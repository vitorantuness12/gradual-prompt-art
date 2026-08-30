/**
 * Precificação autoritativa do pedido da loja (delivery/restaurante).
 *
 * Motivo de existir: até aqui o navegador enviava subtotal, desconto, frete e
 * total já calculados. Qualquer pessoa podia editar esses números antes do
 * envio e gravar um pedido com valores irreais. Agora o servidor recalcula
 * tudo a partir do catálogo, das promoções, das zonas de entrega e do saldo
 * real de cashback; o que o visitante manda como valor é ignorado.
 */
import type { DeliveryZoneRow } from "@/lib/delivery";
import { bumpPrice } from "@/lib/digitais";
import { quoteDelivery } from "@/lib/geo";
import { maxRedeemable } from "@/lib/cashback";
import type { PedidoLojaInput } from "@/lib/pedido-loja";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Arredonda para centavos, evitando resíduos de ponto flutuante. */
function money(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export interface PricedItem {
  productId: string;
  variantId: string | null;
  variantName: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  fromUpsell: boolean;
}

export interface PricedOffer {
  offerId: string;
  productId: string;
  name: string;
  price: number;
}

export interface PedidoLojaPricing {
  ok: boolean;
  message: string;
  problems: string[];
  storeId: string;
  items: PricedItem[];
  offers: PricedOffer[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode: string | null;
  cashbackUsed: number;
  upsellItems: number;
  upsellTotal: number;
  total: number;
  distanceKm: number | null;
}

const EMPTY: PedidoLojaPricing = {
  ok: false,
  message: "Loja indisponível no momento.",
  problems: [],
  storeId: "",
  items: [],
  offers: [],
  subtotal: 0,
  deliveryFee: 0,
  discount: 0,
  couponCode: null,
  cashbackUsed: 0,
  upsellItems: 0,
  upsellTotal: 0,
  total: 0,
  distanceKm: null,
};

/** Preço unitário base: variação > preço promocional válido > preço de tabela. */
function basePrice(
  product: { price: number | string; promo_price: number | string | null },
  variant: { price: number | string | null } | null,
): number {
  if (variant && variant.price !== null && Number(variant.price) > 0) return Number(variant.price);
  const list = Number(product.price ?? 0);
  const promo = product.promo_price === null ? null : Number(product.promo_price);
  if (promo !== null && promo > 0 && promo < list) return promo;
  return list;
}

/** Desconto do cupom recalculado no servidor; código inválido vale zero. */
async function couponDiscount(
  admin: Admin,
  storeId: string,
  code: string | null | undefined,
  subtotal: number,
): Promise<{ code: string | null; discount: number }> {
  const clean = (code ?? "").trim().toUpperCase();
  if (clean.length < 2) return { code: null, discount: 0 };

  const { data: promo } = await admin
    .from("promotions")
    .select(
      "code, discount_type, discount_value, min_order_value, starts_at, ends_at, usage_limit, used_count, is_active",
    )
    .eq("store_id", storeId)
    .eq("code", clean)
    .maybeSingle();
  if (!promo || !promo.is_active) return { code: null, discount: 0 };

  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return { code: null, discount: 0 };
  if (promo.ends_at && new Date(promo.ends_at).getTime() < now) return { code: null, discount: 0 };
  if (promo.usage_limit && Number(promo.used_count ?? 0) >= Number(promo.usage_limit)) {
    return { code: null, discount: 0 };
  }
  if (subtotal < Number(promo.min_order_value ?? 0)) return { code: null, discount: 0 };

  const value = Number(promo.discount_value ?? 0);
  const raw = promo.discount_type === "percent" ? (subtotal * value) / 100 : value;
  return { code: clean, discount: money(Math.min(subtotal, Math.max(0, raw))) };
}

/**
 * Recalcula todos os valores do pedido a partir do banco.
 * Nunca lança: devolve `ok: false` com a primeira mensagem útil.
 */
export async function precificarPedidoLoja(
  admin: Admin,
  input: PedidoLojaInput,
): Promise<PedidoLojaPricing> {
  if (input.items.length === 0) {
    return { ...EMPTY, message: "Seu carrinho está vazio." };
  }

  const { data: store } = await admin
    .from("stores")
    .select("id, is_active, delivery_fee, min_order_value")
    .eq("slug", input.storeSlug)
    .maybeSingle();

  if (!store || !store.is_active) return EMPTY;

  const productIds = Array.from(new Set(input.items.map((item) => item.productId)));
  const [{ data: products }, { data: variants }, { data: groups }, { data: options }] = await Promise.all([
    admin
      .from("products")
      .select("id, name, price, promo_price, is_active, is_available")
      .eq("store_id", store.id)
      .in("id", productIds),
    admin
      .from("product_variants")
      .select("id, product_id, price, is_active")
      .eq("store_id", store.id)
      .in("product_id", productIds),
    admin.from("product_option_groups").select("id, product_id, name").in("product_id", productIds),
    admin.from("product_options").select("id, group_id, name, price_delta").eq("store_id", store.id),
  ]);

  const problems: string[] = [];
  const priced: PricedItem[] = [];

  const productById = new Map((products ?? []).map((row) => [row.id, row]));
  const variantById = new Map((variants ?? []).map((row) => [row.id, row]));
  const groupById = new Map((groups ?? []).map((row) => [row.id, row]));

  /** Preço do adicional pelo nome do grupo + nome da opção (o carrinho não guarda IDs). */
  function optionPrice(productId: string, groupName: string, optionName: string): number | null {
    const match = (options ?? []).find((option) => {
      const group = groupById.get(option.group_id);
      return (
        group?.product_id === productId &&
        (group?.name ?? "").trim().toLowerCase() === groupName.trim().toLowerCase() &&
        (option.name ?? "").trim().toLowerCase() === optionName.trim().toLowerCase()
      );
    });
    return match ? Number(match.price_delta ?? 0) : null;
  }

  for (const item of input.items) {
    const product = productById.get(item.productId);
    if (!product || !product.is_active) {
      problems.push(`"${item.productName}" não está mais disponível.`);
      continue;
    }
    if (product.is_available === false) {
      problems.push(`"${product.name}" está indisponível agora.`);
      continue;
    }

    const variant = item.variantId ? variantById.get(item.variantId) ?? null : null;
    if (item.variantId && (!variant || variant.is_active === false)) {
      problems.push(`A variação escolhida de "${product.name}" não está mais disponível.`);
      continue;
    }

    let unit = basePrice(product, variant);
    for (const option of item.options ?? []) {
      const price = optionPrice(item.productId, option.groupName, option.optionName);
      // Adicional que não existe mais no cadastro simplesmente não é cobrado.
      if (price !== null) unit += price;
    }

    priced.push({
      productId: item.productId,
      variantId: item.variantId ?? null,
      variantName: item.variantName ?? null,
      productName: variant && item.variantName ? `${product.name} (${item.variantName})` : product.name,
      quantity: item.quantity,
      unitPrice: money(unit),
      notes: item.notes ?? null,
      fromUpsell: item.fromUpsell === true,
    });
  }

  if (priced.length === 0) {
    return {
      ...EMPTY,
      storeId: store.id,
      problems,
      message: problems[0] ?? "Nenhum item do seu carrinho está disponível.",
    };
  }

  const itemsSubtotal = money(priced.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));

  // Ofertas do checkout: preço vem do produto + percentual cadastrado.
  const offerIds = (input.offers ?? []).map((offer) => offer.offerId);
  const pricedOffers: PricedOffer[] = [];
  if (offerIds.length > 0) {
    const { data: offerRows } = await admin
      .from("checkout_offers")
      .select("id, product_id, discount_percent, is_active")
      .eq("store_id", store.id)
      .in("id", offerIds);
    const offerProductIds = Array.from(
      new Set((offerRows ?? []).map((row) => row.product_id).filter((id): id is string => Boolean(id))),
    );
    const { data: offerProducts } = offerProductIds.length
      ? await admin.from("products").select("id, name, price").in("id", offerProductIds)
      : { data: [] };
    const offerProductById = new Map((offerProducts ?? []).map((row) => [row.id, row]));
    for (const row of offerRows ?? []) {
      const product = row.product_id ? offerProductById.get(row.product_id) ?? null : null;
      if (!product || row.is_active === false) continue;
      pricedOffers.push({
        offerId: row.id,
        productId: product.id,
        name: product.name,
        price: money(bumpPrice(Number(product.price ?? 0), Number(row.discount_percent ?? 0))),
      });
    }
  }
  const offersTotal = money(pricedOffers.reduce((sum, offer) => sum + offer.price, 0));
  const subtotal = money(itemsSubtotal + offersTotal);

  const minOrder = Number(store.min_order_value ?? 0);
  if (minOrder > 0 && itemsSubtotal < minOrder) {
    return {
      ...EMPTY,
      storeId: store.id,
      problems,
      message: `Pedido mínimo desta loja: R$ ${minOrder.toFixed(2).replace(".", ",")}.`,
    };
  }

  // Frete: recalculado pelas zonas do lojista; a distância é a única entrada
  // do cliente aceita (ela vem da cotação pública, que também é do servidor).
  let deliveryFee = 0;
  let distanceKm: number | null = null;
  if (input.type === "delivery") {
    const { data: zoneRows } = await admin
      .from("delivery_zones")
      .select("*")
      .eq("store_id", store.id)
      .order("sort_order");
    const address = input.address ?? {};
    const quote = quoteDelivery(
      (zoneRows ?? []) as DeliveryZoneRow[],
      {
        subtotal: itemsSubtotal,
        zip: address["zip"] ?? null,
        district: address["district"] ?? null,
        distanceKm: input.distanceKm ?? null,
      },
      Number(store.delivery_fee ?? 0),
    );
    if (quote.blockedReason) {
      return { ...EMPTY, storeId: store.id, problems, message: quote.blockedReason };
    }
    deliveryFee = money(quote.fee);
    distanceKm = quote.distanceKm;
  }

  const coupon = await couponDiscount(admin, store.id, input.couponCode, itemsSubtotal);
  const afterCoupon = Math.max(0, money(subtotal - coupon.discount));

  // Cashback: usa o saldo real e o teto por pedido definido pelo lojista.
  let cashbackUsed = 0;
  if (input.cashbackUsed > 0) {
    const { loadCashbackAccount } = await import("@/lib/cashback.server");
    const account = await loadCashbackAccount(admin, input.storeSlug, input.customerPhone);
    if (account.enabled) {
      cashbackUsed = money(
        Math.min(input.cashbackUsed, maxRedeemable(account.balance, afterCoupon, account.maxPercentUse)),
      );
    }
  }

  const upsell = priced.reduce(
    (acc, item) =>
      item.fromUpsell
        ? { items: acc.items + item.quantity, total: acc.total + item.unitPrice * item.quantity }
        : acc,
    { items: 0, total: 0 },
  );

  const total = Math.max(0, money(afterCoupon - cashbackUsed + deliveryFee));

  return {
    ok: true,
    message: "Valores confirmados.",
    problems,
    storeId: store.id,
    items: priced,
    offers: pricedOffers,
    subtotal,
    deliveryFee,
    discount: coupon.discount,
    couponCode: coupon.code,
    cashbackUsed,
    upsellItems: upsell.items,
    upsellTotal: money(upsell.total),
    total,
    distanceKm,
  };
}

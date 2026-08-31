/**
 * Checkouts especializados — camada de servidor.
 *
 * Aqui acontece toda a decisão sensível: preço, estoque, frete, disponibilidade
 * de horário e liberação de acesso digital. O navegador apenas envia intenções;
 * nada do que ele manda como valor é aceito.
 *
 * O checkout de delivery/restaurantes NÃO passa por este arquivo e permanece
 * exatamente como está.
 */
import {
  buildAgendaSlots,
  canReleaseDigital,
  depositForService,
  orderTotals,
  quoteShipping,
  revalidateCart,
  type AgendaSlot,
  type CartLineInput,
  type CatalogProduct,
  type CatalogVariant,
  type SchedulingConfig,
  type ShippingQuote,
  type ShippingZone,
} from "@/lib/checkout-especializado";
import { PUBLIC_STORE_BASE_URL } from "@/lib/store-url";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const DEFAULT_CONFIG: SchedulingConfig = {
  slot_minutes: 30,
  open_time: "09:00",
  close_time: "18:00",
  require_deposit: false,
  deposit_percent: 0,
};

export interface CheckoutCustomer {
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
}

export interface CheckoutOutcome {
  ok: boolean;
  message: string;
  /** Código curto do pedido, mostrado ao cliente. */
  code?: string;
  /** Token público para acompanhar o pedido sem login. */
  publicToken?: string;
  /** Problemas encontrados na revalidação (estoque, preço, horário). */
  problems?: string[];
}

/* --------------------------------- Comuns --------------------------------- */

async function loadStore(admin: Admin, slug: string) {
  const { data } = await admin
    .from("stores")
    .select("id, name, slug, is_active, is_demo, payment_methods, whatsapp")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

async function loadCatalog(admin: Admin, storeId: string, productIds: string[]) {
  const [{ data: products }, { data: variants }] = await Promise.all([
    admin
      .from("products")
      .select(
        "id, name, price, promo_price, is_active, is_available, track_stock, stock_quantity, max_quantity_per_order, weight_grams, kind, duration_minutes, digital_instructions",
      )
      .eq("store_id", storeId)
      .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("product_variants")
      .select("id, product_id, price, stock_quantity, is_active, option1_value, option2_value")
      .eq("store_id", storeId),
  ]);
  return {
    products: (products ?? []) as unknown as (CatalogProduct & {
      duration_minutes: number | null;
      digital_instructions: string | null;
    })[],
    variants: (variants ?? []) as unknown as CatalogVariant[],
  };
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
    .select("code, discount_type, discount_value, min_order_value, starts_at, ends_at, usage_limit, used_count, is_active")
    .eq("store_id", storeId)
    .eq("code", clean)
    .maybeSingle();
  if (!promo || !promo.is_active) return { code: null, discount: 0 };

  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return { code: null, discount: 0 };
  if (promo.ends_at && new Date(promo.ends_at).getTime() < now) return { code: null, discount: 0 };
  if (promo.usage_limit && Number(promo.used_count ?? 0) >= promo.usage_limit) return { code: null, discount: 0 };
  if (subtotal < Number(promo.min_order_value ?? 0)) return { code: null, discount: 0 };

  const value = Number(promo.discount_value ?? 0);
  const discount =
    promo.discount_type === "percent" ? Math.round(subtotal * (value / 100) * 100) / 100 : value;
  return { code: clean, discount: Math.min(subtotal, Math.max(0, discount)) };
}

function orderCode(): string {
  return `P${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

function baseUrl(): string {
  return process.env["PUBLIC_SITE_URL"] || PUBLIC_STORE_BASE_URL;
}

/** Confere se a forma de pagamento escolhida está habilitada na loja. */
function paymentAllowed(store: { payment_methods: unknown }, method: string): boolean {
  const methods = (store.payment_methods ?? {}) as Record<string, unknown>;
  if (method === "pix_online") return methods["pix"] === true || methods["card_online"] === true;
  return methods[method] === true;
}

/* ------------------------------ Agendamento ------------------------------- */

export interface AgendaOptions {
  storeName: string;
  services: {
    id: string;
    name: string;
    price: number;
    durationMinutes: number;
    professionalIds: string[];
  }[];
  professionals: { id: string; name: string; roleTitle: string | null }[];
  units: { id: string; name: string }[];
  config: SchedulingConfig;
  cancellationPolicy: string | null;
}

/** Serviços, profissionais, unidades e política de agendamento da loja. */
export async function loadAgendaOptions(admin: Admin, slug: string): Promise<AgendaOptions | null> {
  const store = await loadStore(admin, slug);
  if (!store) return null;

  const [{ data: products }, { data: professionals }, { data: links }, { data: units }, { data: settings }] =
    await Promise.all([
      admin
        .from("products")
        .select("id, name, price, promo_price, duration_minutes, kind, is_service, is_active, is_available")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .is("archived_at", null)
        .order("sort_order"),
      admin
        .from("professionals")
        .select("id, name, role_title")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .order("name"),
      admin.from("product_professionals").select("product_id, professional_id").eq("store_id", store.id),
      admin.from("dining_areas").select("id, name").eq("store_id", store.id).eq("is_active", true).order("sort_order"),
      admin.from("scheduling_settings").select("*").eq("store_id", store.id).maybeSingle(),
    ]);

  const services = (products ?? [])
    .filter((item) => item.is_available && (item.kind === "service" || item.is_service))
    .map((item) => ({
      id: item.id,
      name: item.name,
      price:
        item.promo_price != null && item.promo_price > 0 && item.promo_price < item.price
          ? item.promo_price
          : item.price,
      durationMinutes: item.duration_minutes ?? settings?.slot_minutes ?? 30,
      professionalIds: (links ?? [])
        .filter((link) => link.product_id === item.id)
        .map((link) => link.professional_id),
    }));

  return {
    storeName: store.name,
    services,
    professionals: (professionals ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      roleTitle: item.role_title,
    })),
    units: units ?? [],
    config: settings
      ? {
          slot_minutes: settings.slot_minutes,
          open_time: settings.open_time,
          close_time: settings.close_time,
          require_deposit: settings.require_deposit,
          deposit_percent: settings.deposit_percent,
        }
      : DEFAULT_CONFIG,
    cancellationPolicy: settings?.cancellation_policy ?? null,
  };
}

async function agendaContext(admin: Admin, storeId: string, date: string) {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const [{ data: busy }, { data: blocks }] = await Promise.all([
    admin
      .from("appointments")
      .select("professional_id, starts_at, ends_at")
      .eq("store_id", storeId)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString()),
    admin
      .from("schedule_blocks")
      .select("professional_id, is_recurring, weekday, start_time, end_time, starts_at, ends_at")
      .eq("store_id", storeId),
  ]);
  return { busy: busy ?? [], blocks: blocks ?? [] };
}

/** Horários realmente livres do serviço no dia escolhido. */
export async function loadAgendaSlots(
  admin: Admin,
  input: { slug: string; productId: string; professionalId?: string | null; date: string },
): Promise<AgendaSlot[]> {
  const store = await loadStore(admin, input.slug);
  if (!store) return [];

  const [{ data: product }, { data: settings }] = await Promise.all([
    admin
      .from("products")
      .select("id, duration_minutes, is_active, is_available")
      .eq("store_id", store.id)
      .eq("id", input.productId)
      .maybeSingle(),
    admin.from("scheduling_settings").select("*").eq("store_id", store.id).maybeSingle(),
  ]);
  if (!product || !product.is_active || !product.is_available) return [];

  const config: SchedulingConfig = settings
    ? {
        slot_minutes: settings.slot_minutes,
        open_time: settings.open_time,
        close_time: settings.close_time,
        require_deposit: settings.require_deposit,
        deposit_percent: settings.deposit_percent,
      }
    : DEFAULT_CONFIG;

  const { busy, blocks } = await agendaContext(admin, store.id, input.date);
  return buildAgendaSlots({
    date: input.date,
    durationMinutes: product.duration_minutes ?? config.slot_minutes,
    config,
    professionalId: input.professionalId ?? null,
    busy,
    blocks,
  });
}

export interface AgendamentoInput extends CheckoutCustomer {
  slug: string;
  productId: string;
  professionalId?: string | null;
  unitId?: string | null;
  startsAt: string;
  paymentMethod: string;
}

/**
 * Cria o agendamento após reconferir a disponibilidade real do horário.
 * Também gera o pedido correspondente, para o financeiro da loja continuar único.
 */
export async function createAgendamento(admin: Admin, input: AgendamentoInput): Promise<CheckoutOutcome> {
  const store = await loadStore(admin, input.slug);
  if (!store) return { ok: false, message: "Loja não encontrada." };
  if (!paymentAllowed(store, input.paymentMethod)) {
    return { ok: false, message: "Forma de pagamento indisponível nesta loja." };
  }

  const options = await loadAgendaOptions(admin, input.slug);
  const service = options?.services.find((item) => item.id === input.productId);
  if (!options || !service) return { ok: false, message: "Serviço indisponível para agendamento." };

  if (input.professionalId && service.professionalIds.length > 0) {
    if (!service.professionalIds.includes(input.professionalId)) {
      return { ok: false, message: "Este profissional não atende o serviço escolhido." };
    }
  }

  const date = input.startsAt.slice(0, 10);
  const slots = await loadAgendaSlots(admin, {
    slug: input.slug,
    productId: input.productId,
    professionalId: input.professionalId ?? null,
    date,
  });
  const slot = slots.find((item) => item.startsAt === input.startsAt);
  if (!slot) {
    return {
      ok: false,
      message: "Esse horário acabou de ser ocupado. Escolha outro horário disponível.",
      problems: ["Horário indisponível."],
    };
  }

  const totals = orderTotals({ subtotal: service.price });
  const deposit = depositForService(service.price, options.config);
  const code = orderCode();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      store_id: store.id,
      code,
      type: "scheduled",
      status: "pending",
      channel: "checkout_agendamento",
      customer_name: input.name,
      customer_phone: input.phone,
      customer_email: input.email || null,
      subtotal: totals.subtotal,
      total: totals.total,
      delivery_fee: 0,
      discount: 0,
      deposit_amount: deposit,
      payment_method: input.paymentMethod,
      payment_status: "pending",
      scheduled_for: input.startsAt,
      notes: input.notes || null,
      is_demo: store.is_demo,
    })
    .select("id, code, public_token")
    .maybeSingle();
  if (orderError || !order) return { ok: false, message: "Não foi possível concluir o agendamento agora." };

  await admin.from("order_items").insert({
    order_id: order.id,
    store_id: store.id,
    product_id: service.id,
    product_name: service.name,
    quantity: 1,
    unit_price: service.price,
    total: service.price,
  });

  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .insert({
      store_id: store.id,
      product_id: service.id,
      professional_id: input.professionalId || null,
      customer_name: input.name,
      customer_phone: input.phone,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      price: service.price,
      deposit_amount: deposit,
      deposit_status: deposit > 0 ? "pending" : "not_required",
      status: "scheduled",
      notes: input.notes || null,
      is_demo: store.is_demo,
    })
    .select("id, confirmation_token")
    .maybeSingle();

  if (appointmentError || !appointment) {
    // O horário não pôde ser reservado: o pedido não deve ficar órfão.
    await admin.from("orders").update({ status: "cancelled", cancel_reason: "Falha ao reservar horário" }).eq("id", order.id);
    return { ok: false, message: "Não foi possível reservar o horário. Tente novamente." };
  }

  await notifyAppointmentConfirmation(admin, appointment.id);

  return {
    ok: true,
    message: "Agendamento confirmado! Enviamos os detalhes para você.",
    code: order.code,
    publicToken: order.public_token,
  };
}

/** Confirmação do agendamento por e-mail e WhatsApp, com instruções da loja. */
export async function notifyAppointmentConfirmation(
  admin: Admin,
  appointmentId: string,
): Promise<{ ok: boolean; message: string }> {
  const { data: row } = await admin
    .from("appointments")
    .select(
      "id, store_id, customer_name, customer_phone, starts_at, price, deposit_amount, confirmation_token, product:products(name), store:stores(name, slug, address_street, address_number, address_district)",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (!row) return { ok: false, message: "Agendamento não encontrado." };

  const when = new Date(row.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const address = [row.store?.address_street, row.store?.address_number, row.store?.address_district]
    .filter(Boolean)
    .join(", ");
  const link = row.confirmation_token ? `${baseUrl()}/agendamento/${row.confirmation_token}` : null;

  const lines = [
    `Olá, ${row.customer_name}! Seu agendamento está confirmado.`,
    `Serviço: ${row.product?.name ?? "Serviço"}`,
    `Data e hora: ${when}`,
    address ? `Local: ${address}` : null,
    Number(row.deposit_amount ?? 0) > 0
      ? `Sinal para confirmar: R$ ${Number(row.deposit_amount).toFixed(2)}`
      : null,
    link ? `Confirmar, remarcar ou cancelar: ${link}` : null,
    `Qualquer dúvida, responda esta mensagem. — ${row.store?.name ?? "Sua loja"}`,
  ].filter(Boolean) as string[];
  const body = lines.join("\n");

  const { data: order } = await admin
    .from("orders")
    .select("customer_email")
    .eq("store_id", row.store_id)
    .eq("scheduled_for", row.starts_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { sendStoreEmail } = await import("@/lib/digitais.server");
  const email = await sendStoreEmail(admin, row.store_id, {
    to: order?.customer_email ?? null,
    subject: `Agendamento confirmado — ${when}`,
    body,
    event: "agendamento_confirmado",
  });

  if (row.customer_phone) {
    const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");
    await sendWhatsappMessage(admin, {
      storeId: row.store_id,
      phone: row.customer_phone,
      body,
      messageType: "transactional",
      templateKey: "agendamento_confirmado",
    });
  }

  return { ok: true, message: email.message };
}

/* --------------------------- Produtos digitais ---------------------------- */

export interface DigitalCheckoutInput extends CheckoutCustomer {
  slug: string;
  lines: CartLineInput[];
  couponCode?: string | null;
  paymentMethod: string;
  installments?: number | null;
}

/**
 * Pedido de produto digital. O acesso NUNCA é liberado aqui: a entrega nasce
 * pendente e só é liberada por `releaseDigitalForOrder` quando o pagamento é
 * confirmado com o valor correto.
 */
export async function createDigitalOrder(admin: Admin, input: DigitalCheckoutInput): Promise<CheckoutOutcome> {
  const store = await loadStore(admin, input.slug);
  if (!store) return { ok: false, message: "Loja não encontrada." };
  if (!paymentAllowed(store, input.paymentMethod)) {
    return { ok: false, message: "Forma de pagamento indisponível nesta loja." };
  }
  if (!input.email) return { ok: false, message: "Informe um e-mail para receber o acesso." };

  const { products, variants } = await loadCatalog(
    admin,
    store.id,
    input.lines.map((line) => line.productId),
  );
  const notDigital = products.filter((item) => item.kind && !["digital", "subscription"].includes(item.kind));
  if (notDigital.length > 0) {
    return { ok: false, message: "Este checkout aceita apenas produtos digitais." };
  }

  const check = revalidateCart(input.lines, products, variants);
  if (!check.ok) return { ok: false, message: check.problems[0] ?? "Revise seu carrinho.", problems: check.problems };

  const coupon = await couponDiscount(admin, store.id, input.couponCode, check.subtotal);
  const totals = orderTotals({ subtotal: check.subtotal, discount: coupon.discount });
  const code = orderCode();

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      store_id: store.id,
      code,
      type: "pickup",
      status: "awaiting_payment",
      channel: "checkout_digital",
      customer_name: input.name,
      customer_phone: input.phone,
      customer_email: input.email,
      subtotal: totals.subtotal,
      discount: totals.discount,
      delivery_fee: 0,
      total: totals.total,
      coupon_code: coupon.code,
      payment_method: input.paymentMethod,
      payment_status: "pending",
      notes: input.notes || null,
      is_demo: store.is_demo,
    })
    .select("id, code, public_token")
    .maybeSingle();
  if (error || !order) return { ok: false, message: "Não foi possível concluir a compra agora." };

  await admin.from("order_items").insert(
    check.lines.map((line) => ({
      order_id: order.id,
      store_id: store.id,
      product_id: line.productId,
      product_name: line.name,
      variant_id: line.variantId,
      variant_name: line.variantName,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      total: line.total,
      notes: line.notes,
    })),
  );

  // Entregas criadas bloqueadas: released_at nulo = sem acesso.
  await admin.from("digital_deliveries").insert(
    check.lines.map((line) => ({
      store_id: store.id,
      order_id: order.id,
      product_id: line.productId,
      customer_email: input.email!,
      released_at: null,
    })),
  );

  // Cobrança real: o pedido digital nasce com uma transação pendente que o
  // lojista acompanha (e confirma) na tela de cobranças.
  const { ensureOrderCharge } = await import("@/lib/cobrancas.server");
  await ensureOrderCharge(admin, {
    storeId: store.id,
    orderId: order.id,
    method: input.paymentMethod,
    amount: totals.total,
    isDemo: store.is_demo,
  });

  return {
    ok: true,
    message: "Compra registrada! Assim que o pagamento for confirmado, liberamos seu acesso.",
    code: order.code,
    publicToken: order.public_token,
  };
}

/**
 * Libera o acesso digital do pedido — somente com pagamento confirmado e valor
 * conferido — e envia as instruções por e-mail e WhatsApp.
 */
export async function releaseDigitalForOrder(
  admin: Admin,
  orderId: string,
  paidAmount?: number | null,
): Promise<{ ok: boolean; released: number; message: string }> {
  const { data: order } = await admin
    .from("orders")
    .select("id, total, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, released: 0, message: "Pedido não encontrado." };

  if (
    !canReleaseDigital({
      paymentStatus: order.payment_status,
      total: order.total,
      paidAmount: paidAmount ?? null,
    })
  ) {
    return { ok: false, released: 0, message: "Pagamento ainda não confirmado: acesso mantido bloqueado." };
  }

  const { data: pending } = await admin
    .from("digital_deliveries")
    .select("id")
    .eq("order_id", orderId)
    .is("released_at", null)
    .is("revoked_at", null);
  if (!pending || pending.length === 0) return { ok: true, released: 0, message: "Nenhuma entrega pendente." };

  const now = new Date().toISOString();
  await admin
    .from("digital_deliveries")
    .update({ released_at: now })
    .in(
      "id",
      pending.map((row) => row.id),
    );

  const { notifyDeliveryReleased } = await import("@/lib/digitais.server");
  for (const row of pending) {
    await notifyDeliveryReleased(admin, row.id, baseUrl());
  }

  await provisionMemberAccess(admin, orderId);

  return { ok: true, released: pending.length, message: "Acesso liberado e instruções enviadas." };
}

/**
 * Cria (quando ainda não existe) a conta do comprador na área de membros e
 * envia o endereço de acesso com a senha padrão, pedindo a troca no primeiro
 * acesso. Falhas aqui não desfazem a liberação do produto.
 */
async function provisionMemberAccess(admin: Admin, orderId: string): Promise<void> {
  const { data: order } = await admin
    .from("orders")
    .select("id, store_id, customer_name, customer_email, store:stores(name, slug)")
    .eq("id", orderId)
    .maybeSingle();
  const email = order?.customer_email ?? null;
  const slug = (order as never as { store: { name: string; slug: string } | null } | null)?.store?.slug ?? null;
  if (!order || !email || !slug) return;

  const { ensureMemberAccount } = await import("@/lib/membros.server");
  const { memberAreaUrl, DEFAULT_MEMBER_PASSWORD } = await import("@/lib/membros");
  const account = await ensureMemberAccount(admin, { storeId: order.store_id, email });
  if (!account.ok) return;

  const url = memberAreaUrl(baseUrl(), slug);
  const storeName = (order as never as { store: { name: string } | null }).store?.name ?? "a loja";
  const { sendStoreEmail } = await import("@/lib/digitais.server");

  const body = account.created
    ? [
        `Olá, ${order.customer_name ?? "tudo bem"}!`,
        "",
        `Seu acesso à área de membros de ${storeName} está liberado.`,
        "",
        `Endereço: ${url}`,
        `E-mail: ${email}`,
        `Senha padrão: ${DEFAULT_MEMBER_PASSWORD}`,
        "",
        "IMPORTANTE: por segurança, troque essa senha assim que entrar na sua conta.",
      ].join("\n")
    : [
        `Olá, ${order.customer_name ?? "tudo bem"}!`,
        "",
        `Adicionamos o novo produto à sua área de membros de ${storeName}.`,
        "",
        `Endereço: ${url}`,
        `E-mail: ${email}`,
        "Use a senha que você já cadastrou.",
      ].join("\n");

  await sendStoreEmail(admin, order.store_id, {
    to: email,
    subject: account.created ? `Seu acesso à área de membros — ${storeName}` : `Novo produto na sua área de membros — ${storeName}`,
    body,
    event: "area_membros",
  });
}

/* --------------------------- Loja online (físico) ------------------------- */

async function loadZones(admin: Admin, storeId: string): Promise<ShippingZone[]> {
  const { data } = await admin
    .from("delivery_zones")
    .select("*")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as unknown as ShippingZone[];
}

export interface ShippingQuoteInput {
  slug: string;
  lines: CartLineInput[];
  zip?: string | null;
  district?: string | null;
  distanceKm?: number | null;
}

/** Cotação de frete usando as regras do lojista e o peso real dos itens. */
export async function quoteStoreShipping(
  admin: Admin,
  input: ShippingQuoteInput,
): Promise<ShippingQuote & { subtotal: number; problems: string[] }> {
  const fallback = { subtotal: 0, problems: ["Loja não encontrada."] };
  const store = await loadStore(admin, input.slug);
  if (!store) {
    return { ...quoteShipping([], { subtotal: 0 }), ok: false, reason: "no_match", message: fallback.problems[0]!, ...fallback };
  }

  const { products, variants } = await loadCatalog(
    admin,
    store.id,
    input.lines.map((line) => line.productId),
  );
  const check = revalidateCart(input.lines, products, variants);
  const zones = await loadZones(admin, store.id);
  const quote = quoteShipping(zones, {
    subtotal: check.subtotal,
    zip: input.zip ?? null,
    district: input.district ?? null,
    distanceKm: input.distanceKm ?? null,
    weightGrams: check.weightGrams,
  });

  return { ...quote, subtotal: check.subtotal, problems: check.problems };
}

export interface StoreCheckoutInput extends CheckoutCustomer {
  slug: string;
  lines: CartLineInput[];
  couponCode?: string | null;
  paymentMethod: string;
  fulfillment: "delivery" | "pickup";
  address?: {
    zip?: string | null;
    street?: string | null;
    number?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    complement?: string | null;
  } | null;
  distanceKm?: number | null;
}

/**
 * Pedido de produto físico: revalida preço e estoque, recalcula o frete pelas
 * regras da loja e só então grava o pedido, baixando o estoque das variações.
 */
export async function createStoreOrder(admin: Admin, input: StoreCheckoutInput): Promise<CheckoutOutcome> {
  const store = await loadStore(admin, input.slug);
  if (!store) return { ok: false, message: "Loja não encontrada." };
  if (!paymentAllowed(store, input.paymentMethod)) {
    return { ok: false, message: "Forma de pagamento indisponível nesta loja." };
  }

  const { products, variants } = await loadCatalog(
    admin,
    store.id,
    input.lines.map((line) => line.productId),
  );
  const check = revalidateCart(input.lines, products, variants);
  if (!check.ok) {
    return { ok: false, message: check.problems[0] ?? "Revise seu carrinho.", problems: check.problems };
  }

  let shipping = 0;
  if (input.fulfillment === "delivery") {
    const zones = await loadZones(admin, store.id);
    const quote = quoteShipping(zones, {
      subtotal: check.subtotal,
      zip: input.address?.zip ?? null,
      district: input.address?.district ?? null,
      distanceKm: input.distanceKm ?? null,
      weightGrams: check.weightGrams,
    });
    if (!quote.ok) return { ok: false, message: quote.message, problems: [quote.message] };
    shipping = quote.fee;
  }

  const coupon = await couponDiscount(admin, store.id, input.couponCode, check.subtotal);
  const totals = orderTotals({ subtotal: check.subtotal, shipping, discount: coupon.discount });
  const code = orderCode();

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      store_id: store.id,
      code,
      type: input.fulfillment === "delivery" ? "delivery" : "pickup",
      status: "pending",
      channel: "checkout_loja",
      customer_name: input.name,
      customer_phone: input.phone,
      customer_email: input.email || null,
      subtotal: totals.subtotal,
      delivery_fee: totals.shipping,
      discount: totals.discount,
      total: totals.total,
      coupon_code: coupon.code,
      payment_method: input.paymentMethod,
      payment_status: "pending",
      address: input.fulfillment === "delivery" ? (input.address ?? null) : null,
      notes: input.notes || null,
      is_demo: store.is_demo,
    })
    .select("id, code, public_token")
    .maybeSingle();
  if (error || !order) return { ok: false, message: "Não foi possível concluir o pedido agora." };

  const { error: itemsError } = await admin.from("order_items").insert(
    check.lines.map((line) => ({
      order_id: order.id,
      store_id: store.id,
      product_id: line.productId,
      product_name: line.name,
      variant_id: line.variantId,
      variant_name: line.variantName,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      total: line.total,
      notes: line.notes,
    })),
  );
  if (itemsError) {
    await admin.from("orders").update({ status: "cancelled", cancel_reason: "Falha ao gravar itens" }).eq("id", order.id);
    return { ok: false, message: "Não foi possível concluir o pedido agora." };
  }

  // Estoque das variações não é coberto pelos gatilhos de produto.
  for (const line of check.lines) {
    if (!line.variantId) continue;
    const variant = variants.find((item) => item.id === line.variantId);
    if (!variant) continue;
    await admin
      .from("product_variants")
      .update({ stock_quantity: Math.max(0, variant.stock_quantity - line.quantity) })
      .eq("id", line.variantId);
  }

  return {
    ok: true,
    message: "Pedido confirmado! Acompanhe o andamento pelo link enviado.",
    code: order.code,
    publicToken: order.public_token,
  };
}

/* --------------------------- Assinatura recorrente ------------------------ */

const SUBSCRIPTION_PERIOD_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
};

export interface SubscriptionCheckoutInput extends CheckoutCustomer {
  slug: string;
  lines: CartLineInput[];
  couponCode?: string | null;
  paymentMethod: string;
  period: "weekly" | "biweekly" | "monthly" | "quarterly";
  fulfillment: "delivery" | "pickup";
  address?: {
    zip?: string | null;
    street?: string | null;
    number?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    complement?: string | null;
  } | null;
  distanceKm?: number | null;
}

/**
 * Assinatura recorrente. Usa exatamente a mesma revalidação dos outros
 * checkouts — preço do catálogo, promoção conferida e frete recalculado pelas
 * zonas da loja — e é esse valor real que fica gravado na assinatura, para que
 * as cobranças seguintes não herdem nada digitado pelo visitante.
 */
export async function createSubscriptionCheckout(
  admin: Admin,
  input: SubscriptionCheckoutInput,
): Promise<CheckoutOutcome & { subscriptionId?: string }> {
  const store = await loadStore(admin, input.slug);
  if (!store) return { ok: false, message: "Loja não encontrada." };
  if (!paymentAllowed(store, input.paymentMethod)) {
    return { ok: false, message: "Forma de pagamento indisponível nesta loja." };
  }
  if (input.lines.length === 0) return { ok: false, message: "Escolha um plano para assinar." };

  const { products, variants } = await loadCatalog(
    admin,
    store.id,
    input.lines.map((line) => line.productId),
  );
  const notSubscription = products.filter((item) => item.kind && item.kind !== "subscription");
  if (notSubscription.length > 0) {
    return { ok: false, message: "Este checkout aceita apenas planos de assinatura." };
  }

  const check = revalidateCart(input.lines, products, variants);
  if (!check.ok) return { ok: false, message: check.problems[0] ?? "Revise seu plano.", problems: check.problems };

  let shipping = 0;
  if (input.fulfillment === "delivery") {
    const zones = await loadZones(admin, store.id);
    const quote = quoteShipping(zones, {
      subtotal: check.subtotal,
      zip: input.address?.zip ?? null,
      district: input.address?.district ?? null,
      distanceKm: input.distanceKm ?? null,
      weightGrams: check.weightGrams,
    });
    if (!quote.ok) return { ok: false, message: quote.message, problems: [quote.message] };
    shipping = quote.fee;
  }

  const coupon = await couponDiscount(admin, store.id, input.couponCode, check.subtotal);
  const totals = orderTotals({ subtotal: check.subtotal, shipping, discount: coupon.discount });
  const first = check.lines[0]!;
  const code = orderCode();

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      store_id: store.id,
      code,
      type: input.fulfillment === "delivery" ? "delivery" : "pickup",
      status: "awaiting_payment",
      channel: "checkout_assinatura",
      customer_name: input.name,
      customer_phone: input.phone,
      customer_email: input.email || null,
      subtotal: totals.subtotal,
      delivery_fee: totals.shipping,
      discount: totals.discount,
      total: totals.total,
      coupon_code: coupon.code,
      payment_method: input.paymentMethod,
      payment_status: "pending",
      address: input.fulfillment === "delivery" ? (input.address ?? null) : null,
      notes: input.notes || null,
      is_demo: store.is_demo,
    })
    .select("id, code, public_token")
    .maybeSingle();
  if (error || !order) return { ok: false, message: "Não foi possível criar a assinatura agora." };

  await admin.from("order_items").insert(
    check.lines.map((line) => ({
      order_id: order.id,
      store_id: store.id,
      product_id: line.productId,
      product_name: line.name,
      variant_id: line.variantId,
      variant_name: line.variantName,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      total: line.total,
      notes: line.notes,
    })),
  );

  const days = SUBSCRIPTION_PERIOD_DAYS[input.period] ?? 30;
  const nextAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data: subscription } = await admin
    .from("customer_subscriptions")
    .insert({
      store_id: store.id,
      product_id: first.productId,
      customer_name: input.name,
      customer_phone: input.phone,
      customer_email: input.email || null,
      status: "active",
      period: input.period,
      // Valores autoritativos: recalculados agora, não os enviados pelo cliente.
      quantity: first.quantity,
      unit_price: first.unitPrice,
      amount: totals.total,
      delivery_fee: totals.shipping,
      delivery_type: input.fulfillment,
      delivery_address: input.fulfillment === "delivery" ? (input.address ?? null) : null,
      notes: input.notes || null,
      items: check.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.total,
      })),
      next_charge_at: nextAt,
      next_order_at: nextAt,
      current_period_end: nextAt,
      source_order_id: order.id,
      orders_count: 1,
      last_order_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  const { ensureOrderCharge } = await import("@/lib/cobrancas.server");
  await ensureOrderCharge(admin, {
    storeId: store.id,
    orderId: order.id,
    method: input.paymentMethod,
    amount: totals.total,
    isDemo: store.is_demo,
  });

  if (subscription?.id) {
    const { notifySubscription } = await import("@/lib/digitais.server");
    await notifySubscription(admin, subscription.id, "activated").catch(() => undefined);
  }

  return {
    ok: true,
    message: "Assinatura criada! Confirme o pagamento para começar o primeiro ciclo.",
    code: order.code,
    publicToken: order.public_token,
    ...(subscription?.id ? { subscriptionId: subscription.id } : {}),
  };
}

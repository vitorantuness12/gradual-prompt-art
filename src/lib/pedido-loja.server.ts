/**
 * Gravação do pedido da loja no servidor.
 *
 * Usa o cliente administrativo porque o visitante anônimo tem permissão de
 * inserir pedidos, mas nenhuma política de leitura — logo, não consegue
 * receber de volta o `code` gerado. Toda validação de loja acontece aqui.
 */
import type { PedidoLojaInput, PedidoLojaResult } from "@/lib/pedido-loja";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export async function gravarPedidoLoja(
  admin: Admin,
  input: PedidoLojaInput,
): Promise<PedidoLojaResult> {
  if (input.items.length === 0) {
    return { ok: false, message: "Seu carrinho está vazio." };
  }

  // Preço, promoção, cupom, frete e cashback são recalculados aqui: nada do
  // que o visitante digitou como valor entra no banco.
  const { precificarPedidoLoja } = await import("@/lib/pedido-loja-pricing.server");
  const pricing = await precificarPedidoLoja(admin, input);
  if (!pricing.ok) {
    return { ok: false, message: pricing.message };
  }
  const store = { id: pricing.storeId };

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      store_id: store.id,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_email: input.customerEmail ?? null,
      type: input.type,
      table_number: input.tableNumber ?? null,
      distance_km: pricing.distanceKm ?? input.distanceKm ?? null,
      delivery_lat: input.deliveryLat ?? null,
      delivery_lng: input.deliveryLng ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      subtotal: pricing.subtotal,
      delivery_fee: pricing.deliveryFee,
      discount: pricing.discount,
      coupon_code: pricing.couponCode,
      cashback_used: pricing.cashbackUsed,
      referral_code: input.referralCode ?? null,
      upsell_items: pricing.upsellItems,
      upsell_total: pricing.upsellTotal,
      total: pricing.total,
      payment_method: input.paymentMethod,
      scheduled_for: input.scheduledFor ?? null,
      channel: input.channel,
      affiliate_code: input.affiliateCode ?? null,
      utm_source: input.utmSource ?? null,
      utm_medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
      utm_content: input.utmContent ?? null,
    })
    .select("id, code")
    .single();

  if (error || !order) {
    return { ok: false, message: error?.message ?? "Falha ao criar pedido." };
  }

  const { error: itemsError } = await admin.from("order_items").insert(
    pricing.items.map((item) => ({
      order_id: order.id,
      store_id: store.id,
      product_id: item.productId,
      variant_id: item.variantId,
      variant_name: item.variantName,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.unitPrice * item.quantity,
      notes: item.notes,
    })),
  );

  if (itemsError) {
    // Sem itens o pedido é inútil para a cozinha: desfaz para não sujar o painel.
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, message: itemsError.message };
  }

  const offers = pricing.offers;
  if (offers.length > 0) {
    await admin.from("order_items").insert(
      offers.map((line) => ({
        order_id: order.id,
        store_id: store.id,
        product_id: line.productId,
        product_name: line.name,
        quantity: 1,
        unit_price: line.price,
        total: line.price,
        notes: "Oferta do checkout",
      })),
    );

    for (const line of offers) {
      const { data: offer } = await admin
        .from("checkout_offers")
        .select("conversions")
        .eq("id", line.offerId)
        .maybeSingle();
      await admin
        .from("checkout_offers")
        .update({ conversions: (offer?.conversions ?? 0) + 1 })
        .eq("id", line.offerId);
    }
  }

  return {
    ok: true,
    message: "Pedido enviado.",
    id: order.id,
    code: order.code,
    totals: {
      subtotal: pricing.subtotal,
      deliveryFee: pricing.deliveryFee,
      discount: pricing.discount,
      cashbackUsed: pricing.cashbackUsed,
      total: pricing.total,
    },
  };
}

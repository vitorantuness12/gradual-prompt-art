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

  const { data: store } = await admin
    .from("stores")
    .select("id, is_active")
    .eq("slug", input.storeSlug)
    .maybeSingle();

  if (!store || !store.is_active) {
    return { ok: false, message: "Loja indisponível no momento." };
  }

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      store_id: store.id,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_email: input.customerEmail ?? null,
      type: input.type,
      table_number: input.tableNumber ?? null,
      distance_km: input.distanceKm ?? null,
      delivery_lat: input.deliveryLat ?? null,
      delivery_lng: input.deliveryLng ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      subtotal: input.subtotal,
      delivery_fee: input.deliveryFee,
      discount: input.discount,
      coupon_code: input.couponCode ?? null,
      cashback_used: input.cashbackUsed,
      referral_code: input.referralCode ?? null,
      upsell_items: input.upsellItems,
      upsell_total: input.upsellTotal,
      total: input.total,
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
    input.items.map((item) => ({
      order_id: order.id,
      store_id: store.id,
      product_id: item.productId,
      variant_id: item.variantId ?? null,
      variant_name: item.variantName ?? null,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.unitPrice * item.quantity,
      notes: item.notes ?? null,
    })),
  );

  if (itemsError) {
    // Sem itens o pedido é inútil para a cozinha: desfaz para não sujar o painel.
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, message: itemsError.message };
  }

  const offers = input.offers ?? [];
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

  return { ok: true, message: "Pedido enviado.", id: order.id, code: order.code };
}

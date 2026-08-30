/**
 * Assinatura recorrente de produtos — lado servidor.
 *
 * Regra desta fase: nenhuma cobrança automática. A rotina agendada só **gera
 * o pedido recorrente** na loja e avisa o cliente. Pausar, retomar e cancelar
 * são operações do próprio cliente (área /meus-pedidos) ou da loja.
 */
import type { Json } from "@/integrations/supabase/types";
import {
  isDue,
  nextCycleDate,
  parseItems,
  subscriptionTotal,
  type SubscriptionItem,
} from "@/lib/assinaturas";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Código curto do pedido, no mesmo formato dos checkouts. */
function orderCode(): string {
  return `A${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

export interface RecurringOrdersResult {
  checked: number;
  created: number;
  skipped: number;
  failed: number;
}

/** Gera um pedido a partir da assinatura. Devolve o pedido criado ou null. */
async function createOrderFromSubscription(
  admin: Admin,
  subscription: {
    id: string;
    store_id: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    delivery_type: string;
    delivery_fee: number;
    delivery_address: Json | null;
    notes: string | null;
    items: Json;
    period: string;
    orders_count: number;
  },
  now: Date,
): Promise<{ id: string; code: string; publicToken: string } | null> {
  const items: SubscriptionItem[] = parseItems(subscription.items);
  if (items.length === 0) return null;

  const deliveryFee = subscription.delivery_type === "delivery" ? Number(subscription.delivery_fee ?? 0) : 0;
  const subtotal = subscriptionTotal(items, 0);
  const total = subscriptionTotal(items, deliveryFee);

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      store_id: subscription.store_id,
      code: orderCode(),
      type: subscription.delivery_type === "pickup" ? "pickup" : "delivery",
      status: "pending",
      channel: "assinatura",
      customer_id: subscription.customer_id,
      customer_name: subscription.customer_name,
      customer_phone: subscription.customer_phone,
      customer_email: subscription.customer_email,
      address: subscription.delivery_address,
      subtotal,
      discount: 0,
      delivery_fee: deliveryFee,
      total,
      payment_status: "pending",
      notes: subscription.notes,
      subscription_id: subscription.id,
    })
    .select("id, code, public_token")
    .maybeSingle();

  if (error || !order) {
    console.error("[assinaturas] falha ao gerar pedido recorrente", error?.message);
    return null;
  }

  const { error: itemsError } = await admin.from("order_items").insert(
    items.map((item) => ({
      order_id: order.id,
      store_id: subscription.store_id,
      product_id: item.productId,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: Math.round(item.quantity * item.unitPrice * 100) / 100,
      notes: item.notes,
    })),
  );

  if (itemsError) {
    // Pedido sem itens não serve para a loja: desfaz para não sujar o painel.
    console.error("[assinaturas] falha nos itens do pedido recorrente", itemsError.message);
    await admin.from("orders").delete().eq("id", order.id);
    return null;
  }

  await admin.from("notifications").insert({
    store_id: subscription.store_id,
    event: "assinatura_pedido_gerado",
    title: `Pedido de assinatura ${order.code}`,
    body: `${subscription.customer_name} tem um pedido recorrente para preparar.`,
    order_id: order.id,
  });

  void now;
  return { id: order.id, code: order.code, publicToken: order.public_token };
}

/** Avisa o cliente por WhatsApp que o pedido da assinatura foi gerado. */
async function notifyCustomer(
  admin: Admin,
  input: {
    storeId: string;
    customerId: string | null;
    phone: string | null;
    firstName: string;
    storeName: string;
    orderCode: string;
    publicToken: string;
  },
): Promise<void> {
  if (!input.phone) return;
  try {
    const { normalizePhoneBR } = await import("@/lib/phone");
    const phone = normalizePhoneBR(input.phone);
    if (!phone.ok) return;

    const base = process.env["PUBLIC_SITE_URL"] ?? "https://oseupedido.com.br";
    const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");
    await sendWhatsappMessage(admin, {
      storeId: input.storeId,
      phone: phone.e164,
      body:
        `${input.firstName}, sua assinatura na ${input.storeName} gerou o pedido #${input.orderCode}. ` +
        `Acompanhe aqui: ${base}/acompanhar?codigo=${encodeURIComponent(input.publicToken)}\n` +
        `Quer pausar ou cancelar? Acesse ${base}/meus-pedidos`,
      messageType: "transactional",
      templateKey: "assinatura_pedido_gerado",
      customerId: input.customerId,
    });
  } catch (error) {
    console.error("[assinaturas] aviso ao cliente falhou", error);
  }
}

/**
 * Rotina agendada: percorre as assinaturas com ciclo vencido, gera um pedido
 * para cada uma e reagenda o próximo ciclo.
 *
 * Um ciclo atrasado gera **um** pedido (não acumula), porque a próxima data é
 * sempre calculada a partir de agora.
 */
export async function runRecurringOrders(
  admin: Admin,
  options: { storeId?: string; now?: Date; limit?: number } = {},
): Promise<RecurringOrdersResult> {
  const now = options.now ?? new Date();
  const result: RecurringOrdersResult = { checked: 0, created: 0, skipped: 0, failed: 0 };

  let query = admin
    .from("customer_subscriptions")
    .select(
      "id, store_id, status, period, paused_at, resumes_at, next_order_at, orders_count, customer_id, customer_name, customer_phone, customer_email, delivery_type, delivery_fee, delivery_address, notes, items, store:stores(name)",
    )
    .in("status", ["active", "trialing"])
    .lte("next_order_at", now.toISOString())
    .limit(options.limit ?? 200);
  if (options.storeId) query = query.eq("store_id", options.storeId);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[assinaturas] falha ao listar assinaturas vencidas", error.message);
    return result;
  }

  for (const row of rows ?? []) {
    result.checked += 1;

    // Pausa com retorno programado: volta sozinha quando a data chega.
    if (row.paused_at && row.resumes_at && new Date(row.resumes_at).getTime() <= now.getTime()) {
      await admin
        .from("customer_subscriptions")
        .update({ paused_at: null, resumes_at: null, status: "active" })
        .eq("id", row.id);
      row.paused_at = null;
    }

    if (!isDue(row, now)) {
      result.skipped += 1;
      continue;
    }

    const order = await createOrderFromSubscription(row, now, admin) as never;
    void order;
    const created = await createOrderFromSubscription(admin, row, now);
    if (!created) {
      result.failed += 1;
      await admin
        .from("customer_subscriptions")
        .update({ last_error: "Não foi possível gerar o pedido recorrente.", next_order_at: nextCycleDate(row.period, now) })
        .eq("id", row.id);
      continue;
    }

    result.created += 1;

    await admin
      .from("customer_subscriptions")
      .update({
        last_order_at: now.toISOString(),
        orders_count: Number(row.orders_count ?? 0) + 1,
        next_order_at: nextCycleDate(row.period, now),
        current_period_end: nextCycleDate(row.period, now),
        last_error: null,
      })
      .eq("id", row.id);

    await notifyCustomer(admin, {
      storeId: row.store_id,
      customerId: row.customer_id,
      phone: row.customer_phone,
      firstName: (row.customer_name ?? "").trim().split(" ")[0] || "Olá",
      storeName: (row.store as { name: string } | null)?.name ?? "loja",
      orderCode: created.code,
      publicToken: created.publicToken,
    });
  }

  return result;
}

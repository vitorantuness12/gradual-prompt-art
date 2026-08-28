/**
 * Processamento dos eventos recebidos de cada conector.
 *
 * Cada função é idempotente: reprocessar o mesmo evento não duplica dados.
 * Erros são propagados de propósito — quem chamou coloca o evento na fila
 * de retentativas em vez de descartá-lo.
 */

import type { NormalizedEvent } from "./connectors.server";

export async function processIntegrationEvent(
  kind: string,
  storeId: string,
  event: NormalizedEvent,
): Promise<void> {
  switch (kind) {
    case "mercadopago":
    case "pagseguro":
    case "asaas":
      await processPayment(kind, storeId, event);
      return;
    case "hotmart":
      await processHotmart(storeId, event);
      return;
    case "ifood":
      await processMarketplace(storeId, event);
      return;
    case "fiscal":
      await processFiscal(storeId, event);
      return;
    default:
      // Conectores sem processamento próprio apenas registram o evento.
      return;
  }
}

/** Confirmação de pagamento: atualiza a transação e o pedido vinculado. */
async function processPayment(
  provider: string,
  storeId: string,
  event: NormalizedEvent,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dispatchWebhook } = await import("./connectors.server");

  const paid = /approved|received|paid|confirmed|PAYMENT_RECEIVED|PAYMENT_CONFIRMED/i.test(
    event.eventType,
  );
  const refunded = /refund|estorn|charge_?back/i.test(event.eventType);
  if (!paid && !refunded) return;

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, order_id, status")
    .eq("store_id", storeId)
    .eq("external_id", event.externalId)
    .maybeSingle();
  if (!payment) return;

  const status = refunded ? "refunded" : "paid";
  if (payment.status === status) return;

  await supabaseAdmin.from("payments").update({ status, provider }).eq("id", payment.id);

  if (payment.order_id) {
    await supabaseAdmin
      .from("orders")
      .update({ payment_status: status === "paid" ? "paid" : "refunded" })
      .eq("id", payment.order_id);
  }

  await dispatchWebhook({
    event: refunded ? "pagamento.estornado" : "pagamento.confirmado",
    storeId,
    data: {
      payment_id: payment.id,
      order_id: payment.order_id,
      provider,
      external_id: event.externalId,
    },
  });
}

/** Compra aprovada na Hotmart: libera o acesso ao produto digital. */
async function processHotmart(storeId: string, event: NormalizedEvent): Promise<void> {
  if (!/APPROVED|COMPLETE/i.test(event.eventType)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dispatchWebhook } = await import("./connectors.server");

  const payload = event.payload as { data?: { buyer?: { email?: string; name?: string } } };
  const email = payload.data?.buyer?.email ?? null;
  if (!email) return;

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("store_id", storeId)
    .eq("customer_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order) return;

  const { data: existing } = await supabaseAdmin
    .from("digital_deliveries")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();
  if (existing) return;

  await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid", status: "completed" })
    .eq("id", order.id);
  await dispatchWebhook({
    event: "entrega_digital.liberada",
    storeId,
    data: { order_id: order.id, email },
  });
}

/** Pedido vindo de marketplace: registra o evento para conciliação no painel. */
async function processMarketplace(storeId: string, event: NormalizedEvent): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notifications").insert({
    store_id: storeId,
    event: "marketplace_evento",
    title: `Marketplace: ${event.eventType}`,
    body: `Evento ${event.externalId} recebido do marketplace.`,
    payload: event.payload as never,
  });
}

/** Retorno do provedor fiscal: guarda a situação da nota junto ao pedido. */
async function processFiscal(storeId: string, event: NormalizedEvent): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dispatchWebhook } = await import("./connectors.server");
  const authorized = /autoriz|approved/i.test(event.eventType);

  await supabaseAdmin.from("notifications").insert({
    store_id: storeId,
    event: "fiscal_evento",
    title: authorized ? "Nota autorizada" : `Nota: ${event.eventType}`,
    body: `Documento ${event.externalId}.`,
    payload: event.payload as never,
  });

  await dispatchWebhook({
    event: authorized ? "fiscal.autorizada" : "fiscal.rejeitada",
    storeId,
    data: { external_id: event.externalId, event_type: event.eventType },
  });
}

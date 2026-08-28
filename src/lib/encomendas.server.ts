/**
 * Lembretes automáticos das encomendas:
 * - aprovar o orçamento antes da data de corte;
 * - pagar o saldo antes da entrega.
 *
 * Roda pela rotina agendada e envia por e-mail e WhatsApp, sem repetir
 * o mesmo aviso dentro de 24 horas.
 */

import { sendStoreEmail } from "@/lib/digitais.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const DAY = 86_400_000;

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function when(value: string | null): string {
  if (!value) return "a combinar";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function whatsapp(
  admin: Admin,
  storeId: string,
  phone: string | null,
  body: string,
  templateKey: string,
  orderId?: string | null,
) {
  if (!phone) return;
  const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");
  await sendWhatsappMessage(admin, {
    storeId,
    phone,
    body,
    messageType: "transactional",
    templateKey,
    orderId: orderId ?? null,
  });
}

export interface ReminderRun {
  quotes: number;
  balances: number;
}

/** Avisa clientes com orçamento aberto e com saldo a pagar antes da entrega. */
export async function runOrderReminders(
  admin: Admin,
  options: { baseUrl?: string } = {},
): Promise<ReminderRun> {
  const baseUrl = options.baseUrl ?? process.env["PUBLIC_BASE_URL"] ?? "https://oseupedido.com.br";
  const now = Date.now();
  const cutoffAgo = new Date(now - DAY).toISOString();
  const result: ReminderRun = { quotes: 0, balances: 0 };

  /* ---- Lembrete de aprovação do orçamento ---- */
  const { data: quotes } = await admin
    .from("quotes")
    .select(
      "id, store_id, public_token, customer_name, customer_email, customer_phone, total, deposit_amount, event_at, valid_until, approval_reminder_at, store:stores(name), settings:production_settings!inner(cutoff_days)",
    )
    .eq("status", "sent")
    .or(`approval_reminder_at.is.null,approval_reminder_at.lt.${cutoffAgo}`)
    .limit(200);

  for (const quote of quotes ?? []) {
    const cutoffDays = Number(quote.settings?.cutoff_days ?? 0) || 0;
    const deadline = quote.event_at
      ? new Date(quote.event_at).getTime() - cutoffDays * DAY
      : quote.valid_until
        ? new Date(quote.valid_until).getTime()
        : null;
    if (deadline === null) continue;
    // Avisa nos 3 dias que antecedem o prazo de decisão.
    if (deadline < now || deadline - now > 3 * DAY) continue;

    const storeName = quote.store?.name ?? "Sua loja";
    const link = `${baseUrl}/orcamento/${quote.public_token}`;
    const body =
      `Olá, ${quote.customer_name}! Sua proposta na ${storeName} no valor de ${money(Number(quote.total ?? 0))} ` +
      `precisa ser aprovada até ${when(new Date(deadline).toISOString())} para garantirmos a produção. ` +
      `Aprove aqui: ${link}`;

    await sendStoreEmail(admin, quote.store_id, {
      to: quote.customer_email ?? null,
      subject: `Sua encomenda na ${storeName} está esperando aprovação`,
      body,
      event: "encomenda_aprovacao",
    });
    await whatsapp(admin, quote.store_id, quote.customer_phone ?? null, body, "encomenda_aprovacao");

    await admin.from("quotes").update({ approval_reminder_at: new Date().toISOString() }).eq("id", quote.id);
    result.quotes += 1;
  }

  /* ---- Lembrete de saldo antes da entrega ---- */
  const { data: orders } = await admin
    .from("orders")
    .select(
      "id, store_id, code, customer_name, customer_email, customer_phone, balance_due, scheduled_for, public_token, deposit_paid_at, balance_confirmed_at, balance_reminder_at, store:stores(name)",
    )
    .gt("balance_due", 0)
    .not("scheduled_for", "is", null)
    .not("status", "in", "(cancelled,rejected,delivered,completed)")
    .lte("scheduled_for", new Date(now + 2 * DAY).toISOString())
    .gte("scheduled_for", new Date(now).toISOString())
    .or(`balance_reminder_at.is.null,balance_reminder_at.lt.${cutoffAgo}`)
    .limit(200);

  for (const order of orders ?? []) {
    const storeName = order.store?.name ?? "Sua loja";
    const link = `${baseUrl}/encomenda/${order.public_token}`;
    const body =
      `Olá, ${order.customer_name}! Sua encomenda ${order.code} na ${storeName} está marcada para ` +
      `${when(order.scheduled_for)}. Falta o saldo de ${money(Number(order.balance_due ?? 0))}. ` +
      `Acompanhe a produção e confirme o pagamento aqui: ${link}`;

    await sendStoreEmail(admin, order.store_id, {
      to: order.customer_email ?? null,
      subject: `Saldo da sua encomenda ${order.code}`,
      body,
      event: "encomenda_saldo",
    });
    await whatsapp(admin, order.store_id, order.customer_phone ?? null, body, "encomenda_saldo", order.id);

    await admin.from("orders").update({ balance_reminder_at: new Date().toISOString() }).eq("id", order.id);
    result.balances += 1;
  }

  await raiseDelayAlerts(admin);

  return result;
}

/**
 * Alertas internos de risco de atraso: orçamento perto do corte sem resposta
 * e encomenda perto da entrega com a ficha de produção incompleta.
 */
export async function raiseDelayAlerts(admin: Admin): Promise<number> {
  const now = Date.now();
  const quiet = new Date(now - DAY).toISOString();
  let alerts = 0;

  const { data: quotes } = await admin
    .from("quotes")
    .select("id, store_id, code, customer_name, event_at, status")
    .eq("status", "sent")
    .not("event_at", "is", null)
    .lte("event_at", new Date(now + 2 * DAY).toISOString())
    .gte("event_at", new Date(now).toISOString())
    .limit(100);

  for (const quote of quotes ?? []) {
    await admin.from("notifications").insert({
      store_id: quote.store_id,
      event: "encomenda.risco_corte",
      title: `Risco no orçamento ${quote.code}`,
      body: `${quote.customer_name} ainda não aprovou e o evento é em ${when(quote.event_at)}. Confirme ou reprograme.`,
      channel: "painel",
    });
    alerts += 1;
  }

  const { data: orders } = await admin
    .from("orders")
    .select("id, store_id, code, customer_name, scheduled_for, delay_alert_at, order_checklist_items(done)")
    .not("scheduled_for", "is", null)
    .not("status", "in", "(cancelled,rejected,delivered,completed)")
    .lte("scheduled_for", new Date(now + DAY).toISOString())
    .gte("scheduled_for", new Date(now).toISOString())
    .or(`delay_alert_at.is.null,delay_alert_at.lt.${quiet}`)
    .limit(100);

  for (const order of orders ?? []) {
    const steps = (order.order_checklist_items ?? []) as { done: boolean }[];
    const pending = steps.filter((step) => !step.done).length;
    if (steps.length === 0 || pending === 0) continue;

    await admin.from("notifications").insert({
      store_id: order.store_id,
      order_id: order.id,
      event: "encomenda.risco_atraso",
      title: `Risco de atraso no pedido ${order.code}`,
      body: `Faltam ${pending} etapa(s) e a entrega é em ${when(order.scheduled_for)}. Reforce a equipe ou reprograme a data.`,
      channel: "painel",
    });
    await admin.from("orders").update({ delay_alert_at: new Date().toISOString() }).eq("id", order.id);
    alerts += 1;
  }

  return alerts;
}

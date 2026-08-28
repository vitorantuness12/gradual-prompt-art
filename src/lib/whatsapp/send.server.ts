/**
 * Camada interna de envio pelo WhatsApp (Evolution API).
 *
 * Toda mensagem passa por aqui: sempre com store_id, sempre pela instância da
 * própria loja, sempre com consentimento, limite de frequência e registro.
 */
import { maskPhone, renderWhatsappTemplate, type MessageVars } from "@/lib/whatsapp/eventos";
import {
  normalizePhone,
  sendText,
  type GlobalSettingsRow,
} from "@/lib/whatsapp/evolution.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export async function loadGlobalSettings(admin: Admin): Promise<GlobalSettingsRow | null> {
  const { data } = await admin.from("evolution_global_settings").select("*").limit(1).maybeSingle();
  return (data as GlobalSettingsRow | null) ?? null;
}

export async function loadStoreInstance(admin: Admin, storeId: string) {
  const { data } = await admin.from("whatsapp_instances").select("*").eq("store_id", storeId).maybeSingle();
  return data;
}

export interface SendOptions {
  storeId: string;
  phone: string;
  body: string;
  messageType?: "transactional" | "support" | "marketing";
  templateKey?: string | null;
  orderId?: string | null;
  customerId?: string | null;
  automationId?: string | null;
}

export interface SendOutcome {
  ok: boolean;
  status: "sent" | "failed" | "skipped" | "waiting_connection";
  message: string;
}

/** Envia uma mensagem pelo WhatsApp da loja, respeitando consentimento e limites. */
export async function sendWhatsappMessage(admin: Admin, options: SendOptions): Promise<SendOutcome> {
  const type = options.messageType ?? "transactional";
  const phone = normalizePhone(options.phone ?? "");

  async function log(status: string, error: string | null, response: Record<string, unknown> = {}, instanceId?: string | null) {
    await admin.from("whatsapp_message_logs").insert({
      store_id: options.storeId,
      instance_id: instanceId ?? null,
      order_id: options.orderId ?? null,
      customer_id: options.customerId ?? null,
      automation_id: options.automationId ?? null,
      phone_masked: phone ? maskPhone(phone) : null,
      message_type: type,
      template_key: options.templateKey ?? null,
      body_preview: options.body.slice(0, 200),
      status,
      provider_response: response as never,
      error,
    });
  }

  if (!phone) {
    await log("failed", "Telefone inválido.");
    return { ok: false, status: "failed", message: "Telefone do cliente em formato inválido." };
  }

  const settings = await loadGlobalSettings(admin);
  if (!settings || !settings.is_enabled || !settings.base_url || !settings.api_key) {
    await log("skipped", "Integração global desativada.");
    return { ok: false, status: "skipped", message: "Integração de WhatsApp desativada na plataforma." };
  }

  const instance = await loadStoreInstance(admin, options.storeId);
  if (!instance) {
    await log("skipped", "Loja sem instância.");
    return { ok: false, status: "skipped", message: "Esta loja ainda não conectou o WhatsApp." };
  }
  if (instance.status !== "open") {
    await log("waiting_connection", "WhatsApp desconectado.", {}, instance.id);
    return { ok: false, status: "waiting_connection", message: "Aguardando reconexão do WhatsApp." };
  }

  // Consentimento por tipo de mensagem.
  const { data: preference } = await admin
    .from("whatsapp_customer_preferences")
    .select("*")
    .eq("store_id", options.storeId)
    .eq("phone", phone)
    .maybeSingle();
  if (preference) {
    const blocked =
      (type === "marketing" && !preference.accept_marketing) ||
      (type === "support" && !preference.accept_support) ||
      (type === "transactional" && !preference.accept_orders);
    if (blocked || preference.opted_out_at) {
      await log("skipped", "Contato sem consentimento para este tipo de mensagem.", {}, instance.id);
      return { ok: false, status: "skipped", message: "Cliente optou por não receber este tipo de mensagem." };
    }
  } else if (type === "marketing") {
    await log("skipped", "Sem consentimento registrado para marketing.", {}, instance.id);
    return { ok: false, status: "skipped", message: "Sem consentimento registrado para mensagens promocionais." };
  }

  // Limite de frequência por contato (última hora) e antiduplicidade (10 min).
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("whatsapp_message_logs")
    .select("body_preview, created_at, status")
    .eq("store_id", options.storeId)
    .eq("phone_masked", maskPhone(phone))
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false })
    .limit(30);

  const sentRecently = (recent ?? []).filter((row) => row.status === "sent");
  if (sentRecently.length >= 12) {
    await log("skipped", "Limite de mensagens por hora atingido.", {}, instance.id);
    return { ok: false, status: "skipped", message: "Limite de mensagens por hora atingido para este contato." };
  }
  const tenMinAgo = Date.now() - 10 * 60_000;
  const duplicate = sentRecently.some(
    (row) => row.body_preview === options.body.slice(0, 200) && new Date(row.created_at).getTime() > tenMinAgo,
  );
  if (duplicate) {
    await log("skipped", "Mensagem duplicada.", {}, instance.id);
    return { ok: false, status: "skipped", message: "Mensagem idêntica já enviada há pouco." };
  }

  const { data: credentials } = await admin
    .from("whatsapp_instance_credentials")
    .select("token")
    .eq("instance_id", instance.id)
    .maybeSingle();

  const result = await sendText(settings, instance.instance_name, credentials?.token ?? null, phone, options.body);
  const providerId = (result.data as { key?: { id?: string } } | null)?.key?.id ?? null;

  await log(
    result.ok ? "sent" : "failed",
    result.ok ? null : (result.error ?? "Falha no envio."),
    { id: providerId, status: result.status },
    instance.id,
  );

  if (!result.ok) {
    const { data: logRow } = await admin
      .from("whatsapp_message_logs")
      .select("id")
      .eq("store_id", options.storeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    await admin.from("whatsapp_delivery_attempts").insert({
      store_id: options.storeId,
      message_log_id: logRow?.id ?? null,
      attempt: 1,
      status: "failed",
      error: result.error ?? "Falha no envio.",
      next_retry_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    return { ok: false, status: "failed", message: result.error ?? "Falha no envio." };
  }

  return { ok: true, status: "sent", message: "Mensagem enviada." };
}

function withinWindow(from: string | null, to: string | null): boolean {
  if (!from || !to) return true;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const start = (fh ?? 0) * 60 + (fm ?? 0);
  const end = (th ?? 23) * 60 + (tm ?? 59);
  return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
}

/** Executa as automações ativas para um evento da loja. */
export async function dispatchAutomation(
  admin: Admin,
  params: {
    storeId: string;
    event: string;
    phone: string;
    vars: MessageVars;
    orderId?: string | null;
    customerId?: string | null;
    orderType?: string | null;
  },
): Promise<{ executed: number; results: SendOutcome[] }> {
  const { data: rules } = await admin
    .from("whatsapp_automation_rules")
    .select("*")
    .eq("store_id", params.storeId)
    .eq("trigger_event", params.event)
    .eq("is_active", true);

  const results: SendOutcome[] = [];
  for (const rule of rules ?? []) {
    if (rule.order_type && params.orderType && rule.order_type !== params.orderType) continue;
    if (!withinWindow(rule.send_from, rule.send_to)) continue;

    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { count } = await admin
      .from("whatsapp_message_logs")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", rule.id)
      .eq("status", "sent")
      .gte("created_at", dayAgo);
    if ((count ?? 0) >= (rule.max_per_day ?? 200)) continue;

    const outcome = await sendWhatsappMessage(admin, {
      storeId: params.storeId,
      phone: params.phone,
      body: renderWhatsappTemplate(rule.message_body, params.vars),
      messageType: (rule.category as "transactional" | "support" | "marketing") ?? "transactional",
      templateKey: rule.trigger_event,
      orderId: params.orderId ?? null,
      customerId: params.customerId ?? null,
      automationId: rule.id,
    });
    results.push(outcome);

    await admin
      .from("whatsapp_automation_rules")
      .update({ last_run_at: new Date().toISOString(), run_count: (rule.run_count ?? 0) + 1 })
      .eq("id", rule.id);
  }

  return { executed: results.length, results };
}

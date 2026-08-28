/**
 * Apoio à área do cliente (histórico, repetir pedido, acompanhamento ao vivo)
 * e às notificações automáticas de mudança de situação do pedido.
 *
 * Regras de segurança concentradas aqui (nada roda no navegador):
 * - o acesso só existe depois do código de 6 dígitos enviado ao telefone;
 * - a sessão é um token assinado (HMAC) com validade curta, guardado apenas
 *   no navegador do cliente. Ele não dá acesso a nenhuma tabela, só serve para
 *   provar ao servidor qual telefone já foi verificado;
 * - notificações só saem para telefone verificado e sem recusa registrada.
 */
import { createHmac, timingSafeEqual } from "crypto";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export const SESSION_TTL_HOURS = 12;

function sessionSecret(): string {
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["VAPID_PRIVATE_KEY"] ??
    process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Sessão do cliente indisponível: segredo do servidor ausente.");
  return key;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/** Cria o token de sessão do cliente para o telefone já verificado. */
export function issueSession(phoneE164: string): { token: string; expiresAt: string } {
  const expires = Date.now() + SESSION_TTL_HOURS * 3_600_000;
  const payload = base64url(JSON.stringify({ p: phoneE164, exp: expires }));
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expires).toISOString() };
}

export interface SessionRead {
  ok: boolean;
  phoneE164: string;
  message: string;
}

/** Confere assinatura e validade do token; devolve o telefone verificado. */
export function readSession(token: string): SessionRead {
  const invalid: SessionRead = {
    ok: false,
    phoneE164: "",
    message: "Sua sessão expirou. Confirme o telefone novamente.",
  };

  const parts = (token ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid;

  const expected = Buffer.from(sign(parts[0]));
  const received = Buffer.from(parts[1]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return invalid;

  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as {
      p?: string;
      exp?: number;
    };
    if (!data.p || !data.exp || data.exp < Date.now()) return invalid;
    return { ok: true, phoneE164: data.p, message: "" };
  } catch {
    return invalid;
  }
}

export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Compara telefones pelos últimos 11 dígitos (formato nacional). */
export function samePhone(a: string, b: string): boolean {
  return onlyDigits(a).slice(-11) === onlyDigits(b).slice(-11);
}

/**
 * Marca o telefone como verificado nas lojas onde ele tem cadastro e registra
 * a autorização para receber avisos de pedido (pode ser desligada depois).
 */
export async function markPhoneVerified(admin: Admin, phoneE164: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: customers } = await admin
    .from("customers")
    .select("id, store_id")
    .eq("phone_e164", phoneE164);

  for (const customer of customers ?? []) {
    await admin.from("customers").update({ phone_verified_at: now }).eq("id", customer.id);
    await setOrderNotifications(admin, customer.store_id, phoneE164, { whatsapp: true });
  }
}

export interface NotificationPrefs {
  whatsapp: boolean;
  email: boolean;
}

/** Preferências de aviso do cliente naquela loja (padrão: WhatsApp ligado). */
export async function readNotificationPrefs(
  admin: Admin,
  storeId: string,
  phoneE164: string,
): Promise<NotificationPrefs> {
  const { data: pref } = await admin
    .from("whatsapp_customer_preferences")
    .select("accept_orders, opted_out_at")
    .eq("store_id", storeId)
    .eq("phone", phoneE164)
    .maybeSingle();

  const { data: consent } = await admin
    .from("customer_consents")
    .select("accepted")
    .eq("store_id", storeId)
    .eq("phone_e164", phoneE164)
    .eq("kind", "order_updates_email")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    whatsapp: Boolean(pref ? pref.accept_orders && !pref.opted_out_at : true),
    email: Boolean(consent?.accepted),
  };
}

/** Grava as preferências escolhidas pelo cliente (sem sobrescrever o que não mudou). */
export async function setOrderNotifications(
  admin: Admin,
  storeId: string,
  phoneE164: string,
  patch: { whatsapp?: boolean; email?: boolean },
): Promise<void> {
  if (typeof patch.whatsapp === "boolean") {
    const { data: existing } = await admin
      .from("whatsapp_customer_preferences")
      .select("id")
      .eq("store_id", storeId)
      .eq("phone", phoneE164)
      .maybeSingle();

    const values = {
      accept_orders: patch.whatsapp,
      opted_out_at: patch.whatsapp ? null : new Date().toISOString(),
      source: "area_cliente",
    };

    if (existing) {
      await admin.from("whatsapp_customer_preferences").update(values).eq("id", existing.id);
    } else {
      await admin
        .from("whatsapp_customer_preferences")
        .insert({ store_id: storeId, phone: phoneE164, ...values });
    }
  }

  if (typeof patch.email === "boolean") {
    await admin.from("customer_consents").insert({
      store_id: storeId,
      phone_e164: phoneE164,
      kind: "order_updates_email",
      accepted: patch.email,
      source: "area_cliente",
    });
  }
}

const STATUS_MESSAGE: Record<string, string> = {
  confirmed: "foi confirmado pela loja",
  preparing: "entrou em preparo",
  ready: "está pronto",
  out_for_delivery: "saiu para entrega",
  delivered: "foi entregue",
  picked_up: "foi retirado",
  completed: "foi concluído",
  cancelled: "foi cancelado",
  rejected: "não pôde ser aceito",
  paid: "teve o pagamento aprovado",
  awaiting_payment: "está aguardando o pagamento",
  pending: "foi recebido pela loja",
};

export function statusSentence(status: string): string {
  return STATUS_MESSAGE[status] ?? "teve uma atualização";
}

export interface NotifyResult {
  whatsapp: "sent" | "skipped" | "failed" | "handled_by_store";
  email: "sent" | "skipped" | "failed";
}

/**
 * Avisa o cliente sobre a nova situação do pedido.
 * Só envia para telefone verificado e com autorização ativa. Quando a loja
 * já tem automação própria para o evento, o WhatsApp é deixado para ela,
 * evitando mensagem duplicada.
 */
export async function notifyCustomerStatus(
  admin: Admin,
  input: { orderId: string; status: string; event?: string | null },
): Promise<NotifyResult> {
  const result: NotifyResult = { whatsapp: "skipped", email: "skipped" };

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, store_id, code, status, total, public_token, customer_name, customer_phone, customer_id, store:stores(name, slug)",
    )
    .eq("id", input.orderId)
    .maybeSingle();

  if (!order || !order.customer_phone) return result;

  const { normalizePhoneBR } = await import("@/lib/phone");
  const phone = normalizePhoneBR(order.customer_phone);
  if (!phone.ok) return result;

  const { data: customer } = await admin
    .from("customers")
    .select("id, name, email, phone_verified_at")
    .eq("store_id", order.store_id)
    .eq("phone_e164", phone.e164)
    .maybeSingle();

  // "Passar pela verificação" é o que autoriza o aviso automático.
  if (!customer?.phone_verified_at) return result;

  const prefs = await readNotificationPrefs(admin, order.store_id, phone.e164);
  const store = order.store as { name: string; slug: string } | null;
  const storeName = store?.name ?? "a loja";
  const link = `https://oseupedido.com.br/acompanhar?codigo=${encodeURIComponent(order.public_token)}`;
  const sentence = statusSentence(input.status);
  const firstName = (customer.name ?? order.customer_name ?? "").trim().split(" ")[0] || "Olá";

  if (prefs.whatsapp) {
    const event = input.event ?? null;
    let storeHandles = false;
    if (event) {
      const { data: rule } = await admin
        .from("whatsapp_automation_rules")
        .select("id")
        .eq("store_id", order.store_id)
        .eq("trigger_event", event)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      storeHandles = Boolean(rule);
    }

    if (storeHandles) {
      result.whatsapp = "handled_by_store";
    } else {
      try {
        const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");
        const outcome = await sendWhatsappMessage(admin, {
          storeId: order.store_id,
          phone: phone.e164,
          body: `${firstName}, seu pedido #${order.code} na ${storeName} ${sentence}. Acompanhe aqui: ${link}`,
          messageType: "transactional",
          templateKey: "cliente_status_pedido",
          orderId: order.id,
          customerId: customer.id,
        });
        result.whatsapp = outcome.ok ? "sent" : "failed";
      } catch (error) {
        console.error("[cliente] aviso por whatsapp", error);
        result.whatsapp = "failed";
      }
    }
  }

  if (prefs.email && customer.email) {
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("order-status", customer.email, {
        idempotencyKey: `order-status:${order.id}:${input.status}`,
        templateData: {
          customerName: firstName,
          storeName,
          orderCode: order.code,
          statusSentence: sentence,
          trackingUrl: link,
          total: Number(order.total),
        },
      });
      result.email = "sent";
    } catch (error) {
      console.error("[cliente] aviso por e-mail", error);
      result.email = "failed";
    }
  }

  return result;
}

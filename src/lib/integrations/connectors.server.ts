/**
 * Adaptadores de servidor da central de integrações.
 *
 * Responsabilidades:
 * - conferir a assinatura do webhook de cada provedor antes de ler o corpo;
 * - extrair um evento normalizado (id externo + tipo) para idempotência;
 * - testar a conexão com as credenciais salvas;
 * - assinar e entregar os webhooks de saída da loja, com fila de retentativas.
 *
 * Sem credenciais o conector responde em modo demonstração: nada sai para fora.
 */

import { nextRetryDelay } from "./catalog";

export interface StoredCredentials {
  apiKey: string | null;
  apiSecret: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  webhookSecret: string | null;
  extra: Record<string, unknown>;
}

export interface NormalizedEvent {
  externalId: string;
  eventType: string;
  payload: unknown;
}

export interface TestResult {
  ok: boolean;
  demo: boolean;
  message: string;
}

export interface Connector {
  kind: string;
  verifySignature: (
    headers: Headers,
    rawBody: string,
    credentials: StoredCredentials,
  ) => Promise<boolean>;
  parseEvent: (rawBody: string, headers: Headers) => NormalizedEvent;
  test: (credentials: StoredCredentials, sandbox: boolean) => Promise<TestResult>;
}

/** Comparação em tempo constante. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function json(rawBody: string): Record<string, unknown> {
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fallbackId(prefix: string, rawBody: string): string {
  // Sem id do provedor usamos o hash do corpo: repetições continuam sendo
  // descartadas pela chave única de idempotência.
  let hash = 0;
  for (let index = 0; index < rawBody.length; index += 1) {
    hash = (hash * 31 + rawBody.charCodeAt(index)) | 0;
  }
  return `${prefix}-${Math.abs(hash)}`;
}

/** Assinatura HMAC-SHA256 padrão em um cabeçalho. */
function hmacConnector(
  kind: string,
  header: string,
  idField: string,
  typeField: string,
): Connector {
  return {
    kind,
    verifySignature: async (headers, rawBody, credentials) => {
      const secretValue = credentials.webhookSecret;
      if (!secretValue) return false;
      const received = (headers.get(header) ?? "").replace(/^sha256=/, "").trim();
      if (!received) return false;
      return safeEqual(received, await hmacHex(secretValue, rawBody));
    },
    parseEvent: (rawBody) => {
      const body = json(rawBody);
      return {
        externalId: String(body[idField] ?? fallbackId(kind, rawBody)),
        eventType: String(body[typeField] ?? "evento"),
        payload: body,
      };
    },
    test: async (credentials) => {
      const configured = Boolean(credentials.apiKey || credentials.accessToken);
      return configured
        ? {
            ok: true,
            demo: false,
            message: "Credenciais salvas. Conector pronto para receber eventos.",
          }
        : { ok: true, demo: true, message: "Modo demonstração: nenhum dado sai da plataforma." };
    },
  };
}

/** ---------- WhatsApp Business Cloud API ---------- */

const whatsapp: Connector = {
  kind: "whatsapp",
  verifySignature: async (headers, rawBody, credentials) => {
    if (!credentials.webhookSecret) return false;
    const received = (headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
    if (!received) return false;
    return safeEqual(received, await hmacHex(credentials.webhookSecret, rawBody));
  },
  parseEvent: (rawBody) => {
    const body = json(rawBody);
    const entry = (
      body["entry"] as { id?: string; changes?: { value?: unknown }[] }[] | undefined
    )?.[0];
    const change = entry?.changes?.[0]?.value as
      { messages?: { id?: string }[]; statuses?: { id?: string; status?: string }[] } | undefined;
    const messageId = change?.messages?.[0]?.id ?? change?.statuses?.[0]?.id;
    return {
      externalId: messageId ?? fallbackId("whatsapp", rawBody),
      eventType: change?.messages
        ? "mensagem_recebida"
        : (change?.statuses?.[0]?.status ?? "status_mensagem"),
      payload: body,
    };
  },
  test: async (credentials) => {
    const phoneNumberId = String(
      credentials.extra["phoneNumberId"] ?? credentials.extra["extra"] ?? "",
    );
    if (!credentials.accessToken || !phoneNumberId) {
      return {
        ok: true,
        demo: true,
        message: "Modo demonstração: mensagens simuladas na central de atendimento.",
      };
    }
    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
      if (!response.ok)
        return {
          ok: false,
          demo: false,
          message: `A Meta respondeu ${response.status}. Confira o token e o número.`,
        };
      return { ok: true, demo: false, message: "Número conectado à API oficial do WhatsApp." };
    } catch {
      return { ok: false, demo: false, message: "Não foi possível falar com a API da Meta agora." };
    }
  },
};

/** ---------- Mercado Pago ---------- */

const mercadopago: Connector = {
  kind: "mercadopago",
  verifySignature: async (headers, rawBody, credentials) => {
    if (!credentials.webhookSecret) return false;
    const header = headers.get("x-signature") ?? "";
    const parts = Object.fromEntries(
      header
        .split(",")
        .map((piece) => piece.split("=").map((value) => value.trim()) as [string, string]),
    );
    const received = parts["v1"];
    if (!received) return false;
    const requestId = headers.get("x-request-id") ?? "";
    const dataId = String(
      json(rawBody)["data"] instanceof Object
        ? ((json(rawBody)["data"] as { id?: string }).id ?? "")
        : "",
    );
    const manifest = `id:${dataId};request-id:${requestId};ts:${parts["ts"] ?? ""};`;
    return safeEqual(received, await hmacHex(credentials.webhookSecret, manifest));
  },
  parseEvent: (rawBody) => {
    const body = json(rawBody);
    const data = (body["data"] ?? {}) as { id?: string };
    return {
      externalId: String(body["id"] ?? data.id ?? fallbackId("mercadopago", rawBody)),
      eventType: String(body["type"] ?? body["action"] ?? "payment.updated"),
      payload: body,
    };
  },
  test: async (credentials) => {
    if (!credentials.accessToken) {
      return {
        ok: true,
        demo: true,
        message: "Modo demonstração: Pix pela chave da loja e confirmação manual.",
      };
    }
    try {
      const response = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
      if (!response.ok)
        return {
          ok: false,
          demo: false,
          message: `Mercado Pago respondeu ${response.status}. Verifique o access token.`,
        };
      return { ok: true, demo: false, message: "Conta do Mercado Pago conectada." };
    } catch {
      return {
        ok: false,
        demo: false,
        message: "Não foi possível falar com o Mercado Pago agora.",
      };
    }
  },
};

/** ---------- Asaas ---------- */

const asaas: Connector = {
  kind: "asaas",
  verifySignature: async (headers, _rawBody, credentials) => {
    if (!credentials.webhookSecret) return false;
    const received = headers.get("asaas-access-token") ?? "";
    if (!received) return false;
    return safeEqual(received, credentials.webhookSecret);
  },
  parseEvent: (rawBody) => {
    const body = json(rawBody);
    const payment = (body["payment"] ?? {}) as { id?: string };
    return {
      externalId: String(body["id"] ?? payment.id ?? fallbackId("asaas", rawBody)),
      eventType: String(body["event"] ?? "PAYMENT_UPDATED"),
      payload: body,
    };
  },
  test: async (credentials, sandbox) => {
    if (!credentials.apiKey) {
      return {
        ok: true,
        demo: true,
        message: "Modo demonstração: cobranças registradas manualmente.",
      };
    }
    const base = sandbox ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
    try {
      const response = await fetch(`${base}/myAccount`, {
        headers: { access_token: credentials.apiKey },
      });
      if (!response.ok)
        return {
          ok: false,
          demo: false,
          message: `Asaas respondeu ${response.status}. Verifique a chave de API.`,
        };
      return {
        ok: true,
        demo: false,
        message: "Conta Asaas conectada para cobranças e recorrência.",
      };
    } catch {
      return { ok: false, demo: false, message: "Não foi possível falar com o Asaas agora." };
    }
  },
};

/** ---------- Hotmart ---------- */

const hotmart: Connector = {
  kind: "hotmart",
  verifySignature: async (headers, _rawBody, credentials) => {
    if (!credentials.webhookSecret) return false;
    const received = headers.get("x-hotmart-hottok") ?? "";
    if (!received) return false;
    return safeEqual(received, credentials.webhookSecret);
  },
  parseEvent: (rawBody) => {
    const body = json(rawBody);
    const data = (body["data"] ?? {}) as { purchase?: { transaction?: string } };
    return {
      externalId: String(
        body["id"] ?? data.purchase?.transaction ?? fallbackId("hotmart", rawBody),
      ),
      eventType: String(body["event"] ?? "PURCHASE_APPROVED"),
      payload: body,
    };
  },
  test: async (credentials) =>
    credentials.accessToken
      ? {
          ok: true,
          demo: false,
          message: "Token salvo. A liberação do acesso ocorre na aprovação da compra.",
        }
      : {
          ok: true,
          demo: true,
          message: "Modo demonstração: liberação manual do produto digital.",
        },
};

/** ---------- Mapas ---------- */

const maps: Connector = {
  kind: "maps",
  verifySignature: async () => false,
  parseEvent: (rawBody) => ({
    externalId: fallbackId("maps", rawBody),
    eventType: "evento",
    payload: json(rawBody),
  }),
  test: async (credentials) => {
    if (!credentials.apiKey) {
      return {
        ok: true,
        demo: true,
        message: "Modo demonstração: distância estimada pelas zonas de entrega.",
      };
    }
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=Bras%C3%ADlia&key=${encodeURIComponent(credentials.apiKey)}`,
      );
      const body = (await response.json()) as { status?: string; error_message?: string };
      if (body.status === "OK") return { ok: true, demo: false, message: "Chave de mapas válida." };
      return {
        ok: false,
        demo: false,
        message: body.error_message ?? `Provedor respondeu ${body.status ?? "erro"}.`,
      };
    } catch {
      return {
        ok: false,
        demo: false,
        message: "Não foi possível validar a chave de mapas agora.",
      };
    }
  },
};

const CONNECTORS: Record<string, Connector> = {
  whatsapp,
  mercadopago,
  asaas,
  hotmart,
  maps,
  pagseguro: hmacConnector("pagseguro", "x-authenticity-token", "id", "event"),
  ifood: hmacConnector("ifood", "x-ifood-signature", "id", "code"),
  fiscal: hmacConnector("fiscal", "x-signature", "id", "event"),
  email: hmacConnector("email", "svix-signature", "id", "type"),
  push: hmacConnector("push", "x-signature", "id", "event"),
  analytics: hmacConnector("analytics", "x-signature", "id", "event"),
};

export function getConnector(kind: string): Connector | null {
  return CONNECTORS[kind] ?? null;
}

/** ---------- Webhooks de saída ---------- */

export interface OutboundPayload {
  event: string;
  storeId: string;
  data: Record<string, unknown>;
}

/**
 * Enfileira o evento para todos os endpoints ativos da loja que o assinam
 * e tenta a primeira entrega imediatamente.
 */
export async function dispatchWebhook(payload: OutboundPayload): Promise<{ queued: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: endpoints } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("*")
    .eq("store_id", payload.storeId)
    .eq("is_active", true);

  const targets = (endpoints ?? []).filter(
    (endpoint) => endpoint.events.length === 0 || endpoint.events.includes(payload.event),
  );

  for (const endpoint of targets) {
    const { data: delivery } = await supabaseAdmin
      .from("webhook_deliveries")
      .insert({
        store_id: payload.storeId,
        endpoint_id: endpoint.id,
        event: payload.event,
        payload: payload.data as never,
      })
      .select("*")
      .maybeSingle();
    if (delivery) await attemptDelivery(delivery.id);
  }

  return { queued: targets.length };
}

/** Executa uma tentativa de entrega e agenda a próxima em caso de falha. */
export async function attemptDelivery(deliveryId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: delivery } = await supabaseAdmin
    .from("webhook_deliveries")
    .select("*, webhook_endpoints(url, secret, is_active)")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!delivery) return false;

  const endpoint = (
    delivery as unknown as {
      webhook_endpoints: { url: string; secret: string; is_active: boolean } | null;
    }
  ).webhook_endpoints;
  if (!endpoint || !endpoint.is_active) return false;

  const attempts = delivery.attempts + 1;
  const body = JSON.stringify({
    id: delivery.event_id,
    event: delivery.event,
    created_at: delivery.created_at,
    data: delivery.payload,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacHex(endpoint.secret, `${timestamp}.${body}`);

  let responseStatus: number | null = null;
  let error: string | null = null;

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-seupedido-event": delivery.event,
        "x-seupedido-delivery": delivery.event_id,
        "x-seupedido-timestamp": String(timestamp),
        "x-seupedido-signature": `t=${timestamp},v1=${signature}`,
      },
      body,
    });
    responseStatus = response.status;
    if (!response.ok) error = `Destino respondeu ${response.status}.`;
  } catch (fetchError) {
    error = fetchError instanceof Error ? fetchError.message : "Falha de rede.";
  }

  const success = responseStatus != null && responseStatus >= 200 && responseStatus < 300;
  const delay = success ? null : nextRetryDelay(attempts);

  await supabaseAdmin
    .from("webhook_deliveries")
    .update({
      attempts,
      response_status: responseStatus,
      error,
      status: success ? "delivered" : delay ? "retrying" : "failed",
      delivered_at: success ? new Date().toISOString() : null,
      next_retry_at: delay ? new Date(Date.now() + delay * 1000).toISOString() : null,
    })
    .eq("id", delivery.id);

  await supabaseAdmin
    .from("webhook_endpoints")
    .update({
      last_delivery_at: new Date().toISOString(),
      last_status: responseStatus,
      failure_count: success ? 0 : attempts,
    })
    .eq("id", delivery.endpoint_id);

  return success;
}

/** Processa a fila: entregas pendentes e eventos de entrada com erro. */
export async function processRetryQueue(
  limit = 25,
): Promise<{ deliveries: number; events: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  const { data: deliveries } = await supabaseAdmin
    .from("webhook_deliveries")
    .select("id")
    .eq("status", "retrying")
    .lte("next_retry_at", now)
    .limit(limit);

  for (const delivery of deliveries ?? []) {
    await attemptDelivery(delivery.id);
  }

  const { data: events } = await supabaseAdmin
    .from("integration_events")
    .select("id, attempts")
    .eq("status", "retrying")
    .lte("next_retry_at", now)
    .limit(limit);

  for (const event of events ?? []) {
    const attempts = event.attempts + 1;
    const delay = nextRetryDelay(attempts);
    await supabaseAdmin
      .from("integration_events")
      .update({
        attempts,
        status: delay ? "retrying" : "failed",
        next_retry_at: delay ? new Date(Date.now() + delay * 1000).toISOString() : null,
      })
      .eq("id", event.id);
  }

  return { deliveries: (deliveries ?? []).length, events: (events ?? []).length };
}

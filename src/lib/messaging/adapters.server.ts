/**
 * Adaptadores de canal de atendimento.
 *
 * Cada canal implementa a mesma interface, então o restante do sistema envia
 * mensagens sem saber qual serviço está por trás. A integração de WhatsApp é
 * exclusivamente a oficial (WhatsApp Business Cloud API da Meta) — nenhum
 * método não oficial é usado.
 *
 * Sem credenciais, o adaptador entra em modo demonstração: a mensagem é
 * registrada e marcada como simulada, sem sair para fora da plataforma.
 */

export interface ChannelCredentials {
  accessToken: string | null;
  verifyToken: string | null;
  appSecret: string | null;
  extra: Record<string, unknown>;
}

export interface ChannelConfig {
  channel: string;
  demoMode: boolean;
  accountId: string | null;
  phoneNumberId: string | null;
  displayNumber: string | null;
  fromEmail: string | null;
  botUsername: string | null;
}

export interface SendResult {
  ok: boolean;
  demo: boolean;
  externalId: string | null;
  error?: string;
}

export interface TestResult {
  ok: boolean;
  message: string;
}

export interface ChannelAdapter {
  id: string;
  label: string;
  send: (
    config: ChannelConfig,
    credentials: ChannelCredentials,
    to: string,
    body: string,
  ) => Promise<SendResult>;
  test: (config: ChannelConfig, credentials: ChannelCredentials) => Promise<TestResult>;
  /** Extrai as mensagens recebidas de um payload de webhook. */
  parseWebhook: (payload: unknown) => InboundMessage[];
  /** Baixa uma mídia recebida (usado para áudio). */
  fetchMedia?: (credentials: ChannelCredentials, mediaId: string) => Promise<ArrayBuffer | null>;
}

export interface InboundMessage {
  externalId: string;
  contact: string;
  contactName: string | null;
  text: string | null;
  mediaId: string | null;
  mediaType: string | null;
}

function demoSend(): SendResult {
  return { ok: true, demo: true, externalId: `demo-${crypto.randomUUID()}` };
}

/** ---------- WhatsApp Business Cloud API (oficial) ---------- */

const GRAPH = "https://graph.facebook.com/v21.0";

const whatsappAdapter: ChannelAdapter = {
  id: "whatsapp",
  label: "WhatsApp Business Cloud API",
  send: async (config, credentials, to, body) => {
    if (config.demoMode || !credentials.accessToken || !config.phoneNumberId) return demoSend();
    try {
      const response = await fetch(`${GRAPH}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/\D/g, ""),
          type: "text",
          text: { preview_url: true, body },
        }),
      });
      const json = (await response.json()) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!response.ok) return { ok: false, demo: false, externalId: null, error: json.error?.message ?? "Falha no envio." };
      return { ok: true, demo: false, externalId: json.messages?.[0]?.id ?? null };
    } catch {
      return { ok: false, demo: false, externalId: null, error: "Canal indisponível no momento." };
    }
  },
  test: async (config, credentials) => {
    if (!credentials.accessToken || !config.phoneNumberId) {
      return { ok: false, message: "Informe o token e o ID do número para testar a conexão." };
    }
    try {
      const response = await fetch(`${GRAPH}/${config.phoneNumberId}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
      const json = (await response.json()) as {
        display_phone_number?: string;
        verified_name?: string;
        error?: { message?: string };
      };
      if (!response.ok) return { ok: false, message: json.error?.message ?? "Credenciais recusadas pela Meta." };
      return {
        ok: true,
        message: `Conectado a ${json.verified_name ?? "conta"} (${json.display_phone_number ?? "número"}).`,
      };
    } catch {
      return { ok: false, message: "Não foi possível falar com a API do WhatsApp agora." };
    }
  },
  parseWebhook: (payload) => {
    const body = payload as {
      entry?: {
        changes?: {
          value?: {
            contacts?: { profile?: { name?: string }; wa_id?: string }[];
            messages?: {
              id?: string;
              from?: string;
              type?: string;
              text?: { body?: string };
              audio?: { id?: string };
              image?: { id?: string };
            }[];
          };
        }[];
      }[];
    };
    const result: InboundMessage[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const name = value.contacts?.[0]?.profile?.name ?? null;
        for (const message of value.messages ?? []) {
          result.push({
            externalId: message.id ?? crypto.randomUUID(),
            contact: message.from ?? "",
            contactName: name,
            text: message.text?.body ?? null,
            mediaId: message.audio?.id ?? message.image?.id ?? null,
            mediaType: message.audio ? "audio" : message.image ? "image" : null,
          });
        }
      }
    }
    return result;
  },
  fetchMedia: async (credentials, mediaId) => {
    if (!credentials.accessToken) return null;
    const meta = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!meta.ok) return null;
    const { url } = (await meta.json()) as { url?: string };
    if (!url) return null;
    const file = await fetch(url, { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    if (!file.ok) return null;
    return file.arrayBuffer();
  },
};

/** ---------- Telegram Bot API ---------- */

const telegramAdapter: ChannelAdapter = {
  id: "telegram",
  label: "Telegram",
  send: async (config, credentials, to, body) => {
    if (config.demoMode || !credentials.accessToken) return demoSend();
    try {
      const response = await fetch(`https://api.telegram.org/bot${credentials.accessToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: to, text: body }),
      });
      const json = (await response.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!json.ok) return { ok: false, demo: false, externalId: null, error: json.description ?? "Falha no envio." };
      return { ok: true, demo: false, externalId: String(json.result?.message_id ?? "") };
    } catch {
      return { ok: false, demo: false, externalId: null, error: "Canal indisponível no momento." };
    }
  },
  test: async (_config, credentials) => {
    if (!credentials.accessToken) return { ok: false, message: "Informe o token do bot para testar." };
    const response = await fetch(`https://api.telegram.org/bot${credentials.accessToken}/getMe`);
    const json = (await response.json()) as { ok?: boolean; result?: { username?: string }; description?: string };
    return json.ok
      ? { ok: true, message: `Bot @${json.result?.username ?? "conectado"} pronto para uso.` }
      : { ok: false, message: json.description ?? "Token recusado pelo Telegram." };
  },
  parseWebhook: (payload) => {
    const body = payload as {
      update_id?: number;
      message?: {
        message_id?: number;
        text?: string;
        voice?: { file_id?: string };
        chat?: { id?: number; first_name?: string };
      };
    };
    if (!body.message?.chat?.id) return [];
    return [
      {
        externalId: String(body.update_id ?? body.message.message_id ?? crypto.randomUUID()),
        contact: String(body.message.chat.id),
        contactName: body.message.chat.first_name ?? null,
        text: body.message.text ?? null,
        mediaId: body.message.voice?.file_id ?? null,
        mediaType: body.message.voice ? "audio" : null,
      },
    ];
  },
};

/** ---------- E-mail ---------- */

const emailAdapter: ChannelAdapter = {
  id: "email",
  label: "E-mail",
  send: async (config, credentials, to, body) => {
    const apiKey = credentials.accessToken ?? process.env["RESEND_API_KEY"] ?? null;
    if (config.demoMode || !apiKey || !config.fromEmail) return demoSend();
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: config.fromEmail,
          to: [to],
          subject: "Atualização do seu pedido",
          text: body,
        }),
      });
      const json = (await response.json()) as { id?: string; message?: string };
      if (!response.ok) return { ok: false, demo: false, externalId: null, error: json.message ?? "Falha no envio." };
      return { ok: true, demo: false, externalId: json.id ?? null };
    } catch {
      return { ok: false, demo: false, externalId: null, error: "Serviço de e-mail indisponível." };
    }
  },
  test: async (config, credentials) => {
    const apiKey = credentials.accessToken ?? process.env["RESEND_API_KEY"] ?? null;
    if (!apiKey) return { ok: false, message: "Informe a chave do serviço de e-mail." };
    if (!config.fromEmail) return { ok: false, message: "Informe o e-mail remetente." };
    return { ok: true, message: `Pronto para enviar como ${config.fromEmail}.` };
  },
  parseWebhook: () => [],
};

const ADAPTERS: Record<string, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  telegram: telegramAdapter,
  email: emailAdapter,
};

export function getChannelAdapter(channel: string): ChannelAdapter {
  return ADAPTERS[channel] ?? whatsappAdapter;
}

export const AVAILABLE_CHANNELS = Object.keys(ADAPTERS);

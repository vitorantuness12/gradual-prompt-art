/**
 * Modelos de mensagem e variáveis do módulo de atendimento.
 * Client-safe: usado tanto no painel quanto nas funções de servidor.
 */

export type MessageEvent =
  | "greeting"
  | "catalog"
  | "order_received"
  | "order_confirmed"
  | "payment"
  | "preparing"
  | "delivery"
  | "completed"
  | "cancelled"
  | "recovery"
  | "away"
  | "opt_out";

export const EVENT_LABEL: Record<MessageEvent, string> = {
  greeting: "Saudação",
  catalog: "Catálogo",
  order_received: "Pedido recebido",
  order_confirmed: "Pedido confirmado",
  payment: "Pagamento",
  preparing: "Em preparo",
  delivery: "Saiu para entrega",
  completed: "Pedido concluído",
  cancelled: "Pedido cancelado",
  recovery: "Recuperação de carrinho",
  away: "Fora do horário",
  opt_out: "Cancelamento de contato",
};

/** Variáveis aceitas nos modelos. */
export const TEMPLATE_VARIABLES = [
  { key: "cliente", description: "Nome do cliente" },
  { key: "pedido", description: "Número do pedido" },
  { key: "valor", description: "Valor total formatado" },
  { key: "link", description: "Link de acompanhamento" },
  { key: "loja", description: "Nome da loja" },
  { key: "catalogo", description: "Link do catálogo da loja" },
  { key: "status", description: "Situação atual do pedido" },
] as const;

export interface TemplateVars {
  cliente?: string;
  pedido?: string;
  valor?: string;
  link?: string;
  loja?: string;
  catalogo?: string;
  status?: string;
}

/** Substitui {{variavel}} pelos valores informados. */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value ?? "";
  });
}

export interface DefaultTemplate {
  key: MessageEvent;
  title: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: "greeting",
    title: "Saudação",
    body: "Olá, {{cliente}}! Aqui é da {{loja}}. Como posso ajudar? Responda com uma opção:\n1 - Ver catálogo\n2 - Acompanhar pedido\n3 - Falar com atendente",
  },
  {
    key: "catalog",
    title: "Catálogo",
    body: "Nosso catálogo completo está aqui: {{catalogo}}\nÉ só escolher os itens e finalizar pelo site. 😉",
  },
  {
    key: "order_received",
    title: "Pedido recebido",
    body: "Recebemos seu pedido {{pedido}} no valor de {{valor}}. Acompanhe por aqui: {{link}}",
  },
  {
    key: "order_confirmed",
    title: "Pedido confirmado",
    body: "Boa notícia, {{cliente}}! O pedido {{pedido}} foi confirmado e já entrou na fila. 🙌",
  },
  {
    key: "payment",
    title: "Pagamento",
    body: "Para concluir o pedido {{pedido}}, o pagamento de {{valor}} pode ser feito por aqui: {{link}}",
  },
  { key: "preparing", title: "Em preparo", body: "Seu pedido {{pedido}} está em preparo. Avisamos assim que sair! 👨‍🍳" },
  {
    key: "delivery",
    title: "Saiu para entrega",
    body: "O pedido {{pedido}} saiu para entrega e chega em instantes. Acompanhe: {{link}}",
  },
  {
    key: "completed",
    title: "Pedido concluído",
    body: "Pedido {{pedido}} concluído! Obrigado por comprar na {{loja}}. Se puder, conte o que achou. 💛",
  },
  {
    key: "cancelled",
    title: "Pedido cancelado",
    body: "O pedido {{pedido}} foi cancelado. Se precisar de ajuda, é só responder esta mensagem.",
  },
  {
    key: "recovery",
    title: "Recuperação de carrinho",
    body: "{{cliente}}, seus itens ainda estão separados na {{loja}}. Quer finalizar? {{catalogo}}",
  },
  {
    key: "away",
    title: "Fora do horário",
    body: "Recebemos sua mensagem fora do horário de atendimento. Respondemos assim que abrirmos. 🕒",
  },
  {
    key: "opt_out",
    title: "Cancelamento de contato",
    body: "Tudo certo, {{cliente}}. Você não receberá mais mensagens automáticas da {{loja}}. Para voltar a receber, responda VOLTAR.",
  },
];

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "E-mail",
  chat: "Chat interno",
};

/** Palavras que representam pedido de descadastro. */
export const OPT_OUT_KEYWORDS = ["sair", "parar", "cancelar contato", "descadastrar", "stop"];

export function isOptOutMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return OPT_OUT_KEYWORDS.some((word) => normalized === word || normalized.startsWith(`${word} `));
}

export interface BusinessHour {
  day: number;
  enabled: boolean;
  open: string;
  close: string;
}

export function defaultBusinessHours(): BusinessHour[] {
  return Array.from({ length: 7 }, (_unused, day) => ({
    day,
    enabled: day !== 0,
    open: "08:00",
    close: "18:00",
  }));
}

export function parseBusinessHours(value: unknown): BusinessHour[] {
  if (!Array.isArray(value) || value.length === 0) return defaultBusinessHours();
  const base = defaultBusinessHours();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<BusinessHour>;
    const index = Number(raw.day);
    if (!Number.isInteger(index) || index < 0 || index > 6) continue;
    base[index] = {
      day: index,
      enabled: Boolean(raw.enabled),
      open: typeof raw.open === "string" ? raw.open : "08:00",
      close: typeof raw.close === "string" ? raw.close : "18:00",
    };
  }
  return base;
}

/** Confere se o momento atual está dentro do horário de atendimento. */
export function isWithinBusinessHours(hours: BusinessHour[], now = new Date()): boolean {
  const today = hours[now.getDay()];
  if (!today || !today.enabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [openHour = 0, openMinute = 0] = today.open.split(":").map(Number);
  const [closeHour = 23, closeMinute = 59] = today.close.split(":").map(Number);
  return minutes >= openHour * 60 + openMinute && minutes <= closeHour * 60 + closeMinute;
}

/** Mascara um token para exibição segura (nunca mostra o valor completo). */
export function maskToken(value: string | null | undefined): string {
  if (!value) return "não configurado";
  const visible = value.slice(-4);
  return `••••••••${visible}`;
}

/** Link direto de conversa para cada canal. */
export function conversationLink(channel: string, contact: string, text?: string): string {
  const digits = contact.replace(/\D/g, "");
  const message = text ? encodeURIComponent(text) : "";
  if (channel === "whatsapp") {
    return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}${message ? `?text=${message}` : ""}`;
  }
  if (channel === "telegram") {
    return `https://t.me/${contact.replace(/^@/, "")}`;
  }
  return `mailto:${contact}${message ? `?body=${message}` : ""}`;
}

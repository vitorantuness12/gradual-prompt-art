/**
 * Regras e metadados das situações de pedido.
 * Centralizado aqui para que loja pública, painel e acompanhamento
 * usem exatamente os mesmos rótulos, cores e transições.
 */
import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type OrderType = Database["public"]["Enums"]["order_type"];

export type StatusTone = "info" | "warning" | "success" | "muted" | "destructive";

export interface StatusMeta {
  status: OrderStatus;
  label: string;
  short: string;
  tone: StatusTone;
  /** Situação final: não admite avanço automático. */
  terminal: boolean;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  pending: { status: "pending", label: "Recebido", short: "Recebido", tone: "info", terminal: false },
  awaiting_payment: {
    status: "awaiting_payment",
    label: "Aguardando pagamento",
    short: "Aguard. pagamento",
    tone: "warning",
    terminal: false,
  },
  paid: { status: "paid", label: "Pago", short: "Pago", tone: "success", terminal: false },
  confirmed: { status: "confirmed", label: "Confirmado", short: "Confirmado", tone: "info", terminal: false },
  preparing: { status: "preparing", label: "Em preparo", short: "Em preparo", tone: "warning", terminal: false },
  ready: { status: "ready", label: "Pronto", short: "Pronto", tone: "info", terminal: false },
  out_for_delivery: {
    status: "out_for_delivery",
    label: "Saiu para entrega",
    short: "Em rota",
    tone: "info",
    terminal: false,
  },
  delivered: { status: "delivered", label: "Entregue", short: "Entregue", tone: "success", terminal: false },
  picked_up: { status: "picked_up", label: "Retirado", short: "Retirado", tone: "success", terminal: false },
  completed: { status: "completed", label: "Concluído", short: "Concluído", tone: "success", terminal: true },
  cancelled: { status: "cancelled", label: "Cancelado", short: "Cancelado", tone: "destructive", terminal: true },
  rejected: { status: "rejected", label: "Recusado", short: "Recusado", tone: "destructive", terminal: true },
};

export const ALL_ORDER_STATUSES = Object.keys(ORDER_STATUS_META) as OrderStatus[];

export function statusLabel(status: string): string {
  return ORDER_STATUS_META[status as OrderStatus]?.label ?? status;
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  info: "bg-primary/10 text-primary border-primary/20",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  muted: "bg-muted text-muted-foreground border-border",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
};

export function statusClass(status: string): string {
  return STATUS_TONE_CLASS[ORDER_STATUS_META[status as OrderStatus]?.tone ?? "muted"];
}

/** Colunas do quadro (Kanban) do lojista. */
export interface KanbanColumn {
  key: string;
  title: string;
  statuses: OrderStatus[];
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: "new", title: "Novos", statuses: ["pending", "awaiting_payment"] },
  { key: "accepted", title: "Confirmados", statuses: ["paid", "confirmed"] },
  { key: "preparing", title: "Em preparo", statuses: ["preparing"] },
  { key: "ready", title: "Prontos", statuses: ["ready"] },
  { key: "shipping", title: "Em rota / entrega", statuses: ["out_for_delivery"] },
  { key: "done", title: "Finalizados", statuses: ["delivered", "picked_up", "completed"] },
  { key: "closed", title: "Cancelados / recusados", statuses: ["cancelled", "rejected"] },
];

/**
 * Próximas situações sugeridas, considerando o tipo de atendimento.
 * A loja continua livre para escolher qualquer situação na lista completa.
 */
export function nextStatuses(status: OrderStatus, type: OrderType): OrderStatus[] {
  const finishing: OrderStatus[] = type === "delivery" ? ["out_for_delivery", "delivered"] : ["picked_up", "completed"];
  switch (status) {
    case "pending":
      return ["confirmed", "awaiting_payment", "rejected"];
    case "awaiting_payment":
      return ["paid", "cancelled"];
    case "paid":
      return ["confirmed", "preparing", "cancelled"];
    case "confirmed":
      return ["preparing", "cancelled"];
    case "preparing":
      return ["ready", "cancelled"];
    case "ready":
      return finishing;
    case "out_for_delivery":
      return ["delivered", "cancelled"];
    case "delivered":
    case "picked_up":
      return ["completed"];
    default:
      return [];
  }
}

/** Etapas mostradas ao cliente no acompanhamento público. */
export function customerTimeline(type: string): OrderStatus[] {
  if (type === "delivery") return ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];
  return ["pending", "confirmed", "preparing", "ready", "picked_up"];
}

export const CANCEL_REASONS = [
  "Sem estoque / item indisponível",
  "Fora da área de entrega",
  "Cliente desistiu",
  "Endereço incorreto ou incompleto",
  "Pagamento não confirmado",
  "Loja fechada no momento",
] as const;

/** Formas de atendimento habilitadas na loja. */
export interface FulfillmentOption {
  value: "delivery" | "pickup" | "dine_in" | "table" | "scheduled";
  orderType: OrderType;
  label: string;
  description: string;
}

export function fulfillmentOptions(store: {
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  accepts_dine_in: boolean;
  accepts_scheduling: boolean;
}): FulfillmentOption[] {
  const options: FulfillmentOption[] = [];
  if (store.accepts_delivery) {
    options.push({
      value: "delivery",
      orderType: "delivery",
      label: "Entrega",
      description: "Levamos até o seu endereço.",
    });
  }
  if (store.accepts_pickup) {
    options.push({
      value: "pickup",
      orderType: "pickup",
      label: "Retirada",
      description: "Você retira na loja.",
    });
  }
  if (store.accepts_dine_in) {
    options.push({
      value: "dine_in",
      orderType: "dine_in",
      label: "Consumo no local",
      description: "Pedido servido no salão.",
    });
    options.push({
      value: "table",
      orderType: "dine_in",
      label: "Mesa",
      description: "Informe o número da mesa.",
    });
  }
  if (store.accepts_scheduling) {
    options.push({
      value: "scheduled",
      orderType: "scheduled",
      label: "Agendado",
      description: "Escolha data e horário.",
    });
  }
  return options;
}

/** Gera horários disponíveis (de 30 em 30 minutos) para a data escolhida. */
export function timeSlots(openingHours: { day: number; enabled: boolean; open: string; close: string }[], date: string): string[] {
  if (!date) return [];
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return [];
  const hours = openingHours[parsed.getDay()];
  if (!hours || !hours.enabled) return [];

  const toMinutes = (value: string) => {
    const [h, m] = value.split(":");
    return Number(h) * 60 + Number(m ?? 0);
  };
  const start = toMinutes(hours.open);
  const end = toMinutes(hours.close);
  const isToday = new Date().toISOString().slice(0, 10) === date;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + 30;

  const slots: string[] = [];
  for (let minute = start; minute + 15 <= end; minute += 30) {
    if (isToday && minute < nowMinutes) continue;
    slots.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  }
  return slots;
}

/** ---------- Cupom (regra pura, usada no servidor e nos testes) ---------- */

export interface CouponRule {
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_value: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
}

export interface CouponEvaluation {
  ok: boolean;
  message: string;
  code?: string;
  discount?: number;
}

/** Valida validade, limite de uso e valor mínimo, devolvendo o desconto final. */
export function evaluateCoupon(
  promo: CouponRule | null,
  subtotal: number,
  now: Date = new Date(),
): CouponEvaluation {
  if (!promo || !promo.is_active) return { ok: false, message: "Cupom inválido para esta loja." };

  const reference = now.getTime();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > reference) {
    return { ok: false, message: "Este cupom ainda não está válido." };
  }
  if (promo.ends_at && new Date(promo.ends_at).getTime() < reference) {
    return { ok: false, message: "Este cupom já expirou." };
  }
  if (promo.usage_limit !== null && promo.used_count >= promo.usage_limit) {
    return { ok: false, message: "Este cupom atingiu o limite de uso." };
  }
  if (subtotal < Number(promo.min_order_value)) {
    return {
      ok: false,
      message: `Cupom válido para pedidos a partir de R$ ${Number(promo.min_order_value).toFixed(2).replace(".", ",")}.`,
    };
  }

  const raw =
    promo.discount_type === "percent"
      ? (subtotal * Number(promo.discount_value)) / 100
      : Number(promo.discount_value);

  return {
    ok: true,
    message: "Cupom aplicado.",
    code: promo.code,
    discount: Math.min(Math.round(raw * 100) / 100, subtotal),
  };
}

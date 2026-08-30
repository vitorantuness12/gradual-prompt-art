/**
 * Assinatura recorrente de produtos — regras puras (sem acesso ao banco).
 *
 * Decisão de produto desta fase: a assinatura NÃO cobra o cartão do cliente.
 * A cada ciclo o sistema apenas **gera um novo pedido** na loja, com os mesmos
 * itens, endereço e forma de pagamento do pedido de origem. Assim a loja
 * trabalha com o fluxo normal de pedidos e o cliente pode pausar ou cancelar
 * antes do próximo ciclo.
 */

/** Periodicidades aceitas na assinatura. */
export const SUBSCRIPTION_PERIODS = ["week", "biweek", "month"] as const;

export type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number];

export const SUBSCRIPTION_PERIOD_LABEL: Record<SubscriptionPeriod, string> = {
  week: "Toda semana",
  biweek: "A cada 15 dias",
  month: "Todo mês",
};

/** Situações que o cliente vê na área dele. */
export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  paused: "Pausada",
  canceled: "Cancelada",
  past_due: "Pendente",
  trialing: "Em teste",
  expired: "Encerrada",
};

export function isSubscriptionPeriod(value: unknown): value is SubscriptionPeriod {
  return typeof value === "string" && (SUBSCRIPTION_PERIODS as readonly string[]).includes(value);
}

/**
 * Data do próximo pedido da assinatura.
 * Sempre avança a partir de `from`, então um ciclo atrasado não gera vários
 * pedidos de uma vez — gera um e reagenda o seguinte.
 */
export function nextCycleDate(period: string, from: Date = new Date()): string {
  const date = new Date(from.getTime());
  if (period === "week") date.setDate(date.getDate() + 7);
  else if (period === "biweek") date.setDate(date.getDate() + 15);
  else date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

export interface SubscriptionItem {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
}

/** Soma dos itens (sem taxa de entrega). */
export function itemsSubtotal(items: SubscriptionItem[]): number {
  return items.reduce(
    (total, item) => total + Math.max(0, Number(item.quantity)) * Math.max(0, Number(item.unitPrice)),
    0,
  );
}

/** Total previsto do próximo pedido da assinatura. */
export function subscriptionTotal(items: SubscriptionItem[], deliveryFee = 0): number {
  return Math.round((itemsSubtotal(items) + Math.max(0, deliveryFee)) * 100) / 100;
}

/** O cliente só pode pausar/retomar enquanto a assinatura não foi cancelada. */
export function canManage(status: string): boolean {
  return status !== "canceled" && status !== "expired";
}

/**
 * Uma assinatura só gera pedido quando está ativa, não está pausada e a data
 * do próximo pedido já chegou.
 */
export function isDue(
  row: { status: string; paused_at: string | null; next_order_at: string | null },
  now: Date = new Date(),
): boolean {
  if (row.status !== "active" && row.status !== "trialing") return false;
  if (row.paused_at) return false;
  if (!row.next_order_at) return false;
  return new Date(row.next_order_at).getTime() <= now.getTime();
}

/** Itens vindos do banco (jsonb) em formato seguro para uso. */
export function parseItems(value: unknown): SubscriptionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const quantity = Number(item["quantity"] ?? 0);
      const unitPrice = Number(item["unitPrice"] ?? item["unit_price"] ?? 0);
      const name = String(item["name"] ?? "").trim();
      if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) return null;
      return {
        productId: typeof item["productId"] === "string" ? (item["productId"] as string) : null,
        name: name.slice(0, 160),
        quantity: Math.min(99, Math.max(1, Math.round(quantity))),
        unitPrice: Math.max(0, unitPrice),
        notes: typeof item["notes"] === "string" ? (item["notes"] as string).slice(0, 300) : null,
      } satisfies SubscriptionItem;
    })
    .filter((item): item is SubscriptionItem => item !== null);
}

/**
 * Receita recorrente mensal equivalente (MRR) de uma assinatura.
 * Semana ≈ 4,33 ciclos/mês, quinzena ≈ 2,03 (365/15/12), mês = 1.
 */
export function monthlyRecurringValue(period: string, total: number): number {
  const value = Math.max(0, Number(total) || 0);
  const cycles = period === "week" ? 365 / 7 / 12 : period === "biweek" ? 365 / 15 / 12 : 1;
  return Math.round(value * cycles * 100) / 100;
}

/**
 * Produtos digitais e infoprodutos: regras puras de entrega protegida,
 * assinatura recorrente, afiliados/UTM, order bump e nota fiscal de serviço.
 */

export const DEFAULT_LINK_DAYS = 7;
export const DEFAULT_MAX_DOWNLOADS = 3;
/** Tentativas de cobrança antes de marcar a assinatura como inadimplente. */
export const MAX_CHARGE_ATTEMPTS = 3;

export interface DeliveryAccess {
  expires_at: string | null;
  revoked_at: string | null;
  download_count: number;
  max_downloads: number;
  released_at?: string | null;
}

export type DeliveryBlockReason = "revoked" | "expired" | "limit" | "pending" | null;

/** Situação do link de download em um dado instante. */
export function deliveryAccess(
  delivery: DeliveryAccess,
  now: Date = new Date(),
): { allowed: boolean; reason: DeliveryBlockReason; remaining: number } {
  const remaining = Math.max(0, delivery.max_downloads - delivery.download_count);
  if (delivery.revoked_at) return { allowed: false, reason: "revoked", remaining };
  if (delivery.expires_at && new Date(delivery.expires_at).getTime() < now.getTime()) {
    return { allowed: false, reason: "expired", remaining };
  }
  if (delivery.max_downloads > 0 && remaining <= 0) return { allowed: false, reason: "limit", remaining: 0 };
  return { allowed: true, reason: null, remaining };
}

export const DELIVERY_BLOCK_LABEL: Record<Exclude<DeliveryBlockReason, null>, string> = {
  revoked: "Acesso revogado pela loja.",
  expired: "Este link expirou. Fale com a loja para receber um novo.",
  limit: "Limite de downloads atingido.",
  pending: "Pagamento ainda não confirmado.",
};

/** Data de expiração a partir da liberação. */
export function expiryFrom(days: number, from: Date = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() + Math.max(1, days));
  return date.toISOString();
}

export type SubscriptionPeriod = "week" | "month" | "quarter" | "year";

export const SUBSCRIPTION_PERIOD_LABEL: Record<SubscriptionPeriod, string> = {
  week: "Semanal",
  month: "Mensal",
  quarter: "Trimestral",
  year: "Anual",
};

/** Próxima data de cobrança conforme o ciclo. */
export function nextChargeDate(period: string, from: Date = new Date()): string {
  const date = new Date(from);
  if (period === "week") date.setDate(date.getDate() + 7);
  else if (period === "quarter") date.setMonth(date.getMonth() + 3);
  else if (period === "year") date.setFullYear(date.getFullYear() + 1);
  else date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

/** Situação da assinatura após uma tentativa de cobrança. */
export function statusAfterCharge(paid: boolean, failedAttempts: number): {
  status: "active" | "past_due" | "canceled";
  failed_attempts: number;
} {
  if (paid) return { status: "active", failed_attempts: 0 };
  const attempts = failedAttempts + 1;
  if (attempts >= MAX_CHARGE_ATTEMPTS) return { status: "canceled", failed_attempts: attempts };
  return { status: "past_due", failed_attempts: attempts };
}

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  past_due: "Inadimplente",
  canceled: "Cancelada",
  paused: "Pausada",
};

/** Preço do item ofertado no order bump. */
export function bumpPrice(price: number, discountPercent: number): number {
  const percent = Math.min(90, Math.max(0, discountPercent));
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}

/** Conversão do order bump em % (0 quando nunca foi exibido). */
export function offerConversionRate(impressions: number, conversions: number): number {
  if (impressions <= 0) return 0;
  return Math.round((conversions / impressions) * 1000) / 10;
}

export interface Tracking {
  affiliate_code: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
}

export const EMPTY_TRACKING: Tracking = {
  affiliate_code: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
};

/** Lê afiliado e UTMs da query string da loja pública. */
export function parseTracking(search: string): Tracking {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const get = (key: string) => {
    const value = params.get(key)?.trim();
    return value ? value.slice(0, 60) : null;
  };
  return {
    affiliate_code: get("ref") ?? get("afiliado"),
    utm_source: get("utm_source"),
    utm_medium: get("utm_medium"),
    utm_campaign: get("utm_campaign"),
    utm_content: get("utm_content"),
  };
}

/** Link de divulgação do afiliado. */
export function affiliateLink(baseUrl: string, slug: string, code: string, campaign?: string | null): string {
  const url = new URL(`/loja/${slug}`, baseUrl);
  url.searchParams.set("ref", code);
  url.searchParams.set("utm_source", "afiliado");
  url.searchParams.set("utm_medium", "indicacao");
  if (campaign) url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

/** Comissão devida ao afiliado sobre o total do pedido. */
export function affiliateCommission(total: number, percent: number): number {
  return Math.round(total * (Math.max(0, percent) / 100) * 100) / 100;
}

/** Valor do imposto da NFS-e. */
export function serviceTax(amount: number, percent: number): number {
  return Math.round(amount * (Math.max(0, percent) / 100) * 100) / 100;
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando emissão",
  issued: "Emitida",
  failed: "Falhou",
  canceled: "Cancelada",
};

/* --------------------------- Reembolsos e funil -------------------------- */

export type RefundKind = "refund" | "cancellation" | "chargeback";

export const REFUND_KIND_LABEL: Record<RefundKind, string> = {
  refund: "Reembolso",
  cancellation: "Cancelamento de assinatura",
  chargeback: "Chargeback",
};

export const REFUND_METHOD_LABEL: Record<string, string> = {
  money: "Devolução em dinheiro",
  credit: "Crédito na loja",
};

/** Chargeback e reembolso total tiram o acesso ao conteúdo digital. */
export function shouldRevokeAccess(kind: RefundKind, amount: number, orderTotal: number): boolean {
  if (kind === "chargeback") return true;
  if (orderTotal <= 0) return false;
  return amount >= orderTotal - 0.01;
}

export interface FunnelEvent {
  kind: string;
  amount: number;
  affiliate_code: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  coupon_code: string | null;
}

export interface FunnelRow {
  origin: string;
  visits: number;
  bumpViews: number;
  bumpAccepts: number;
  coupons: number;
  purchases: number;
  revenue: number;
  conversion: number;
  bumpRate: number;
  ticket: number;
}

/** Agrupa os eventos do checkout por origem (afiliado ou UTM). */
export function buildFunnel(events: FunnelEvent[]): FunnelRow[] {
  const map = new Map<string, FunnelRow>();
  for (const event of events) {
    const origin = event.affiliate_code
      ? `afiliado: ${event.affiliate_code}`
      : event.utm_source
        ? `${event.utm_source}${event.utm_campaign ? ` / ${event.utm_campaign}` : ""}`
        : "direto";
    const row =
      map.get(origin) ??
      ({
        origin,
        visits: 0,
        bumpViews: 0,
        bumpAccepts: 0,
        coupons: 0,
        purchases: 0,
        revenue: 0,
        conversion: 0,
        bumpRate: 0,
        ticket: 0,
      } satisfies FunnelRow);

    if (event.kind === "view") row.visits += 1;
    else if (event.kind === "bump_view") row.bumpViews += 1;
    else if (event.kind === "bump_accept") row.bumpAccepts += 1;
    else if (event.kind === "coupon") row.coupons += 1;
    else if (event.kind === "purchase") {
      row.purchases += 1;
      row.revenue += event.amount;
    }
    map.set(origin, row);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      conversion: row.visits > 0 ? Math.round((row.purchases / row.visits) * 1000) / 10 : 0,
      bumpRate: row.bumpViews > 0 ? Math.round((row.bumpAccepts / row.bumpViews) * 1000) / 10 : 0,
      ticket: row.purchases > 0 ? Math.round((row.revenue / row.purchases) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Receita recorrente mensal equivalente de uma assinatura. */
export function monthlyEquivalent(amount: number, period: string): number {
  const factor = period === "year" ? 1 / 12 : period === "quarter" ? 1 / 3 : period === "week" ? 4 : 1;
  return Math.round(amount * factor * 100) / 100;
}

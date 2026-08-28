import type { Database } from "@/integrations/supabase/types";

export type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
export type SubscriptionRow = Database["public"]["Tables"]["store_subscriptions"]["Row"];
export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

/** Limites numéricos de um plano (-1 = ilimitado). */
export const LIMIT_KEYS = [
  { key: "users", label: "Usuários da equipe" },
  { key: "stores", label: "Lojas" },
  { key: "products", label: "Itens no catálogo" },
  { key: "orders_month", label: "Pedidos por mês" },
  { key: "automations", label: "Automações de mensagem" },
  { key: "integrations", label: "Integrações conectadas" },
  { key: "couriers", label: "Entregadores" },
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number]["key"];

export const FEATURE_KEYS = [
  { key: "reports", label: "Relatórios" },
  { key: "kds", label: "Monitor de preparo (KDS)" },
  { key: "custom_domain", label: "Domínio próprio" },
  { key: "support", label: "Suporte" },
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number]["key"];

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Pagamento atrasado",
  canceled: "Cancelada",
  expired: "Expirada",
};

export const SUBSCRIPTION_STATUS_TONE: Record<SubscriptionStatus, string> = {
  trialing: "bg-accent/15 text-accent-foreground",
  active: "bg-primary/10 text-primary",
  past_due: "bg-destructive/10 text-destructive",
  canceled: "bg-muted text-muted-foreground",
  expired: "bg-destructive/10 text-destructive",
};

export function planLimit(plan: Pick<PlanRow, "limits"> | null | undefined, key: LimitKey): number {
  const limits = (plan?.limits ?? {}) as Record<string, unknown>;
  const value = limits[key];
  if (typeof value === "number") return value;
  return 0;
}

export function planFeature(plan: Pick<PlanRow, "features"> | null | undefined, key: FeatureKey): string | boolean {
  const features = (plan?.features ?? {}) as Record<string, unknown>;
  const value = features[key];
  if (typeof value === "boolean" || typeof value === "string") return value;
  return false;
}

export function formatLimit(value: number): string {
  if (value < 0) return "Ilimitado";
  if (value === 0) return "Não incluso";
  return value.toLocaleString("pt-BR");
}

export function formatFeature(value: string | boolean): string {
  if (value === true) return "Incluso";
  if (value === false) return "Não incluso";
  const map: Record<string, string> = {
    basic: "Básicos",
    standard: "Completos",
    advanced: "Avançados",
    community: "Central de ajuda",
    email: "Por e-mail",
    priority: "Prioritário",
    dedicated: "Dedicado",
  };
  return map[value] ?? value;
}

export function planPrice(plan: PlanRow, period: "month" | "year"): number {
  return period === "year" ? Number(plan.price_year) : Number(plan.price_month);
}

/** true quando o uso atual já atingiu (ou passou) o limite do plano. */
export function isOverLimit(current: number, limit: number): boolean {
  if (limit < 0) return false;
  return current >= limit;
}

/** Situações em que a loja continua operando normalmente. */
export function isSubscriptionUsable(status: SubscriptionStatus | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

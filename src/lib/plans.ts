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

/**
 * Como cada recurso é editado no painel: `toggle` = liberado/bloqueado,
 * `options` = nível do recurso incluído no plano.
 */
export const FEATURE_CONTROLS: Record<
  FeatureKey,
  { kind: "toggle" } | { kind: "options"; options: { value: string; label: string }[] }
> = {
  reports: {
    kind: "options",
    options: [
      { value: "false", label: "Não incluso" },
      { value: "basic", label: "Básicos" },
      { value: "standard", label: "Completos" },
      { value: "advanced", label: "Avançados" },
    ],
  },
  kds: { kind: "toggle" },
  custom_domain: { kind: "toggle" },
  support: {
    kind: "options",
    options: [
      { value: "community", label: "Central de ajuda" },
      { value: "email", label: "Por e-mail" },
      { value: "priority", label: "Prioritário" },
      { value: "dedicated", label: "Dedicado" },
    ],
  },
};

/** Dados brutos do formulário de plano (strings vindas dos inputs). */
export interface PlanFormInput {
  name: string;
  key: string;
  tagline: string;
  priceMonth: string;
  priceYear: string;
  trialDays: string;
  sortOrder: string;
}

export type PlanFormErrors = Partial<Record<keyof PlanFormInput, string>>;

export function slugifyPlanKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function numberError(raw: string, { min = 0, integer = false }: { min?: number; integer?: boolean } = {}) {
  const trimmed = raw.trim();
  if (!trimmed) return "Campo obrigatório.";
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed)) return "Informe um número válido.";
  if (parsed < min) return `Valor mínimo: ${min}.`;
  if (integer && !Number.isInteger(parsed)) return "Use um número inteiro.";
  return null;
}

export function parsePlanNumber(raw: string): number {
  const parsed = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Valida o formulário de plano; retorna um mapa vazio quando está tudo certo. */
export function validatePlanForm(input: PlanFormInput, existingKeys: string[] = []): PlanFormErrors {
  const errors: PlanFormErrors = {};

  if (!input.name.trim()) errors.name = "Informe o nome do plano.";
  else if (input.name.trim().length > 60) errors.name = "Máximo de 60 caracteres.";

  const slug = slugifyPlanKey(input.key || input.name);
  if (!slug) errors.key = "Identificador inválido — use letras ou números.";
  else if (existingKeys.includes(slug)) errors.key = "Já existe um plano com este identificador.";

  if (input.tagline.trim().length > 120) errors.tagline = "Máximo de 120 caracteres.";

  const month = numberError(input.priceMonth);
  if (month) errors.priceMonth = month;
  const year = numberError(input.priceYear);
  if (year) errors.priceYear = year;
  const trial = numberError(input.trialDays, { integer: true });
  if (trial) errors.trialDays = trial;
  const sort = numberError(input.sortOrder, { integer: true });
  if (sort) errors.sortOrder = sort;

  if (!month && !year) {
    const monthValue = parsePlanNumber(input.priceMonth);
    const yearValue = parsePlanNumber(input.priceYear);
    if (monthValue > 0 && yearValue > 0 && yearValue < monthValue) {
      errors.priceYear = "O preço anual deve ser maior ou igual ao mensal.";
    }
  }

  return errors;
}


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

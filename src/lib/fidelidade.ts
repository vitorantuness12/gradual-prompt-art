/**
 * Regras puras do programa de fidelidade e do CRM.
 * Client-safe: usado no painel, na loja pública e nas funções de servidor.
 */

import type { Database } from "@/integrations/supabase/types";

export type LoyaltySettingsRow = Database["public"]["Tables"]["loyalty_settings"]["Row"];
export type LoyaltyTierRow = Database["public"]["Tables"]["loyalty_tiers"]["Row"];
export type LoyaltyRuleRow = Database["public"]["Tables"]["loyalty_rules"]["Row"];
export type LoyaltyRewardRow = Database["public"]["Tables"]["loyalty_rewards"]["Row"];
export type LoyaltyMissionRow = Database["public"]["Tables"]["loyalty_missions"]["Row"];
export type LoyaltyAccountRow = Database["public"]["Tables"]["loyalty_accounts"]["Row"];
export type LoyaltyTransactionRow = Database["public"]["Tables"]["loyalty_transactions"]["Row"];
export type CrmCampaignRow = Database["public"]["Tables"]["crm_campaigns"]["Row"];
export type CustomerBlockRow = Database["public"]["Tables"]["customer_blocks"]["Row"];

/** ---------- Tipos de regra ---------- */

export const RULE_KINDS = [
  { key: "purchase", label: "Por compra", help: "Pontos fixos a cada pedido concluído." },
  { key: "value", label: "Por valor gasto", help: "Multiplica os pontos por real gasto." },
  { key: "category", label: "Por categoria", help: "Pontos extras para itens de uma categoria." },
  { key: "campaign", label: "Campanha", help: "Pontos extras dentro de um período promocional." },
  { key: "first_order", label: "Primeira compra", help: "Bônus na estreia do cliente." },
  {
    key: "frequent",
    label: "Cliente frequente",
    help: "Bônus ao atingir a quantidade de pedidos.",
  },
  { key: "birthday", label: "Aniversário", help: "Bônus no mês de aniversário." },
  {
    key: "referral",
    label: "Indicação de amigo",
    help: "Bônus para quem indica e para quem é indicado.",
  },
  { key: "winback", label: "Recuperação de inativo", help: "Bônus para quem volta a comprar." },
] as const;

export type RuleKind = (typeof RULE_KINDS)[number]["key"];

export const RULE_KIND_LABEL: Record<string, string> = Object.fromEntries(
  RULE_KINDS.map((item) => [item.key, item.label]),
);

export const REWARD_KINDS = [
  { key: "discount", label: "Desconto no pedido" },
  { key: "free_product", label: "Produto grátis" },
  { key: "cashback", label: "Crédito em cashback" },
  { key: "coupon", label: "Cupom especial" },
] as const;

export const REWARD_KIND_LABEL: Record<string, string> = Object.fromEntries(
  REWARD_KINDS.map((item) => [item.key, item.label]),
);

export const MISSION_GOALS = [
  { key: "orders", label: "Quantidade de pedidos" },
  { key: "spend", label: "Valor gasto (R$)" },
  { key: "category", label: "Pedidos de uma categoria" },
] as const;

export const MISSION_GOAL_LABEL: Record<string, string> = Object.fromEntries(
  MISSION_GOALS.map((item) => [item.key, item.label]),
);

export const TRANSACTION_LABEL: Record<string, string> = {
  earn: "Pontos ganhos",
  redeem: "Resgate",
  expire: "Pontos expirados",
  adjust: "Ajuste manual",
  cashback: "Cashback",
  refund: "Estorno",
  bonus: "Bônus",
};

export const SEGMENTS = [
  { key: "all", label: "Todos os clientes", help: "Toda a base que aceitou receber mensagens." },
  { key: "new", label: "Clientes novos", help: "Primeiro pedido nos últimos dias." },
  { key: "frequent", label: "Clientes frequentes", help: "Acima da quantidade mínima de pedidos." },
  { key: "inactive", label: "Clientes inativos", help: "Sem comprar há X dias." },
  { key: "high_ticket", label: "Alto ticket", help: "Ticket médio acima do valor definido." },
  { key: "district", label: "Por bairro", help: "Clientes de bairros específicos." },
  { key: "preference", label: "Por preferência", help: "Clientes com determinados marcadores." },
] as const;

export type SegmentKey = (typeof SEGMENTS)[number]["key"];

export const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(
  SEGMENTS.map((s) => [s.key, s.label]),
);

export interface SegmentConfig {
  days?: number;
  minOrders?: number;
  minTicket?: number;
  districts?: string[];
  tags?: string[];
}

/** ---------- Cálculo de pontos ---------- */

export interface OrderContextItem {
  categoryId: string | null;
  productId: string | null;
  total: number;
}

export interface OrderContext {
  total: number;
  subtotal: number;
  type: string;
  channel: string;
  district: string | null;
  items: OrderContextItem[];
  /** Pedidos concluídos anteriores deste cliente. */
  previousOrders: number;
  /** Dias desde o último pedido (null quando é o primeiro). */
  daysSinceLastOrder: number | null;
  /** Mês de aniversário (1-12) ou null. */
  birthMonth: number | null;
  now?: Date;
}

export interface PointsLine {
  ruleId: string | null;
  kind: string;
  label: string;
  points: number;
}

export interface PointsResult {
  lines: PointsLine[];
  total: number;
  cashback: number;
}

function withinPeriod(startsAt: string | null, endsAt: string | null, now: Date): boolean {
  if (startsAt && new Date(startsAt).getTime() > now.getTime()) return false;
  if (endsAt && new Date(endsAt).getTime() < now.getTime()) return false;
  return true;
}

/** Regra é elegível para este pedido? (período, valor mínimo, canal, bairro, limite) */
export function isRuleEligible(
  rule: LoyaltyRuleRow,
  order: OrderContext,
  now = order.now ?? new Date(),
): boolean {
  if (!rule.is_active) return false;
  if (!withinPeriod(rule.starts_at, rule.ends_at, now)) return false;
  if (Number(rule.min_order_value) > order.total) return false;
  if (rule.channels.length > 0 && !rule.channels.includes(order.channel)) return false;
  if (rule.order_types.length > 0 && !rule.order_types.includes(order.type)) return false;
  if (rule.districts.length > 0) {
    const district = (order.district ?? "").trim().toLowerCase();
    if (!rule.districts.some((item) => item.trim().toLowerCase() === district)) return false;
  }
  if (rule.usage_limit != null && rule.used_count >= rule.usage_limit) return false;
  return true;
}

/** Base de pontos de um pedido: configuração geral + regras elegíveis + multiplicador do nível. */
export function calculateOrderPoints(
  settings: Pick<
    LoyaltySettingsRow,
    | "is_enabled"
    | "points_per_currency"
    | "cashback_percent"
    | "min_order_value"
    | "first_order_points"
    | "frequent_orders_threshold"
    | "frequent_bonus_points"
    | "birthday_bonus_points"
    | "inactive_days"
    | "winback_points"
  >,
  rules: LoyaltyRuleRow[],
  order: OrderContext,
  tierMultiplier = 1,
): PointsResult {
  const now = order.now ?? new Date();
  const lines: PointsLine[] = [];
  if (!settings.is_enabled || order.total < Number(settings.min_order_value)) {
    return { lines, total: 0, cashback: 0 };
  }

  const base = Math.floor(order.total * Number(settings.points_per_currency));
  if (base > 0)
    lines.push({ ruleId: null, kind: "value", label: "Pontos pelo valor da compra", points: base });

  if (order.previousOrders === 0 && settings.first_order_points > 0) {
    lines.push({
      ruleId: null,
      kind: "first_order",
      label: "Bônus de primeira compra",
      points: settings.first_order_points,
    });
  }

  if (
    settings.frequent_bonus_points > 0 &&
    settings.frequent_orders_threshold > 0 &&
    (order.previousOrders + 1) % settings.frequent_orders_threshold === 0
  ) {
    lines.push({
      ruleId: null,
      kind: "frequent",
      label: "Bônus de cliente frequente",
      points: settings.frequent_bonus_points,
    });
  }

  if (
    settings.winback_points > 0 &&
    order.daysSinceLastOrder != null &&
    order.daysSinceLastOrder >= settings.inactive_days
  ) {
    lines.push({
      ruleId: null,
      kind: "winback",
      label: "Boas-vindas de volta",
      points: settings.winback_points,
    });
  }

  if (
    settings.birthday_bonus_points > 0 &&
    order.birthMonth != null &&
    order.birthMonth === now.getMonth() + 1
  ) {
    lines.push({
      ruleId: null,
      kind: "birthday",
      label: "Bônus de aniversário",
      points: settings.birthday_bonus_points,
    });
  }

  for (const rule of rules) {
    if (!isRuleEligible(rule, order, now)) continue;
    let points = 0;
    if (rule.kind === "value") {
      points = Math.floor(order.total * Number(rule.multiplier));
    } else if (rule.kind === "category") {
      const eligible = order.items.filter(
        (item) =>
          (rule.category_id && item.categoryId === rule.category_id) ||
          (rule.product_ids.length > 0 &&
            item.productId &&
            rule.product_ids.includes(item.productId)),
      );
      if (eligible.length === 0) continue;
      const totalEligible = eligible.reduce((sum, item) => sum + item.total, 0);
      points = rule.points + Math.floor(totalEligible * (Number(rule.multiplier) - 1));
    } else {
      points = rule.points;
    }
    if (points > 0) lines.push({ ruleId: rule.id, kind: rule.kind, label: rule.name, points });
  }

  const raw = lines.reduce((sum, line) => sum + line.points, 0);
  const total = Math.max(0, Math.round(raw * tierMultiplier));
  const cashback = Math.round(order.total * (Number(settings.cashback_percent) / 100) * 100) / 100;
  return { lines, total, cashback };
}

/** ---------- Níveis ---------- */

export function resolveTier(tiers: LoyaltyTierRow[], points: number): LoyaltyTierRow | null {
  const sorted = [...tiers].sort((a, b) => a.min_points - b.min_points);
  let current: LoyaltyTierRow | null = null;
  for (const tier of sorted) {
    if (points >= tier.min_points) current = tier;
  }
  return current;
}

export function nextTier(tiers: LoyaltyTierRow[], points: number): LoyaltyTierRow | null {
  return (
    [...tiers]
      .sort((a, b) => a.min_points - b.min_points)
      .find((tier) => tier.min_points > points) ?? null
  );
}

/** Progresso (0-100) até o próximo nível. */
export function tierProgress(tiers: LoyaltyTierRow[], points: number): number {
  const current = resolveTier(tiers, points);
  const next = nextTier(tiers, points);
  if (!next) return 100;
  const floor = current?.min_points ?? 0;
  const span = next.min_points - floor;
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((points - floor) / span) * 100)));
}

/** ---------- Recompensas ---------- */

export interface RewardAvailability {
  available: boolean;
  reason: string;
}

export function rewardAvailability(
  reward: LoyaltyRewardRow,
  balance: number,
  redemptionsByCustomer: number,
  now = new Date(),
): RewardAvailability {
  if (!reward.is_active) return { available: false, reason: "Recompensa indisponível." };
  if (!withinPeriod(reward.starts_at, reward.ends_at, now))
    return { available: false, reason: "Fora do período." };
  if (reward.stock != null && reward.stock <= 0)
    return { available: false, reason: "Estoque esgotado." };
  if (reward.per_customer_limit != null && redemptionsByCustomer >= reward.per_customer_limit) {
    return { available: false, reason: "Limite por cliente atingido." };
  }
  if (balance < reward.points_cost) {
    return { available: false, reason: `Faltam ${reward.points_cost - balance} pontos.` };
  }
  return { available: true, reason: "Disponível para resgate." };
}

/** ---------- Missões ---------- */

export function missionProgressPercent(goalValue: number, progress: number): number {
  if (goalValue <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((progress / goalValue) * 100)));
}

/** ---------- Segmentação ---------- */

export interface SegmentCustomer {
  id: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  district: string | null;
  tags: string[];
}

export function matchesSegment(
  segment: string,
  config: SegmentConfig,
  customer: SegmentCustomer,
  now = new Date(),
): boolean {
  const days = (value: string | null) =>
    value == null ? null : Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000);

  switch (segment) {
    case "new": {
      const since = days(customer.firstOrderAt ?? customer.lastOrderAt);
      return since != null && since <= (config.days ?? 30);
    }
    case "frequent":
      return customer.ordersCount >= (config.minOrders ?? 3);
    case "inactive": {
      const since = days(customer.lastOrderAt);
      return since != null && since >= (config.days ?? 60);
    }
    case "high_ticket": {
      if (customer.ordersCount === 0) return false;
      return customer.totalSpent / customer.ordersCount >= (config.minTicket ?? 100);
    }
    case "district": {
      const list = (config.districts ?? [])
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      if (list.length === 0) return false;
      return list.includes((customer.district ?? "").trim().toLowerCase());
    }
    case "preference": {
      const list = (config.tags ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean);
      if (list.length === 0) return false;
      return customer.tags.some((tag) => list.includes(tag.trim().toLowerCase()));
    }
    default:
      return true;
  }
}

/** Respeita o limite de frequência: só envia se o último contato foi há mais de N dias. */
export function respectsFrequencyCap(
  lastSentAt: string | null,
  capDays: number,
  now = new Date(),
): boolean {
  if (!lastSentAt || capDays <= 0) return true;
  return now.getTime() - new Date(lastSentAt).getTime() >= capDays * 86_400_000;
}

/** ---------- Bloqueio ---------- */

export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function isBlockActive(
  block: Pick<CustomerBlockRow, "is_active" | "expires_at">,
  now = new Date(),
): boolean {
  if (!block.is_active) return false;
  if (block.expires_at && new Date(block.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

export function generateCode(prefix = "RSG"): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}

/** Converte pontos em valor de desconto conforme a configuração da loja. */
export function pointsToCurrency(points: number, currencyPerPoint: number): number {
  return Math.round(points * currencyPerPoint * 100) / 100;
}

/**
 * Metas de faturamento da loja e resumo diário.
 *
 * Módulo puro: só cálculo de progresso e montagem do texto do resumo, para
 * poder rodar tanto no navegador (painel) quanto no servidor (rotina diária).
 */

import type { Database } from "@/integrations/supabase/types";

export type StoreGoalsRow = Database["public"]["Tables"]["store_goals"]["Row"];

export interface GoalsSettings {
  monthlyRevenueGoal: number;
  dailyRevenueGoal: number;
  monthlyOrdersGoal: number;
  ticketGoal: number;
  dailySummaryEnabled: boolean;
  summaryHour: number;
  summaryWhatsapp: string;
  lastSummaryAt: string | null;
}

export const DEFAULT_GOALS: GoalsSettings = {
  monthlyRevenueGoal: 0,
  dailyRevenueGoal: 0,
  monthlyOrdersGoal: 0,
  ticketGoal: 0,
  dailySummaryEnabled: false,
  summaryHour: 20,
  summaryWhatsapp: "",
  lastSummaryAt: null,
};

export function goalsKey(storeId: string | undefined) {
  return ["store-goals", storeId] as const;
}

function num(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readGoals(row: StoreGoalsRow | null | undefined): GoalsSettings {
  if (!row) return DEFAULT_GOALS;
  return {
    monthlyRevenueGoal: num(row.monthly_revenue_goal),
    dailyRevenueGoal: num(row.daily_revenue_goal),
    monthlyOrdersGoal: num(row.monthly_orders_goal),
    ticketGoal: num(row.ticket_goal),
    dailySummaryEnabled: row.daily_summary_enabled,
    summaryHour: clampHour(row.summary_hour),
    summaryWhatsapp: row.summary_whatsapp ?? "",
    lastSummaryAt: row.last_summary_at,
  };
}

export function clampHour(value: number | null | undefined): number {
  const parsed = Math.round(num(value));
  if (parsed < 0) return 0;
  if (parsed > 23) return 23;
  return parsed;
}

/** Linha mínima de pedido usada nos cálculos. */
export interface GoalOrderLine {
  created_at: string;
  total: number | string | null;
  status: string;
}

const CANCELLED = new Set(["cancelled", "rejected"]);

export interface GoalsProgress {
  todayRevenue: number;
  todayOrders: number;
  monthRevenue: number;
  monthOrders: number;
  ticket: number;
  /** Percentuais de 0 a 100 (limitados para a barra de progresso). */
  dailyPercent: number;
  monthlyPercent: number;
  ordersPercent: number;
  ticketPercent: number;
  /** Quanto falta hoje e no mês para bater a meta. */
  dailyRemaining: number;
  monthlyRemaining: number;
}

function percent(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((value / goal) * 100));
}

/** Calcula o progresso do dia e do mês a partir dos pedidos válidos. */
export function computeGoalsProgress(
  orders: GoalOrderLine[],
  goals: GoalsSettings,
  now: Date = new Date(),
): GoalsProgress {
  const todayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);

  let todayRevenue = 0;
  let todayOrders = 0;
  let monthRevenue = 0;
  let monthOrders = 0;

  for (const order of orders) {
    if (CANCELLED.has(order.status)) continue;
    const total = num(order.total);
    if (order.created_at.startsWith(monthKey)) {
      monthRevenue += total;
      monthOrders += 1;
    }
    if (order.created_at.startsWith(todayKey)) {
      todayRevenue += total;
      todayOrders += 1;
    }
  }

  const ticket = monthOrders > 0 ? monthRevenue / monthOrders : 0;

  return {
    todayRevenue: Number(todayRevenue.toFixed(2)),
    todayOrders,
    monthRevenue: Number(monthRevenue.toFixed(2)),
    monthOrders,
    ticket: Number(ticket.toFixed(2)),
    dailyPercent: percent(todayRevenue, goals.dailyRevenueGoal),
    monthlyPercent: percent(monthRevenue, goals.monthlyRevenueGoal),
    ordersPercent: percent(monthOrders, goals.monthlyOrdersGoal),
    ticketPercent: percent(ticket, goals.ticketGoal),
    dailyRemaining: Math.max(0, Number((goals.dailyRevenueGoal - todayRevenue).toFixed(2))),
    monthlyRemaining: Math.max(0, Number((goals.monthlyRevenueGoal - monthRevenue).toFixed(2))),
  };
}

export interface GoalsOverview {
  goals: GoalsSettings;
  progress: GoalsProgress;
  storeName: string;
  channelReady: boolean;
}

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Texto do resumo diário enviado no WhatsApp do lojista. */
export function buildDailySummaryText(
  storeName: string,
  progress: GoalsProgress,
  goals: GoalsSettings,
): string {
  const lines = [
    `📊 Resumo do dia — ${storeName}`,
    `Vendas hoje: ${money(progress.todayRevenue)} em ${progress.todayOrders} pedidos`,
  ];

  if (goals.dailyRevenueGoal > 0) {
    lines.push(
      progress.dailyRemaining === 0
        ? `Meta do dia batida! (${progress.dailyPercent}% de ${money(goals.dailyRevenueGoal)})`
        : `Meta do dia: ${progress.dailyPercent}% — faltam ${money(progress.dailyRemaining)}`,
    );
  }

  lines.push(`No mês: ${money(progress.monthRevenue)} em ${progress.monthOrders} pedidos`);

  if (goals.monthlyRevenueGoal > 0) {
    lines.push(
      progress.monthlyRemaining === 0
        ? `Meta do mês batida! (${progress.monthlyPercent}%)`
        : `Meta do mês: ${progress.monthlyPercent}% — faltam ${money(progress.monthlyRemaining)}`,
    );
  }

  lines.push(`Ticket médio do mês: ${money(progress.ticket)}`);
  return lines.join("\n");
}

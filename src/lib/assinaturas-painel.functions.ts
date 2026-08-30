import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Painel do lojista: assinaturas ativas, receita recorrente prevista (MRR),
 * status dos próximos ciclos e evolução diária dos pedidos gerados por
 * assinatura.
 *
 * Tudo lido com o cliente autenticado, então a RLS da loja continua valendo.
 */

const input = z.object({
  storeId: z.string().uuid(),
  days: z.union([z.literal(7), z.literal(30), z.literal(60), z.literal(90)]).default(30),
});

export interface SubscriptionPanelRow {
  id: string;
  customerName: string;
  customerPhone: string | null;
  status: string;
  period: string;
  paused: boolean;
  nextOrderAt: string | null;
  lastOrderAt: string | null;
  ordersCount: number;
  /** Valor previsto do próximo pedido (itens + entrega). */
  total: number;
  /** Receita recorrente mensal equivalente. */
  monthlyValue: number;
  itemsLabel: string;
  lastError: string | null;
  /** Ciclo vencido e ainda sem pedido gerado. */
  overdue: boolean;
}

export interface SubscriptionDailyPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  revenue: number;
  orders: number;
}

export interface SubscriptionPanelReport {
  days: number;
  activeCount: number;
  pausedCount: number;
  canceledCount: number;
  /** Receita recorrente prevista por mês somando as assinaturas ativas. */
  monthlyRecurringRevenue: number;
  /** Receita já faturada por assinaturas no período. */
  periodRevenue: number;
  periodOrders: number;
  dueNext7Days: number;
  overdueCount: number;
  subscriptions: SubscriptionPanelRow[];
  daily: SubscriptionDailyPoint[];
}

const CANCELLED_ORDER = new Set(["cancelled", "rejected"]);

export const subscriptionPanelReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<SubscriptionPanelReport> => {
    const { data: allowed } = await context.supabase.rpc("has_store_permission", {
      _store_id: data.storeId,
      _user_id: context.userId,
      _area: "reports",
    });
    if (allowed !== true) throw new Error("Você não tem permissão para ver as assinaturas desta loja.");

    const { monthlyRecurringValue, parseItems, subscriptionTotal } = await import("@/lib/assinaturas");

    const now = new Date();
    const since = new Date(now.getTime() - data.days * 86_400_000);

    const [subsRes, ordersRes] = await Promise.all([
      context.supabase
        .from("customer_subscriptions")
        .select(
          "id, status, period, paused_at, next_order_at, last_order_at, orders_count, delivery_type, delivery_fee, items, customer_name, customer_phone, last_error, created_at",
        )
        .eq("store_id", data.storeId)
        .order("next_order_at", { ascending: true, nullsFirst: false })
        .limit(300),
      context.supabase
        .from("orders")
        .select("id, status, total, created_at, subscription_id")
        .eq("store_id", data.storeId)
        .not("subscription_id", "is", null)
        .gte("created_at", since.toISOString()),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (subsRes.data ?? []) as any[];
    const orders = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((ordersRes.data ?? []) as any[]).filter((row) => !CANCELLED_ORDER.has(String(row.status)));

    const in7Days = now.getTime() + 7 * 86_400_000;

    const subscriptions: SubscriptionPanelRow[] = rows.map((row) => {
      const items = parseItems(row.items);
      const total = subscriptionTotal(
        items,
        row.delivery_type === "delivery" ? Number(row.delivery_fee ?? 0) : 0,
      );
      const active = row.status === "active" || row.status === "trialing";
      const nextAt = row.next_order_at ? new Date(row.next_order_at).getTime() : null;
      return {
        id: row.id,
        customerName: row.customer_name ?? "Cliente",
        customerPhone: row.customer_phone ?? null,
        status: row.status,
        period: row.period,
        paused: Boolean(row.paused_at),
        nextOrderAt: row.next_order_at ?? null,
        lastOrderAt: row.last_order_at ?? null,
        ordersCount: Number(row.orders_count ?? 0),
        total,
        monthlyValue: active && !row.paused_at ? monthlyRecurringValue(row.period, total) : 0,
        itemsLabel: items.map((item) => `${item.quantity}x ${item.name}`).join(", "),
        lastError: row.last_error ?? null,
        overdue: Boolean(active && !row.paused_at && nextAt && nextAt < now.getTime()),
      };
    });

    // Série diária: um ponto por dia da janela, mesmo sem pedidos, para o
    // gráfico não “pular” datas.
    const buckets = new Map<string, SubscriptionDailyPoint>();
    for (let index = 0; index <= data.days; index += 1) {
      const day = new Date(since.getTime() + index * 86_400_000).toISOString().slice(0, 10);
      buckets.set(day, { date: day, revenue: 0, orders: 0 });
    }
    for (const order of orders) {
      const day = String(order.created_at).slice(0, 10);
      const point = buckets.get(day);
      if (!point) continue;
      point.orders += 1;
      point.revenue = Math.round((point.revenue + Number(order.total ?? 0)) * 100) / 100;
    }

    const activeRows = subscriptions.filter(
      (row) => (row.status === "active" || row.status === "trialing") && !row.paused,
    );

    return {
      days: data.days,
      activeCount: activeRows.length,
      pausedCount: subscriptions.filter((row) => row.paused || row.status === "paused").length,
      canceledCount: subscriptions.filter(
        (row) => row.status === "canceled" || row.status === "expired",
      ).length,
      monthlyRecurringRevenue:
        Math.round(activeRows.reduce((total, row) => total + row.monthlyValue, 0) * 100) / 100,
      periodRevenue:
        Math.round(orders.reduce((total, row) => total + Number(row.total ?? 0), 0) * 100) / 100,
      periodOrders: orders.length,
      dueNext7Days: activeRows.filter(
        (row) => row.nextOrderAt && new Date(row.nextOrderAt).getTime() <= in7Days,
      ).length,
      overdueCount: subscriptions.filter((row) => row.overdue).length,
      subscriptions,
      daily: Array.from(buckets.values()),
    };
  });

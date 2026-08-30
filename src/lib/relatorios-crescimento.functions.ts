import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Relatório de crescimento do lojista: quanto o carrinho abandonado, os cupons,
 * o upsell e o cashback realmente geraram no período escolhido.
 *
 * Tudo lido com o cliente autenticado (`context.supabase`), então a RLS da loja
 * continua valendo — o lojista só vê os próprios dados.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: "reports",
  });
  if (data !== true) throw new Error("Você não tem permissão para ver os relatórios desta loja.");
}

const input = z.object({
  storeId: z.string().uuid(),
  /** Janela do relatório em dias. */
  days: z.union([z.literal(7), z.literal(30), z.literal(60), z.literal(90)]).default(30),
});

export interface GrowthReport {
  days: number;
  /** Carrinhos abandonados criados no período. */
  cartsCreated: number;
  /** Lembretes de recuperação enviados. */
  cartsReminded: number;
  /** Carrinhos que voltaram e viraram pedido. */
  cartsRecovered: number;
  /** Valor dos carrinhos que foram recuperados (subtotal salvo). */
  recoveredRevenue: number;
  /** Percentual de recuperação sobre os lembretes enviados. */
  recoveryRate: number;
  /** Pedidos com cupom aplicado + desconto concedido. */
  couponOrders: number;
  couponDiscount: number;
  /** Pedidos que levaram ao menos um item do "leve também". */
  upsellOrders: number;
  upsellItems: number;
  upsellRevenue: number;
  /** Resgates de cashback no checkout. */
  cashbackRedemptions: number;
  cashbackRedeemed: number;
  cashbackGranted: number;
  /** Total de pedidos válidos no período (base de comparação). */
  totalOrders: number;
  totalRevenue: number;
}

const CANCELLED = new Set(["cancelled", "rejected"]);

export const growthReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<GrowthReport> => {
    await assertPermission(context.supabase, data.storeId, context.userId);

    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const [ordersRes, cartsRes, txRes] = await Promise.all([
      context.supabase
        .from("orders")
        .select("id, status, total, discount, coupon_code, cashback_used, upsell_items, upsell_total, created_at")
        .eq("store_id", data.storeId)
        .gte("created_at", since),
      context.supabase
        .from("abandoned_carts")
        .select("id, reminder_count, recovered_at, subtotal, created_at")
        .eq("store_id", data.storeId)
        .gte("created_at", since),
      context.supabase
        .from("loyalty_transactions")
        .select("id, cashback_amount, created_at")
        .eq("store_id", data.storeId)
        .gte("created_at", since),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = ((ordersRes.data ?? []) as any[]).filter(
      (row) => !CANCELLED.has(String(row.status)),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const carts = (cartsRes.data ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions = (txRes.data ?? []) as any[];

    const cartsReminded = carts.filter((row) => Number(row.reminder_count ?? 0) > 0).length;
    const recovered = carts.filter((row) => Boolean(row.recovered_at));

    const couponOrders = orders.filter((row) => Boolean(row.coupon_code));
    const upsellOrders = orders.filter((row) => Number(row.upsell_items ?? 0) > 0);
    const cashbackOrders = orders.filter((row) => Number(row.cashback_used ?? 0) > 0);

    const sum = (rows: { [key: string]: unknown }[], key: string) =>
      rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

    return {
      days: data.days,
      cartsCreated: carts.length,
      cartsReminded,
      cartsRecovered: recovered.length,
      recoveredRevenue: sum(recovered, "subtotal"),
      recoveryRate: cartsReminded ? (recovered.length / cartsReminded) * 100 : 0,
      couponOrders: couponOrders.length,
      couponDiscount: sum(couponOrders, "discount"),
      upsellOrders: upsellOrders.length,
      upsellItems: sum(upsellOrders, "upsell_items"),
      upsellRevenue: sum(upsellOrders, "upsell_total"),
      cashbackRedemptions: cashbackOrders.length,
      cashbackRedeemed: sum(cashbackOrders, "cashback_used"),
      cashbackGranted: transactions
        .filter((row) => Number(row.cashback_amount ?? 0) > 0)
        .reduce((total, row) => total + Number(row.cashback_amount ?? 0), 0),
      totalOrders: orders.length,
      totalRevenue: sum(orders, "total"),
    };
  });

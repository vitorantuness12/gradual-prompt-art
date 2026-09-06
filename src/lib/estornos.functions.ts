import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RefundResult, RefundSummary } from "@/lib/estornos";

/**
 * Estorno de pedidos.
 *
 * Regras de negócio:
 * - só a equipe com permissão em "orders" estorna;
 * - a soma dos estornos nunca passa do total do pedido;
 * - dinheiro devolvido baixa o pagamento; crédito/cashback devolvem saldo ao cliente;
 * - estorno total cancela o pedido e devolve os pontos ganhos na compra.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: "orders",
  });
  if (data !== true) throw new Error("Você não tem permissão para estornar pedidos desta loja.");
}

const round2 = (value: number) => Math.round(value * 100) / 100;

const listInput = z.object({ storeId: z.string().uuid(), orderId: z.string().uuid() });

export const listOrderRefunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listInput.parse(data))
  .handler(async ({ data, context }): Promise<RefundSummary> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [order, refunds] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id, total")
        .eq("id", data.orderId)
        .eq("store_id", data.storeId)
        .maybeSingle(),
      supabaseAdmin
        .from("refunds")
        .select("*")
        .eq("order_id", data.orderId)
        .eq("store_id", data.storeId)
        .order("created_at", { ascending: false }),
    ]);

    const orderTotal = Number(order.data?.total ?? 0);
    const rows = refunds.data ?? [];
    const refunded = round2(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0));

    return {
      orderTotal: round2(orderTotal),
      refunded,
      remaining: round2(Math.max(0, orderTotal - refunded)),
      refunds: rows,
    };
  });

const createInput = z.object({
  storeId: z.string().uuid(),
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["money", "credit", "cashback"]),
  reason: z.string().trim().max(400).optional(),
  cancelOrder: z.boolean().optional(),
  revokeAccess: z.boolean().optional(),
});

export const createOrderRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createInput.parse(data))
  .handler(async ({ data, context }): Promise<RefundResult> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, total, status, customer_id, customer_name, affiliate_code, payment_status")
      .eq("id", data.orderId)
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado.", remaining: 0 };

    const { data: previous } = await supabaseAdmin
      .from("refunds")
      .select("amount")
      .eq("order_id", data.orderId)
      .eq("store_id", data.storeId);

    const orderTotal = Number(order.total ?? 0);
    const refunded = round2((previous ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const remaining = round2(Math.max(0, orderTotal - refunded));
    const amount = round2(data.amount);

    if (remaining <= 0) {
      return { ok: false, message: "Este pedido já foi estornado por completo.", remaining: 0 };
    }
    if (amount > remaining + 0.001) {
      return {
        ok: false,
        message: `O valor disponível para estorno é de no máximo R$ ${remaining.toFixed(2)}.`,
        remaining,
      };
    }

    const isFull = amount >= remaining - 0.001;
    let creditId: string | null = null;

    // Devolução em crédito da loja.
    if (data.method === "credit") {
      const { data: credit } = await supabaseAdmin
        .from("customer_credits")
        .insert({
          store_id: data.storeId,
          customer_id: order.customer_id,
          customer_name: order.customer_name,
          amount,
          balance: amount,
          origin: "refund",
          notes: data.reason ?? "Estorno de pedido",
          created_by: context.userId,
        })
        .select("id")
        .maybeSingle();
      creditId = credit?.id ?? null;
    }

    // Devolução em cashback.
    if (data.method === "cashback" && order.customer_id) {
      const { creditCashback } = await import("@/lib/cashback.server");
      await creditCashback(supabaseAdmin, {
        storeId: data.storeId,
        customerId: order.customer_id,
        amount,
        expirationDays: 90,
        description: "Estorno de pedido",
        orderId: order.id,
      });
    }

    const { error: refundError } = await supabaseAdmin.from("refunds").insert({
      store_id: data.storeId,
      order_id: order.id,
      kind: isFull ? "full" : "partial",
      method: data.method,
      amount,
      reason: data.reason ?? null,
      status: "done",
      customer_name: order.customer_name,
      credit_id: creditId,
      affiliate_code: order.affiliate_code,
      revoked_access: data.revokeAccess === true,
      created_by: context.userId,
    });
    if (refundError) return { ok: false, message: refundError.message, remaining };

    // Baixa no pagamento quando o dinheiro volta de verdade.
    if (data.method === "money") {
      const { data: payment } = await supabaseAdmin
        .from("payments")
        .select("id, amount, refunded_amount")
        .eq("order_id", order.id)
        .eq("store_id", data.storeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (payment) {
        const total = round2(Number(payment.refunded_amount ?? 0) + amount);
        await supabaseAdmin
          .from("payments")
          .update({
            refunded_amount: total,
            refunded_at: new Date().toISOString(),
            status: total >= Number(payment.amount ?? 0) - 0.001 ? "refunded" : "paid",
          })
          .eq("id", payment.id);
      }
    }

    // Estorno total: cancela o pedido e devolve os pontos ganhos na compra.
    if (isFull || data.cancelOrder) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "cancelled", payment_status: "refunded" })
        .eq("id", order.id)
        .eq("store_id", data.storeId);

      if (order.customer_id) {
        const { data: earned } = await supabaseAdmin
          .from("loyalty_transactions")
          .select("points")
          .eq("order_id", order.id)
          .eq("store_id", data.storeId)
          .eq("kind", "earn");
        const points = (earned ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
        if (points > 0) {
          const { data: account } = await supabaseAdmin
            .from("loyalty_accounts")
            .select("id, points_balance")
            .eq("store_id", data.storeId)
            .eq("customer_id", order.customer_id)
            .maybeSingle();
          if (account) {
            await supabaseAdmin
              .from("loyalty_accounts")
              .update({ points_balance: Math.max(0, Number(account.points_balance ?? 0) - points) })
              .eq("id", account.id);
          }
          await supabaseAdmin.from("loyalty_transactions").insert({
            store_id: data.storeId,
            customer_id: order.customer_id,
            kind: "refund",
            points: -points,
            cashback_amount: 0,
            order_id: order.id,
            description: "Pontos devolvidos pelo estorno do pedido",
            created_by: context.userId,
          });
        }
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      actor_id: context.userId,
      action: "order.refund",
      entity: "orders",
      entity_id: order.id,
      details: { amount, method: data.method, reason: data.reason ?? null, full: isFull },
    });

    return {
      ok: true,
      message: isFull
        ? "Estorno total registrado e pedido cancelado."
        : "Estorno parcial registrado.",
      remaining: round2(remaining - amount),
    };
  });

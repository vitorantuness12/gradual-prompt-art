import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  planInvoiceNumber,
  planPeriodEnd,
  validatePlanRefund,
  type PlanInvoiceView,
} from "@/lib/planos-cobranca";

/**
 * Ciclo de cobrança dos planos (área da plataforma).
 *
 * Todas as funções exigem o papel `super_admin`, verificado com o cliente do
 * próprio usuário antes de carregar o cliente privilegiado. Nenhuma delas
 * confia em dado vindo do navegador para decidir permissão.
 */
async function assertSuperAdmin(context: {
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> };
  userId: string;
}) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (data !== true) throw new Error("Acesso restrito à administração da plataforma.");
}

interface InvoiceJoinRow {
  id: string;
  store_id: string;
  amount: number;
  refunded_amount: number | null;
  status: string;
  method: string | null;
  number: string | null;
  note: string | null;
  due_at: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  store: { name: string | null } | null;
  subscription: { plan: { name: string | null } | null } | null;
}

function toView(row: InvoiceJoinRow): PlanInvoiceView {
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.store?.name ?? null,
    planName: row.subscription?.plan?.name ?? null,
    amount: Number(row.amount ?? 0),
    refundedAmount: Number(row.refunded_amount ?? 0),
    status: row.status,
    method: row.method,
    number: row.number,
    note: row.note,
    dueAt: row.due_at,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, store_id, amount, refunded_amount, status, method, number, note, due_at, paid_at, refunded_at, period_start, period_end, created_at, store:stores(name), subscription:store_subscriptions(plan:plans(name))";

/** Cobranças de plano, opcionalmente de uma loja só. */
export const listPlanInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ storeId: z.string().uuid().nullable().optional(), status: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<PlanInvoiceView[]> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("subscription_invoices")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.storeId) query = query.eq("store_id", data.storeId);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as InvoiceJoinRow[]).map(toView);
  });

const createInput = z.object({
  storeId: z.string().uuid(),
  planId: z.string().uuid(),
  period: z.enum(["month", "year"]),
  amount: z.number().min(0).max(1_000_000).optional(),
  dueAt: z.string().max(40).optional(),
  note: z.string().trim().max(400).optional(),
});

/**
 * Cria a cobrança do plano de uma loja. Garante a assinatura da loja e usa o
 * preço do plano quando nenhum valor é informado.
 */
export const createPlanInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; invoiceId?: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("id, name, price_month, price_year")
      .eq("id", data.planId)
      .maybeSingle();
    if (!plan) return { ok: false, message: "Plano não encontrado." };

    const amount =
      data.amount !== undefined && data.amount > 0
        ? data.amount
        : Number(data.period === "year" ? plan.price_year : plan.price_month);

    const startedAt = new Date();
    const periodEnd = planPeriodEnd(data.period, startedAt);

    // Assinatura da loja: cria se ainda não existe, senão mantém o plano atual.
    const { data: subscription } = await supabaseAdmin
      .from("store_subscriptions")
      .select("id")
      .eq("store_id", data.storeId)
      .maybeSingle();

    let subscriptionId = subscription?.id ?? null;
    if (!subscriptionId) {
      const { data: created, error } = await supabaseAdmin
        .from("store_subscriptions")
        .insert({
          store_id: data.storeId,
          plan_id: data.planId,
          period: data.period,
          provider: "manual",
          status: "trialing",
          current_period_start: startedAt.toISOString(),
          current_period_end: periodEnd,
        })
        .select("id")
        .maybeSingle();
      if (error) return { ok: false, message: `Não foi possível criar a assinatura: ${error.message}` };
      subscriptionId = created?.id ?? null;
    }

    const { data: invoice, error: insertError } = await supabaseAdmin
      .from("subscription_invoices")
      .insert({
        store_id: data.storeId,
        subscription_id: subscriptionId,
        provider: "manual",
        status: "open",
        amount,
        due_at: data.dueAt || periodEnd,
        period_start: startedAt.toISOString(),
        period_end: periodEnd,
        note: data.note || null,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if (insertError || !invoice) return { ok: false, message: `Não foi possível criar a cobrança: ${insertError?.message}` };

    await supabaseAdmin
      .from("subscription_invoices")
      .update({ number: planInvoiceNumber(invoice.id, startedAt) })
      .eq("id", invoice.id);

    return { ok: true, message: `Cobrança de ${plan.name} criada.`, invoiceId: invoice.id };
  });

/** Confirma o pagamento: ativa o plano e estende o ciclo da loja. */
export const payPlanInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        method: z.string().trim().max(30).optional(),
        note: z.string().trim().max(400).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invoice } = await supabaseAdmin
      .from("subscription_invoices")
      .select("id, store_id, subscription_id, status, amount, period_start, period_end")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!invoice) return { ok: false, message: "Cobrança não encontrada." };
    if (invoice.status === "paid") return { ok: false, message: "Esta cobrança já está paga." };

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("subscription_invoices")
      .update({ status: "paid", paid_at: now, method: data.method || "manual", note: data.note || null })
      .eq("id", invoice.id);

    if (invoice.subscription_id) {
      await supabaseAdmin
        .from("store_subscriptions")
        .update({
          status: "active",
          current_period_start: invoice.period_start ?? now,
          current_period_end: invoice.period_end,
          cancel_at_period_end: false,
          canceled_at: null,
        })
        .eq("id", invoice.subscription_id);
    }

    return { ok: true, message: "Pagamento confirmado e plano ativo." };
  });

/** Marca a cobrança como não paga (atraso) ou cancelada. */
export const voidPlanInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ invoiceId: z.string().uuid(), reason: z.string().trim().max(400).optional() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invoice } = await supabaseAdmin
      .from("subscription_invoices")
      .select("id, subscription_id, status")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!invoice) return { ok: false, message: "Cobrança não encontrada." };
    if (invoice.status === "paid") return { ok: false, message: "Cobrança paga: use o reembolso." };

    await supabaseAdmin
      .from("subscription_invoices")
      .update({ status: "void", note: data.reason || null })
      .eq("id", invoice.id);

    if (invoice.subscription_id) {
      await supabaseAdmin.from("store_subscriptions").update({ status: "past_due" }).eq("id", invoice.subscription_id);
    }
    return { ok: true, message: "Cobrança cancelada e loja marcada em atraso." };
  });

/** Reembolsa total ou parcialmente uma cobrança paga. */
export const refundPlanInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        amount: z.number().min(0.01).max(1_000_000),
        reason: z.string().trim().max(400).optional(),
        cancelSubscription: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invoice } = await supabaseAdmin
      .from("subscription_invoices")
      .select("id, subscription_id, status, amount, refunded_amount")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!invoice) return { ok: false, message: "Cobrança não encontrada." };

    const check = validatePlanRefund(
      {
        status: invoice.status,
        amount: Number(invoice.amount ?? 0),
        refundedAmount: Number(invoice.refunded_amount ?? 0),
      },
      data.amount,
    );
    if (!check.ok) return { ok: false, message: check.message };

    const totalRefunded = Number(invoice.refunded_amount ?? 0) + check.amount;
    const full = totalRefunded >= Number(invoice.amount ?? 0) - 0.001;

    await supabaseAdmin
      .from("subscription_invoices")
      .update({
        refunded_amount: totalRefunded,
        refunded_at: new Date().toISOString(),
        status: full ? "refunded" : "paid",
        note: data.reason || null,
      })
      .eq("id", invoice.id);

    if (full && data.cancelSubscription && invoice.subscription_id) {
      await supabaseAdmin
        .from("store_subscriptions")
        .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_at_period_end: true })
        .eq("id", invoice.subscription_id);
    }

    return {
      ok: true,
      message: full ? "Reembolso total registrado." : "Reembolso parcial registrado.",
    };
  });

/** Troca o plano da loja (mantendo o ciclo atual) e registra o período novo. */
export const changeStorePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        planId: z.string().uuid(),
        period: z.enum(["month", "year"]),
        status: z.enum(["trialing", "active", "past_due", "canceled", "expired"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const patch = {
      plan_id: data.planId,
      period: data.period,
      status: data.status ?? "active",
      current_period_start: now.toISOString(),
      current_period_end: planPeriodEnd(data.period, now),
    };

    const { data: existing } = await supabaseAdmin
      .from("store_subscriptions")
      .select("id")
      .eq("store_id", data.storeId)
      .maybeSingle();

    const { error } = existing?.id
      ? await supabaseAdmin.from("store_subscriptions").update(patch as never).eq("id", existing.id)
      : await supabaseAdmin
          .from("store_subscriptions")
          .insert({ ...patch, store_id: data.storeId, provider: "manual" } as never);

    if (error) return { ok: false, message: `Não foi possível atualizar o plano: ${error.message}` };
    return { ok: true, message: "Plano da loja atualizado." };
  });

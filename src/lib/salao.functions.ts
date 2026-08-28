import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Operações do salão.
 * As mudanças de situação da mesa são condicionais (comparam a situação
 * atual) para que dois atendentes simultâneos não sobrescrevam um ao outro.
 */

type Ctx = {
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> };
  userId: string;
};

async function assertStaff(context: Ctx, storeId: string) {
  const { data } = await context.supabase.rpc("is_store_staff", {
    _store_id: storeId,
    _user_id: context.userId,
  });
  if (data !== true) throw new Error("Você não tem acesso ao salão desta loja.");
}

async function hasPermission(context: Ctx, storeId: string, area: string): Promise<boolean> {
  const { data } = await context.supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: context.userId,
    _area: area,
  });
  return data === true;
}

/* ---------------- Impressão setorizada ---------------- */

async function enqueueJobsForOrder(orderId: string, createdBy: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buildStationTicket, groupItemsByStation, templateForStation, STATION_LABEL } = await import("@/lib/salao");

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, store_id, code, notes, table_number, table_session_id, order_items(product_name, quantity, notes, prep_station)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return 0;

  const { data: store } = await supabaseAdmin.from("stores").select("name").eq("id", order.store_id).maybeSingle();
  const { data: session } = order.table_session_id
    ? await supabaseAdmin
        .from("table_sessions")
        .select("code, table:dining_tables(label)")
        .eq("id", order.table_session_id)
        .maybeSingle()
    : { data: null };

  const tableLabel = (session?.table as { label: string } | null)?.label ?? order.table_number ?? null;
  const groups = groupItemsByStation(order.order_items ?? []);

  const jobs = groups.map((group) => ({
    store_id: order.store_id,
    order_id: order.id,
    session_id: order.table_session_id,
    station: group.station,
    template: templateForStation(group.station),
    title: `${STATION_LABEL[group.station] ?? group.station} · pedido ${order.code}`,
    content: buildStationTicket({
      station: group.station,
      storeName: store?.name ?? "Loja",
      orderCode: order.code,
      tableLabel,
      sessionCode: session?.code ?? null,
      items: group.items,
      notes: order.notes,
    }),
    created_by: createdBy,
  }));

  if (jobs.length === 0) return 0;
  await supabaseAdmin.from("print_jobs").insert(jobs);
  return jobs.length;
}

export const enqueuePrintJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; jobs?: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin.from("orders").select("store_id").eq("id", data.orderId).maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado." };
    await assertStaff(context as unknown as Ctx, order.store_id);

    const jobs = await enqueueJobsForOrder(data.orderId, context.userId);
    return { ok: true, message: `${jobs} cupom(ns) enviado(s) para os setores.`, jobs };
  });

export const markPrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), action: z.enum(["printed", "reprint", "cancel"]) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("print_jobs")
      .select("id, store_id, attempts")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) return { ok: false, message: "Cupom não encontrado na fila." };
    await assertStaff(context as unknown as Ctx, job.store_id);

    const patch =
      data.action === "printed"
        ? { status: "printed" as const, printed_at: new Date().toISOString(), attempts: job.attempts + 1 }
        : data.action === "reprint"
          ? { status: "queued" as const, printed_at: null, attempts: job.attempts + 1 }
          : { status: "cancelled" as const };

    const { error } = await supabaseAdmin.from("print_jobs").update(patch).eq("id", job.id);
    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message: data.action === "reprint" ? "Cupom reenviado para a fila." : data.action === "printed" ? "Cupom marcado como impresso." : "Cupom cancelado.",
    };
  });

/* ---------------- Mesas e comandas ---------------- */

export const setTableStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        tableId: z.string().uuid(),
        status: z.enum(["free", "occupied", "reserved", "awaiting_payment", "maintenance"]),
        expectedStatus: z.string().max(30).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canTransition, TABLE_STATUS_LABEL } = await import("@/lib/salao");

    const { data: table } = await supabaseAdmin
      .from("dining_tables")
      .select("id, store_id, status, label")
      .eq("id", data.tableId)
      .maybeSingle();
    if (!table) return { ok: false, message: "Mesa não encontrada." };
    await assertStaff(context as unknown as Ctx, table.store_id);

    if (data.expectedStatus && data.expectedStatus !== table.status) {
      return {
        ok: false,
        message: `Outro atendente já mudou a mesa ${table.label} para ${TABLE_STATUS_LABEL[table.status] ?? table.status}.`,
      };
    }
    if (!canTransition(table.status as never, data.status)) {
      return { ok: false, message: `Não é possível ir de ${TABLE_STATUS_LABEL[table.status]} para ${TABLE_STATUS_LABEL[data.status]}.` };
    }

    // Atualização condicional: só grava se ninguém mudou no meio do caminho.
    const { data: updated, error } = await supabaseAdmin
      .from("dining_tables")
      .update({ status: data.status })
      .eq("id", table.id)
      .eq("status", table.status)
      .select("id");
    if (error) return { ok: false, message: error.message };
    if (!updated || updated.length === 0) {
      return { ok: false, message: "A mesa foi alterada por outro atendente. Atualize a tela." };
    }
    return { ok: true, message: `Mesa ${table.label}: ${TABLE_STATUS_LABEL[data.status]}.` };
  });

export const openTableSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        tableId: z.string().uuid(),
        guests: z.number().int().min(1).max(50).default(2),
        label: z.string().trim().max(80).optional(),
        serviceFeePercent: z.number().min(0).max(30).default(0),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; sessionId?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: table } = await supabaseAdmin
      .from("dining_tables")
      .select("id, store_id, status, label")
      .eq("id", data.tableId)
      .maybeSingle();
    if (!table) return { ok: false, message: "Mesa não encontrada." };
    await assertStaff(context as unknown as Ctx, table.store_id);
    if (table.status === "maintenance") return { ok: false, message: "Mesa em manutenção." };

    const { data: existing } = await supabaseAdmin
      .from("table_sessions")
      .select("id")
      .eq("table_id", table.id)
      .in("status", ["open", "awaiting_payment"])
      .maybeSingle();
    if (existing) return { ok: true, message: "Comanda já aberta nesta mesa.", sessionId: existing.id };

    const { data: session, error } = await supabaseAdmin
      .from("table_sessions")
      .insert({
        store_id: table.store_id,
        table_id: table.id,
        guests: data.guests,
        label: data.label?.trim() || null,
        service_fee_percent: data.serviceFeePercent,
        opened_by: context.userId,
      })
      .select("id, code")
      .single();
    if (error || !session) return { ok: false, message: error?.message ?? "Não foi possível abrir a comanda." };

    await supabaseAdmin.from("dining_tables").update({ status: "occupied" }).eq("id", table.id);
    return { ok: true, message: `Comanda ${session.code} aberta na mesa ${table.label}.`, sessionId: session.id };
  });

const sessionOrderInput = z.object({
  sessionId: z.string().uuid(),
  notes: z.string().trim().max(400).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(60),
});

/** Lança itens na comanda: cria um pedido vinculado e manda os cupons aos setores. */
export const addSessionOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sessionOrderInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; code?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("table_sessions")
      .select("id, store_id, status, code, table:dining_tables(id, label)")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false, message: "Comanda não encontrada." };
    await assertStaff(context as unknown as Ctx, session.store_id);
    if (session.status === "closed" || session.status === "merged") {
      return { ok: false, message: "Esta comanda já foi encerrada." };
    }

    const result = await createSessionOrder({
      storeId: session.store_id,
      sessionId: session.id,
      table: session.table as { id: string; label: string } | null,
      items: data.items,
      notes: data.notes ?? null,
      customerName: `Mesa ${(session.table as { label: string } | null)?.label ?? session.code}`,
      createdBy: context.userId,
    });
    return result;
  });

/** Núcleo compartilhado entre garçom e cliente (QR Code). */
async function createSessionOrder(input: {
  storeId: string;
  sessionId: string;
  table: { id: string; label: string } | null;
  items: { productId: string; quantity: number; notes?: string | undefined }[];
  notes: string | null;
  customerName: string;
  customerPhone?: string | null;
  createdBy: string | null;
}): Promise<{ ok: boolean; message: string; code?: string; orderId?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sanitizeText } = await import("@/lib/security.server");

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, name, price, promo_price, is_active, prep_station, track_stock, stock_quantity")
    .eq("store_id", input.storeId)
    .in("id", productIds);

  const catalog = new Map((products ?? []).map((product) => [product.id, product]));
  const lines = [];
  let subtotal = 0;

  for (const item of input.items) {
    const product = catalog.get(item.productId);
    if (!product || !product.is_active) return { ok: false, message: "Um dos itens não está disponível." };
    const unitPrice = Number(product.promo_price ?? 0) > 0 ? Number(product.promo_price) : Number(product.price);
    const total = Math.round(unitPrice * item.quantity * 100) / 100;
    subtotal += total;
    lines.push({
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      total,
      notes: item.notes ? sanitizeText(item.notes, 200) : null,
      prep_station: product.prep_station ?? null,
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      store_id: input.storeId,
      table_session_id: input.sessionId,
      table_number: input.table?.label ?? null,
      type: "dine_in",
      channel: "mesa",
      status: "confirmed",
      customer_name: sanitizeText(input.customerName, 120),
      customer_phone: input.customerPhone ?? null,
      subtotal,
      total: subtotal,
      notes: input.notes ? sanitizeText(input.notes, 300) : null,
      payment_status: "pending",
    })
    .select("id, code")
    .single();
  if (error || !order) return { ok: false, message: error?.message ?? "Não foi possível lançar o pedido." };

  await supabaseAdmin.from("order_items").insert(
    lines.map((line) => ({ ...line, order_id: order.id, store_id: input.storeId })),
  );

  await enqueueJobsForOrder(order.id, input.createdBy);

  return { ok: true, message: `Pedido ${order.code} lançado na comanda.`, code: order.code, orderId: order.id };
}

export const transferTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ sessionId: z.string().uuid(), targetTableId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("table_sessions")
      .select("id, store_id, status, table_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false, message: "Comanda não encontrada." };
    await assertStaff(context as unknown as Ctx, session.store_id);
    if (session.status !== "open" && session.status !== "awaiting_payment") {
      return { ok: false, message: "Comanda encerrada." };
    }

    const { data: target } = await supabaseAdmin
      .from("dining_tables")
      .select("id, store_id, status, label")
      .eq("id", data.targetTableId)
      .maybeSingle();
    if (!target || target.store_id !== session.store_id) return { ok: false, message: "Mesa de destino inválida." };
    if (target.status === "maintenance") return { ok: false, message: "Mesa de destino em manutenção." };

    const { data: busy } = await supabaseAdmin
      .from("table_sessions")
      .select("id")
      .eq("table_id", target.id)
      .in("status", ["open", "awaiting_payment"])
      .maybeSingle();
    if (busy) return { ok: false, message: `A mesa ${target.label} já tem uma comanda aberta. Junte as comandas.` };

    await supabaseAdmin.from("table_sessions").update({ table_id: target.id }).eq("id", session.id);
    await supabaseAdmin.from("orders").update({ table_number: target.label }).eq("table_session_id", session.id);
    await supabaseAdmin.from("dining_tables").update({ status: "occupied" }).eq("id", target.id);
    if (session.table_id) {
      await supabaseAdmin.from("dining_tables").update({ status: "free" }).eq("id", session.table_id);
    }

    await supabaseAdmin.from("audit_logs").insert({
      store_id: session.store_id,
      user_id: context.userId,
      action: "salao.transfer_table",
      entity: "table_sessions",
      entity_id: session.id,
      metadata: { to: target.label },
    });

    return { ok: true, message: `Comanda transferida para a mesa ${target.label}.` };
  });

export const mergeSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    if (data.sourceId === data.targetId) return { ok: false, message: "Escolha duas comandas diferentes." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mergeGuests } = await import("@/lib/salao");

    const { data: sessions } = await supabaseAdmin
      .from("table_sessions")
      .select("id, store_id, status, guests, table_id, code")
      .in("id", [data.sourceId, data.targetId]);

    const source = (sessions ?? []).find((item) => item.id === data.sourceId);
    const target = (sessions ?? []).find((item) => item.id === data.targetId);
    if (!source || !target) return { ok: false, message: "Comanda não encontrada." };
    if (source.store_id !== target.store_id) return { ok: false, message: "Comandas de lojas diferentes." };
    await assertStaff(context as unknown as Ctx, target.store_id);
    if (source.status === "closed" || target.status === "closed") {
      return { ok: false, message: "Não é possível juntar comandas encerradas." };
    }

    await supabaseAdmin.from("orders").update({ table_session_id: target.id }).eq("table_session_id", source.id);
    await supabaseAdmin
      .from("table_sessions")
      .update({ status: "merged", merged_into: target.id, closed_at: new Date().toISOString(), closed_by: context.userId })
      .eq("id", source.id);
    await supabaseAdmin
      .from("table_sessions")
      .update({ guests: mergeGuests(target.guests, source.guests) })
      .eq("id", target.id);
    if (source.table_id) {
      await supabaseAdmin.from("dining_tables").update({ status: "free" }).eq("id", source.table_id);
    }

    return { ok: true, message: `Comanda ${source.code} juntada à ${target.code}.` };
  });

/** Separa itens: move pedidos escolhidos para outra comanda (nova ou existente). */
export const splitSessionOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        orderIds: z.array(z.string().uuid()).min(1).max(50),
        targetSessionId: z.string().uuid().optional(),
        label: z.string().trim().max(80).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; sessionId?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("table_sessions")
      .select("id, store_id, table_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false, message: "Comanda não encontrada." };
    await assertStaff(context as unknown as Ctx, session.store_id);
    if (session.status === "closed") return { ok: false, message: "Comanda já encerrada." };

    let targetId = data.targetSessionId ?? null;
    if (!targetId) {
      const { data: created, error } = await supabaseAdmin
        .from("table_sessions")
        .insert({
          store_id: session.store_id,
          table_id: session.table_id,
          label: data.label?.trim() || "Comanda separada",
          opened_by: context.userId,
        })
        .select("id")
        .single();
      if (error || !created) return { ok: false, message: error?.message ?? "Não foi possível separar." };
      targetId = created.id;
    }

    await supabaseAdmin
      .from("orders")
      .update({ table_session_id: targetId })
      .in("id", data.orderIds)
      .eq("table_session_id", session.id);

    return { ok: true, message: "Itens separados em outra comanda.", sessionId: targetId };
  });

export const applySessionDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        discount: z.number().min(0).max(100_000),
        reason: z.string().trim().max(200).optional(),
        serviceFeePercent: z.number().min(0).max(30).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("table_sessions")
      .select("id, store_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false, message: "Comanda não encontrada." };
    await assertStaff(context as unknown as Ctx, session.store_id);
    if (data.discount > 0 && !(await hasPermission(context as unknown as Ctx, session.store_id, "pos_discount"))) {
      return { ok: false, message: "Você não tem permissão para aplicar desconto." };
    }

    const { error } = await supabaseAdmin
      .from("table_sessions")
      .update({
        discount: data.discount,
        discount_reason: data.reason?.trim() || null,
        ...(data.serviceFeePercent !== undefined ? { service_fee_percent: data.serviceFeePercent } : {}),
      })
      .eq("id", session.id);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: session.store_id,
      user_id: context.userId,
      action: "salao.session_discount",
      entity: "table_sessions",
      entity_id: session.id,
      metadata: { discount: data.discount, reason: data.reason ?? null },
    });

    return { ok: true, message: "Conta atualizada." };
  });

/** Pede a conta: envia o cupom do caixa e marca a mesa como aguardando pagamento. */
export const requestSessionBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ sessionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { billTotals } = await import("@/lib/salao");

    const { data: session } = await supabaseAdmin
      .from("table_sessions")
      .select("id, store_id, code, guests, discount, service_fee_percent, table_id, table:dining_tables(label)")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false, message: "Comanda não encontrada." };
    await assertStaff(context as unknown as Ctx, session.store_id);

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("id, product_name, quantity, unit_price, order:orders!inner(table_session_id, status)")
      .eq("orders.table_session_id", session.id);

    const totals = billTotals(
      (items ?? []).map((item) => ({
        id: item.id,
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
      })),
      {
        discount: Number(session.discount),
        serviceFeePercent: Number(session.service_fee_percent),
        guests: session.guests,
      },
    );

    const tableLabel = (session.table as { label: string } | null)?.label ?? "";
    const content = [
      "*** CONTA ***",
      tableLabel ? `Mesa ${tableLabel}` : "",
      `Comanda ${session.code}`,
      new Date().toLocaleString("pt-BR"),
      "--------------------------------",
      ...(items ?? []).map(
        (item) => `${item.quantity}x ${item.product_name}  ${(Number(item.unit_price) * item.quantity).toFixed(2)}`,
      ),
      "--------------------------------",
      `Subtotal: ${totals.subtotal.toFixed(2)}`,
      totals.discount > 0 ? `Desconto: -${totals.discount.toFixed(2)}` : "",
      totals.serviceFee > 0 ? `Serviço: ${totals.serviceFee.toFixed(2)}` : "",
      `TOTAL: ${totals.total.toFixed(2)}`,
      `Por pessoa (${session.guests}): ${totals.perGuest.toFixed(2)}`,
    ]
      .filter(Boolean)
      .join("\n");

    await supabaseAdmin.from("print_jobs").insert({
      store_id: session.store_id,
      session_id: session.id,
      station: "caixa",
      template: "cashier",
      title: `Conta · comanda ${session.code}`,
      content,
      created_by: context.userId,
    });

    await supabaseAdmin.from("table_sessions").update({ status: "awaiting_payment" }).eq("id", session.id);
    if (session.table_id) {
      await supabaseAdmin.from("dining_tables").update({ status: "awaiting_payment" }).eq("id", session.table_id);
    }

    return { ok: true, message: "Conta enviada para o caixa." };
  });

export const closeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        paymentMethod: z.enum(["cash", "pix", "debit", "credit", "voucher", "split"]).default("cash"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("table_sessions")
      .select("id, store_id, table_id, status, code")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false, message: "Comanda não encontrada." };
    await assertStaff(context as unknown as Ctx, session.store_id);
    if (session.status === "closed") return { ok: false, message: "Comanda já encerrada." };

    await supabaseAdmin
      .from("orders")
      .update({ status: "completed", payment_status: "paid", payment_method: data.paymentMethod })
      .eq("table_session_id", session.id)
      .neq("status", "cancelled");

    await supabaseAdmin
      .from("table_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: context.userId })
      .eq("id", session.id);

    if (session.table_id) {
      await supabaseAdmin.from("dining_tables").update({ status: "free" }).eq("id", session.table_id);
    }

    await supabaseAdmin.from("table_calls").update({ status: "done", resolved_at: new Date().toISOString() }).eq("session_id", session.id).eq("status", "open");

    await supabaseAdmin.from("audit_logs").insert({
      store_id: session.store_id,
      user_id: context.userId,
      action: "salao.session_closed",
      entity: "table_sessions",
      entity_id: session.id,
      metadata: { payment_method: data.paymentMethod },
    });

    return { ok: true, message: `Comanda ${session.code} encerrada e mesa liberada.` };
  });

export const resolveTableCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ callId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: call } = await supabaseAdmin.from("table_calls").select("id, store_id").eq("id", data.callId).maybeSingle();
    if (!call) return { ok: false, message: "Chamado não encontrado." };
    await assertStaff(context as unknown as Ctx, call.store_id);

    await supabaseAdmin
      .from("table_calls")
      .update({ status: "done", resolved_by: context.userId, resolved_at: new Date().toISOString() })
      .eq("id", call.id);
    return { ok: true, message: "Chamado atendido." };
  });

/* ---------------- Cliente na mesa (QR Code, sem login) ---------------- */

export interface PublicTableMenu {
  ok: boolean;
  message: string;
  storeName?: string;
  storeSlug?: string;
  tableLabel?: string;
  sessionCode?: string | undefined;
  categories?: { id: string; name: string }[];
  products?: { id: string; name: string; description: string | null; price: number; categoryId: string | null }[];
}

export const publicTableMenu = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().trim().min(6).max(80) }).parse(data))
  .handler(async ({ data }): Promise<PublicTableMenu> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", `mesa:${clientIdentifier(getRequest()?.headers)}`);
    if (!limit.allowed) return { ok: false, message: "Muitas tentativas. Aguarde um instante." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: table } = await supabaseAdmin
      .from("dining_tables")
      .select("id, label, store_id, is_active, status")
      .eq("qr_token", data.token)
      .maybeSingle();
    if (!table || !table.is_active) return { ok: false, message: "Mesa não encontrada." };

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id, name, slug, is_active, accepts_dine_in")
      .eq("id", table.store_id)
      .maybeSingle();
    if (!store?.is_active) return { ok: false, message: "Loja indisponível no momento." };

    const [{ data: categories }, { data: products }, { data: session }] = await Promise.all([
      supabaseAdmin.from("categories").select("id, name").eq("store_id", store.id).eq("is_active", true).order("sort_order"),
      supabaseAdmin
        .from("products")
        .select("id, name, description, price, promo_price, category_id")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .eq("is_available", true)
        .is("archived_at", null)
        .order("sort_order"),
      supabaseAdmin
        .from("table_sessions")
        .select("code")
        .eq("table_id", table.id)
        .in("status", ["open", "awaiting_payment"])
        .maybeSingle(),
    ]);

    return {
      ok: true,
      message: "ok",
      storeName: store.name,
      storeSlug: store.slug,
      tableLabel: table.label,
      sessionCode: session?.code ?? undefined,
      categories: categories ?? [],
      products: (products ?? []).map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: Number(product.promo_price ?? 0) > 0 ? Number(product.promo_price) : Number(product.price),
        categoryId: product.category_id,
      })),
    };
  });

export const publicTableOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().trim().min(6).max(80),
        customerName: z.string().trim().min(2).max(80),
        notes: z.string().trim().max(300).optional(),
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().min(1).max(20),
              notes: z.string().trim().max(200).optional(),
            }),
          )
          .min(1)
          .max(30),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; code?: string }> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("checkout", `mesa:${clientIdentifier(getRequest()?.headers)}:${data.token}`);
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: table } = await supabaseAdmin
      .from("dining_tables")
      .select("id, label, store_id, is_active, status")
      .eq("qr_token", data.token)
      .maybeSingle();
    if (!table || !table.is_active) return { ok: false, message: "Mesa não encontrada." };
    if (table.status === "maintenance") return { ok: false, message: "Mesa indisponível no momento." };

    // Reaproveita a comanda aberta; se não houver, abre uma.
    const { data: existing } = await supabaseAdmin
      .from("table_sessions")
      .select("id, status")
      .eq("table_id", table.id)
      .in("status", ["open", "awaiting_payment"])
      .maybeSingle();

    let sessionId = existing?.id ?? null;
    if (!sessionId) {
      const { data: created, error } = await supabaseAdmin
        .from("table_sessions")
        .insert({ store_id: table.store_id, table_id: table.id, label: data.customerName.trim() })
        .select("id")
        .single();
      if (error || !created) return { ok: false, message: "Não foi possível abrir a comanda." };
      sessionId = created.id;
      await supabaseAdmin.from("dining_tables").update({ status: "occupied" }).eq("id", table.id).eq("status", "free");
    }

    return createSessionOrder({
      storeId: table.store_id,
      sessionId,
      table: { id: table.id, label: table.label },
      items: data.items,
      notes: data.notes ?? null,
      customerName: data.customerName,
      createdBy: null,
    });
  });

export const publicTableCall = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().trim().min(6).max(80),
        kind: z.enum(["waiter", "bill", "help"]),
        note: z.string().trim().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", `chamado:${clientIdentifier(getRequest()?.headers)}:${data.token}`);
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeText } = await import("@/lib/security.server");
    const { data: table } = await supabaseAdmin
      .from("dining_tables")
      .select("id, store_id, is_active")
      .eq("qr_token", data.token)
      .maybeSingle();
    if (!table || !table.is_active) return { ok: false, message: "Mesa não encontrada." };

    const { data: session } = await supabaseAdmin
      .from("table_sessions")
      .select("id")
      .eq("table_id", table.id)
      .in("status", ["open", "awaiting_payment"])
      .maybeSingle();

    const { data: alreadyOpen } = await supabaseAdmin
      .from("table_calls")
      .select("id")
      .eq("table_id", table.id)
      .eq("kind", data.kind)
      .eq("status", "open")
      .maybeSingle();
    if (alreadyOpen) return { ok: true, message: "Já avisamos a equipe. Alguém vem em instantes." };

    await supabaseAdmin.from("table_calls").insert({
      store_id: table.store_id,
      table_id: table.id,
      session_id: session?.id ?? null,
      kind: data.kind,
      note: data.note ? sanitizeText(data.note, 200) : null,
    });

    return { ok: true, message: data.kind === "bill" ? "Conta solicitada." : "Garçom chamado." };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Operações do monitor de preparo (KDS).
 *
 * Tudo passa por validação de permissão e por controle de concorrência: a
 * atualização só acontece se o pedido ainda estiver no estado que o operador
 * viu na tela. Assim dois operadores não sobrescrevem um ao outro em silêncio.
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
  if (data !== true) throw new Error("Você não tem acesso à operação desta loja.");
}

async function hasArea(context: Ctx, storeId: string, area: string): Promise<boolean> {
  const { data } = await context.supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: context.userId,
    _area: area,
  });
  return data === true;
}

const KDS_FLOW = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "completed"] as const;

export interface KdsActionResult {
  ok: boolean;
  message: string;
  status?: string;
  conflict?: boolean;
}

/* ---------------- Status do pedido ---------------- */

export const advanceKdsOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        /** Status que o operador viu na tela — base do controle de concorrência. */
        expectedStatus: z.string().trim().min(1).max(30),
        nextStatus: z.enum(KDS_FLOW),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<KdsActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, status, code, prep_started_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado." };

    await assertStaff(context as unknown as Ctx, order.store_id);
    if (!(await hasArea(context as unknown as Ctx, order.store_id, "orders"))) {
      return { ok: false, message: "Você não tem permissão para movimentar pedidos." };
    }
    if (order.status !== data.expectedStatus) {
      return {
        ok: false,
        conflict: true,
        status: order.status,
        message: `Outro operador já mudou o pedido ${order.code}. A tela foi atualizada.`,
      };
    }

    const now = new Date().toISOString();
    const patch = {
      status: data.nextStatus,
      ...(data.nextStatus === "preparing" && !order.prep_started_at ? { prep_started_at: now } : {}),
      ...(data.nextStatus === "ready" ? { prep_ready_at: now } : {}),
    } as never;

    const { data: updated, error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .eq("status", data.expectedStatus)
      .select("id, status");
    if (error) return { ok: false, message: error.message };
    if (!updated || updated.length === 0) {
      return { ok: false, conflict: true, message: "O pedido mudou enquanto você agia. Tente novamente." };
    }

    // Ao iniciar o preparo, os itens ainda pendentes acompanham o pedido.
    if (data.nextStatus === "preparing") {
      await supabaseAdmin
        .from("order_items")
        .update({ prep_status: "preparing", prep_started_at: now })
        .eq("order_id", order.id)
        .eq("prep_status", "pending");
    }
    if (data.nextStatus === "ready") {
      await supabaseAdmin
        .from("order_items")
        .update({ prep_status: "ready", prep_ready_at: now })
        .eq("order_id", order.id)
        .neq("prep_status", "ready");
    }

    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id,
      store_id: order.store_id,
      status: data.nextStatus,
      changed_by: context.userId,
      note: "Atualizado no monitor de preparo",
    } as never);

    await supabaseAdmin.from("audit_logs").insert({
      store_id: order.store_id,
      user_id: context.userId,
      action: "kds.status_changed",
      entity: "orders",
      entity_id: order.id,
      metadata: { from: order.status, to: data.nextStatus },
    });

    return { ok: true, message: `Pedido ${order.code} atualizado.`, status: data.nextStatus };
  });

export const rejectKdsOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<KdsActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeText } = await import("@/lib/security.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, status, code")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado." };

    await assertStaff(context as unknown as Ctx, order.store_id);
    // Recusar é ação sensível: exige a permissão de cancelamento.
    if (!(await hasArea(context as unknown as Ctx, order.store_id, "pos_cancel"))) {
      return { ok: false, message: "Você não tem permissão para recusar pedidos." };
    }
    if (["cancelled", "rejected", "completed", "delivered"].includes(order.status)) {
      return { ok: false, message: "Este pedido já foi encerrado." };
    }

    const reason = sanitizeText(data.reason, 300);
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: "rejected", cancel_reason: reason })
      .eq("id", order.id)
      .eq("status", order.status);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id,
      store_id: order.store_id,
      status: "rejected",
      changed_by: context.userId,
      note: reason,
    } as never);
    await supabaseAdmin.from("audit_logs").insert({
      store_id: order.store_id,
      user_id: context.userId,
      action: "kds.order_rejected",
      entity: "orders",
      entity_id: order.id,
      metadata: { reason },
    });

    return { ok: true, message: `Pedido ${order.code} recusado.`, status: "rejected" };
  });

export const setKdsPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), priority: z.number().int().min(0).max(3) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<KdsActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, code")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado." };
    await assertStaff(context as unknown as Ctx, order.store_id);
    if (!(await hasArea(context as unknown as Ctx, order.store_id, "orders"))) {
      return { ok: false, message: "Você não tem permissão para priorizar pedidos." };
    }
    const { error } = await supabaseAdmin.from("orders").update({ priority: data.priority }).eq("id", order.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: data.priority > 0 ? `Pedido ${order.code} priorizado.` : "Prioridade removida." };
  });

export const addKdsOrderNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), note: z.string().trim().min(2).max(300) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<KdsActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeText } = await import("@/lib/security.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, status, code")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado." };
    await assertStaff(context as unknown as Ctx, order.store_id);
    if (!(await hasArea(context as unknown as Ctx, order.store_id, "orders"))) {
      return { ok: false, message: "Você não tem permissão para anotar pedidos." };
    }
    const note = sanitizeText(data.note, 300);
    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id,
      store_id: order.store_id,
      status: order.status,
      changed_by: context.userId,
      note: `Nota interna: ${note}`,
    } as never);
    return { ok: true, message: "Observação interna registrada." };
  });

/* ---------------- Preparo por item ---------------- */

export const setItemPrepStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        prepStatus: z.enum(["pending", "preparing", "ready", "paused"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<KdsActionResult & { orderReady?: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: item } = await supabaseAdmin
      .from("order_items")
      .select("id, store_id, order_id, prep_status")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) return { ok: false, message: "Item não encontrado." };

    await assertStaff(context as unknown as Ctx, item.store_id);
    if (!(await hasArea(context as unknown as Ctx, item.store_id, "orders"))) {
      return { ok: false, message: "Você não tem permissão para movimentar itens." };
    }

    const now = new Date().toISOString();
    const patch = {
      prep_status: data.prepStatus,
      ...(data.prepStatus === "preparing" ? { prep_started_at: now } : {}),
      ...(data.prepStatus === "ready" ? { prep_ready_at: now } : {}),
    } as never;

    const { error } = await supabaseAdmin.from("order_items").update(patch).eq("id", item.id);
    if (error) return { ok: false, message: error.message };

    // Informa se o pedido inteiro já está preparado (a tela decide o que fazer).
    const { data: siblings } = await supabaseAdmin
      .from("order_items")
      .select("prep_status")
      .eq("order_id", item.order_id);
    const orderReady = (siblings ?? []).every((row) => row.prep_status === "ready");

    return { ok: true, message: "Item atualizado.", orderReady };
  });

/* ---------------- Impressão setorizada ---------------- */

export const enqueueOrderPrint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        /** "todas" gera uma via por setor presente no pedido. */
        station: z.string().trim().max(30).default("todas"),
        reprint: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; jobs: number; simulated: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { groupItemsByStation, templateForStation, buildStationTicket, STATION_LABEL } = await import("@/lib/salao");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, code, notes, table_number, table_session_id, order_items(product_name, quantity, notes, prep_station)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado.", jobs: 0, simulated: false };

    await assertStaff(context as unknown as Ctx, order.store_id);
    if (!(await hasArea(context as unknown as Ctx, order.store_id, "orders"))) {
      return { ok: false, message: "Você não tem permissão para imprimir pedidos.", jobs: 0, simulated: false };
    }

    const { data: store } = await supabaseAdmin.from("stores").select("name").eq("id", order.store_id).maybeSingle();
    const { data: settings } = await supabaseAdmin
      .from("print_settings")
      .select("printer_name")
      .eq("store_id", order.store_id)
      .maybeSingle();
    // Sem impressora configurada, a fila fica marcada como simulada.
    const simulated = !settings?.printer_name;

    const items = (order.order_items ?? []) as {
      product_name: string;
      quantity: number;
      notes: string | null;
      prep_station: string | null;
    }[];
    const scoped = data.station === "todas" ? items : items.filter((item) => (item.prep_station ?? "cozinha") === data.station);
    if (scoped.length === 0) return { ok: false, message: "Nenhum item para este setor.", jobs: 0, simulated };

    let jobs = 0;
    for (const group of groupItemsByStation(scoped)) {
      const content = buildStationTicket({
        station: group.station,
        storeName: store?.name ?? "Loja",
        orderCode: order.code,
        tableLabel: order.table_number,
        items: group.items,
        notes: order.notes,
      });
      const { error } = await supabaseAdmin.from("print_jobs").insert({
        store_id: order.store_id,
        order_id: order.id,
        session_id: order.table_session_id,
        station: group.station,
        template: templateForStation(group.station),
        title: `${data.reprint ? "Reimpressão · " : ""}${STATION_LABEL[group.station] ?? group.station} · Pedido ${order.code}`,
        content: simulated ? `[FILA SIMULADA — sem impressora configurada]\n${content}` : content,
        status: "pending",
        created_by: context.userId,
      });
      if (!error) jobs += 1;
    }

    await supabaseAdmin.from("audit_logs").insert({
      store_id: order.store_id,
      user_id: context.userId,
      action: data.reprint ? "kds.reprint" : "kds.print",
      entity: "orders",
      entity_id: order.id,
      metadata: { station: data.station, jobs, simulated },
    });

    return {
      ok: jobs > 0,
      jobs,
      simulated,
      message: simulated
        ? `${jobs} via(s) na fila simulada — configure a impressora para imprimir de verdade.`
        : `${jobs} via(s) enviada(s) para impressão.`,
    };
  });

export const updatePrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ jobId: z.string().uuid(), action: z.enum(["retry", "done", "failed", "cancel"]) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("print_jobs")
      .select("id, store_id, attempts, status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) return { ok: false, message: "Trabalho de impressão não encontrado." };

    await assertStaff(context as unknown as Ctx, job.store_id);
    if (!(await hasArea(context as unknown as Ctx, job.store_id, "orders"))) {
      return { ok: false, message: "Você não tem permissão para gerenciar a fila de impressão." };
    }

    const patch =
      data.action === "retry"
        ? { status: "pending", attempts: job.attempts + 1 }
        : data.action === "done"
          ? { status: "printed", printed_at: new Date().toISOString() }
          : data.action === "failed"
            ? { status: "failed", attempts: job.attempts + 1 }
            : { status: "cancelled" } as never;

    const { error } = await supabaseAdmin.from("print_jobs").update(patch).eq("id", job.id);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: job.store_id,
      user_id: context.userId,
      action: `print.${data.action}`,
      entity: "print_jobs",
      entity_id: job.id,
      metadata: { from: job.status },
    });

    const labels: Record<string, string> = {
      retry: "Reenviado para a fila.",
      done: "Marcado como impresso.",
      failed: "Marcado como falha.",
      cancel: "Trabalho cancelado.",
    };
    return { ok: true, message: labels[data.action] ?? "Atualizado." };
  });

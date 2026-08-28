import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Operação em tempo real: pausa rápida de itens ("acabou o X"),
 * pausa de pedidos por demanda e carga atual da cozinha para o prazo dinâmico.
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

export interface OperacaoResult {
  ok: boolean;
  message: string;
}

/** Marca um item como esgotado (ou volta a vender) direto do PDV/KDS. */
export const setProductAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        available: z.boolean(),
        reason: z.string().trim().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<OperacaoResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, store_id, name")
      .eq("id", data.productId)
      .maybeSingle();
    if (!product) return { ok: false, message: "Item não encontrado." };
    await assertStaff(context as unknown as Ctx, product.store_id);

    const { error } = await supabaseAdmin
      .from("products")
      .update({
        is_available: data.available,
        unavailable_reason: data.available ? null : data.reason?.trim() || "Esgotado no momento",
      })
      .eq("id", product.id);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: product.store_id,
      user_id: context.userId,
      action: data.available ? "operacao.item_reativado" : "operacao.item_pausado",
      entity: "products",
      entity_id: product.id,
      metadata: { name: product.name, reason: data.reason ?? null },
    });

    return {
      ok: true,
      message: data.available ? `${product.name} voltou a vender.` : `${product.name} pausado no cardápio.`,
    };
  });

/** Reativa de uma vez todos os itens pausados da loja. */
export const resumeAllProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<OperacaoResult> => {
    await assertStaff(context as unknown as Ctx, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("products")
      .update({ is_available: true, unavailable_reason: null }, { count: "exact" })
      .eq("store_id", data.storeId)
      .eq("is_available", false);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: `${count ?? 0} item(ns) reativado(s).` };
  });

/** "Estou lotado": pausa os pedidos por alguns minutos e reabre sozinho. */
export const setStoreOrderPause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        minutes: z.number().int().min(0).max(720),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<OperacaoResult & { pausedUntil: string | null }> => {
    await assertStaff(context as unknown as Ctx, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const pausedUntil = data.minutes > 0 ? new Date(Date.now() + data.minutes * 60_000).toISOString() : null;
    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        availability_status: data.minutes > 0 ? "paused" : "open",
        paused_until: pausedUntil,
      })
      .eq("id", data.storeId);
    if (error) return { ok: false, message: error.message, pausedUntil: null };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: data.minutes > 0 ? "operacao.pedidos_pausados" : "operacao.pedidos_retomados",
      entity: "stores",
      entity_id: data.storeId,
      metadata: { minutes: data.minutes },
    });

    return {
      ok: true,
      message: data.minutes > 0 ? `Pedidos pausados por ${data.minutes} minutos.` : "Pedidos retomados.",
      pausedUntil,
    };
  });

export interface StoreLoadResult {
  activeOrders: number;
  baseMinutes: number;
  capacity: number;
}

/** Carga atual da loja (público) para calcular o prazo dinâmico na vitrine. */
export const getStoreLoad = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<StoreLoadResult> => {
    // Só devolve contagens agregadas (sem dados de cliente), por isso usa o cliente de serviço.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin;

    const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const [{ count }, { data: settings }] = await Promise.all([
      client
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", data.storeId)
        .in("status", ["pending", "confirmed", "preparing"])
        .gte("created_at", since),
      client
        .from("production_settings")
        .select("prep_window_minutes, max_orders_per_slot")
        .eq("store_id", data.storeId)
        .maybeSingle(),
    ]);

    return {
      activeOrders: count ?? 0,
      baseMinutes: Number(settings?.prep_window_minutes ?? 0) || 25,
      capacity: Number(settings?.max_orders_per_slot ?? 0) || 6,
    };
  });

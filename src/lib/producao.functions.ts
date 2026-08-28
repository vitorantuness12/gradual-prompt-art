import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Capacidade de produção e validação de montagens no servidor.
 *
 * Tudo que o cliente calcula no navegador é recalculado aqui: preço do
 * montador, componentes de combo e vaga na agenda. Assim um total adulterado
 * no navegador nunca vira pedido aceito.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string, area: string) {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: area,
  });
  if (data !== true) throw new Error("Você não tem permissão para esta ação.");
}

/** ---------- Configuração (lojista) ---------- */

const settingsInput = z.object({
  storeId: z.string().uuid(),
  isEnabled: z.boolean(),
  slotMinutes: z.number().int().min(5).max(240),
  prepWindowMinutes: z.number().int().min(0).max(1440),
  maxOrdersPerSlot: z.number().int().min(1).max(500),
  maxItemsPerSlot: z.number().int().min(1).max(5000),
  minLeadMinutes: z.number().int().min(0).max(10080),
  maxDaysAhead: z.number().int().min(1).max(365),
  queueEnabled: z.boolean(),
  queueMessage: z.string().trim().max(300).optional(),
});

export const saveProductionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "settings");
    const { error } = await context.supabase.from("production_settings").upsert(
      {
        store_id: data.storeId,
        is_enabled: data.isEnabled,
        slot_minutes: data.slotMinutes,
        prep_window_minutes: data.prepWindowMinutes,
        max_orders_per_slot: data.maxOrdersPerSlot,
        max_items_per_slot: data.maxItemsPerSlot,
        min_lead_minutes: data.minLeadMinutes,
        max_days_ahead: data.maxDaysAhead,
        queue_enabled: data.queueEnabled,
        queue_message: data.queueMessage?.trim() || null,
      },
      { onConflict: "store_id" },
    );
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Capacidade de produção atualizada." };
  });

/** ---------- Consulta de capacidade (loja pública) ---------- */

const capacityInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  desiredAt: z.string().trim().min(10).max(40).optional(),
  itemsCount: z.number().int().min(1).max(500).default(1),
});

export interface CapacityResponse {
  enabled: boolean;
  allowed: boolean;
  reason: string;
  canQueue: boolean;
  slot: string | null;
  startPrepAt: string | null;
  prepWindowMinutes: number;
  minLeadMinutes: number;
  maxDaysAhead: number;
  suggestions: { slot: string; remainingOrders: number }[];
}

export const checkProductionCapacity = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => capacityInput.parse(data))
  .handler(async ({ data }): Promise<CapacityResponse> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers));

    const { DEFAULT_PRODUCTION, availableSlots, buildLoad, checkCapacity, parseProduction } =
      await import("@/lib/producao");

    const off: CapacityResponse = {
      enabled: false,
      allowed: true,
      reason: "",
      canQueue: false,
      slot: null,
      startPrepAt: null,
      prepWindowMinutes: DEFAULT_PRODUCTION.prepWindowMinutes,
      minLeadMinutes: DEFAULT_PRODUCTION.minLeadMinutes,
      maxDaysAhead: DEFAULT_PRODUCTION.maxDaysAhead,
      suggestions: [],
    };
    if (!limit.allowed) return off;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return off;

    const { data: row } = await supabaseAdmin
      .from("production_settings")
      .select("*")
      .eq("store_id", store.id)
      .maybeSingle();
    const settings = parseProduction(row);
    if (!settings.isEnabled) return off;

    const load = await currentLoad(
      supabaseAdmin,
      store.id,
      settings.slotMinutes,
      settings.maxDaysAhead,
    );
    const desired = data.desiredAt ? new Date(data.desiredAt) : null;

    const suggestions = availableSlots(settings, load, data.itemsCount);

    if (!desired || Number.isNaN(desired.getTime())) {
      return {
        ...off,
        enabled: true,
        allowed: true,
        prepWindowMinutes: settings.prepWindowMinutes,
        minLeadMinutes: settings.minLeadMinutes,
        maxDaysAhead: settings.maxDaysAhead,
        suggestions,
      };
    }

    const { buildDayLoad, checkCutoff, checkDayCapacity } = await import("@/lib/encomendas");
    const dayLoad = buildDayLoad(
      (
        await supabaseAdmin
          .from("orders")
          .select("scheduled_for, order_items(quantity)")
          .eq("store_id", store.id)
          .not("scheduled_for", "is", null)
          .not("status", "in", "(cancelled,rejected)")
      ).data?.map((order: { scheduled_for: string | null; order_items?: { quantity: number }[] }) => ({
        scheduled_for: order.scheduled_for,
        items: (order.order_items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
      })) ?? [],
    );

    const cutoff = checkCutoff(desired, settings.cutoffDays);
    const daily = checkDayCapacity(
      desired,
      data.itemsCount,
      dayLoad,
      settings.dailyMaxOrders,
      settings.dailyMaxItems,
    );
    if (!cutoff.ok || !daily.ok) {
      return {
        enabled: true,
        allowed: false,
        reason: cutoff.ok ? daily.reason : cutoff.reason,
        canQueue: settings.queueEnabled,
        slot: null,
        startPrepAt: null,
        prepWindowMinutes: settings.prepWindowMinutes,
        minLeadMinutes: settings.minLeadMinutes,
        maxDaysAhead: settings.maxDaysAhead,
        suggestions,
      };
    }

    const result = checkCapacity(settings, desired, data.itemsCount, load);
    return {
      enabled: true,
      allowed: result.allowed,
      reason: result.reason,
      canQueue: result.canQueue,
      slot: result.slot,
      startPrepAt: result.startPrepAt,
      prepWindowMinutes: settings.prepWindowMinutes,
      minLeadMinutes: settings.minLeadMinutes,
      maxDaysAhead: settings.maxDaysAhead,
      suggestions,
    };
  });

async function currentLoad(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  storeId: string,
  slotMinutes: number,
  maxDaysAhead: number,
) {
  const { buildLoad } = await import("@/lib/producao");
  const horizon = new Date(Date.now() + maxDaysAhead * 86_400_000).toISOString();
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("scheduled_for, order_items(quantity)")
    .eq("store_id", storeId)
    .not("scheduled_for", "is", null)
    .not("status", "in", "(cancelled,rejected)")
    .lte("scheduled_for", horizon);

  return buildLoad(
    (orders ?? []).map(
      (order: { scheduled_for: string | null; order_items?: { quantity: number }[] }) => ({
        scheduled_for: order.scheduled_for,
        items: (order.order_items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
      }),
    ),
    slotMinutes,
  );
}

/** ---------- Fila de encomendas ---------- */

const queueInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().max(30).optional(),
  desiredAt: z.string().trim().min(10).max(40),
  itemsCount: z.number().int().min(1).max(500).default(1),
  notes: z.string().trim().max(300).optional(),
});

export const joinProductionQueue = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => queueInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; position?: number }> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage, sanitizeText } =
      await import("@/lib/security.server");
    const limit = await consumeRateLimit(
      "checkout",
      `fila:${clientIdentifier(getRequest()?.headers)}`,
    );
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return { ok: false, message: "Loja não encontrada." };

    const { data: settings } = await supabaseAdmin
      .from("production_settings")
      .select("queue_enabled")
      .eq("store_id", store.id)
      .maybeSingle();
    if (!settings?.queue_enabled)
      return { ok: false, message: "Esta loja não está aceitando fila de encomendas." };

    const { count } = await supabaseAdmin
      .from("production_queue")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .eq("status", "waiting");

    const position = (count ?? 0) + 1;
    const { error } = await supabaseAdmin.from("production_queue").insert({
      store_id: store.id,
      customer_name: sanitizeText(data.customerName, 80),
      customer_phone: data.customerPhone?.replace(/\D/g, "") || null,
      desired_at: new Date(data.desiredAt).toISOString(),
      items_count: data.itemsCount,
      position,
      reason: "Capacidade do horário esgotada",
      notes: data.notes ? sanitizeText(data.notes, 300) : null,
    });
    if (error) return { ok: false, message: error.message };

    return {
      ok: true,
      message: `Você entrou na fila de encomendas na posição ${position}.`,
      position,
    };
  });

/** ---------- Validação de montagem e combo (servidor) ---------- */

const validateInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
  selection: z.object({
    sizeId: z.string().trim().max(60),
    flavorIds: z.array(z.string().trim().max(60)).max(8).default([]),
    crustId: z.string().trim().max(60).nullish(),
    doughId: z.string().trim().max(60).nullish(),
    extraIds: z.array(z.string().trim().max(60)).max(20).default([]),
    removedIngredientIds: z.array(z.string().trim().max(60)).max(20).default([]),
    notes: z.string().trim().max(300).optional(),
  }),
  /** Total calculado no navegador — precisa bater com o do servidor. */
  expectedTotal: z.number().nonnegative().optional(),
});

export interface BuilderValidation {
  ok: boolean;
  message: string;
  unitPrice: number;
  total: number;
  description: string;
}

export const validateBuilderSelection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => validateInput.parse(data))
  .handler(async ({ data }): Promise<BuilderValidation> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseBuilder, quoteBuilder } = await import("@/lib/montador");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store)
      return {
        ok: false,
        message: "Loja não encontrada.",
        unitPrice: 0,
        total: 0,
        description: "",
      };

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, builder_config, is_active, is_available")
      .eq("id", data.productId)
      .eq("store_id", store.id)
      .maybeSingle();
    if (!product || !product.is_active) {
      return { ok: false, message: "Item indisponível.", unitPrice: 0, total: 0, description: "" };
    }

    const config = parseBuilder(product.builder_config);
    if (!config.enabled) {
      return {
        ok: false,
        message: "Este item não usa montagem.",
        unitPrice: 0,
        total: 0,
        description: "",
      };
    }

    const quote = quoteBuilder(config, {
      sizeId: data.selection.sizeId,
      flavorIds: data.selection.flavorIds,
      crustId: data.selection.crustId ?? null,
      doughId: data.selection.doughId ?? null,
      extraIds: data.selection.extraIds,
      removedIngredientIds: data.selection.removedIngredientIds,
      quantity: data.quantity,
      ...(data.selection.notes ? { notes: data.selection.notes } : {}),
    });

    if (!quote.ok) {
      return {
        ok: false,
        message: quote.errors.join(" "),
        unitPrice: 0,
        total: 0,
        description: "",
      };
    }

    if (
      typeof data.expectedTotal === "number" &&
      Math.abs(data.expectedTotal - quote.total) > 0.01
    ) {
      return {
        ok: false,
        message: "O valor da montagem mudou. Confira o resumo atualizado antes de continuar.",
        unitPrice: quote.unitPrice,
        total: quote.total,
        description: quote.description,
      };
    }

    return {
      ok: true,
      message: "Montagem válida.",
      unitPrice: quote.unitPrice,
      total: quote.total,
      description: quote.description,
    };
  });

/** Confere componentes e estoque de um combo antes de aceitar o pedido. */
const comboInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  comboProductId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});

export const validateComboAvailability = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => comboInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; maxKits: number | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkCombo } = await import("@/lib/montador");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return { ok: false, message: "Loja não encontrada.", maxKits: null };

    const { data: items } = await supabaseAdmin
      .from("product_combo_items")
      .select(
        "quantity, deducts_stock, is_optional, products!product_combo_items_item_product_id_fkey(id, name, price, stock_quantity, track_stock)",
      )
      .eq("combo_product_id", data.comboProductId)
      .eq("store_id", store.id);

    const components = (items ?? []).map((item) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const product = (item as any).products as {
        id: string;
        name: string;
        price: number;
        stock_quantity: number;
        track_stock: boolean;
      } | null;
      return {
        productId: product?.id ?? "",
        name: product?.name ?? "Item",
        quantity: Number(item.quantity ?? 1),
        price: Number(product?.price ?? 0),
        deductsStock: item.deducts_stock,
        isOptional: item.is_optional,
        availableStock: product?.track_stock ? Number(product.stock_quantity ?? 0) : null,
      };
    });

    const result = checkCombo(components, data.quantity);
    return {
      ok: result.ok,
      message: result.ok ? "Combo disponível." : result.errors.join(" "),
      maxKits: result.maxKits,
    };
  });

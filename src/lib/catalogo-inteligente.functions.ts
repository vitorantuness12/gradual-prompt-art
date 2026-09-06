import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSortedOrder,
  catalogIntelligenceKey,
  clampUpsellMax,
  clampWindow,
  rankBestSellers,
  readIntelligenceSettings,
  type CatalogIntelligenceOverview,
  type SoldLine,
} from "@/lib/catalogo-inteligente";

/**
 * Regras de servidor do catálogo inteligente: leitura das configurações,
 * ranking de vendas, geração das sugestões com IA e reordenação da vitrine.
 */

const storeInput = z.object({ storeId: z.string().uuid() });

/** Garante que quem chamou é da equipe da loja e pode mexer no catálogo. */
async function assertStaff(
  supabase: Awaited<ReturnType<typeof requireSupabaseAuth.options.server>> extends never
    ? never
    : { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  storeId: string,
  userId: string,
) {
  const { data } = await supabase.rpc("is_store_staff", { _store_id: storeId, _user_id: userId });
  if (data !== true) throw new Error("Sem permissão para esta loja.");
}

interface OrderLinesResult {
  lines: SoldLine[];
}

/** Itens vendidos (pedidos válidos) no período informado. */
async function soldLines(
  supabase: ReturnType<typeof createAuthedClient>,
  storeId: string,
  windowDays: number,
): Promise<OrderLinesResult> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("store_id", storeId)
    .gte("created_at", since)
    .not("status", "in", "(cancelled,rejected)")
    .limit(5000);

  const ids = (orders ?? []).map((order) => order.id);
  if (ids.length === 0) return { lines: [] };

  const { data: items } = await supabase
    .from("order_items")
    .select("product_id, quantity, total")
    .eq("store_id", storeId)
    .in("order_id", ids)
    .limit(20000);

  return { lines: items ?? [] };
}

/** Tipo auxiliar do cliente autenticado injetado pelo middleware. */
type AuthedContext = { supabase: ReturnType<typeof createAuthedClient>; userId: string };
function createAuthedClient() {
  // Apenas para inferência de tipo — o cliente real vem do middleware.
  return null as unknown as import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
}

export const getCatalogIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<CatalogIntelligenceOverview> => {
    const { supabase, userId } = context as unknown as AuthedContext;
    await assertStaff(supabase, data.storeId, userId);

    const { data: settingsRow } = await supabase
      .from("catalog_ai_settings")
      .select("*")
      .eq("store_id", data.storeId)
      .maybeSingle();

    const settings = readIntelligenceSettings(settingsRow);

    const [{ data: products }, { data: relations }] = await Promise.all([
      supabase.from("products").select("id, name, category_id").eq("store_id", data.storeId),
      supabase.from("product_related").select("product_id").eq("store_id", data.storeId),
    ]);

    const { lines } = await soldLines(supabase, data.storeId, settings.autosortWindowDays);
    const bestSellers = rankBestSellers(lines, products ?? []).slice(0, 15);

    return {
      settings,
      bestSellers,
      productCount: products?.length ?? 0,
      productsWithSuggestions: new Set((relations ?? []).map((row) => row.product_id)).size,
      suggestionCount: relations?.length ?? 0,
      aiAvailable: Boolean(process.env["OPENAI_API_KEY"]),
    };
  });

const settingsInput = storeInput.extend({
  upsellAiEnabled: z.boolean(),
  upsellMax: z.coerce.number().min(1).max(8),
  aiNotes: z.string().trim().max(600).default(""),
  autosortEnabled: z.boolean(),
  autosortWindowDays: z.coerce.number().min(1).max(365),
  autosortScope: z.enum(["category", "store"]),
});

export const saveCatalogIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as AuthedContext;
    await assertStaff(supabase, data.storeId, userId);

    const { error } = await supabase.from("catalog_ai_settings").upsert(
      {
        store_id: data.storeId,
        upsell_ai_enabled: data.upsellAiEnabled,
        upsell_max: clampUpsellMax(data.upsellMax),
        ai_notes: data.aiNotes || null,
        autosort_enabled: data.autosortEnabled,
        autosort_window_days: clampWindow(data.autosortWindowDays),
        autosort_scope: data.autosortScope,
      },
      { onConflict: "store_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Reordena a vitrine pelos mais vendidos do período configurado. */
export const applyBestSellerOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; changed: number; message: string }> => {
    const { supabase, userId } = context as unknown as AuthedContext;
    await assertStaff(supabase, data.storeId, userId);

    const { data: settingsRow } = await supabase
      .from("catalog_ai_settings")
      .select("*")
      .eq("store_id", data.storeId)
      .maybeSingle();
    const settings = readIntelligenceSettings(settingsRow);

    const { data: products } = await supabase
      .from("products")
      .select("id, name, category_id, sort_order")
      .eq("store_id", data.storeId);
    if (!products?.length) return { ok: false, changed: 0, message: "Cadastre itens no catálogo primeiro." };

    const { lines } = await soldLines(supabase, data.storeId, settings.autosortWindowDays);
    const ranking = rankBestSellers(lines, products);
    if (ranking.length === 0) {
      return { ok: false, changed: 0, message: "Ainda não há vendas no período escolhido." };
    }

    const changes = buildSortedOrder(products, ranking, settings.autosortScope);
    for (const change of changes) {
      await supabase.from("products").update({ sort_order: change.sort_order }).eq("id", change.id);
    }

    await supabase
      .from("catalog_ai_settings")
      .upsert(
        { store_id: data.storeId, last_sort_run_at: new Date().toISOString() },
        { onConflict: "store_id" },
      );

    return {
      ok: true,
      changed: changes.length,
      message:
        changes.length === 0
          ? "A vitrine já estava na melhor ordem."
          : `${changes.length} itens reposicionados na vitrine.`,
    };
  });

export { catalogIntelligenceKey };

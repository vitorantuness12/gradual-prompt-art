import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
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

type AuthedClient = SupabaseClient<Database>;

/** Garante que quem chamou é da equipe da loja e pode mexer no catálogo. */
async function assertStaff(supabase: AuthedClient, storeId: string, userId: string) {
  const { data } = await supabase.rpc("is_store_staff", { _store_id: storeId, _user_id: userId });
  if (data !== true) throw new Error("Sem permissão para esta loja.");
}

/** Itens vendidos (pedidos válidos) no período informado. */
async function soldLines(
  supabase: AuthedClient,
  storeId: string,
  windowDays: number,
): Promise<{ lines: SoldLine[] }> {
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

export const getCatalogIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<CatalogIntelligenceOverview> => {
    const { supabase, userId } = context;
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
    const { supabase, userId } = context;
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
    const { supabase, userId } = context;
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

interface AiPair {
  base: string;
  suggested: string[];
}

/** Lê a resposta da IA com tolerância a formatos diferentes. */
function parsePairs(raw: string): AiPair[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : ((parsed as { pares?: unknown[]; pairs?: unknown[] }).pares ??
        (parsed as { pairs?: unknown[] }).pairs ??
        []);
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        const row = item as { base?: unknown; sugestoes?: unknown; suggested?: unknown };
        const suggested = Array.isArray(row.sugestoes)
          ? row.sugestoes
          : Array.isArray(row.suggested)
            ? row.suggested
            : [];
        return {
          base: String(row.base ?? "").trim(),
          suggested: suggested.map((value) => String(value).trim()).filter(Boolean),
        };
      })
      .filter((pair) => pair.base && pair.suggested.length > 0);
  } catch {
    return [];
  }
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Pede à IA combinações de itens ("leve também") e grava em product_related.
 * As sugestões continuam sob controle do lojista: são gravadas como
 * relacionamentos normais, que ele pode remover no item.
 */
export const generateUpsellSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; created: number; message: string }> => {
    const { supabase, userId } = context;
    await assertStaff(supabase, data.storeId, userId);

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) return { ok: false, created: 0, message: "Chave da IA não configurada." };

    const { data: settingsRow } = await supabase
      .from("catalog_ai_settings")
      .select("*")
      .eq("store_id", data.storeId)
      .maybeSingle();
    const settings = readIntelligenceSettings(settingsRow);

    const [{ data: products }, { data: categories }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, price, kind, category_id, is_available")
        .eq("store_id", data.storeId)
        .limit(300),
      supabase.from("categories").select("id, name").eq("store_id", data.storeId),
    ]);

    const usable = (products ?? []).filter(
      (product) => product.is_available !== false && (!product.kind || product.kind === "product" || product.kind === "combo"),
    );
    if (usable.length < 2) return { ok: false, created: 0, message: "Cadastre pelo menos dois itens disponíveis." };

    const categoryName = new Map((categories ?? []).map((category) => [category.id, category.name]));
    const catalogText = usable
      .map(
        (product) =>
          `- ${product.name} | R$ ${Number(product.price ?? 0).toFixed(2)} | ${
            product.category_id ? (categoryName.get(product.category_id) ?? "sem categoria") : "sem categoria"
          }`,
      )
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Você monta combinações de venda para um catálogo brasileiro. Responda somente JSON no formato " +
              '{"pares":[{"base":"nome exato do item","sugestoes":["nome exato","nome exato"]}]}. ' +
              "Use apenas nomes que existem na lista recebida, nunca repita o próprio item como sugestão e " +
              `no máximo ${settings.upsellMax} sugestões por item. Combine itens que fazem sentido juntos (bebida com prato, acompanhamento, sobremesa, acessório).`,
          },
          {
            role: "user",
            content: `Catálogo:\n${catalogText}\n\nObservações do lojista: ${settings.aiNotes || "nenhuma"}`,
          },
        ],
      }),
    });

    if (response.status === 429) return { ok: false, created: 0, message: "Muitas chamadas à IA. Tente em instantes." };
    if (!response.ok) return { ok: false, created: 0, message: "A IA não respondeu agora. Tente novamente." };

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const pairs = parsePairs(payload.choices?.[0]?.message?.content ?? "");
    if (pairs.length === 0) return { ok: false, created: 0, message: "A IA não retornou combinações válidas." };

    const byName = new Map(usable.map((product) => [normalizeName(product.name), product.id]));
    const rows: { store_id: string; product_id: string; related_product_id: string; sort_order: number }[] = [];

    for (const pair of pairs) {
      const baseId = byName.get(normalizeName(pair.base));
      if (!baseId) continue;
      pair.suggested.slice(0, settings.upsellMax).forEach((name, index) => {
        const targetId = byName.get(normalizeName(name));
        if (!targetId || targetId === baseId) return;
        rows.push({ store_id: data.storeId, product_id: baseId, related_product_id: targetId, sort_order: index + 1 });
      });
    }

    if (rows.length === 0) return { ok: false, created: 0, message: "Nenhuma combinação pôde ser aplicada." };

    const { error } = await supabase
      .from("product_related")
      .upsert(rows, { onConflict: "product_id,related_product_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    await supabase
      .from("catalog_ai_settings")
      .upsert({ store_id: data.storeId, last_ai_run_at: new Date().toISOString() }, { onConflict: "store_id" });

    return { ok: true, created: rows.length, message: `${rows.length} combinações sugeridas pela IA.` };
  });

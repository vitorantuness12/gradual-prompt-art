import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  defaultSections,
  defaultThemeConfig,
  parseThemeConfig,
  type StoreSectionDraft,
  type StoreThemeConfig,
} from "@/lib/store-theme";

export type StoreThemeRow = Database["public"]["Tables"]["store_themes"]["Row"];
export type StoreSectionRow = Database["public"]["Tables"]["store_sections"]["Row"];
export type StoreHighlightRow = Database["public"]["Tables"]["store_highlights"]["Row"];
export type StoreThemeVersionRow = Database["public"]["Tables"]["store_theme_versions"]["Row"];

export interface StoreAppearance {
  theme: StoreThemeRow | null;
  sections: StoreSectionRow[];
  highlight: StoreHighlightRow | null;
  highlightProductIds: { product_id: string; badge: string | null; sort_order: number }[];
}

/** Aparência publicada de uma loja — é o que o cliente vê. */
export function publicAppearanceQuery(storeId: string | null) {
  return queryOptions({
    queryKey: ["store-appearance", storeId],
    enabled: Boolean(storeId),
    queryFn: async (): Promise<StoreAppearance> => {
      const [theme, sections, highlight] = await Promise.all([
        supabase.from("store_themes").select("*").eq("store_id", storeId!).maybeSingle(),
        supabase.from("store_sections").select("*").eq("store_id", storeId!).order("sort_order"),
        supabase.from("store_highlights").select("*").eq("store_id", storeId!).maybeSingle(),
      ]);

      let highlightProductIds: StoreAppearance["highlightProductIds"] = [];
      if (highlight.data) {
        const { data } = await supabase
          .from("store_highlight_products")
          .select("product_id, badge, sort_order")
          .eq("highlight_id", highlight.data.id)
          .order("sort_order");
        highlightProductIds = data ?? [];
      }

      return {
        theme: theme.data ?? null,
        sections: sections.data ?? [],
        highlight: highlight.data ?? null,
        highlightProductIds,
      };
    },
  });
}

/** Lê o tema publicado; cai no padrão quando a loja nunca personalizou. */
export function publishedTheme(appearance: StoreAppearance | undefined): StoreThemeConfig {
  if (!appearance?.theme) return defaultThemeConfig();
  return parseThemeConfig(appearance.theme.published_config);
}

/** Cria o tema e os blocos iniciais da loja na primeira vez que o editor abre. */
export async function ensureStoreAppearance(storeId: string): Promise<void> {
  const { data: theme } = await supabase.from("store_themes").select("id").eq("store_id", storeId).maybeSingle();
  if (!theme) {
    const config = defaultThemeConfig();
    const { error } = await supabase.from("store_themes").insert({
      store_id: storeId,
      draft_config: config as never,
      published_config: config as never,
      has_unpublished_changes: false,
    });
    if (error) throw new Error(error.message);
  }

  const { data: sections } = await supabase.from("store_sections").select("block_key").eq("store_id", storeId);
  const existing = new Set((sections ?? []).map((row) => row.block_key));
  const missing = defaultSections().filter((section) => !existing.has(section.block_key));
  if (missing.length > 0) {
    const { error } = await supabase.from("store_sections").insert(
      missing.map((section) => ({
        store_id: storeId,
        block_key: section.block_key,
        title: section.title,
        subtitle: section.subtitle,
        sort_order: section.sort_order,
        is_visible: section.is_visible,
        schedule_rule: section.schedule_rule as never,
      })),
    );
    if (error) throw new Error(error.message);
  }

  const { data: highlight } = await supabase.from("store_highlights").select("id").eq("store_id", storeId).maybeSingle();
  if (!highlight) {
    await supabase.from("store_highlights").insert({ store_id: storeId });
  }
}

/** Dados do editor: rascunho, blocos, destaques e histórico. */
export function editorAppearanceQuery(storeId: string | null) {
  return queryOptions({
    queryKey: ["store-editor", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      await ensureStoreAppearance(storeId!);
      const [theme, sections, highlight, versions, products, categories] = await Promise.all([
        supabase.from("store_themes").select("*").eq("store_id", storeId!).maybeSingle(),
        supabase.from("store_sections").select("*").eq("store_id", storeId!).order("sort_order"),
        supabase.from("store_highlights").select("*").eq("store_id", storeId!).maybeSingle(),
        supabase
          .from("store_theme_versions")
          .select("*")
          .eq("store_id", storeId!)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("products")
          .select("id, name, price, promo_price, is_active, category_id")
          .eq("store_id", storeId!)
          .is("archived_at", null)
          .order("name"),
        supabase.from("categories").select("id, name").eq("store_id", storeId!).order("sort_order"),
      ]);

      let highlightProducts: StoreAppearance["highlightProductIds"] = [];
      if (highlight.data) {
        const { data } = await supabase
          .from("store_highlight_products")
          .select("product_id, badge, sort_order")
          .eq("highlight_id", highlight.data.id)
          .order("sort_order");
        highlightProducts = data ?? [];
      }

      return {
        theme: theme.data ?? null,
        sections: sections.data ?? [],
        highlight: highlight.data ?? null,
        highlightProducts,
        versions: versions.data ?? [],
        products: products.data ?? [],
        categories: categories.data ?? [],
      };
    },
  });
}

/** Salva o rascunho (não afeta o que o cliente vê). */
export async function saveDraft(storeId: string, config: StoreThemeConfig, sections: StoreSectionDraft[]) {
  const { error } = await supabase
    .from("store_themes")
    .update({ draft_config: config as never, has_unpublished_changes: true })
    .eq("store_id", storeId);
  if (error) throw new Error(error.message);

  for (const section of sections) {
    const { error: sectionError } = await supabase
      .from("store_sections")
      .update({
        title: section.title,
        subtitle: section.subtitle,
        image_url: section.image_url,
        accent_color: section.accent_color,
        sort_order: section.sort_order,
        is_visible: section.is_visible,
        schedule_rule: section.schedule_rule as never,
      })
      .eq("store_id", storeId)
      .eq("block_key", section.block_key);
    if (sectionError) throw new Error(sectionError.message);
  }
}

/** Publica o rascunho e guarda a versão anterior no histórico. */
export async function publishDraft(
  storeId: string,
  config: StoreThemeConfig,
  sections: StoreSectionDraft[],
  label: string,
) {
  await saveDraft(storeId, config, sections);

  const { error: versionError } = await supabase.from("store_theme_versions").insert({
    store_id: storeId,
    label,
    config: config as never,
    sections: sections as never,
  });
  if (versionError) throw new Error(versionError.message);

  const { error } = await supabase
    .from("store_themes")
    .update({
      published_config: config as never,
      has_unpublished_changes: false,
      published_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);
  if (error) throw new Error(error.message);
}

/** Traz uma versão do histórico de volta para o rascunho. */
export function versionToDraft(version: StoreThemeVersionRow): {
  config: StoreThemeConfig;
  sections: StoreSectionDraft[];
} {
  const sections = Array.isArray(version.sections) ? (version.sections as unknown as StoreSectionDraft[]) : [];
  return { config: parseThemeConfig(version.config), sections };
}

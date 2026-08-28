import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type OptionGroupRow = Database["public"]["Tables"]["product_option_groups"]["Row"];
export type OptionRow = Database["public"]["Tables"]["product_options"]["Row"];
export type ProfessionalRow = Database["public"]["Tables"]["professionals"]["Row"];
export type ScheduleBlockRow = Database["public"]["Tables"]["schedule_blocks"]["Row"];
export type ComboItemRow = Database["public"]["Tables"]["product_combo_items"]["Row"];

export interface CatalogData {
  products: ProductRow[];
  categories: CategoryRow[];
  optionGroups: OptionGroupRow[];
  options: OptionRow[];
  professionals: ProfessionalRow[];
  productProfessionals: { product_id: string; professional_id: string }[];
  comboItems: ComboItemRow[];
  blocks: ScheduleBlockRow[];
}

export function catalogKey(storeId: string | undefined) {
  return ["catalog", storeId] as const;
}

/** Carrega todo o catálogo da loja ativa (itens, categorias, opções, profissionais e bloqueios). */
export function useCatalog(storeId: string | undefined) {
  return useQuery({
    queryKey: catalogKey(storeId),
    enabled: Boolean(storeId),
    queryFn: async (): Promise<CatalogData> => {
      const id = storeId!;
      const [products, categories, groups, options, professionals, links, combos, blocks] = await Promise.all([
        supabase.from("products").select("*").eq("store_id", id).order("sort_order").order("name"),
        supabase.from("categories").select("*").eq("store_id", id).order("sort_order"),
        supabase.from("product_option_groups").select("*").eq("store_id", id).order("sort_order"),
        supabase.from("product_options").select("*").eq("store_id", id).order("sort_order"),
        supabase.from("professionals").select("*").eq("store_id", id).order("name"),
        supabase.from("product_professionals").select("product_id, professional_id").eq("store_id", id),
        supabase.from("product_combo_items").select("*").eq("store_id", id),
        supabase.from("schedule_blocks").select("*").eq("store_id", id).order("starts_at"),
      ]);

      const failure = [products, categories, groups, options, professionals, links, combos, blocks].find(
        (result) => result.error,
      );
      if (failure?.error) throw new Error(failure.error.message);

      return {
        products: products.data ?? [],
        categories: categories.data ?? [],
        optionGroups: groups.data ?? [],
        options: options.data ?? [],
        professionals: professionals.data ?? [],
        productProfessionals: links.data ?? [],
        comboItems: combos.data ?? [],
        blocks: blocks.data ?? [],
      };
    },
  });
}

/** Invalida o catálogo do painel e o catálogo público da loja. */
export function useCatalogRefresh(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: catalogKey(storeId) });
    void queryClient.invalidateQueries({ queryKey: ["public-store"] });
  };
}

/** Persiste a nova ordem de exibição após arrastar e soltar. */
export async function persistOrder(table: "products" | "categories", ids: string[]) {
  await Promise.all(
    ids.map((id, index) =>
      supabase
        .from(table)
        .update({ sort_order: index + 1 })
        .eq("id", id),
    ),
  );
}

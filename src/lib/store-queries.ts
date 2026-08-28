import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type StoreRow = Database["public"]["Tables"]["stores"]["Row"];
export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type OptionGroupRow = Database["public"]["Tables"]["product_option_groups"]["Row"];
export type OptionRow = Database["public"]["Tables"]["product_options"]["Row"];
export type ProfessionalRow = Database["public"]["Tables"]["professionals"]["Row"];
export type ComboItemRow = Database["public"]["Tables"]["product_combo_items"]["Row"];
export type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["product_collections"]["Row"];
export type CollectionItemRow = Database["public"]["Tables"]["product_collection_items"]["Row"];
export type RelatedRow = Database["public"]["Tables"]["product_related"]["Row"];

export const PUBLIC_STORE_COLUMNS =
  "id, slug, name, segment, description, logo_url, cover_url, phone, whatsapp, email, address_street, address_number, address_district, address_city, address_state, address_zip, opening_hours, delivery_fee, min_order_value, accepts_delivery, accepts_pickup, accepts_scheduling, accepts_dine_in, plan, is_active, is_demo, is_published, availability_status, paused_until, timezone, payment_methods, delivery_mode, delivery_areas, holidays, created_at, updated_at";

export interface PublicStoreData {
  store: StoreRow;
  categories: CategoryRow[];
  products: ProductRow[];
  optionGroups: OptionGroupRow[];
  options: OptionRow[];
  professionals: ProfessionalRow[];
  comboItems: ComboItemRow[];
  variants: VariantRow[];
  collections: CollectionRow[];
  collectionItems: CollectionItemRow[];
  related: RelatedRow[];
}

/** Busca os dados públicos de uma loja ativa pelo endereço (slug). */
export function publicStoreQuery(slug: string) {
  return queryOptions({
    queryKey: ["public-store", slug],
    queryFn: async (): Promise<PublicStoreData | null> => {
      // Colunas seguras para a vitrine: CNPJ, razão social, dono e dados de
      // onboarding ficam fora do alcance de visitantes não autenticados.
      const { data: store, error } = await supabase
        .from("stores")
        .select(PUBLIC_STORE_COLUMNS)
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!store) return null;
      const publicStore = store as unknown as StoreRow;

      const [
        categoriesResult,
        productsResult,
        groupsResult,
        optionsResult,
        professionalsResult,
        comboResult,
        variantsResult,
        collectionsResult,
        collectionItemsResult,
        relatedResult,
      ] = await Promise.all([
          supabase
            .from("categories")
            .select("*")
            .eq("store_id", publicStore.id)
            .is("archived_at", null)
            .order("sort_order"),
          supabase
            .from("products")
            .select("*")
            .eq("store_id", publicStore.id)
            .eq("is_active", true)
            .is("archived_at", null)
            .order("sort_order"),
          supabase.from("product_option_groups").select("*").eq("store_id", publicStore.id).order("sort_order"),
          supabase.from("product_options").select("*").eq("store_id", publicStore.id).order("sort_order"),
          supabase.from("professionals").select("*").eq("store_id", publicStore.id).eq("is_active", true).order("name"),
          supabase.from("product_combo_items").select("*").eq("store_id", publicStore.id),
          supabase
            .from("product_variants")
            .select("*")
            .eq("store_id", publicStore.id)
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("product_collections")
            .select("*")
            .eq("store_id", publicStore.id)
            .eq("is_active", true)
            .order("sort_order"),
          supabase.from("product_collection_items").select("*").eq("store_id", publicStore.id).order("sort_order"),
          supabase.from("product_related").select("*").eq("store_id", publicStore.id).order("sort_order"),
        ]);

      if (categoriesResult.error) throw new Error(categoriesResult.error.message);
      if (productsResult.error) throw new Error(productsResult.error.message);

      return {
        store: publicStore,
        categories: categoriesResult.data ?? [],
        products: productsResult.data ?? [],
        optionGroups: groupsResult.data ?? [],
        options: optionsResult.data ?? [],
        professionals: professionalsResult.data ?? [],
        comboItems: comboResult.data ?? [],
        variants: variantsResult.data ?? [],
        collections: collectionsResult.data ?? [],
        collectionItems: collectionItemsResult.data ?? [],
        related: relatedResult.data ?? [],
      };
    },
  });
}

/**
 * Quando o lojista altera o endereço público, o slug antigo passa a apontar
 * para o novo. Retorna o slug atual ou null quando não há redirecionamento.
 */
export async function resolveSlugRedirect(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("store_slug_redirects")
    .select("store:stores(slug)")
    .eq("old_slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const store = data.store as { slug: string } | null;
  return store?.slug ?? null;
}

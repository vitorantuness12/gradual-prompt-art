/**
 * Inserção compartilhada de itens no catálogo (CSV, IA por foto e IA por texto).
 * Cria automaticamente as categorias que ainda não existem na loja.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CategoryRow, ProductKind } from "@/lib/catalog";

export interface CatalogImportItem {
  name: string;
  description?: string | null;
  categoryName?: string | null;
  kind?: ProductKind;
  price?: number;
  promoPrice?: number | null;
  sku?: string | null;
  barcode?: string | null;
  unit?: string;
  weightGrams?: number | null;
  trackStock?: boolean;
  stock?: number;
  minStock?: number;
  isFeatured?: boolean;
  isAvailable?: boolean;
  durationMinutes?: number | null;
  tags?: string[];
  sortOrder?: number;
}

export interface CatalogImportOptions {
  storeId: string;
  items: CatalogImportItem[];
  categories: Pick<CategoryRow, "id" | "name">[];
  /** Quantidade de itens já existentes, usada para continuar a ordem de exibição. */
  offset?: number;
}

/** Insere os itens e devolve quantos foram criados. */
export async function insertCatalogItems({
  storeId,
  items,
  categories,
  offset = 0,
}: CatalogImportOptions): Promise<number> {
  if (items.length === 0) return 0;

  const byName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
  const missing = [
    ...new Set(
      items
        .map((item) => item.categoryName?.trim())
        .filter((name): name is string => Boolean(name) && !byName.has(name!.toLowerCase())),
    ),
  ];

  if (missing.length > 0) {
    const { data, error } = await supabase
      .from("categories")
      .insert(
        missing.map((name, index) => ({
          store_id: storeId,
          name,
          sort_order: categories.length + index + 1,
        })),
      )
      .select("id, name");
    if (error) throw new Error(error.message);
    (data ?? []).forEach((category) => byName.set(category.name.toLowerCase(), category.id));
  }

  const payload = items.map((item, index) => {
    const kind = item.kind ?? "product";
    return {
      store_id: storeId,
      name: item.name,
      description: item.description ?? null,
      category_id: item.categoryName ? (byName.get(item.categoryName.trim().toLowerCase()) ?? null) : null,
      kind,
      price: item.price ?? 0,
      promo_price: item.promoPrice ?? null,
      sku: item.sku ?? null,
      barcode: item.barcode ?? null,
      unit: item.unit ?? "un",
      weight_grams: item.weightGrams == null ? null : Math.trunc(item.weightGrams),
      track_stock: item.trackStock ?? false,
      stock_quantity: item.stock ?? 0,
      min_stock: item.minStock ?? 0,
      is_featured: item.isFeatured ?? false,
      is_available: item.isAvailable ?? true,
      is_service: kind === "service",
      duration_minutes: item.durationMinutes == null ? null : Math.trunc(item.durationMinutes),
      tags: item.tags ?? [],
      sort_order: item.sortOrder || offset + index + 1,
    };
  });

  const { error } = await supabase.from("products").insert(payload);
  if (error) throw new Error(error.message);
  return payload.length;
}

/**
 * Consultas e ajustes do módulo de Estoque (produtos, ingredientes e movimentações).
 * Separado do catálogo para que o lojista trabalhe estoque sem mexer na vitrine.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type StockProduct = Database["public"]["Tables"]["products"]["Row"];
export type IngredientRow = Database["public"]["Tables"]["ingredients"]["Row"];
export type MovementRow = Database["public"]["Tables"]["inventory_movements"]["Row"];

export const MOVEMENT_TYPES = [
  { value: "in", label: "Entrada" },
  { value: "out", label: "Saída" },
  { value: "loss", label: "Perda / quebra" },
  { value: "balance", label: "Balanço (contagem)" },
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number]["value"];

export const MOVEMENT_LABEL: Record<string, string> = {
  in: "Entrada",
  out: "Saída",
  loss: "Perda / quebra",
  balance: "Balanço",
};

export interface StockData {
  products: StockProduct[];
  ingredients: IngredientRow[];
  movements: MovementRow[];
}

export function stockKey(storeId: string | undefined) {
  return ["estoque", storeId] as const;
}

export async function fetchStock(storeId: string): Promise<StockData> {
  const [products, ingredients, movements] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("store_id", storeId)
      .is("archived_at", null)
      .order("name"),
    supabase.from("ingredients").select("*").eq("store_id", storeId).order("name"),
    supabase
      .from("inventory_movements")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const failure = [products, ingredients, movements].find((result) => result.error);
  if (failure?.error) throw new Error(failure.error.message);

  return {
    products: products.data ?? [],
    ingredients: ingredients.data ?? [],
    movements: movements.data ?? [],
  };
}

/** Custo unitário salvo pela calculadora de precificação; cai no preço quando não houver. */
export function unitCost(product: StockProduct): number {
  const pricing = product.pricing as Record<string, unknown> | null;
  const cost = pricing ? Number(pricing["cost"] ?? pricing["custo"] ?? NaN) : NaN;
  return Number.isFinite(cost) && cost > 0 ? cost : Number(product.price ?? 0);
}

export interface StockSummary {
  tracked: number;
  outOfStock: number;
  belowMin: number;
  totalValue: number;
}

export function summarizeStock(products: StockProduct[]): StockSummary {
  const tracked = products.filter((product) => product.track_stock);
  return {
    tracked: tracked.length,
    outOfStock: tracked.filter((product) => Number(product.stock_quantity ?? 0) <= 0).length,
    belowMin: tracked.filter(
      (product) =>
        Number(product.stock_quantity ?? 0) > 0 &&
        Number(product.stock_quantity ?? 0) <= Number(product.min_stock ?? 0),
    ).length,
    totalValue: tracked.reduce(
      (total, product) => total + Number(product.stock_quantity ?? 0) * unitCost(product),
      0,
    ),
  };
}

/** Aplica um ajuste manual no produto e registra a movimentação. */
export async function adjustProductStock(params: {
  storeId: string;
  product: StockProduct;
  type: MovementType;
  quantity: number;
  reason: string;
}): Promise<number> {
  const current = Number(params.product.stock_quantity ?? 0);
  const quantity = Math.abs(params.quantity);
  const next =
    params.type === "in"
      ? current + quantity
      : params.type === "balance"
        ? quantity
        : current - quantity;

  const { error } = await supabase
    .from("products")
    .update({ stock_quantity: next, track_stock: true })
    .eq("id", params.product.id);
  if (error) throw new Error(error.message);

  const { error: movementError } = await supabase.from("inventory_movements").insert({
    store_id: params.storeId,
    product_id: params.product.id,
    movement_type: params.type,
    quantity: params.type === "balance" ? Math.abs(next - current) : quantity,
    reason: params.reason.trim() || MOVEMENT_LABEL[params.type] || "Ajuste manual",
  });
  if (movementError) throw new Error(movementError.message);

  return next;
}

export async function updateProductStockFields(
  productId: string,
  patch: { stock_quantity?: number; min_stock?: number; track_stock?: boolean },
) {
  const { error } = await supabase.from("products").update(patch).eq("id", productId);
  if (error) throw new Error(error.message);
}

export async function upsertIngredient(input: {
  id?: string | undefined;
  storeId: string;
  name: string;
  unit: string;
  stockQuantity: number;
  minStock: number;
}) {
  const payload = {
    store_id: input.storeId,
    name: input.name.trim(),
    unit: input.unit || "un",
    stock_quantity: input.stockQuantity,
    min_stock: input.minStock,
  };
  const query = input.id
    ? supabase.from("ingredients").update(payload).eq("id", input.id)
    : supabase.from("ingredients").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function deleteIngredient(id: string) {
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Linhas do histórico prontas para exportação CSV. */
export function movementsToCsv(movements: MovementRow[], productName: (id: string) => string): string {
  const header = ["data", "item", "tipo", "quantidade", "motivo"];
  const rows = movements.map((movement) =>
    [
      new Date(movement.created_at).toLocaleString("pt-BR"),
      productName(movement.product_id),
      MOVEMENT_LABEL[movement.movement_type] ?? movement.movement_type,
      String(movement.quantity),
      (movement.reason ?? "").replace(/;/g, ","),
    ].join(";"),
  );
  return [header.join(";"), ...rows].join("\n");
}

/* ------------------------------------------------------------------ */
/* Histórico de pausas e retomadas de itens                            */
/* ------------------------------------------------------------------ */

export type AvailabilityEvent = Database["public"]["Tables"]["product_availability_events"]["Row"];

export function availabilityKey(storeId: string | undefined) {
  return ["estoque-pausas", storeId] as const;
}

export async function fetchAvailabilityEvents(storeId: string): Promise<AvailabilityEvent[]> {
  const { data, error } = await supabase
    .from("product_availability_events")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Item com controle de estoque acima de zero, mas já no limite mínimo. */
export function isLowStock(product: {
  track_stock?: boolean | null;
  stock_quantity?: number | null;
  min_stock?: number | null;
}): boolean {
  if (!product.track_stock) return false;
  const stock = Number(product.stock_quantity ?? 0);
  const min = Number(product.min_stock ?? 0);
  return stock > 0 && min > 0 && stock <= min;
}

/* ------------------------------------------------------------------ */
/* Curva de ruptura: itens que vendem sempre e estão zerados           */
/* ------------------------------------------------------------------ */

export function ruptureKey(storeId: string | undefined) {
  return ["estoque-ruptura", storeId] as const;
}

/** Quantidade vendida por produto nos últimos dias (padrão: 30). */
export async function fetchSalesVolume(storeId: string, days = 30): Promise<Record<string, number>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("order_items")
    .select("product_id, quantity, created_at")
    .eq("store_id", storeId)
    .gte("created_at", since)
    .limit(5000);
  if (error) throw new Error(error.message);
  const volume: Record<string, number> = {};
  for (const item of data ?? []) {
    if (!item.product_id) continue;
    volume[item.product_id] = (volume[item.product_id] ?? 0) + Number(item.quantity ?? 0);
  }
  return volume;
}

export interface RuptureItem {
  product: StockProduct;
  sold: number;
}

/** Produto zerado que teve venda no período — perda de venda agora. */
export function ruptureItems(products: StockProduct[], volume: Record<string, number>): RuptureItem[] {
  return products
    .filter((product) => product.track_stock && Number(product.stock_quantity ?? 0) <= 0 && (volume[product.id] ?? 0) > 0)
    .map((product) => ({ product, sold: volume[product.id] ?? 0 }))
    .sort((a, b) => b.sold - a.sold);
}

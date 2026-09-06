/**
 * Catálogo inteligente: sugestões de "leve também" geradas por IA e
 * reordenação da vitrine pelos itens que mais vendem.
 *
 * Este módulo é puro (sem rede/banco) para poder ser usado no navegador e no
 * servidor e testado isoladamente.
 */

import type { Database } from "@/integrations/supabase/types";

export type CatalogAiSettingsRow = Database["public"]["Tables"]["catalog_ai_settings"]["Row"];

/** Onde a reordenação acontece: dentro de cada categoria ou na loja inteira. */
export type AutosortScope = "category" | "store";

export const AUTOSORT_SCOPES: { value: AutosortScope; label: string; hint: string }[] = [
  {
    value: "category",
    label: "Dentro de cada categoria",
    hint: "Os mais vendidos sobem para o topo da própria categoria.",
  },
  { value: "store", label: "Na loja inteira", hint: "Os campeões de venda aparecem primeiro na vitrine." },
];

export const AUTOSORT_WINDOWS: { value: number; label: string }[] = [
  { value: 7, label: "Últimos 7 dias" },
  { value: 30, label: "Últimos 30 dias" },
  { value: 90, label: "Últimos 90 dias" },
];

export function isAutosortScope(value: string | null | undefined): value is AutosortScope {
  return value === "category" || value === "store";
}

/** Item campeão de venda no período analisado. */
export interface BestSellerItem {
  productId: string;
  name: string;
  categoryId: string | null;
  quantity: number;
  revenue: number;
}

export interface CatalogIntelligenceOverview {
  settings: {
    upsellAiEnabled: boolean;
    upsellMax: number;
    aiNotes: string;
    lastAiRunAt: string | null;
    autosortEnabled: boolean;
    autosortWindowDays: number;
    autosortScope: AutosortScope;
    lastSortRunAt: string | null;
  };
  bestSellers: BestSellerItem[];
  productCount: number;
  /** Quantos itens já têm ao menos uma sugestão cadastrada. */
  productsWithSuggestions: number;
  suggestionCount: number;
  aiAvailable: boolean;
}

export const DEFAULT_INTELLIGENCE_SETTINGS: CatalogIntelligenceOverview["settings"] = {
  upsellAiEnabled: false,
  upsellMax: 4,
  aiNotes: "",
  lastAiRunAt: null,
  autosortEnabled: false,
  autosortWindowDays: 30,
  autosortScope: "category",
  lastSortRunAt: null,
};

export function catalogIntelligenceKey(storeId: string | undefined) {
  return ["catalog-intelligence", storeId] as const;
}

/** Converte a linha do banco no formato usado pela tela. */
export function readIntelligenceSettings(
  row: CatalogAiSettingsRow | null | undefined,
): CatalogIntelligenceOverview["settings"] {
  if (!row) return DEFAULT_INTELLIGENCE_SETTINGS;
  return {
    upsellAiEnabled: row.upsell_ai_enabled,
    upsellMax: clampUpsellMax(row.upsell_max),
    aiNotes: row.ai_notes ?? "",
    lastAiRunAt: row.last_ai_run_at,
    autosortEnabled: row.autosort_enabled,
    autosortWindowDays: clampWindow(row.autosort_window_days),
    autosortScope: isAutosortScope(row.autosort_scope) ? row.autosort_scope : "category",
    lastSortRunAt: row.last_sort_run_at,
  };
}

export function clampUpsellMax(value: number | null | undefined): number {
  const parsed = Number(value ?? 4);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(8, Math.max(1, Math.round(parsed)));
}

export function clampWindow(value: number | null | undefined): number {
  const parsed = Number(value ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  if (parsed <= 7) return 7;
  if (parsed <= 30) return 30;
  return 90;
}

/** Linha mínima de item vendido para o cálculo de ranking. */
export interface SoldLine {
  product_id: string | null;
  quantity: number | string | null;
  total: number | string | null;
}

export interface RankableProduct {
  id: string;
  name: string;
  category_id: string | null;
}

function num(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Ranking de vendas por produto, do maior para o menor. */
export function rankBestSellers(lines: SoldLine[], products: RankableProduct[]): BestSellerItem[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const totals = new Map<string, { quantity: number; revenue: number }>();

  for (const line of lines) {
    if (!line.product_id || !byId.has(line.product_id)) continue;
    const current = totals.get(line.product_id) ?? { quantity: 0, revenue: 0 };
    current.quantity += num(line.quantity);
    current.revenue += num(line.total);
    totals.set(line.product_id, current);
  }

  return [...totals.entries()]
    .map(([productId, value]) => {
      const product = byId.get(productId)!;
      return {
        productId,
        name: product.name,
        categoryId: product.category_id,
        quantity: Number(value.quantity.toFixed(3)),
        revenue: Number(value.revenue.toFixed(2)),
      };
    })
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

/**
 * Nova ordem de exibição: campeões primeiro, o resto mantendo a ordem atual.
 * Devolve apenas os itens cuja posição mudou, para gravar o mínimo possível.
 */
export function buildSortedOrder(
  products: (RankableProduct & { sort_order: number | null })[],
  ranking: BestSellerItem[],
  scope: AutosortScope,
): { id: string; sort_order: number }[] {
  const rankIndex = new Map(ranking.map((item, index) => [item.productId, index]));
  const groups = new Map<string, (RankableProduct & { sort_order: number | null })[]>();

  for (const product of products) {
    const groupKey = scope === "category" ? (product.category_id ?? "sem-categoria") : "loja";
    const list = groups.get(groupKey) ?? [];
    list.push(product);
    groups.set(groupKey, list);
  }

  const changes: { id: string; sort_order: number }[] = [];

  for (const list of groups.values()) {
    const current = [...list].sort((a, b) => num(a.sort_order) - num(b.sort_order));
    const ordered = [...current].sort((a, b) => {
      const rankA = rankIndex.get(a.id);
      const rankB = rankIndex.get(b.id);
      if (rankA != null && rankB != null) return rankA - rankB;
      if (rankA != null) return -1;
      if (rankB != null) return 1;
      return num(a.sort_order) - num(b.sort_order);
    });

    ordered.forEach((product, index) => {
      const position = index + 1;
      if (num(product.sort_order) !== position) changes.push({ id: product.id, sort_order: position });
    });
  }

  return changes;
}

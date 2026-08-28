/**
 * Seleção de produtos da campanha "Destaques para você".
 *
 * Nunca devolve item oculto, arquivado, inativo, sem estoque ou fora do
 * período de venda. Quando nada é elegível, a lista volta vazia e a janela
 * simplesmente não abre.
 */
import { currentPrice, hasPromo, productAvailability, type ProductRow } from "@/lib/catalog";
import type { HighlightCampaignRow } from "@/lib/entry-popup-queries";

export type HighlightSelectionRule =
  | "manual"
  | "best_sellers"
  | "most_viewed"
  | "promotions"
  | "new_items"
  | "featured"
  | "related_last_order"
  | "complementary"
  | "category"
  | "in_stock";

export const SELECTION_RULE_LABEL: Record<HighlightSelectionRule, string> = {
  manual: "Selecionados manualmente",
  best_sellers: "Mais vendidos",
  most_viewed: "Mais visualizados",
  promotions: "Produtos em promoção",
  new_items: "Novidades",
  featured: "Destaques do catálogo",
  related_last_order: "Relacionados ao último pedido",
  complementary: "Complementares ao carrinho",
  category: "Categoria escolhida",
  in_stock: "Com estoque disponível",
};

export interface HighlightPick {
  product: ProductRow;
  badge: string | null;
}

export interface HighlightContext {
  /** Produtos escolhidos manualmente na campanha. */
  manualItems: { product_id: string; badge: string | null; sort_order: number }[];
  /** Ids já comprados pelo cliente nesta loja. */
  purchasedIds?: string[];
  /** Ids já presentes no carrinho — base dos complementares. */
  cartProductIds?: string[];
  /** Quantidade vendida por produto. */
  salesByProduct?: Record<string, number>;
  /** Visualizações por produto. */
  viewsByProduct?: Record<string, number>;
  now?: Date;
}

/** A campanha só vale dentro do período configurado e quando ativa. */
export function isCampaignActive(campaign: HighlightCampaignRow | null, now: Date = new Date()): boolean {
  if (!campaign || !campaign.is_active) return false;
  if (campaign.starts_at && now < new Date(campaign.starts_at)) return false;
  if (campaign.ends_at && now > new Date(campaign.ends_at)) return false;
  return true;
}

/** Itens que a loja realmente pode vender agora. */
export function sellableProducts(products: ProductRow[], now: Date = new Date()): ProductRow[] {
  return products.filter((product) => {
    if (!product.is_active || product.archived_at) return false;
    if (product.track_stock && Number(product.stock_quantity) <= 0) return false;
    return productAvailability(product, now).available;
  });
}

export function selectCampaignProducts(
  campaign: HighlightCampaignRow,
  products: ProductRow[],
  context: HighlightContext,
): HighlightPick[] {
  const now = context.now ?? new Date();
  const sellable = sellableProducts(products, now);
  const byId = new Map(sellable.map((product) => [product.id, product]));
  const limit = Math.max(1, campaign.max_items);
  const fallbackBadge = campaign.badge?.trim() ? campaign.badge.trim() : null;
  const sales = context.salesByProduct ?? {};
  const views = context.viewsByProduct ?? {};
  const purchased = context.purchasedIds ?? [];
  const inCart = context.cartProductIds ?? [];

  const take = (list: ProductRow[], badge: string | null): HighlightPick[] =>
    list.slice(0, limit).map((product) => ({ product, badge: fallbackBadge ?? badge }));

  switch (campaign.selection_rule as HighlightSelectionRule) {
    case "manual":
      return context.manualItems
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => ({ product: byId.get(item.product_id), badge: item.badge ?? fallbackBadge }))
        .filter((pick): pick is HighlightPick => Boolean(pick.product))
        .slice(0, limit);
    case "best_sellers":
      return take(
        sellable.filter((p) => (sales[p.id] ?? 0) > 0).sort((a, b) => (sales[b.id] ?? 0) - (sales[a.id] ?? 0)),
        "Mais vendido",
      );
    case "most_viewed":
      return take(
        sellable.filter((p) => (views[p.id] ?? 0) > 0).sort((a, b) => (views[b.id] ?? 0) - (views[a.id] ?? 0)),
        "Mais visto",
      );
    case "promotions":
      return take(sellable.filter((p) => hasPromo(p)), "Oferta");
    case "new_items":
      return take(
        [...sellable].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        "Novidade",
      );
    case "related_last_order":
      return take(sellable.filter((p) => purchased.includes(p.id)), "Você já pediu");
    case "complementary":
      return take(
        sellable.filter((p) => !inCart.includes(p.id) && (p.is_featured || hasPromo(p))),
        "Combina com seu pedido",
      );
    case "category":
      return take(
        sellable.filter((p) => p.category_id === campaign.category_id),
        null,
      );
    case "in_stock":
      return take(
        sellable.filter((p) => !p.track_stock || Number(p.stock_quantity) > 0),
        null,
      );
    case "featured":
    default:
      return take(sellable.filter((p) => p.is_featured), "Destaque");
  }
}

/** Preço exibido no card, já considerando promoção vigente. */
export function displayPrices(product: ProductRow): { price: number; original: number | null } {
  return { price: currentPrice(product), original: hasPromo(product) ? Number(product.price) : null };
}

/**
 * Sugestões de "leve também" (upsell) no carrinho e no checkout.
 *
 * A regra é puramente derivada de dados já carregados no catálogo público:
 * usamos os relacionamentos cadastrados pelo lojista (`product_related`) dos
 * itens que estão no carrinho. Nada de recomendação mágica — o lojista decide
 * o que aparece, e nós só filtramos o que o cliente não pode comprar agora.
 *
 * Este módulo é puro (sem acesso a rede/banco) para poder ser testado e usado
 * tanto no servidor quanto no navegador.
 */

/** Forma mínima de produto necessária para montar a sugestão. */
export interface UpsellProduct {
  id: string;
  name: string;
  price: number | string;
  description?: string | null;
  image_url?: string | null;
  is_available?: boolean | null;
  track_stock?: boolean | null;
  stock_quantity?: number | string | null;
  kind?: string | null;
}

/** Linha da tabela de produtos relacionados (apenas o que interessa aqui). */
export interface UpsellRelation {
  product_id: string;
  related_product_id: string;
  sort_order?: number | null;
}

export interface UpsellSuggestion {
  product: UpsellProduct;
  /** Preço unitário já normalizado para número. */
  price: number;
  /** Quantidade máxima permitida (estoque), quando a loja controla estoque. */
  maxQuantity: number | null;
  /** Produto de origem da sugestão — usado para explicar o "combina com". */
  becauseOf: string;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Estoque disponível quando a loja controla saldo; `null` quando é livre. */
function availableStock(product: UpsellProduct): number | null {
  if (!product.track_stock) return null;
  return Math.max(0, Math.floor(toNumber(product.stock_quantity)));
}

export interface BuildUpsellInput {
  products: UpsellProduct[];
  related: UpsellRelation[];
  /** Produtos que já estão no carrinho (não devem ser sugeridos de novo). */
  cartProductIds: string[];
  /**
   * Produtos que exigem escolhas (grupos de opções ou grade de variações).
   * Ficam de fora porque a sugestão adiciona com um clique, sem abrir o modal.
   */
  requiresChoiceIds?: string[];
  max?: number;
}

/**
 * Monta as sugestões respeitando a ordem definida pelo lojista.
 * Retorna lista vazia quando não há relacionamento cadastrado — preferimos
 * não mostrar nada a mostrar sugestão irrelevante.
 */
export function buildUpsellSuggestions(input: BuildUpsellInput): UpsellSuggestion[] {
  const max = Math.max(0, input.max ?? 4);
  if (max === 0 || input.cartProductIds.length === 0) return [];

  const inCart = new Set(input.cartProductIds);
  const blocked = new Set(input.requiresChoiceIds ?? []);
  const byId = new Map(input.products.map((product) => [product.id, product]));

  const relations = [...input.related]
    .filter((relation) => inCart.has(relation.product_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const seen = new Set<string>();
  const suggestions: UpsellSuggestion[] = [];

  for (const relation of relations) {
    if (suggestions.length >= max) break;
    const target = relation.related_product_id;
    if (inCart.has(target) || blocked.has(target) || seen.has(target)) continue;

    const product = byId.get(target);
    if (!product) continue;
    if (product.is_available === false) continue;
    // Serviços, encomendas e digitais têm fluxo próprio de contratação.
    if (product.kind && product.kind !== "product" && product.kind !== "combo") continue;

    const stock = availableStock(product);
    if (stock !== null && stock <= 0) continue;

    seen.add(target);
    suggestions.push({
      product,
      price: toNumber(product.price),
      maxQuantity: stock,
      becauseOf: byId.get(relation.product_id)?.name ?? "",
    });
  }

  return suggestions;
}

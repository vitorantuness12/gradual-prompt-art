import { useMemo } from "react";

import { buildUpsellSuggestions, type UpsellSuggestion } from "@/lib/upsell";
import type { PublicStoreData } from "@/lib/store-queries";
import type { CartItem } from "@/hooks/useCart";

/**
 * Deriva as sugestões de "leve também" dos dados já carregados do catálogo.
 * É estado derivado — nada de efeito nem requisição extra.
 */
export function useUpsellSuggestions(
  data: PublicStoreData | null | undefined,
  cartItems: CartItem[],
  options?: { enabled?: boolean; max?: number },
): UpsellSuggestion[] {
  const enabled = options?.enabled ?? true;
  const max = options?.max ?? 4;
  const cartKey = cartItems.map((item) => item.productId).join("|");

  return useMemo(() => {
    if (!enabled || !data) return [];

    // Produtos que exigem escolha do cliente não podem ser adicionados com um
    // clique: pulamos para não montar uma linha de carrinho incompleta.
    const requiresChoiceIds = [
      ...new Set([
        ...data.optionGroups.map((group) => group.product_id),
        ...data.variants.map((variant) => variant.product_id),
      ]),
    ].filter((id): id is string => Boolean(id));

    return buildUpsellSuggestions({
      products: data.products,
      related: data.related,
      cartProductIds: [...new Set(cartItems.map((item) => item.productId))],
      requiresChoiceIds,
      max,
    });
    // cartKey resume os produtos do carrinho; evita recalcular a cada digitação.
  }, [data, cartKey, enabled, max, cartItems]);
}

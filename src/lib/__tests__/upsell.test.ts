import { describe, expect, it } from "vitest";

import { buildUpsellSuggestions, type UpsellProduct } from "@/lib/upsell";

function product(id: string, overrides: Partial<UpsellProduct> = {}): UpsellProduct {
  return { id, name: `Produto ${id}`, price: 10, is_available: true, kind: "product", ...overrides };
}

describe("buildUpsellSuggestions", () => {
  const products = [
    product("a"),
    product("b", { price: "15.5" }),
    product("c", { is_available: false }),
    product("d", { track_stock: true, stock_quantity: 0 }),
    product("e", { kind: "service" }),
    product("f", { track_stock: true, stock_quantity: 3 }),
  ];

  it("sugere relacionados do item no carrinho", () => {
    const result = buildUpsellSuggestions({
      products,
      related: [{ product_id: "a", related_product_id: "b", sort_order: 1 }],
      cartProductIds: ["a"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.product.id).toBe("b");
    expect(result[0]!.price).toBe(15.5);
    expect(result[0]!.becauseOf).toBe("Produto a");
  });

  it("ignora indisponível, sem estoque, serviço e o que já está no carrinho", () => {
    const result = buildUpsellSuggestions({
      products,
      related: [
        { product_id: "a", related_product_id: "c" },
        { product_id: "a", related_product_id: "d" },
        { product_id: "a", related_product_id: "e" },
        { product_id: "a", related_product_id: "b" },
      ],
      cartProductIds: ["a", "b"],
    });
    expect(result).toHaveLength(0);
  });

  it("respeita produtos que exigem escolha e o limite máximo", () => {
    const result = buildUpsellSuggestions({
      products,
      related: [
        { product_id: "a", related_product_id: "b", sort_order: 2 },
        { product_id: "a", related_product_id: "f", sort_order: 1 },
      ],
      cartProductIds: ["a"],
      requiresChoiceIds: ["b"],
      max: 5,
    });
    expect(result.map((item) => item.product.id)).toEqual(["f"]);
    expect(result[0]!.maxQuantity).toBe(3);
  });

  it("não repete a mesma sugestão vinda de itens diferentes", () => {
    const result = buildUpsellSuggestions({
      products,
      related: [
        { product_id: "a", related_product_id: "f" },
        { product_id: "b", related_product_id: "f" },
      ],
      cartProductIds: ["a", "b"],
    });
    expect(result).toHaveLength(1);
  });

  it("retorna vazio com carrinho vazio ou limite zero", () => {
    const related = [{ product_id: "a", related_product_id: "b" }];
    expect(buildUpsellSuggestions({ products, related, cartProductIds: [] })).toEqual([]);
    expect(buildUpsellSuggestions({ products, related, cartProductIds: ["a"], max: 0 })).toEqual([]);
  });
});

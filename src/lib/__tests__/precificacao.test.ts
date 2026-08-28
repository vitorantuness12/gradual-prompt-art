import { describe, expect, it } from "vitest";

import {
  DEFAULT_COSTS,
  applyRounding,
  calculatePricing,
  marginForPrice,
  parsePricing,
  type CostInput,
} from "@/lib/precificacao";
import {
  EMPTY_BUILDER,
  checkCombo,
  flavorsPrice,
  parseBuilder,
  quoteBuilder,
  type BuilderConfig,
} from "@/lib/montador";
import {
  DEFAULT_PRODUCTION,
  availableSlots,
  buildLoad,
  checkCapacity,
  slotStart,
  type ProductionSettings,
} from "@/lib/producao";

/** ---------- Precificação ---------- */

const costs: CostInput = {
  ...DEFAULT_COSTS,
  productCost: 10,
  packagingCost: 2,
  laborCost: 3,
  taxPercent: 6,
  gatewayPercent: 4,
  channelPercent: 0,
  marginPercent: 30,
  maxDiscountPercent: 10,
};

describe("calculadora de preço", () => {
  it("cobre os custos fixos e os percentuais sobre o preço", () => {
    const result = calculatePricing(costs);
    // 15 / (1 - 0,40) = 25,00
    expect(result.fixedCost).toBe(15);
    expect(result.recommendedPrice).toBe(25);
    expect(result.totalCost).toBe(17.5);
    expect(result.grossProfit).toBe(7.5);
    expect(result.marginPercent).toBe(30);
  });

  it("aplica o desconto máximo e mostra a margem mínima", () => {
    const result = calculatePricing(costs);
    expect(result.minPrice).toBe(22.5);
    expect(result.minMarginPercent).toBeLessThan(result.marginPercent);
  });

  it("avisa quando o desconto máximo dá prejuízo", () => {
    const result = calculatePricing({ ...costs, maxDiscountPercent: 60 });
    expect(result.warnings.join(" ")).toContain("abaixo do custo");
  });

  it("avalia o preço promocional informado", () => {
    const result = calculatePricing({ ...costs, promoPrice: 18 });
    expect(result.promo?.viable).toBe(true);
    const bad = calculatePricing({ ...costs, promoPrice: 12 });
    expect(bad.promo?.viable).toBe(false);
  });

  it("avisa quando margem e taxas passam de 100%", () => {
    const result = calculatePricing({ ...costs, marginPercent: 95, taxPercent: 10 });
    expect(result.warnings.join(" ")).toContain("100%");
  });

  it("arredonda conforme a preferência", () => {
    expect(applyRounding(27.43, "cents_90")).toBe(27.9);
    expect(applyRounding(27.95, "cents_90")).toBe(28.9);
    expect(applyRounding(27.43, "cents_99")).toBe(27.99);
    expect(applyRounding(27.43, "half_real")).toBe(27.5);
    expect(applyRounding(27.43, "real")).toBe(28);
    expect(applyRounding(27.43, "five")).toBe(30);
  });

  it("calcula a margem de um preço já praticado", () => {
    expect(marginForPrice(costs, 25)).toBe(30);
  });

  it("lê a ficha salva com valores padrão", () => {
    const parsed = parsePricing({ productCost: 8, rounding: "real" });
    expect(parsed.productCost).toBe(8);
    expect(parsed.marginPercent).toBe(DEFAULT_COSTS.marginPercent);
    expect(parsed.rounding).toBe("real");
  });
});

/** ---------- Montador ---------- */

const pizza: BuilderConfig = {
  ...EMPTY_BUILDER,
  enabled: true,
  flavorRule: "highest",
  sizes: [
    { id: "p", label: "Pequena", basePrice: 10, maxFlavors: 1 },
    { id: "g", label: "Grande", basePrice: 20, maxFlavors: 2 },
  ],
  flavors: [
    { id: "mus", label: "Mussarela", price: 20 },
    { id: "cal", label: "Calabresa", price: 26 },
  ],
  crusts: [{ id: "cat", label: "Catupiry", price: 8, priceBySize: { p: 5 } }],
  doughs: [{ id: "int", label: "Integral", price: 4 }],
  extras: [{ id: "bac", label: "Bacon", price: 6 }],
  ingredients: [
    { id: "ceb", label: "Cebola", removable: true },
    { id: "queijo", label: "Queijo", removable: false },
  ],
  maxExtras: 2,
};

describe("montador de pizza", () => {
  it("cobra o sabor mais caro por padrão", () => {
    expect(flavorsPrice(pizza, pizza.sizes[1]!, pizza.flavors)).toBe(26);
  });

  it("usa a média quando configurado", () => {
    expect(flavorsPrice({ ...pizza, flavorRule: "average" }, pizza.sizes[1]!, pizza.flavors)).toBe(
      23,
    );
  });

  it("soma tamanho, sabores, borda, massa e adicionais", () => {
    const quote = quoteBuilder(pizza, {
      sizeId: "g",
      flavorIds: ["mus", "cal"],
      crustId: "cat",
      doughId: "int",
      extraIds: ["bac"],
      removedIngredientIds: ["ceb"],
      quantity: 2,
    });
    expect(quote.ok).toBe(true);
    // 20 + 26 + 8 + 4 + 6 = 64
    expect(quote.unitPrice).toBe(64);
    expect(quote.total).toBe(128);
    expect(quote.description).toContain("sem Cebola");
  });

  it("usa o preço da borda por tamanho quando existir", () => {
    const quote = quoteBuilder(pizza, {
      sizeId: "p",
      flavorIds: ["mus"],
      crustId: "cat",
      extraIds: [],
      removedIngredientIds: [],
      quantity: 1,
    });
    expect(quote.unitPrice).toBe(35);
  });

  it("recusa mais sabores do que o tamanho permite", () => {
    const quote = quoteBuilder(pizza, {
      sizeId: "p",
      flavorIds: ["mus", "cal"],
      extraIds: [],
      removedIngredientIds: [],
      quantity: 1,
    });
    expect(quote.ok).toBe(false);
    expect(quote.errors.join(" ")).toContain("no máximo 1");
  });

  it("recusa remover ingrediente que não é removível", () => {
    const quote = quoteBuilder(pizza, {
      sizeId: "g",
      flavorIds: ["mus"],
      extraIds: [],
      removedIngredientIds: ["queijo"],
      quantity: 1,
    });
    expect(quote.ok).toBe(false);
  });

  it("respeita o limite de adicionais", () => {
    const config = { ...pizza, maxExtras: 0 };
    const quote = quoteBuilder(config, {
      sizeId: "g",
      flavorIds: ["mus"],
      extraIds: ["bac"],
      removedIngredientIds: [],
      quantity: 1,
    });
    expect(quote.ok).toBe(false);
  });

  it("lê configuração incompleta sem quebrar", () => {
    expect(parseBuilder({ enabled: true }).sizes).toEqual([]);
  });
});

describe("combos e kits", () => {
  const components = [
    {
      productId: "a",
      name: "Refrigerante",
      quantity: 2,
      price: 6,
      deductsStock: true,
      isOptional: false,
      availableStock: 10,
    },
    {
      productId: "b",
      name: "Burger",
      quantity: 1,
      price: 30,
      deductsStock: true,
      isOptional: false,
      availableStock: 3,
    },
  ];

  it("soma os componentes obrigatórios e calcula quantos kits cabem", () => {
    const result = checkCombo(components, 1);
    expect(result.ok).toBe(true);
    expect(result.componentsTotal).toBe(42);
    expect(result.maxKits).toBe(3);
  });

  it("bloqueia quando falta estoque para a quantidade pedida", () => {
    const result = checkCombo(components, 5);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Estoque insuficiente");
  });

  it("exige ao menos um componente", () => {
    expect(checkCombo([], 1).ok).toBe(false);
  });
});

/** ---------- Capacidade de produção ---------- */

const production: ProductionSettings = {
  ...DEFAULT_PRODUCTION,
  isEnabled: true,
  slotMinutes: 30,
  maxOrdersPerSlot: 2,
  maxItemsPerSlot: 10,
  minLeadMinutes: 60,
  maxDaysAhead: 7,
};

const now = new Date("2026-08-26T12:00:00.000Z");

describe("capacidade de produção", () => {
  it("agrupa o horário no intervalo configurado", () => {
    expect(slotStart(new Date("2026-08-26T14:47:00.000Z"), 30).getMinutes()).toBe(30);
  });

  it("aceita quando há vaga no horário", () => {
    const result = checkCapacity(production, new Date("2026-08-26T15:00:00.000Z"), 3, [], now);
    expect(result.allowed).toBe(true);
    expect(result.startPrepAt).not.toBeNull();
  });

  it("recusa sem a antecedência mínima e explica o motivo", () => {
    const result = checkCapacity(production, new Date("2026-08-26T12:15:00.000Z"), 1, [], now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("antecedência");
  });

  it("recusa além dos dias permitidos", () => {
    const result = checkCapacity(production, new Date("2026-09-30T12:00:00.000Z"), 1, [], now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("dia(s)");
  });

  it("recusa quando o horário lotou e oferece a fila", () => {
    const slot = slotStart(new Date("2026-08-26T15:00:00.000Z"), 30).toISOString();
    const result = checkCapacity(
      production,
      new Date("2026-08-26T15:00:00.000Z"),
      1,
      [{ slot, orders: 2, items: 4 }],
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.canQueue).toBe(true);
  });

  it("recusa quando o pedido excede os itens do horário", () => {
    const slot = slotStart(new Date("2026-08-26T15:00:00.000Z"), 30).toISOString();
    const result = checkCapacity(
      production,
      new Date("2026-08-26T15:00:00.000Z"),
      9,
      [{ slot, orders: 1, items: 8 }],
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("item(ns)");
  });

  it("não bloqueia nada quando a capacidade está desligada", () => {
    const result = checkCapacity(
      { ...production, isEnabled: false },
      new Date("2026-08-26T12:01:00.000Z"),
      99,
      [],
      now,
    );
    expect(result.allowed).toBe(true);
  });

  it("sugere apenas horários com vaga", () => {
    const slots = availableSlots(production, [], 1, now, 3);
    expect(slots).toHaveLength(3);
    expect(new Date(slots[0]!.slot).getTime()).toBeGreaterThanOrEqual(
      now.getTime() + 60 * 60_000 - 30 * 60_000,
    );
  });

  it("monta a carga a partir dos pedidos agendados", () => {
    const load = buildLoad(
      [
        { scheduled_for: "2026-08-26T15:05:00.000Z", items: 2 },
        { scheduled_for: "2026-08-26T15:20:00.000Z", items: 3 },
        { scheduled_for: null, items: 9 },
      ],
      30,
    );
    expect(load).toHaveLength(1);
    expect(load[0]!.orders).toBe(2);
    expect(load[0]!.items).toBe(5);
  });
});

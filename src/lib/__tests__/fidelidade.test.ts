import { describe, expect, it } from "vitest";

import {
  calculateOrderPoints,
  isBlockActive,
  matchesSegment,
  missionProgressPercent,
  normalizePhone,
  pointsToCurrency,
  resolveTier,
  respectsFrequencyCap,
  rewardAvailability,
  tierProgress,
  type LoyaltyRewardRow,
  type LoyaltyRuleRow,
  type LoyaltyTierRow,
  type OrderContext,
} from "@/lib/fidelidade";

const settings = {
  is_enabled: true,
  points_per_currency: 1,
  cashback_percent: 5,
  min_order_value: 20,
  first_order_points: 50,
  frequent_orders_threshold: 5,
  frequent_bonus_points: 100,
  birthday_bonus_points: 30,
  inactive_days: 60,
  winback_points: 40,
};

function order(overrides: Partial<OrderContext> = {}): OrderContext {
  return {
    total: 100,
    subtotal: 100,
    type: "delivery",
    channel: "loja",
    district: "Centro",
    items: [],
    previousOrders: 3,
    daysSinceLastOrder: 5,
    birthMonth: null,
    ...overrides,
  };
}

function rule(overrides: Partial<LoyaltyRuleRow> = {}): LoyaltyRuleRow {
  return {
    id: "rule-1",
    store_id: "store",
    name: "Regra",
    kind: "purchase",
    points: 10,
    multiplier: 1,
    category_id: null,
    product_ids: [],
    min_order_value: 0,
    channels: [],
    districts: [],
    order_types: [],
    usage_limit: null,
    per_customer_limit: null,
    used_count: 0,
    starts_at: null,
    ends_at: null,
    is_active: true,
    description: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as LoyaltyRuleRow;
}

describe("pontuação de pedidos", () => {
  it("não pontua abaixo do valor mínimo", () => {
    expect(calculateOrderPoints(settings, [], order({ total: 10 })).total).toBe(0);
  });

  it("pontua pelo valor gasto", () => {
    expect(calculateOrderPoints(settings, [], order()).total).toBe(100);
  });

  it("soma bônus de primeira compra", () => {
    const result = calculateOrderPoints(
      settings,
      [],
      order({ previousOrders: 0, daysSinceLastOrder: null }),
    );
    expect(result.total).toBe(150);
  });

  it("soma bônus de cliente frequente no pedido múltiplo do limite", () => {
    const result = calculateOrderPoints(settings, [], order({ previousOrders: 4 }));
    expect(result.total).toBe(200);
  });

  it("recupera cliente inativo", () => {
    const result = calculateOrderPoints(settings, [], order({ daysSinceLastOrder: 90 }));
    expect(result.total).toBe(140);
  });

  it("aplica multiplicador do nível", () => {
    expect(calculateOrderPoints(settings, [], order(), 2).total).toBe(200);
  });

  it("calcula o cashback configurado", () => {
    expect(calculateOrderPoints(settings, [], order()).cashback).toBe(5);
  });

  it("ignora regra fora do bairro elegível", () => {
    const result = calculateOrderPoints(settings, [rule({ districts: ["Jardim"] })], order());
    expect(result.total).toBe(100);
  });

  it("aplica regra de categoria somente aos itens elegíveis", () => {
    const result = calculateOrderPoints(
      settings,
      [rule({ kind: "category", points: 20, category_id: "cat-1" })],
      order({ items: [{ categoryId: "cat-1", productId: "p1", total: 40 }] }),
    );
    expect(result.total).toBe(120);
  });

  it("respeita o limite total de usos da regra", () => {
    const result = calculateOrderPoints(
      settings,
      [rule({ usage_limit: 5, used_count: 5 })],
      order(),
    );
    expect(result.total).toBe(100);
  });
});

describe("níveis", () => {
  const tiers = [
    { id: "t1", name: "Bronze", min_points: 0 },
    { id: "t2", name: "Prata", min_points: 200 },
    { id: "t3", name: "Ouro", min_points: 500 },
  ] as LoyaltyTierRow[];

  it("resolve o nível pelo total de pontos", () => {
    expect(resolveTier(tiers, 250)?.name).toBe("Prata");
  });

  it("calcula o progresso até o próximo nível", () => {
    expect(tierProgress(tiers, 350)).toBe(50);
  });

  it("mostra 100% no nível máximo", () => {
    expect(tierProgress(tiers, 900)).toBe(100);
  });
});

describe("recompensas", () => {
  const reward = {
    id: "r1",
    is_active: true,
    points_cost: 100,
    stock: null,
    per_customer_limit: 1,
    starts_at: null,
    ends_at: null,
  } as LoyaltyRewardRow;

  it("bloqueia quando faltam pontos", () => {
    expect(rewardAvailability(reward, 40, 0).available).toBe(false);
  });

  it("bloqueia ao atingir o limite por cliente", () => {
    expect(rewardAvailability(reward, 500, 1).available).toBe(false);
  });

  it("libera quando tudo está em ordem", () => {
    expect(rewardAvailability(reward, 500, 0).available).toBe(true);
  });
});

describe("segmentação", () => {
  const base = {
    id: "c1",
    ordersCount: 6,
    totalSpent: 900,
    lastOrderAt: "2026-01-01T00:00:00Z",
    firstOrderAt: "2025-01-01T00:00:00Z",
    district: "Centro",
    tags: ["vegetariano"],
  };
  const now = new Date("2026-04-01T00:00:00Z");

  it("identifica cliente inativo", () => {
    expect(matchesSegment("inactive", { days: 60 }, base, now)).toBe(true);
  });

  it("identifica cliente frequente", () => {
    expect(matchesSegment("frequent", { minOrders: 5 }, base, now)).toBe(true);
  });

  it("identifica alto ticket", () => {
    expect(matchesSegment("high_ticket", { minTicket: 100 }, base, now)).toBe(true);
  });

  it("filtra por bairro", () => {
    expect(matchesSegment("district", { districts: ["centro"] }, base, now)).toBe(true);
    expect(matchesSegment("district", { districts: ["Jardim"] }, base, now)).toBe(false);
  });

  it("filtra por preferência", () => {
    expect(matchesSegment("preference", { tags: ["Vegetariano"] }, base, now)).toBe(true);
  });

  it("respeita o limite de frequência de envios", () => {
    expect(respectsFrequencyCap("2026-03-30T00:00:00Z", 7, now)).toBe(false);
    expect(respectsFrequencyCap("2026-01-01T00:00:00Z", 7, now)).toBe(true);
  });
});

describe("bloqueio e utilidades", () => {
  it("considera bloqueio expirado como inativo", () => {
    expect(isBlockActive({ is_active: true, expires_at: "2020-01-01T00:00:00Z" })).toBe(false);
    expect(isBlockActive({ is_active: true, expires_at: null })).toBe(true);
  });

  it("normaliza telefone", () => {
    expect(normalizePhone("(65) 99999-0000")).toBe("65999990000");
  });

  it("converte pontos em dinheiro", () => {
    expect(pointsToCurrency(250, 0.05)).toBe(12.5);
  });

  it("calcula progresso de missão", () => {
    expect(missionProgressPercent(4, 3)).toBe(75);
  });
});

import { describe, expect, it } from "vitest";

import { canManage, isDue, nextCycleDate, parseItems, subscriptionTotal } from "@/lib/assinaturas";

describe("assinaturas", () => {
  it("avança o ciclo conforme a periodicidade", () => {
    const from = new Date("2026-01-01T12:00:00.000Z");
    expect(nextCycleDate("week", from).slice(0, 10)).toBe("2026-01-08");
    expect(nextCycleDate("biweek", from).slice(0, 10)).toBe("2026-01-16");
    expect(nextCycleDate("month", from).slice(0, 10)).toBe("2026-02-01");
  });

  it("soma itens e taxa de entrega", () => {
    const items = parseItems([
      { name: "Cesta", quantity: 2, unitPrice: 25.5 },
      { name: "Inválido", quantity: 0, unitPrice: 10 },
    ]);
    expect(items).toHaveLength(1);
    expect(subscriptionTotal(items, 7)).toBe(58);
  });

  it("só considera vencida a assinatura ativa e sem pausa", () => {
    const now = new Date("2026-01-10T00:00:00.000Z");
    const base = { status: "active", paused_at: null, next_order_at: "2026-01-09T00:00:00.000Z" };
    expect(isDue(base, now)).toBe(true);
    expect(isDue({ ...base, paused_at: "2026-01-05T00:00:00.000Z" }, now)).toBe(false);
    expect(isDue({ ...base, status: "canceled" }, now)).toBe(false);
    expect(isDue({ ...base, next_order_at: "2026-02-01T00:00:00.000Z" }, now)).toBe(false);
  });

  it("bloqueia gestão de assinatura encerrada", () => {
    expect(canManage("active")).toBe(true);
    expect(canManage("canceled")).toBe(false);
  });
});

describe("receita recorrente", () => {
  it("converte o ciclo em valor mensal equivalente", async () => {
    const { monthlyRecurringValue } = await import("@/lib/assinaturas");
    expect(monthlyRecurringValue("month", 100)).toBe(100);
    expect(monthlyRecurringValue("week", 100)).toBeCloseTo(434.52, 1);
    expect(monthlyRecurringValue("biweek", 100)).toBeCloseTo(202.78, 1);
    expect(monthlyRecurringValue("month", -5)).toBe(0);
  });
});

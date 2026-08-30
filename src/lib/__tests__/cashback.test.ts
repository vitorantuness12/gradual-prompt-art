import { describe, expect, it } from "vitest";

import { cashbackEarned, effectiveCashback, maxRedeemable, normalizeReferralCode } from "@/lib/cashback";

describe("effectiveCashback", () => {
  it("ignora saldo vencido", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(effectiveCashback(30, past)).toBe(0);
  });

  it("mantém saldo dentro da validade", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(effectiveCashback(30, future)).toBe(30);
  });

  it("aceita saldo sem validade definida", () => {
    expect(effectiveCashback(12.5, null)).toBe(12.5);
  });
});

describe("maxRedeemable", () => {
  it("limita ao teto percentual da loja", () => {
    expect(maxRedeemable(100, 80, 50)).toBe(40);
  });

  it("nunca excede o saldo nem o valor devido", () => {
    expect(maxRedeemable(10, 80, 100)).toBe(10);
    expect(maxRedeemable(100, 25, 100)).toBe(25);
  });

  it("retorna zero sem saldo ou sem valor devido", () => {
    expect(maxRedeemable(0, 50, 100)).toBe(0);
    expect(maxRedeemable(50, 0, 100)).toBe(0);
  });
});

describe("cashbackEarned", () => {
  it("respeita o pedido mínimo", () => {
    expect(cashbackEarned(40, 10, 50)).toBe(0);
    expect(cashbackEarned(100, 10, 50)).toBe(10);
  });
});

describe("normalizeReferralCode", () => {
  it("normaliza para maiúsculas sem espaços", () => {
    expect(normalizeReferralCode(" ab-12 ")).toBe("AB-12");
  });
});

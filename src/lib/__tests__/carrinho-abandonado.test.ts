import { describe, expect, it } from "vitest";

import {
  cartSubtotal,
  clampDelayMinutes,
  recoveryLink,
  reminderMessage,
  sanitizeItems,
  DEFAULT_ABANDONED_DELAY_MINUTES,
} from "@/lib/carrinho-abandonado";

describe("clampDelayMinutes", () => {
  it("usa o padrão para valores ausentes ou inválidos", () => {
    expect(clampDelayMinutes(null)).toBe(DEFAULT_ABANDONED_DELAY_MINUTES);
    expect(clampDelayMinutes(Number.NaN)).toBe(DEFAULT_ABANDONED_DELAY_MINUTES);
  });

  it("mantém a espera entre 10 minutos e 12 horas", () => {
    expect(clampDelayMinutes(1)).toBe(10);
    expect(clampDelayMinutes(5000)).toBe(720);
    expect(clampDelayMinutes(45)).toBe(45);
  });
});

describe("sanitizeItems", () => {
  it("descarta linhas mal formadas", () => {
    const items = sanitizeItems([
      { productId: "a", name: "Pizza", unitPrice: 30, quantity: 2 },
      { productId: "b", name: "Sem preço", quantity: 1 },
      { name: "Sem id", unitPrice: 5, quantity: 1 },
      { productId: "c", name: "Zero", unitPrice: 5, quantity: 0 },
      null,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: "a", quantity: 2, options: [] });
  });

  it("normaliza quantidade e recorta texto longo", () => {
    const items = sanitizeItems([
      { productId: "a", name: "x".repeat(300), unitPrice: 1, quantity: 2.7, notes: "y".repeat(500) },
    ]);
    expect(items[0]!.quantity).toBe(3);
    expect(items[0]!.name).toHaveLength(160);
    expect(items[0]!.notes).toHaveLength(300);
  });

  it("aceita apenas array", () => {
    expect(sanitizeItems("nada")).toEqual([]);
  });
});

describe("cartSubtotal", () => {
  it("soma preço unitário por quantidade", () => {
    expect(
      cartSubtotal([
        { productId: "a", name: "A", unitPrice: 10.5, quantity: 2 },
        { productId: "b", name: "B", unitPrice: 4, quantity: 1 },
      ]),
    ).toBe(25);
  });
});

describe("recoveryLink", () => {
  it("monta o link com token e cupom", () => {
    const link = recoveryLink("https://oseupedido.com.br", "pizzaria", "abc123abc123abc1", "VOLTA10");
    expect(link).toBe("https://oseupedido.com.br/pizzaria/carrinho?retomar=abc123abc123abc1&cupom=VOLTA10");
  });

  it("omite o cupom quando não houver", () => {
    const link = recoveryLink("https://oseupedido.com.br", "pizzaria", "abc123abc123abc1", null);
    expect(link).not.toContain("cupom");
  });
});

describe("reminderMessage", () => {
  it("cita os itens, o link e o cupom", () => {
    const body = reminderMessage({
      firstName: "Ana",
      storeName: "Pizzaria do Bairro",
      itemNames: ["Pizza", "Refri", "Doce", "Extra"],
      link: "https://oseupedido.com.br/x/carrinho?retomar=t",
      coupon: "VOLTA10",
    });
    expect(body).toContain("Ana");
    expect(body).toContain("Pizzaria do Bairro");
    expect(body).toContain("e mais itens");
    expect(body).toContain("VOLTA10");
    expect(body).toContain("https://oseupedido.com.br/x/carrinho?retomar=t");
  });

  it("funciona sem nome e sem cupom", () => {
    const body = reminderMessage({
      firstName: "",
      storeName: "Loja",
      itemNames: ["Item"],
      link: "https://x/y",
    });
    expect(body.startsWith("você")).toBe(true);
    expect(body).not.toContain("cupom");
  });
});

import { describe, expect, it } from "vitest";

import {
  cashDifference,
  expectedCashBalance,
  findByCode,
  matchesSearch,
  posTotals,
  validateSplitPayments,
  type PosCartLine,
} from "@/lib/pdv";

const lines: PosCartLine[] = [
  { lineId: "1", productId: "p1", name: "Burger", unitPrice: 27.9, quantity: 2 },
  { lineId: "2", productId: "p2", name: "Refri", unitPrice: 7, quantity: 1 },
];

describe("totais da venda", () => {
  it("soma itens, aplica desconto e taxa", () => {
    const totals = posTotals(lines, 5, 3);
    expect(totals.subtotal).toBeCloseTo(62.8);
    expect(totals.total).toBeCloseTo(60.8);
  });

  it("nunca deixa o desconto passar do subtotal", () => {
    const totals = posTotals(lines, 999, 0);
    expect(totals.discount).toBeCloseTo(62.8);
    expect(totals.total).toBe(0);
  });
});

describe("pagamento dividido", () => {
  it("aceita combinação que cobre o total", () => {
    const result = validateSplitPayments(
      [
        { id: "1", method: "pix", amount: 40 },
        { id: "2", method: "credit", amount: 22.8 },
      ],
      62.8,
    );
    expect(result.ok).toBe(true);
    expect(result.change).toBe(0);
  });

  it("bloqueia valor abaixo do total", () => {
    const result = validateSplitPayments([{ id: "1", method: "debit", amount: 50 }], 62.8);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBeCloseTo(12.8);
  });

  it("calcula troco quando o excedente está em dinheiro", () => {
    const result = validateSplitPayments(
      [
        { id: "1", method: "cash", amount: 50 },
        { id: "2", method: "pix", amount: 20 },
      ],
      62.8,
    );
    expect(result.ok).toBe(true);
    expect(result.change).toBeCloseTo(7.2);
  });

  it("recusa excedente em cartão (não gera troco)", () => {
    const result = validateSplitPayments([{ id: "1", method: "credit", amount: 80 }], 62.8);
    expect(result.ok).toBe(false);
  });

  it("exige ao menos uma forma informada", () => {
    expect(validateSplitPayments([{ id: "1", method: "cash", amount: 0 }], 10).ok).toBe(false);
  });
});

describe("caixa", () => {
  const movements = [
    { kind: "sale", method: "cash", amount: 100 },
    { kind: "sale", method: "pix", amount: 200 },
    { kind: "withdrawal", method: "cash", amount: 50 },
    { kind: "supply", method: "cash", amount: 30 },
    { kind: "refund", method: "cash", amount: 10 },
  ];

  it("calcula o saldo esperado somente com dinheiro", () => {
    expect(expectedCashBalance(150, movements)).toBeCloseTo(220);
  });

  it("aponta sobra e falta no fechamento", () => {
    expect(cashDifference(225, 220)).toBeCloseTo(5);
    expect(cashDifference(210, 220)).toBeCloseTo(-10);
  });
});

describe("busca e leitor de código de barras", () => {
  const products = [
    { name: "Burger da Casa", sku: "BRG-01", barcode: "7891234567890" },
    { name: "Refrigerante", sku: "REF-01", barcode: "7890000000001" },
  ];

  it("encontra por nome e por SKU", () => {
    expect(matchesSearch(products[0]!, "burger")).toBe(true);
    expect(matchesSearch(products[0]!, "BRG")).toBe(true);
    expect(matchesSearch(products[0]!, "refri")).toBe(false);
  });

  it("casa o código de barras exatamente", () => {
    expect(findByCode(products, "7890000000001")?.name).toBe("Refrigerante");
    expect(findByCode(products, "789000000")).toBeNull();
  });
});

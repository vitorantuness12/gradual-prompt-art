import { describe, expect, it } from "vitest";

import { batchStatus, daysUntilExpiry, summarizeBatches, sortFefo, type ProductBatch } from "@/lib/lotes";
import { findScaleProduct, formatWeight, parseScaleBarcode, parseWeightInput, scaleQuantity, weightLineTotal } from "@/lib/peso";

const NOW = new Date("2026-08-27T12:00:00");

function batch(partial: Partial<ProductBatch>): ProductBatch {
  return {
    id: "b1",
    store_id: "s1",
    product_id: "p1",
    variant_id: null,
    supplier_id: null,
    batch_code: "L1",
    expires_at: null,
    quantity: 10,
    unit_cost: 2,
    notes: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...partial,
  } as ProductBatch;
}

describe("lotes e validade", () => {
  it("classifica vencido, vencendo e dentro da validade", () => {
    expect(batchStatus(batch({ expires_at: "2026-08-20" }), NOW)).toBe("vencido");
    expect(batchStatus(batch({ expires_at: "2026-09-02" }), NOW)).toBe("vencendo");
    expect(batchStatus(batch({ expires_at: "2026-12-01" }), NOW)).toBe("ok");
    expect(batchStatus(batch({ expires_at: null }), NOW)).toBe("sem-validade");
    expect(batchStatus(batch({ quantity: 0, expires_at: "2026-08-20" }), NOW)).toBe("esgotado");
  });

  it("conta dias e resume o risco", () => {
    expect(daysUntilExpiry("2026-08-30", NOW)).toBe(3);
    const summary = summarizeBatches(
      [batch({ id: "a", expires_at: "2026-08-01" }), batch({ id: "b", expires_at: "2026-08-30" })],
      NOW,
    );
    expect(summary.expired).toBe(1);
    expect(summary.expiring).toBe(1);
    expect(summary.valueAtRisk).toBe(40);
  });

  it("ordena FEFO deixando lotes sem validade no fim", () => {
    const order = sortFefo([
      batch({ id: "sem", expires_at: null }),
      batch({ id: "tarde", expires_at: "2026-10-01" }),
      batch({ id: "cedo", expires_at: "2026-09-01" }),
    ]).map((item) => item.id);
    expect(order).toEqual(["cedo", "tarde", "sem"]);
  });
});

describe("venda por peso", () => {
  it("aceita vírgula na digitação do peso", () => {
    expect(parseWeightInput("1,250")).toBe(1.25);
    expect(parseWeightInput("abc")).toBe(0);
    expect(formatWeight(1.25)).toBe("1,25 kg");
  });

  it("lê a etiqueta da balança com peso embutido", () => {
    // 2 + item 000123 + peso 01250 g + dígito verificador
    const base = "2" + "000123" + "01250";
    const check = (10 - (base.split("").reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
    const label = parseScaleBarcode(base + check);
    expect(label?.weightKg).toBe(1.25);
    expect(scaleQuantity(label!, 20)).toBe(1.25);
    expect(findScaleProduct([{ sku: "123", barcode: null }], label!)).toEqual({ sku: "123", barcode: null });
  });

  it("recusa código inválido", () => {
    expect(parseScaleBarcode("7891234567895")).toBeNull();
    expect(parseScaleBarcode("123")).toBeNull();
  });

  it("calcula o total da linha por peso", () => {
    expect(weightLineTotal(1.235, 39.9)).toBe(49.28);
  });
});

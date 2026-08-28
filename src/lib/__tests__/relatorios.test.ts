import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/relatorios";

describe("toCsv", () => {
  it("retorna vazio sem linhas", () => {
    expect(toCsv([])).toBe("");
  });

  it("gera cabeçalho e linhas separadas por ponto e vírgula", () => {
    const csv = toCsv([{ item: "Pizza", total: "10,00" }]);
    expect(csv).toContain("item;total");
    expect(csv).toContain("Pizza;10,00");
  });

  it("escapa valores com separador ou aspas", () => {
    const csv = toCsv([{ item: 'Combo "A"; grande', total: 1 }]);
    expect(csv).toContain('"Combo ""A""; grande"');
  });
});

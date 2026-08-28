import { describe, expect, it } from "vitest";

import {
  buildDayLoad,
  checklistProgress,
  delayRisk,
  teamByDay,
  checkCutoff,
  checkDayCapacity,
  depositSplit,
  parseCustomFieldsText,
  quoteIsOpen,
  quoteTotals,
  validateCustomization,
} from "@/lib/encomendas";

describe("sinal e saldo", () => {
  it("divide metade do total por padrão", () => {
    const split = depositSplit(200);
    expect(split.deposit).toBe(100);
    expect(split.balance).toBe(100);
  });

  it("respeita outros percentuais", () => {
    expect(depositSplit(150, 30).deposit).toBe(45);
  });
});

describe("orçamento", () => {
  it("soma itens, desconto e entrega", () => {
    const totals = quoteTotals(
      [
        { name: "Bolo", quantity: 2, unitPrice: 100 },
        { name: "Doces", quantity: 100, unitPrice: 1.5 },
      ],
      { discount: 50, deliveryFee: 20, depositPercent: 50 },
    );
    expect(totals.subtotal).toBe(350);
    expect(totals.total).toBe(320);
    expect(totals.deposit).toBe(160);
    expect(totals.balance).toBe(160);
  });

  it("só aceita resposta enquanto está enviado e dentro da validade", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    expect(quoteIsOpen("sent", "2026-01-12T12:00:00Z", now)).toBe(true);
    expect(quoteIsOpen("sent", "2026-01-01T12:00:00Z", now)).toBe(false);
    expect(quoteIsOpen("approved", null, now)).toBe(false);
  });
});

describe("data de corte e capacidade por dia", () => {
  const now = new Date("2026-01-10T12:00:00Z");

  it("recusa encomenda dentro do prazo de corte", () => {
    expect(checkCutoff(new Date("2026-01-11T12:00:00Z"), 3, now).ok).toBe(false);
    expect(checkCutoff(new Date("2026-01-20T12:00:00Z"), 3, now).ok).toBe(true);
  });

  it("bloqueia o dia lotado", () => {
    const load = buildDayLoad([
      { scheduled_for: "2026-01-20T10:00:00", items: 4 },
      { scheduled_for: "2026-01-20T15:00:00", items: 2 },
    ]);
    expect(checkDayCapacity(new Date("2026-01-20T18:00:00"), 1, load, 2, 0).ok).toBe(false);
    expect(checkDayCapacity(new Date("2026-01-20T18:00:00"), 1, load, 5, 0).ok).toBe(true);
    expect(checkDayCapacity(new Date("2026-01-20T18:00:00"), 5, load, 0, 8).ok).toBe(false);
  });
});

describe("personalização obrigatória", () => {
  const fields = parseCustomFieldsText(
    "Texto do bolo | text | obrigatorio\nTema | select | obrigatorio | Futebol; Princesas",
  );

  it("lê os campos configurados", () => {
    expect(fields).toHaveLength(2);
    expect(fields[1]?.options).toEqual(["Futebol", "Princesas"]);
  });

  it("cobra os campos obrigatórios e valida a lista", () => {
    expect(validateCustomization(fields, {}).errors).toHaveLength(2);
    const wrong = validateCustomization(fields, { texto_do_bolo: "Parabéns", tema: "Carros" });
    expect(wrong.ok).toBe(false);
    const right = validateCustomization(fields, { texto_do_bolo: "Parabéns", tema: "Futebol" });
    expect(right.ok).toBe(true);
  });
});

describe("acompanhamento da produção", () => {
  it("resume o andamento da ficha", () => {
    expect(checklistProgress([]).status).toBe("sem_ficha");
    expect(checklistProgress([{ done: false }, { done: true }]).percent).toBe(50);
    expect(checklistProgress([{ done: true }]).status).toBe("concluida");
  });

  it("agrupa a equipe por dia sem repetir nomes", () => {
    const days = teamByDay([
      { work_date: "2026-02-01", member_name: "Ana" },
      { work_date: "2026-02-01", member_name: "Ana" },
      { work_date: "2026-02-02", member_name: "Bia" },
      { work_date: null, member_name: "Caio" },
    ]);
    expect(days).toEqual([
      { day: "2026-02-01", people: ["Ana"] },
      { day: "2026-02-02", people: ["Bia"] },
    ]);
  });
});

describe("risco de atraso", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("alerta quando faltam etapas perto da entrega", () => {
    const risk = delayRisk("2026-03-10T20:00:00Z", { done: 1, total: 4 }, now);
    expect(risk.atRisk).toBe(true);
    expect(risk.message).toContain("3 etapa");
  });

  it("não alerta com ficha concluída ou entrega distante", () => {
    expect(delayRisk("2026-03-10T20:00:00Z", { done: 4, total: 4 }, now).atRisk).toBe(false);
    expect(delayRisk("2026-03-20T20:00:00Z", { done: 0, total: 4 }, now).atRisk).toBe(false);
    expect(delayRisk(null, { done: 0, total: 4 }, now).atRisk).toBe(false);
  });
});

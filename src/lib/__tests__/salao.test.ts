import { describe, expect, it } from "vitest";

import {
  billTotals,
  buildStationTicket,
  canTransition,
  groupItemsByStation,
  mergeGuests,
  stationForItem,
  templateForStation,
} from "@/lib/salao";

describe("situação da mesa", () => {
  it("permite o caminho normal do atendimento", () => {
    expect(canTransition("free", "occupied")).toBe(true);
    expect(canTransition("occupied", "awaiting_payment")).toBe(true);
    expect(canTransition("awaiting_payment", "free")).toBe(true);
  });

  it("bloqueia saltos inválidos", () => {
    expect(canTransition("free", "awaiting_payment")).toBe(false);
    expect(canTransition("maintenance", "occupied")).toBe(false);
  });
});

describe("roteamento por setor", () => {
  it("usa o setor do item e cai na cozinha quando não houver", () => {
    expect(stationForItem("bar")).toBe("bar");
    expect(stationForItem("Confeitaria")).toBe("confeitaria");
    expect(stationForItem(null)).toBe("cozinha");
    expect(stationForItem("inexistente")).toBe("cozinha");
  });

  it("liga cada setor ao seu template de impressão", () => {
    expect(templateForStation("bar")).toBe("bar");
    expect(templateForStation("expedicao")).toBe("delivery");
    expect(templateForStation("caixa")).toBe("cashier");
  });

  it("agrupa os itens do pedido por setor", () => {
    const groups = groupItemsByStation([
      { product_name: "Burger", quantity: 1, prep_station: "cozinha" },
      { product_name: "Chopp", quantity: 2, prep_station: "bar" },
      { product_name: "Batata", quantity: 1, prep_station: null },
    ]);
    const cozinha = groups.find((group) => group.station === "cozinha");
    const bar = groups.find((group) => group.station === "bar");
    expect(cozinha?.items).toHaveLength(2);
    expect(bar?.items).toHaveLength(1);
  });

  it("monta o cupom do setor com mesa, comanda e observações", () => {
    const ticket = buildStationTicket({
      station: "bar",
      storeName: "Cantinho",
      orderCode: "AB12",
      tableLabel: "Mesa 4",
      sessionCode: "C123",
      items: [{ product_name: "Chopp", quantity: 2, prep_station: "bar", notes: "sem colarinho" }],
    });
    expect(ticket).toContain("*** BAR ***");
    expect(ticket).toContain("Mesa 4");
    expect(ticket).toContain("Comanda C123");
    expect(ticket).toContain("2x Chopp");
    expect(ticket).toContain("sem colarinho");
  });
});

describe("conta da comanda", () => {
  const items = [
    { id: "1", name: "Burger", quantity: 2, unitPrice: 30 },
    { id: "2", name: "Chopp", quantity: 4, unitPrice: 10 },
  ];

  it("soma itens, desconto e taxa de serviço", () => {
    const totals = billTotals(items, { discount: 10, serviceFeePercent: 10, guests: 2 });
    expect(totals.subtotal).toBe(100);
    expect(totals.serviceFee).toBeCloseTo(9);
    expect(totals.total).toBeCloseTo(99);
    expect(totals.perGuest).toBeCloseTo(49.5);
  });

  it("não deixa o desconto ultrapassar o subtotal", () => {
    const totals = billTotals(items, { discount: 500 });
    expect(totals.discount).toBe(100);
    expect(totals.total).toBe(0);
  });

  it("junta o número de pessoas ao unir comandas", () => {
    expect(mergeGuests(2, 3)).toBe(5);
    expect(mergeGuests(0, 0)).toBe(2);
  });
});

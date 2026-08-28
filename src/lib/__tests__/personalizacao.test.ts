import { describe, expect, it } from "vitest";

import {
  contrastLevel,
  defaultSections,
  formatFooterPhone,
  isSectionVisibleNow,
  isValidFooterPhone,
  paletteFromPrimary,
  parseThemeConfig,
  readableTextOn,
  resolvedFooterConfig,
  themeCssVars,
  visibleSections,
} from "@/lib/store-theme";

describe("tema da loja", () => {
  it("gera paleta a partir da cor principal", () => {
    const palette = paletteFromPrimary("#1f7a3f");
    expect(palette.primary).toBe("#1f7a3f");
    expect(palette.secondary).not.toBe(palette.primary);
  });

  it("escolhe texto legível sobre o fundo", () => {
    expect(readableTextOn("#111111")).toBe("#ffffff");
    expect(readableTextOn("#ffffff")).toBe("#111111");
  });

  it("aponta contraste ruim", () => {
    expect(contrastLevel("#cccccc", "#ffffff")).toBe("ruim");
    expect(contrastLevel("#111111", "#ffffff")).toBe("bom");
  });

  it("preenche campos ausentes ao ler o banco", () => {
    const config = parseThemeConfig({ colors: { primary: "#000000" } });
    expect(config.colors.primary).toBe("#000000");
    expect(config.layout.cardStyle).toBeDefined();
    expect(config.display.showRepeatOrder).toBe(true);
  });

  it("converte o tema em variáveis CSS", () => {
    const vars = themeCssVars(parseThemeConfig({}));
    expect(vars["--primary"]).toMatch(/^#/);
    expect(vars["--store-font"]).toContain("Sora");
  });
});

describe("blocos da vitrine", () => {
  it("cria os blocos padrão com o cabeçalho sempre visível", () => {
    const sections = defaultSections();
    const header = sections.find((section) => section.block_key === "header");
    expect(header?.is_visible).toBe(true);
  });

  it("respeita a regra de dia da semana", () => {
    const monday = new Date("2026-01-05T12:00:00");
    expect(isSectionVisibleNow({ is_visible: true, schedule_rule: { days: [1] } }, monday)).toBe(true);
    expect(isSectionVisibleNow({ is_visible: true, schedule_rule: { days: [0] } }, monday)).toBe(false);
  });

  it("respeita faixa de horário e período de campanha", () => {
    const noon = new Date("2026-01-05T12:00:00");
    expect(
      isSectionVisibleNow({ is_visible: true, schedule_rule: { startTime: "18:00", endTime: "23:00" } }, noon),
    ).toBe(false);
    expect(
      isSectionVisibleNow({ is_visible: true, schedule_rule: { startDate: "2026-02-01" } }, noon),
    ).toBe(false);
  });

  it("ordena apenas os blocos visíveis agora", () => {
    const list = visibleSections(
      [
        { block_key: "b", sort_order: 2, is_visible: true, schedule_rule: {} },
        { block_key: "a", sort_order: 1, is_visible: true, schedule_rule: {} },
        { block_key: "c", sort_order: 0, is_visible: false, schedule_rule: {} },
      ],
      new Date("2026-01-05T12:00:00"),
    );
    expect(list.map((item) => item.block_key)).toEqual(["a", "b"]);
  });
});

describe("rodapé da loja", () => {
  it("formata telefone brasileiro no rodapé", () => {
    expect(formatFooterPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatFooterPhone("1134567890")).toBe("(11) 3456-7890");
    expect(formatFooterPhone("")).toBe(null);
  });

  it("valida telefone do rodapé", () => {
    expect(isValidFooterPhone("(11) 98765-4321")).toBe(true);
    expect(isValidFooterPhone("123")).toBe(false);
    expect(isValidFooterPhone(null)).toBe(true);
  });

  it("preenche rodapé vazio com dados da loja", () => {
    const store = {
      name: "Cantinho da Praça",
      phone: "11987654321",
      address_street: "Rua das Flores",
      address_number: "42",
      address_district: "Centro",
      address_city: "São Paulo",
      address_state: "SP",
      address_zip: "01000000",
    };
    const footer = resolvedFooterConfig(
      { name: null, phone: null, address: null, note: null, background: "#f59e0b", text: "#ffffff" },
      store,
    );
    expect(footer.name).toBe("Cantinho da Praça");
    expect(footer.phone).toBe("(11) 98765-4321");
    expect(footer.address).toBe("Rua das Flores, 42 — Centro, São Paulo/SP, 01000-000");
  });

  it("formata CEP no endereço de fallback", () => {
    const footer = resolvedFooterConfig(
      { name: null, phone: null, address: null, note: null, background: "#f59e0b", text: "#ffffff" },
      { name: "Loja", address_zip: "78000000" },
    );
    expect(footer.address).toBe("78000-000");
  });

  it("mantém valores personalizados quando preenchidos", () => {
    const footer = resolvedFooterConfig(
      { name: "Meu Nome", phone: "11999998888", address: "Av. Paulista, 1", note: "Obrigado!", background: "#000", text: "#fff" },
      { name: "Loja", phone: "11888887777" },
    );
    expect(footer.name).toBe("Meu Nome");
    expect(footer.phone).toBe("(11) 99999-8888");
    expect(footer.address).toBe("Av. Paulista, 1");
    expect(footer.note).toBe("Obrigado!");
  });
});

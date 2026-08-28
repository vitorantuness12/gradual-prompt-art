import { describe, expect, it } from "vitest";

import {
  affiliateCommission,
  affiliateLink,
  bumpPrice,
  deliveryAccess,
  expiryFrom,
  nextChargeDate,
  offerConversionRate,
  parseTracking,
  serviceTax,
  statusAfterCharge,
} from "@/lib/digitais";

const base = { expires_at: null, revoked_at: null, download_count: 0, max_downloads: 3 };

describe("entrega digital protegida", () => {
  it("libera dentro da validade e do limite", () => {
    expect(deliveryAccess(base).allowed).toBe(true);
    expect(deliveryAccess(base).remaining).toBe(3);
  });

  it("bloqueia link expirado, revogado e sem downloads", () => {
    expect(deliveryAccess({ ...base, expires_at: "2020-01-01T00:00:00Z" }).reason).toBe("expired");
    expect(deliveryAccess({ ...base, revoked_at: "2026-01-01T00:00:00Z" }).reason).toBe("revoked");
    expect(deliveryAccess({ ...base, download_count: 3 }).reason).toBe("limit");
  });

  it("calcula a validade a partir da liberação", () => {
    const iso = expiryFrom(7, new Date("2026-01-01T00:00:00Z"));
    expect(iso.startsWith("2026-01-08")).toBe(true);
  });
});

describe("assinatura recorrente", () => {
  it("avança o ciclo conforme o período", () => {
    const from = new Date("2026-01-31T12:00:00Z");
    expect(nextChargeDate("week", from).startsWith("2026-02-07")).toBe(true);
    expect(nextChargeDate("year", from).startsWith("2027-01-31")).toBe(true);
  });

  it("marca inadimplência e cancela após três falhas", () => {
    expect(statusAfterCharge(true, 2)).toEqual({ status: "active", failed_attempts: 0 });
    expect(statusAfterCharge(false, 0).status).toBe("past_due");
    expect(statusAfterCharge(false, 2).status).toBe("canceled");
  });
});

describe("order bump, afiliados e nota", () => {
  it("aplica o desconto da oferta", () => {
    expect(bumpPrice(100, 20)).toBe(80);
    expect(offerConversionRate(200, 20)).toBe(10);
  });

  it("lê afiliado e UTMs do link", () => {
    const tracking = parseTracking("?ref=joao&utm_source=instagram&utm_campaign=lancamento");
    expect(tracking.affiliate_code).toBe("joao");
    expect(tracking.utm_source).toBe("instagram");
    expect(tracking.utm_medium).toBeNull();
  });

  it("gera o link e a comissão do afiliado", () => {
    const link = affiliateLink("https://app.local", "minha-loja", "joao", "lancamento");
    expect(link).toContain("/loja/minha-loja?ref=joao");
    expect(link).toContain("utm_campaign=lancamento");
    expect(affiliateCommission(250, 10)).toBe(25);
  });

  it("calcula o imposto da nota de serviço", () => {
    expect(serviceTax(200, 5)).toBe(10);
  });
});

describe("reembolsos e funil", () => {
  it("revoga acesso em chargeback e reembolso total", async () => {
    const { shouldRevokeAccess } = await import("@/lib/digitais");
    expect(shouldRevokeAccess("chargeback", 10, 100)).toBe(true);
    expect(shouldRevokeAccess("refund", 100, 100)).toBe(true);
    expect(shouldRevokeAccess("refund", 30, 100)).toBe(false);
  });

  it("agrupa o funil por origem", async () => {
    const { buildFunnel } = await import("@/lib/digitais");
    const rows = buildFunnel([
      { kind: "view", amount: 0, affiliate_code: "joao", utm_source: null, utm_campaign: null, coupon_code: null },
      { kind: "view", amount: 0, affiliate_code: "joao", utm_source: null, utm_campaign: null, coupon_code: null },
      { kind: "bump_view", amount: 0, affiliate_code: "joao", utm_source: null, utm_campaign: null, coupon_code: null },
      { kind: "bump_accept", amount: 0, affiliate_code: "joao", utm_source: null, utm_campaign: null, coupon_code: null },
      { kind: "purchase", amount: 200, affiliate_code: "joao", utm_source: null, utm_campaign: null, coupon_code: null },
      { kind: "view", amount: 0, affiliate_code: null, utm_source: null, utm_campaign: null, coupon_code: null },
    ]);
    const afiliado = rows.find((row) => row.origin === "afiliado: joao")!;
    expect(afiliado.visits).toBe(2);
    expect(afiliado.conversion).toBe(50);
    expect(afiliado.bumpRate).toBe(100);
    expect(afiliado.ticket).toBe(200);
    expect(rows.some((row) => row.origin === "direto")).toBe(true);
  });

  it("converte assinaturas em receita mensal equivalente", async () => {
    const { monthlyEquivalent } = await import("@/lib/digitais");
    expect(monthlyEquivalent(1200, "year")).toBe(100);
    expect(monthlyEquivalent(30, "week")).toBe(120);
    expect(monthlyEquivalent(90, "month")).toBe(90);
  });
});

describe("modelos de mensagem", () => {
  it("substitui as variáveis do modelo", async () => {
    const { renderDigitalTemplate } = await import("@/lib/digitais-templates");
    const text = renderDigitalTemplate("Oi {{cliente}}, baixe {{produto}} em {{link}} (validade {{validade}})", {
      cliente: "Ana",
      produto: "Curso",
      link: "https://x/y",
      validade: "10/09",
    });
    expect(text).toBe("Oi Ana, baixe Curso em https://x/y (validade 10/09)");
  });

  it("remove sobras quando a variável está vazia", async () => {
    const { renderDigitalTemplate } = await import("@/lib/digitais-templates");
    expect(renderDigitalTemplate("A\n\n{{proximos_passos}}\n\nB", {})).toBe("A\n\nB");
  });

  it("tem modelo padrão de e-mail e WhatsApp para cada momento", async () => {
    const { DIGITAL_EVENT_LABEL, defaultTemplate, templateKey } = await import("@/lib/digitais-templates");
    for (const event of Object.keys(DIGITAL_EVENT_LABEL) as (keyof typeof DIGITAL_EVENT_LABEL)[]) {
      expect(defaultTemplate(event, "email").body.length).toBeGreaterThan(10);
      expect(defaultTemplate(event, "whatsapp").body.length).toBeGreaterThan(10);
    }
    expect(templateKey("entrega_digital", "whatsapp")).toBe("digital:whatsapp:entrega_digital");
  });
});

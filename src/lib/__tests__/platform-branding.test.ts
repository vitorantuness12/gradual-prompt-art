import { describe, expect, it } from "vitest";

import { resolvePlatformLogo, type PlatformBranding } from "@/lib/platform-branding";

const branding: PlatformBranding = {
  salesLogoLightUrl: "https://assets.test/vendas-claro.webp",
  salesLogoDarkUrl: "https://assets.test/vendas-escuro.webp",
  merchantLogoLightUrl: "https://assets.test/lojista-claro.webp",
  merchantLogoDarkUrl: null,
  updatedAt: null,
};

describe("resolvePlatformLogo", () => {
  it("separa a marca de vendas da marca do lojista", () => {
    expect(resolvePlatformLogo(branding, "sales", "dark")).toBe("https://assets.test/vendas-escuro.webp");
    expect(resolvePlatformLogo(branding, "merchant", "light")).toBe("https://assets.test/lojista-claro.webp");
  });

  it("usa a outra versão quando o tema ainda não possui logo", () => {
    expect(resolvePlatformLogo(branding, "merchant", "dark")).toBe("https://assets.test/lojista-claro.webp");
  });

  it("mantém a logo padrão fora dos contextos configuráveis", () => {
    expect(resolvePlatformLogo(branding, "platform", "light")).toBeNull();
  });
});
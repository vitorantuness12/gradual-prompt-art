import { expect, test } from "vitest";
import { resolvePlatformLogo, type PlatformBranding } from "../platform-branding";

const mockBranding: PlatformBranding = {
  salesLogoLightUrl: "https://assets.test/sales-light.webp",
  salesLogoDarkUrl: "https://assets.test/sales-dark.webp",
  merchantLogoLightUrl: "https://assets.test/merchant-light.webp",
  merchantLogoDarkUrl: "https://assets.test/merchant-dark.webp",
  faviconUrl: "https://assets.test/favicon.webp",
  appCoverUrl: "https://assets.test/cover.webp",
  pwaIconUrl: "https://assets.test/app.webp",
  pwaMaskableIconUrl: "https://assets.test/maskable.webp",
  updatedAt: new Date().toISOString(),
};

test("resolvePlatformLogo escolhe a logo correta baseada no contexto e tema", () => {
  expect(resolvePlatformLogo(mockBranding, "sales", "light")).toBe(mockBranding.salesLogoLightUrl);
  expect(resolvePlatformLogo(mockBranding, "sales", "dark")).toBe(mockBranding.salesLogoDarkUrl);
  expect(resolvePlatformLogo(mockBranding, "merchant", "light")).toBe(mockBranding.merchantLogoLightUrl);
  expect(resolvePlatformLogo(mockBranding, "merchant", "dark")).toBe(mockBranding.merchantLogoDarkUrl);
});

test("resolvePlatformLogo usa fallback se o tema específico não existir", () => {
  const incomplete = { ...mockBranding, salesLogoDarkUrl: null };
  expect(resolvePlatformLogo(incomplete, "sales", "dark")).toBe(mockBranding.salesLogoLightUrl);
});

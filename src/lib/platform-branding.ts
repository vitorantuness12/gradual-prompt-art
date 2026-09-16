import { supabase } from "@/integrations/supabase/client";

export type PlatformLogoSlot =
  | "sales_logo_light_url"
  | "sales_logo_dark_url"
  | "merchant_logo_light_url"
  | "merchant_logo_dark_url";

export interface PlatformBranding {
  salesLogoLightUrl: string | null;
  salesLogoDarkUrl: string | null;
  merchantLogoLightUrl: string | null;
  merchantLogoDarkUrl: string | null;
  updatedAt: string | null;
}

export const EMPTY_PLATFORM_BRANDING: PlatformBranding = {
  salesLogoLightUrl: null,
  salesLogoDarkUrl: null,
  merchantLogoLightUrl: null,
  merchantLogoDarkUrl: null,
  updatedAt: null,
};

export const platformBrandingQueryKey = ["platform-branding"] as const;

export function resolvePlatformLogo(
  branding: PlatformBranding | undefined,
  context: "sales" | "merchant" | "platform",
  theme: "light" | "dark",
): string | null {
  if (!branding || context === "platform") return null;
  const light = context === "merchant" ? branding.merchantLogoLightUrl : branding.salesLogoLightUrl;
  const dark = context === "merchant" ? branding.merchantLogoDarkUrl : branding.salesLogoDarkUrl;
  return theme === "dark" ? dark ?? light : light ?? dark;
}

export async function fetchPlatformBranding(): Promise<PlatformBranding> {
  const { data, error } = await supabase
    .from("platform_branding")
    .select("sales_logo_light_url, sales_logo_dark_url, merchant_logo_light_url, merchant_logo_dark_url, updated_at")
    .eq("key", "default")
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar a identidade visual.");
  if (!data) return EMPTY_PLATFORM_BRANDING;
  return {
    salesLogoLightUrl: data.sales_logo_light_url,
    salesLogoDarkUrl: data.sales_logo_dark_url,
    merchantLogoLightUrl: data.merchant_logo_light_url,
    merchantLogoDarkUrl: data.merchant_logo_dark_url,
    updatedAt: data.updated_at,
  };
}
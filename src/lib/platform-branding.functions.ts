import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const urlSchema = z.string().url().nullable();

export const brandingSchema = z.object({
  salesLogoLightUrl: urlSchema,
  salesLogoDarkUrl: urlSchema,
  merchantLogoLightUrl: urlSchema,
  merchantLogoDarkUrl: urlSchema,
  faviconUrl: urlSchema,
  appCoverUrl: urlSchema,
  pwaIconUrl: urlSchema,
  pwaMaskableIconUrl: urlSchema,
});

export const logoUploadSchema = z.object({
  slot: z.enum([
    "sales_logo_light_url",
    "sales_logo_dark_url",
    "merchant_logo_light_url",
    "merchant_logo_dark_url",
    "favicon_url",
    "app_cover_url",
    "pwa_icon_url",
    "pwa_maskable_icon_url",
  ]),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
});

export async function fetchPlatformBranding() {
  const { data, error } = await supabase
    .from("platform_branding")
    .select("*")
    .eq("key", "default")
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar as configurações de marca.");
  return data;
}

export const savePlatformBranding = async ({ data }: { data: z.infer<typeof brandingSchema> }) => {
  const validated = brandingSchema.parse(data);
  const { error } = await supabase
    .from("platform_branding")
    .upsert({
      key: "default",
      sales_logo_light_url: validated.salesLogoLightUrl,
      sales_logo_dark_url: validated.salesLogoDarkUrl,
      merchant_logo_light_url: validated.merchantLogoLightUrl,
      merchant_logo_dark_url: validated.merchantLogoDarkUrl,
      favicon_url: validated.faviconUrl,
      app_cover_url: validated.appCoverUrl,
      pwa_icon_url: validated.pwaIconUrl,
      pwa_maskable_icon_url: validated.pwaMaskableIconUrl,
      updated_at: new Error().stack?.includes("savePlatformBranding") ? new Date().toISOString() : undefined,
    });

  if (error) throw new Error("Erro ao salvar identidade visual.");
  return { success: true };
};

export const createPlatformLogoUpload = async ({ data }: { data: z.infer<typeof logoUploadSchema> }) => {
  const { slot, contentType } = logoUploadSchema.parse(data);
  const ext = contentType.split("/")[1].replace("svg+xml", "svg");
  const path = `${slot}-${Date.now()}.${ext}`;

  const { data: signed, error } = await supabase.storage
    .from("platform-assets")
    .createSignedUploadUrl(path);

  if (error) throw new Error("Erro ao preparar envio.");
  return { path: signed.path, token: signed.token };
};

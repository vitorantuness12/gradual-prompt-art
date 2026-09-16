import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const slotSchema = z.enum([
  "sales_logo_light_url",
  "sales_logo_dark_url",
  "merchant_logo_light_url",
  "merchant_logo_dark_url",
  "favicon_url",
  "app_cover_url",
  "pwa_icon_url",
  "pwa_maskable_icon_url",
  "pwa_splash_url",
]);

const urlSchema = z.string().url().max(2200).nullable();

async function requireSuperAdmin(context: {
  supabase: { rpc: (name: string, args: unknown) => Promise<{ data: unknown }> };
  userId: string;
}) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (data !== true) throw new Error("Acesso restrito à administração da plataforma.");
}

export const createPlatformLogoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ slot: slotSchema, contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const extension = data.contentType === "image/svg+xml" ? "svg" : data.contentType.split("/")[1];
    const path = `${data.slot}-${crypto.randomUUID()}.${extension}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("platform-assets")
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !signed) throw new Error("Não foi possível preparar o envio da logo.");
    return { path, token: signed.token };
  });

export const savePlatformBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      salesLogoLightUrl: urlSchema,
      salesLogoDarkUrl: urlSchema,
      merchantLogoLightUrl: urlSchema,
      merchantLogoDarkUrl: urlSchema,
      faviconUrl: urlSchema,
      appCoverUrl: urlSchema,
      pwaIconUrl: urlSchema,
      pwaMaskableIconUrl: urlSchema,
      pwaSplashUrl: urlSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("platform_branding").upsert({
      key: "default",
      sales_logo_light_url: data.salesLogoLightUrl,
      sales_logo_dark_url: data.salesLogoDarkUrl,
      merchant_logo_light_url: data.merchantLogoLightUrl,
      merchant_logo_dark_url: data.merchantLogoDarkUrl,
      favicon_url: data.faviconUrl,
      app_cover_url: data.appCoverUrl,
      pwa_icon_url: data.pwaIconUrl,
      pwa_maskable_icon_url: data.pwaMaskableIconUrl,
      pwa_splash_url: data.pwaSplashUrl,
      updated_by: context.userId,
    });
    if (error) throw new Error("Não foi possível salvar a identidade visual.");
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "platform.branding_updated",
      entity: "platform_branding",
      metadata: { changed_fields: Object.keys(data) },
    });
    return { ok: true };
  });
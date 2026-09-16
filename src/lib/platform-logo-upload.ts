import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-upload";
import type { PlatformLogoSlot } from "@/lib/platform-branding";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function uploadPlatformLogo(
  file: File,
  slot: PlatformLogoSlot,
  prepare: (input: { data: { slot: PlatformLogoSlot; contentType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" } }) => Promise<{ path: string; token: string }>,
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Use uma imagem PNG, JPG, WebP ou SVG.");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");

  const isSvg = file.type === "image/svg+xml";
  const dimensions = slot === "favicon_url"
    ? { maxWidth: 512, maxHeight: 512 }
    : slot === "app_cover_url"
      ? { maxWidth: 1920, maxHeight: 1080 }
      : { maxWidth: 1600, maxHeight: 800 };
  const body = isSvg ? file : await compressImage(file, { ...dimensions, quality: 0.9 });
  const contentType = (isSvg ? file.type : "image/webp") as "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  const signed = await prepare({ data: { slot, contentType } });
  const { error } = await supabase.storage.from("platform-assets").uploadToSignedUrl(signed.path, signed.token, body, { contentType });
  if (error) throw new Error("Não foi possível enviar a logo. Tente novamente.");
  const { data, error: urlError } = await supabase.storage.from("platform-assets").createSignedUrl(signed.path, 60 * 60 * 24 * 365 * 5);
  if (urlError || !data.signedUrl) throw new Error("A logo foi enviada, mas não foi possível abrir sua prévia.");
  return data.signedUrl;
}
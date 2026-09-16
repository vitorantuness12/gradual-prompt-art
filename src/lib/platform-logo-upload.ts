import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-upload";
import type { PlatformLogoSlot } from "@/lib/platform-branding";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Não foi possível ler as dimensões da imagem."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadPlatformLogo(
  file: File,
  slot: PlatformLogoSlot,
  prepare: (input: { data: { slot: PlatformLogoSlot; contentType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" } }) => Promise<{ path: string; token: string }>,
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Use uma imagem PNG, JPG, WebP ou SVG.");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");

  const { width, height } = await readImageDimensions(file);
  if ((slot === "pwa_icon_url" || slot === "pwa_maskable_icon_url") && (width !== height || width < 512)) {
    throw new Error("O ícone do aplicativo deve ser quadrado e ter pelo menos 512 × 512 px.");
  }
  if (slot === "pwa_splash_url" && width >= height) {
    throw new Error("A tela de abertura deve usar uma imagem vertical.");
  }

  const isSvg = file.type === "image/svg+xml";
  const dimensions = slot === "favicon_url" || slot === "pwa_icon_url" || slot === "pwa_maskable_icon_url"
    ? { maxWidth: 512, maxHeight: 512 }
    : slot === "app_cover_url"
      ? { maxWidth: 1920, maxHeight: 1080 }
      : slot === "pwa_splash_url"
        ? { maxWidth: 1080, maxHeight: 1920 }
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
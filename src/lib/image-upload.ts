import { supabase } from "@/integrations/supabase/client";

const BUCKET = "store-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5; // 5 anos

export interface CompressOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
}

/**
 * Redimensiona e comprime a imagem no navegador antes do upload,
 * evitando arquivos grandes na loja pública.
 */
export async function compressImage(file: File, options: CompressOptions): Promise<Blob> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(options.maxWidth / bitmap.width, options.maxHeight / bitmap.height, 1);
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", options.quality ?? 0.82),
  );
  return blob ?? file;
}

export type StoreImageKind = "logo" | "cover" | "product";

const PRESET: Record<StoreImageKind, CompressOptions> = {
  logo: { maxWidth: 512, maxHeight: 512 },
  cover: { maxWidth: 1600, maxHeight: 900 },
  product: { maxWidth: 1200, maxHeight: 1200 },
};

/** Envia a imagem para a pasta da loja e devolve uma URL utilizável na loja pública. */
export async function uploadStoreImage(storeId: string, kind: StoreImageKind, file: File): Promise<string> {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("A imagem deve ter no máximo 8 MB.");
  }

  const blob = await compressImage(file, PRESET[kind]);
  const path = `${storeId}/${kind}-${Date.now()}.webp`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/webp",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error("Não foi possível enviar a imagem. Tente novamente.");

  const { data, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (signError || !data?.signedUrl) throw new Error("Imagem enviada, mas não foi possível gerar o link público.");

  return data.signedUrl;
}

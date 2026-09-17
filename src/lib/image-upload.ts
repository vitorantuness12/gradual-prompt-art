import { supabase } from "@/integrations/supabase/client";

const BUCKET = "store-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5; // 5 anos

export interface CompressOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  /** Gera um arquivo com dimensões exatas e centraliza a imagem sem recortá-la. */
  exactSize?: boolean;
  /** Espaço interno proporcional, útil para ícones adaptáveis do Android. */
  paddingRatio?: number;
}

/**
 * Redimensiona e comprime a imagem no navegador antes do upload,
 * evitando arquivos grandes na loja pública.
 */
export async function compressImage(file: File, options: CompressOptions): Promise<Blob> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const paddingRatio = Math.min(Math.max(options.paddingRatio ?? 0, 0), 0.4);
  const availableWidth = options.maxWidth * (1 - paddingRatio * 2);
  const availableHeight = options.maxHeight * (1 - paddingRatio * 2);
  const ratio = Math.min(availableWidth / bitmap.width, availableHeight / bitmap.height, 1);
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = options.exactSize ? options.maxWidth : width;
  canvas.height = options.exactSize ? options.maxHeight : height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  const offsetX = Math.round((canvas.width - width) / 2);
  const offsetY = Math.round((canvas.height - height) / 2);
  context.drawImage(bitmap, offsetX, offsetY, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", options.quality ?? 0.82),
  );
  return blob ?? file;
}

export type StoreImageKind = "logo" | "cover" | "product" | "pwa-icon" | "pwa-maskable";

const PRESET: Record<StoreImageKind, CompressOptions> = {
  logo: { maxWidth: 512, maxHeight: 512 },
  cover: { maxWidth: 1600, maxHeight: 900 },
  product: { maxWidth: 1200, maxHeight: 1200 },
  "pwa-icon": { maxWidth: 512, maxHeight: 512, quality: 0.82, exactSize: true },
  "pwa-maskable": {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.82,
    exactSize: true,
    paddingRatio: 0.2,
  },
};

/** Envia a imagem para a pasta da loja e devolve uma URL utilizável na loja pública. */
export async function uploadStoreImage(
  storeId: string,
  kind: StoreImageKind,
  file: File,
): Promise<string> {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("A imagem original deve ter no máximo 20 MB.");
  }

  const blob = await compressImage(file, PRESET[kind]);
  const path = `${storeId}/${kind}-${Date.now()}.webp`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/webp",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error("Não foi possível enviar a imagem. Tente novamente.");

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError || !data?.signedUrl)
    throw new Error("Imagem enviada, mas não foi possível gerar o link público.");

  return data.signedUrl;
}

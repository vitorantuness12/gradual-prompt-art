import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadStoreImage, type StoreImageKind } from "@/lib/image-upload";
import { cn } from "@/lib/utils";

export interface ImageUploadFieldProps {
  storeId: string | null;
  kind: StoreImageKind;
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  hint?: string;
}

/** Upload de logo/capa com compressão automática no navegador. */
export function ImageUploadField({ storeId, kind, label, value, onChange, hint }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!storeId) {
      toast.error("Salve os dados da loja antes de enviar imagens.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadStoreImage(storeId, kind, file);
      onChange(url);
      toast.success("Imagem enviada com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40",
            kind === "logo" ? "size-20" : "h-20 w-36",
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="size-full object-cover" loading="lazy" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {uploading ? "Enviando..." : value ? "Trocar imagem" : "Enviar imagem"}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
              Remover
            </Button>
          ) : null}
        </div>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

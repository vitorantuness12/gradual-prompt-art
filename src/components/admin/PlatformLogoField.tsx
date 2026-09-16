import { ImagePlus, Loader2, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import fallbackLogo from "@/assets/pedium-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import type { PlatformLogoSlot } from "@/lib/platform-branding";
import { uploadPlatformLogo } from "@/lib/platform-logo-upload";
import { cn } from "@/lib/utils";

interface PlatformLogoFieldProps {
  title: string;
  description: string;
  slot: PlatformLogoSlot;
  value: string | null;
  darkPreview: boolean;
  previewShape?: "logo" | "square" | "cover";
  fallbackUrl?: string;
  successLabel?: string;
  prepareUpload: Parameters<typeof uploadPlatformLogo>[2];
  onChange: (value: string | null) => void;
}

export function PlatformLogoField(props: PlatformLogoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      props.onChange(await uploadPlatformLogo(file, props.slot, props.prepareUpload));
      toast.success(`${props.successLabel ?? "Imagem"} enviada. Salve para aplicar a alteração.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div className={cn("flex h-36 items-center justify-center bg-background p-4", props.darkPreview && "dark")}>
        <img
          src={props.value ?? props.fallbackUrl ?? fallbackLogo.url}
          alt={`Prévia: ${props.title}`}
          className={cn(
            "max-h-full max-w-full object-contain",
            props.previewShape === "square" && "aspect-square rounded-md",
            props.previewShape === "cover" && "aspect-video w-full rounded-md object-cover",
          )}
        />
      </div>
      <div className="space-y-3 border-t border-border p-4">
        <div>
          <h3 className="font-semibold text-foreground">{props.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" /> : props.value ? <Upload /> : <ImagePlus />}
            {uploading ? "Enviando…" : props.value ? "Trocar" : "Enviar"}
          </Button>
          {props.value ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => props.onChange(null)}>
              <RotateCcw /> Usar padrão
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Sparkles, Wand2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AiCatalogReview, type ReviewItem } from "@/components/catalogo/AiCatalogReview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryRow } from "@/hooks/useCatalog";
import { insertCatalogItems } from "@/lib/catalog-import";
import { catalogPreset } from "@/lib/catalogo-segmento";
import { extractCatalogWithAi } from "@/lib/catalogo-ia.functions";
import type { SegmentGroupId } from "@/lib/painel-segmentos";

interface AiCatalogTabProps {
  storeId: string;
  categories: CategoryRow[];
  productCount: number;
  segment: SegmentGroupId;
  onChanged: () => void;
}

const MAX_IMAGES = 4;

/** Redimensiona a foto no navegador para caber com folga no limite da IA. */
async function toCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function parseMoney(value: string): number {
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Cria o catálogo do ramo de atividade da loja a partir de fotos ou texto, com revisão antes de salvar. */
export function AiCatalogTab({ storeId, categories, productCount, segment, onChanged }: AiCatalogTabProps) {
  const preset = catalogPreset(segment);
  const extract = useServerFn(extractCatalogWithAi);
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);

  async function handleFiles(files: FileList) {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast.error(`Máximo de ${MAX_IMAGES} fotos por leitura.`);
      return;
    }
    try {
      const next = await Promise.all(Array.from(files).slice(0, room).map(toCompressedDataUrl));
      setImages((current) => [...current, ...next]);
    } catch {
      toast.error("Não consegui ler essa imagem.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function runExtraction() {
    setLoading(true);
    try {
      const result = await extract({ data: { storeId, images, text, segment } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setItems(
        result.items.map((item, index) => ({
          key: `${index}-${item.name}`,
          selected: true,
          name: item.name,
          description: item.description ?? "",
          categoryName: item.categoryName ?? "",
          kind: preset.kinds.includes(item.kind) ? item.kind : preset.defaultKind,
          price: item.price ? item.price.toFixed(2).replace(".", ",") : "",
          promoPrice: item.promoPrice ? item.promoPrice.toFixed(2).replace(".", ",") : "",
          unit: item.unit || preset.defaultUnit,
          durationMinutes: item.durationMinutes ? String(item.durationMinutes) : "",
        })),
      );
      toast.success(result.message);
    } catch {
      toast.error("Falha ao ler o material. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSelected() {
    const chosen = items.filter((item) => item.selected && item.name.trim().length >= 2);
    if (chosen.length === 0) {
      toast.error("Selecione ao menos um item válido.");
      return;
    }
    setSaving(true);
    try {
      const created = await insertCatalogItems({
        storeId,
        categories,
        offset: productCount,
        items: chosen.map((item) => {
          const duration = Number(item.durationMinutes.replace(/[^0-9]/g, ""));
          return {
            name: item.name.trim(),
            description: item.description.trim() || null,
            categoryName: item.categoryName.trim() || null,
            kind: item.kind,
            price: parseMoney(item.price),
            promoPrice: item.promoPrice.trim() ? parseMoney(item.promoPrice) : null,
            unit: item.unit || preset.defaultUnit,
            durationMinutes: preset.showDuration && duration > 0 ? duration : null,
          };
        }),
      });
      toast.success(`${created} ${preset.itemNounPlural} adicionados ao catálogo.`);
      setItems([]);
      setImages([]);
      setText("");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar os itens.");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = items.filter((item) => item.selected).length;

  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${preset.allowPhoto ? "md:grid-cols-2" : ""}`}>
        {preset.allowPhoto ? (
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImagePlus className="size-4" aria-hidden="true" /> {preset.photoTitle}
              </CardTitle>
              <CardDescription>{preset.photoHint}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                aria-label={preset.photoTitle}
                onChange={(event) => {
                  if (event.target.files?.length) void handleFiles(event.target.files);
                }}
              />
              <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={loading}>
                <ImagePlus className="mr-2 size-4" aria-hidden="true" /> Tirar ou escolher foto
              </Button>
              {images.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {images.map((image, index) => (
                    <div key={image.slice(-40)} className="relative">
                      <img
                        src={image}
                        alt={`Foto ${index + 1} do material enviado`}
                        className="size-20 rounded-lg border border-border/60 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                        aria-label={`Remover foto ${index + 1}`}
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4" aria-hidden="true" /> {preset.textTitle}
            </CardTitle>
            <CardDescription>{preset.textHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              placeholder={preset.textPlaceholder}
              aria-label={preset.textTitle}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void runExtraction()} disabled={loading}>
          <Sparkles className="mr-2 size-4" aria-hidden="true" />
          {loading ? "Lendo com IA..." : `Gerar ${preset.itemNounPlural} com IA`}
        </Button>
        <p className="text-xs text-muted-foreground">
          Nada é salvo automaticamente: você revisa e edita antes de publicar.
        </p>
      </div>

      {items.length > 0 ? (
        <Card className="border-border/70">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Revisar {preset.itemNounPlural} detectados</CardTitle>
              <CardDescription>
                {selectedCount} de {items.length} selecionados para importar.
              </CardDescription>
            </div>
            <Button onClick={() => void saveSelected()} disabled={saving || selectedCount === 0}>
              {saving ? "Salvando..." : `Adicionar ${selectedCount} ao catálogo`}
            </Button>
          </CardHeader>
          <CardContent>
            <AiCatalogReview
              items={items}
              kinds={preset.kinds}
              showDuration={preset.showDuration}
              onChange={(key, patch) =>
                setItems((current) =>
                  current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
                )
              }
              onRemove={(key) => setItems((current) => current.filter((item) => item.key !== key))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Barcode, Printer, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ProductRow } from "@/hooks/useCatalog";
import { nextInternalEan, printLabels } from "@/lib/etiquetas";
import { formatCurrency } from "@/lib/format";
import {
  deleteVariant,
  generateVariantGrid,
  setProductHasVariants,
  updateVariant,
  variantLabel,
  variantPrice,
  type VariantRow,
} from "@/lib/varejo";

interface VariantsTabProps {
  storeId: string;
  storeName: string;
  products: ProductRow[];
  variants: VariantRow[];
  onChanged: () => void;
}

/** Grade tamanho × cor: cada combinação é um SKU com saldo, custo e etiqueta próprios. */
export function VariantsTab({ storeId, storeName, products, variants, onChanged }: VariantsTabProps) {
  const sellable = useMemo(
    () => products.filter((product) => !product.archived_at),
    [products],
  );
  const [productId, setProductId] = useState<string>(sellable[0]?.id ?? "");
  const [option1Name, setOption1Name] = useState("Tamanho");
  const [option1Values, setOption1Values] = useState("P, M, G");
  const [option2Name, setOption2Name] = useState("Cor");
  const [option2Values, setOption2Values] = useState("");
  const [withBarcode, setWithBarcode] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [copies, setCopies] = useState("1");
  const [busy, setBusy] = useState(false);

  const product = sellable.find((item) => item.id === productId) ?? null;
  const rows = useMemo(
    () => variants.filter((variant) => variant.product_id === productId),
    [variants, productId],
  );

  async function handleGenerate() {
    if (!product) {
      toast.error("Escolha um produto para montar a grade.");
      return;
    }
    setBusy(true);
    try {
      const created = await generateVariantGrid({
        storeId,
        productId: product.id,
        option1Name: option1Name.trim() || "Variação",
        option1Values: option1Values.split(","),
        option2Name: option2Name.trim() || "Variação 2",
        option2Values: option2Values.split(","),
        basePrice: Number(product.price ?? 0),
        skuPrefix: product.sku || product.name.slice(0, 6),
        withBarcode,
        existing: rows,
      });
      if (created === 0) {
        toast.info("Todas as combinações informadas já existem.");
      } else {
        toast.success(`${created} SKU(s) criados na grade.`);
      }
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar a grade.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(variant: VariantRow, values: Parameters<typeof updateVariant>[1]) {
    try {
      await updateVariant(variant.id, values);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    }
  }

  async function handleDelete(variant: VariantRow) {
    if (!window.confirm(`Excluir a variação "${variantLabel(variant)}"?`)) return;
    try {
      await deleteVariant(variant.id);
      if (rows.length <= 1 && product) await setProductHasVariants(product.id, false);
      onChanged();
    } catch {
      toast.error("Esta variação já foi usada em vendas. Desative-a em vez de excluir.");
    }
  }

  function handlePrint() {
    if (!product) return;
    const chosen = rows.filter((variant) => selected.includes(variant.id));
    const list = chosen.length > 0 ? chosen : rows;
    if (list.length === 0) {
      toast.error("Nenhuma variação para imprimir.");
      return;
    }
    const ok = printLabels(
      list.map((variant) => ({
        name: product.name,
        detail: variantLabel(variant),
        price: variantPrice(variant, Number(product.price ?? 0)),
        code: variant.barcode,
        sku: variant.sku,
      })),
      storeName,
      Number(copies) || 1,
    );
    if (!ok) toast.error("Libere as janelas pop-up para imprimir as etiquetas.");
  }

  const totalStock = rows.reduce((sum, variant) => sum + Number(variant.stock_quantity ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Montar grade de variações</CardTitle>
          <CardDescription>
            Combine duas características (ex.: tamanho × cor). Cada combinação vira um SKU com saldo,
            código de barras e etiqueta próprios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Produto</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger aria-label="Produto da grade">
                  <SelectValue placeholder="Escolha o produto" />
                </SelectTrigger>
                <SelectContent>
                  {sellable.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-muted-foreground">
              <Switch checked={withBarcode} onCheckedChange={setWithBarcode} aria-label="Gerar código de barras" />
              Gerar EAN-13 interno para cada SKU
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opt1-name">Característica 1</Label>
              <Input id="opt1-name" value={option1Name} onChange={(event) => setOption1Name(event.target.value)} />
              <Input
                aria-label="Valores da característica 1"
                value={option1Values}
                onChange={(event) => setOption1Values(event.target.value)}
                placeholder="P, M, G, GG"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt2-name">Característica 2 (opcional)</Label>
              <Input id="opt2-name" value={option2Name} onChange={(event) => setOption2Name(event.target.value)} />
              <Input
                aria-label="Valores da característica 2"
                value={option2Values}
                onChange={(event) => setOption2Values(event.target.value)}
                placeholder="Preto, Branco, Azul"
              />
            </div>
          </div>

          <Button onClick={() => void handleGenerate()} disabled={busy || !product}>
            <Wand2 className="mr-2 size-4" aria-hidden="true" /> Gerar grade
          </Button>
        </CardContent>
      </Card>

      {product ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">SKUs de {product.name}</CardTitle>
              <CardDescription>
                {rows.length} variação(ões) · {totalStock} unidade(s) em estoque
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={copies}
                onChange={(event) => setCopies(event.target.value)}
                className="w-20"
                aria-label="Cópias por etiqueta"
              />
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 size-4" aria-hidden="true" /> Etiquetas
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma variação ainda. Monte a grade acima.
              </p>
            ) : (
              rows.map((variant) => {
                const stock = Number(variant.stock_quantity ?? 0);
                const min = Number(variant.min_stock ?? 0);
                return (
                  <div
                    key={variant.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
                  >
                    <Checkbox
                      checked={selected.includes(variant.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked ? [...current, variant.id] : current.filter((id) => id !== variant.id),
                        )
                      }
                      aria-label={`Selecionar ${variantLabel(variant)}`}
                    />
                    <div className="min-w-36 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{variantLabel(variant)}</p>
                        {stock <= 0 ? <Badge variant="destructive">Sem estoque</Badge> : null}
                        {stock > 0 && min > 0 && stock <= min ? (
                          <Badge variant="secondary">Quase esgotando</Badge>
                        ) : null}
                        {!variant.is_active ? <Badge variant="outline">Inativo</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        custo médio {formatCurrency(Number(variant.avg_cost ?? 0))}
                      </p>
                    </div>

                    <Field
                      label="SKU"
                      value={variant.sku ?? ""}
                      className="w-28"
                      onCommit={(value) => void patch(variant, { sku: value || null })}
                    />
                    <Field
                      label="Cód. barras"
                      value={variant.barcode ?? ""}
                      className="w-36"
                      onCommit={(value) => void patch(variant, { barcode: value || null })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Gerar código de barras"
                      onClick={() => void patch(variant, { barcode: nextInternalEan() })}
                    >
                      <Barcode className="size-4" aria-hidden="true" />
                    </Button>
                    <Field
                      label="Preço"
                      value={String(variant.price ?? "")}
                      className="w-24"
                      onCommit={(value) =>
                        void patch(variant, { price: value ? Number(value.replace(",", ".")) : null })
                      }
                    />
                    <Field
                      label="Saldo"
                      value={String(stock)}
                      className="w-20"
                      onCommit={(value) => void patch(variant, { stock_quantity: Number(value.replace(",", ".")) || 0 })}
                    />
                    <Field
                      label="Mín."
                      value={String(min)}
                      className="w-20"
                      onCommit={(value) => void patch(variant, { min_stock: Number(value.replace(",", ".")) || 0 })}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={variant.is_active}
                        aria-label={`Ativar ${variantLabel(variant)}`}
                        onCheckedChange={(checked) => void patch(variant, { is_active: checked })}
                      />
                      Ativo
                    </label>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Excluir ${variantLabel(variant)}`}
                      onClick={() => void handleDelete(variant)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  className,
  onCommit,
}: {
  label: string;
  value: string;
  className?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="text-[11px] text-muted-foreground">
      {label}
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft.trim());
        }}
        className={`h-8 ${className ?? ""}`}
        aria-label={label}
      />
    </label>
  );
}

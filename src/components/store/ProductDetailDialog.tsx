import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { BuilderPicker } from "@/components/store/BuilderPicker";
import type { CartOption } from "@/hooks/useCart";
import { parseBuilder } from "@/lib/montador";
import { currentPrice, hasPromo, productAvailability, PRODUCT_KIND_LABEL } from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import type { OptionGroupRow, OptionRow, ProductRow, RelatedRow, VariantRow } from "@/lib/store-queries";
import { variantLabel, variantPrice } from "@/lib/varejo";

interface ProductDetailDialogProps {
  product: ProductRow | null;
  groups: OptionGroupRow[];
  options: OptionRow[];
  /** SKUs da grade (tamanho × cor) e sugestões de itens relacionados. */
  variants?: VariantRow[];
  related?: RelatedRow[];
  allProducts?: ProductRow[];
  onOpenProduct?: (product: ProductRow) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (payload: {
    product: ProductRow;
    unitPrice: number;
    options: CartOption[];
    notes: string | null;
    variantId?: string | null;
    variantName?: string | null;
  }) => void;
}

/** Detalhe do item na loja pública, com escolha de opções, observações e quantidade. */
export function ProductDetailDialog({
  product,
  groups,
  options,
  variants = [],
  related = [],
  allProducts = [],
  onOpenProduct,
  open,
  onOpenChange,
  onAdd,
}: ProductDetailDialogProps) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState<string | null>(null);

  const productVariants = useMemo(
    () =>
      product
        ? variants.filter(
            (variant) => variant.product_id === product.id && variant.is_active,
          )
        : [],
    [variants, product],
  );

  const relatedProducts = useMemo(() => {
    if (!product) return [];
    const ids = related
      .filter((row) => row.product_id === product.id)
      .map((row) => row.related_product_id);
    return allProducts.filter((item) => ids.includes(item.id));
  }, [related, allProducts, product]);

  const productGroups = useMemo(
    () => (product ? groups.filter((group) => group.product_id === product.id) : []),
    [groups, product],
  );

  const chosen: CartOption[] = useMemo(() => {
    if (!product) return [];
    return productGroups.flatMap((group) =>
      (selected[group.id] ?? [])
        .map((optionId) => options.find((option) => option.id === optionId))
        .filter((option): option is OptionRow => Boolean(option))
        .map((option) => ({
          groupName: group.name,
          optionName: option.name,
          priceDelta: Number(option.price_delta),
        })),
    );
  }, [options, product, productGroups, selected]);

  if (!product) return null;

  const availability = productAvailability(product);
  const builder = parseBuilder(product.builder_config);
  const chosenVariant = productVariants.find((variant) => variant.id === variantId) ?? null;
  const basePrice = chosenVariant
    ? variantPrice(chosenVariant, currentPrice(product))
    : currentPrice(product);
  const unitPrice = basePrice + chosen.reduce((sum, option) => sum + option.priceDelta, 0);
  const needsVariant = productVariants.length > 0 && !chosenVariant;
  const variantOutOfStock = chosenVariant ? Number(chosenVariant.stock_quantity ?? 0) <= 0 : false;
  const missingRequired = productGroups.filter(
    (group) =>
      group.is_required && (selected[group.id]?.length ?? 0) < Math.max(1, group.min_select),
  );
  const limit = product.max_quantity_per_order ?? null;

  function toggle(group: OptionGroupRow, optionId: string, checked: boolean) {
    setSelected((current) => {
      const list = current[group.id] ?? [];
      if (group.max_select <= 1) return { ...current, [group.id]: checked ? [optionId] : [] };
      const next = checked ? [...list, optionId] : list.filter((id) => id !== optionId);
      return { ...current, [group.id]: next.slice(0, group.max_select) };
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {product.name}
            <Badge variant="secondary">{PRODUCT_KIND_LABEL[product.kind]}</Badge>
          </DialogTitle>
          <DialogDescription>
            {product.description || "Escolha as opções e adicione ao carrinho."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm">
            <span className="text-lg font-semibold text-foreground">
              {formatCurrency(currentPrice(product))}
            </span>
            {hasPromo(product) ? (
              <span className="ml-2 text-muted-foreground line-through">
                {formatCurrency(Number(product.price))}
              </span>
            ) : null}
          </p>

          {product.kind === "service" && product.duration_minutes ? (
            <p className="text-sm text-muted-foreground">
              Duração aproximada: {product.duration_minutes} minutos.
            </p>
          ) : null}
          {product.kind === "preorder" ? (
            <p className="text-sm text-muted-foreground">
              Encomenda com prazo mínimo de {product.lead_time_days} dia(s)
              {Number(product.deposit_percent) > 0
                ? ` e sinal de ${Number(product.deposit_percent)}%`
                : ""}
              .
            </p>
          ) : null}
          {product.kind === "subscription" && (product.subscription_benefits ?? []).length > 0 ? (
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {(product.subscription_benefits ?? []).map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          ) : null}
          {product.kind === "digital" ? (
            <p className="text-sm text-muted-foreground">
              O acesso ao arquivo é liberado após a confirmação do pagamento.
            </p>
          ) : null}

          {builder.enabled && builder.sizes.length > 0 ? (
            <BuilderPicker
              config={builder}
              quantity={quantity}
              onConfirm={({ unitPrice: builtPrice, description }) => {
                onAdd({
                  product,
                  unitPrice: builtPrice,
                  options: [{ groupName: builder.label, optionName: description, priceDelta: 0 }],
                  notes: notes.trim() || null,
                });
                onOpenChange(false);
              }}
            />
          ) : null}

          {productVariants.length > 0 ? (
            <fieldset className="space-y-2 rounded-xl border border-border/70 p-3">
              <legend className="px-1 text-sm font-medium text-foreground">
                {productVariants[0]?.option1_name ?? "Variação"}
                {productVariants[0]?.option2_name ? ` / ${productVariants[0].option2_name}` : ""}
                <span className="ml-1 text-destructive">*</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {productVariants.map((variant) => {
                  const soldOut = Number(variant.stock_quantity ?? 0) <= 0;
                  return (
                    <Button
                      key={variant.id}
                      type="button"
                      size="sm"
                      variant={variant.id === variantId ? "default" : "outline"}
                      disabled={soldOut}
                      onClick={() => setVariantId(variant.id)}
                    >
                      {variantLabel(variant)}
                      {soldOut ? " · esgotado" : ""}
                    </Button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {productGroups.map((group) => {
            const groupOptions = options.filter(
              (option) => option.group_id === group.id && option.is_available,
            );
            if (groupOptions.length === 0) return null;
            const single = group.max_select <= 1;
            return (
              <fieldset key={group.id} className="space-y-2 rounded-xl border border-border/70 p-3">
                <legend className="px-1 text-sm font-medium text-foreground">
                  {group.name}
                  {group.is_required ? <span className="ml-1 text-destructive">*</span> : null}
                  {!single ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (até {group.max_select})
                    </span>
                  ) : null}
                </legend>

                {single ? (
                  <RadioGroup
                    value={selected[group.id]?.[0] ?? ""}
                    onValueChange={(value) => toggle(group, value, true)}
                    className="space-y-2"
                  >
                    {groupOptions.map((option) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <RadioGroupItem value={option.id} id={`opt-${option.id}`} />
                        <Label htmlFor={`opt-${option.id}`} className="flex-1 text-sm font-normal">
                          {option.name}
                        </Label>
                        {Number(option.price_delta) !== 0 ? (
                          <span className="text-sm text-muted-foreground">
                            + {formatCurrency(Number(option.price_delta))}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  groupOptions.map((option) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`opt-${option.id}`}
                        checked={(selected[group.id] ?? []).includes(option.id)}
                        onCheckedChange={(checked) => toggle(group, option.id, Boolean(checked))}
                      />
                      <Label htmlFor={`opt-${option.id}`} className="flex-1 text-sm font-normal">
                        {option.name}
                      </Label>
                      {Number(option.price_delta) !== 0 ? (
                        <span className="text-sm text-muted-foreground">
                          + {formatCurrency(Number(option.price_delta))}
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
              </fieldset>
            );
          })}

          {product.allows_notes ? (
            <div className="space-y-2">
              <Label htmlFor="item-notes">Observações</Label>
              <Textarea
                id="item-notes"
                rows={2}
                maxLength={200}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex.: sem cebola, embalar para presente..."
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Diminuir quantidade"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                −
              </Button>
              <span className="w-8 text-center">{quantity}</span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Aumentar quantidade"
                onClick={() =>
                  setQuantity((value) => (limit ? Math.min(limit, value + 1) : value + 1))
                }
              >
                +
              </Button>
            </div>
            <Button
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={
                !availability.available || missingRequired.length > 0 || needsVariant || variantOutOfStock
              }
              onClick={() => {
                for (let index = 0; index < quantity; index += 1) {
                  onAdd({
                    product,
                    unitPrice,
                    options: chosen,
                    notes: notes.trim() || null,
                    variantId: chosenVariant?.id ?? null,
                    variantName: chosenVariant ? variantLabel(chosenVariant) : null,
                  });
                }
                onOpenChange(false);
              }}
            >
              {!availability.available
                ? (availability.reason ?? "Indisponível")
                : needsVariant
                  ? "Escolha uma variação"
                  : `Adicionar · ${formatCurrency(unitPrice * quantity)}`}
            </Button>
          </div>

          {missingRequired.length > 0 ? (
            <p className="text-xs text-destructive">
              Escolha uma opção em: {missingRequired.map((group) => group.name).join(", ")}.
            </p>
          ) : null}
          {limit ? (
            <p className="text-xs text-muted-foreground">Limite de {limit} por pedido.</p>
          ) : null}

          {relatedProducts.length > 0 ? (
            <div className="space-y-2 border-t border-border/70 pt-3">
              <p className="text-sm font-medium text-foreground">Combina com</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {relatedProducts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-28 shrink-0 rounded-xl border border-border/70 p-2 text-left transition-colors hover:bg-secondary"
                    onClick={() => onOpenProduct?.(item)}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        loading="lazy"
                        className="mb-1 h-16 w-full rounded-lg object-cover"
                      />
                    ) : null}
                    <span className="line-clamp-2 text-xs font-medium text-foreground">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatCurrency(currentPrice(item))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

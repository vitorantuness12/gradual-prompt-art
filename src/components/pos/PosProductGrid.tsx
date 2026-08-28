import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import {
  CARD_PADDING,
  DENSITY_GAP,
  POS_QUICK_FILTERS,
  hasPromo,
  isLowStock,
  isNewProduct,
  isOutOfStock,
  productInitials,
  unitPriceOf,
  type PosKdsSettings,
  type PosProductLike,
  type PosQuickFilter,
} from "@/lib/pos-kds";
import { cn } from "@/lib/utils";
import { AlertTriangle, Ban, Minus, PackageX, Plus, RotateCcw, Star } from "lucide-react";

/** Trilha de categorias e filtros rápidos, com rolagem em telas pequenas. */
export function PosCategoryRail({
  categories,
  categoryId,
  onCategory,
  quick,
  onQuick,
}: {
  categories: { id: string; name: string }[];
  categoryId: string;
  onCategory: (id: string) => void;
  quick: PosQuickFilter;
  onQuick: (value: PosQuickFilter) => void;
}) {
  return (
    <div className="space-y-2">
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2" role="group" aria-label="Filtros rápidos">
          {POS_QUICK_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="lg"
              variant={quick === filter.value ? "default" : "outline"}
              className="h-11 shrink-0 rounded-full px-4 font-semibold"
              aria-pressed={quick === filter.value}
              onClick={() => onQuick(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {categories.length > 0 ? (
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2" role="group" aria-label="Categorias">
            <Button
              type="button"
              size="lg"
              variant={categoryId === "all" ? "secondary" : "ghost"}
              className="h-11 shrink-0 border border-border px-4"
              aria-pressed={categoryId === "all"}
              onClick={() => onCategory("all")}
            >
              Todas as categorias
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                type="button"
                size="lg"
                variant={categoryId === category.id ? "secondary" : "ghost"}
                className="h-11 shrink-0 border border-border px-4"
                aria-pressed={categoryId === category.id}
                onClick={() => onCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : null}
    </div>
  );
}

interface PosProductGridProps {
  products: PosProductLike[];
  isLoading: boolean;
  settings: PosKdsSettings;
  bestSellerIds: string[];
  quantities: Record<string, number>;
  onAdd: (product: PosProductLike, quantity: number) => void;
  onOpenDetails: (product: PosProductLike) => void;
  /** Pausa rápida ("acabou o X") sem sair do PDV. */
  onTogglePause?: ((product: PosProductLike, available: boolean) => void) | undefined;
  emptyState: React.ReactNode;
}

/**
 * Cards de produto do PDV: imagem (ou iniciais), preço, estoque, selos e
 * controle de quantidade direto no card.
 */
export function PosProductGrid({
  products,
  isLoading,
  settings,
  bestSellerIds,
  quantities,
  onAdd,
  onOpenDetails,
  onTogglePause,
  emptyState,
}: PosProductGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (products.length === 0) return <>{emptyState}</>;

  const bestSellers = new Set(bestSellerIds);
  const lowStockItems = products.filter((product) => isLowStock(product));

  return (
    <>
      {lowStockItems.length > 0 ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>{lowStockItems.length} item(ns) quase esgotando:</strong>{" "}
            {lowStockItems
              .slice(0, 4)
              .map((product) => `${product.name} (${product.stock_quantity})`)
              .join(", ")}
            {lowStockItems.length > 4 ? " e outros" : ""}. Reponha antes de zerar — ao chegar a zero o item é
            pausado automaticamente.
          </p>
        </div>
      ) : null}
    <ul className={cn("grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4", DENSITY_GAP[settings.density])}>
      {products.map((product) => {
        const out = isOutOfStock(product);
        const price = unitPriceOf(product);
        const quantity = quantities[product.id] ?? 0;
        return (
          <li key={product.id}>
            <div
              className={cn(
                "flex h-full flex-col rounded-2xl border-2 bg-card transition-colors",
                CARD_PADDING[settings.density],
                out ? "border-border/60 opacity-60" : "border-border hover:border-primary",
                quantity > 0 && "border-primary ring-2 ring-primary/25",
              )}
            >
              <button
                type="button"
                className="flex flex-1 flex-col text-left"
                onClick={() => onOpenDetails(product)}
                aria-label={`Detalhes de ${product.name}`}
              >
                {settings.showProductImages ? (
                  <div className="mb-2 aspect-square w-full overflow-hidden rounded-xl bg-secondary">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="size-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-2xl font-bold text-muted-foreground">
                        {productInitials(product.name)}
                      </span>
                    )}
                  </div>
                ) : null}

                <div className="mb-1 flex flex-wrap gap-1">
                  {product.is_available === false ? (
                    <Badge variant="outline" className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-600">
                      <Ban className="size-3" aria-hidden="true" />
                      Pausado
                    </Badge>
                  ) : null}
                  {out ? (
                    <Badge variant="outline" className="gap-1 border-destructive/50 bg-destructive/10 text-destructive">
                      <PackageX className="size-3" aria-hidden="true" />
                      Esgotado
                    </Badge>
                  ) : null}
                  {hasPromo(product) ? (
                    <Badge className="bg-accent text-accent-foreground">Promoção</Badge>
                  ) : null}
                  {bestSellers.has(product.id) ? (
                    <Badge variant="outline" className="border-primary/50 bg-primary/10 text-primary">
                      Mais vendido
                    </Badge>
                  ) : null}
                  {!out && isLowStock(product) ? (
                    <Badge variant="outline" className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-600">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      Quase esgotando
                    </Badge>
                  ) : null}
                  {isNewProduct(product) ? <Badge variant="secondary">Novo</Badge> : null}
                  {product.is_featured ? (
                    <Badge variant="outline" className="gap-1">
                      <Star className="size-3" aria-hidden="true" />
                      Favorito
                    </Badge>
                  ) : null}
                </div>

                <p className="line-clamp-2 text-sm leading-snug font-semibold">{product.name}</p>
                <p className="mt-1 text-base font-bold text-foreground">
                  {formatCurrency(price)}
                  {hasPromo(product) ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">
                      {formatCurrency(Number(product.price))}
                    </span>
                  ) : null}
                </p>
                {product.track_stock ? (
                  <p
                    className={cn(
                      "text-xs",
                      isLowStock(product) ? "font-semibold text-amber-600" : "text-muted-foreground",
                    )}
                  >
                    {product.stock_quantity} em estoque
                    {isLowStock(product) ? ` · mínimo ${product.min_stock}` : ""}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Estoque livre</p>
                )}
              </button>

              {onTogglePause ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 w-full justify-center gap-1 text-xs font-semibold"
                  disabled={product.is_available === false && out}
                  title={
                    product.is_available === false && out
                      ? "Item pausado automaticamente por falta de estoque. Reponha o estoque para voltar a vender."
                      : undefined
                  }
                  onClick={() => onTogglePause(product, product.is_available === false)}
                >
                  {product.is_available === false ? (
                    <>
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      {out ? "Sem estoque" : "Voltar a vender"}
                    </>
                  ) : (
                    <>
                      <Ban className="size-3.5" aria-hidden="true" />
                      Acabou
                    </>
                  )}
                </Button>
              ) : null}


              <div className="mt-2 flex items-center gap-1">
                {quantity > 0 ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10 shrink-0"
                      aria-label={`Diminuir ${product.name}`}
                      onClick={() => onAdd(product, -1)}
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </Button>
                    <span className="flex-1 text-center text-base font-bold tabular-nums">{quantity}</span>
                    <Button
                      size="icon"
                      className="size-10 shrink-0"
                      aria-label={`Aumentar ${product.name}`}
                      disabled={out}
                      onClick={() => onAdd(product, 1)}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="lg"
                    className="h-10 w-full font-semibold"
                    disabled={out}
                    onClick={() => onAdd(product, 1)}
                  >
                    <Plus className="mr-1 size-4" aria-hidden="true" />
                    Adicionar
                  </Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

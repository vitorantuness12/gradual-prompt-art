import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProductRow } from "@/lib/catalog";
import type { HighlightCampaignRow } from "@/lib/entry-popup-queries";
import { displayPrices, type HighlightPick } from "@/lib/destaques";
import { formatCurrency } from "@/lib/format";
import { themeCssVars, type StoreThemeConfig } from "@/lib/store-theme";
import { cn } from "@/lib/utils";

/**
 * Janela "Destaques para você".
 *
 * Layout, textos, cores e produtos vêm da campanha configurada pelo
 * lojista. Cores usam as variáveis do tema da loja, com sobreposição só
 * quando o lojista escolhe uma cor específica.
 */
interface Props {
  campaign: HighlightCampaignRow;
  items: HighlightPick[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (product: ProductRow) => void;
  onOpenDetail: (product: ProductRow) => void;
  onEvent?: (event: "close" | "click" | "add_to_cart") => void;
  preview?: boolean;
  /** Tema da loja: o modal vive em portal, então recebe as cores aqui. */
  theme?: StoreThemeConfig;
}

export function HighlightsPopup({
  campaign,
  items,
  open,
  onOpenChange,
  onAdd,
  onOpenDetail,
  onEvent,
  preview = false,
  theme,
}: Props) {
  if (items.length === 0) return null;

  const layout = campaign.layout;
  const listClass =
    layout === "list"
      ? "grid gap-3"
      : layout === "carousel"
        ? "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
        : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onEvent?.("close");
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[85dvh] w-[calc(100vw-2rem)] overflow-y-auto bg-card text-foreground sm:max-w-3xl"
        style={theme ? { ...themeCssVars(theme), fontFamily: "var(--store-font)" } : undefined}
      >
        <DialogHeader
          className="rounded-[var(--radius)] p-3"
          style={
            campaign.header_color
              ? { background: campaign.header_color, color: campaign.text_color ?? undefined }
              : undefined
          }
        >
          <DialogTitle className="flex items-center gap-2" style={{ color: campaign.text_color ?? undefined }}>
            <Sparkles className="size-5" aria-hidden="true" />
            {campaign.title}
            {preview ? <Badge variant="secondary">Pré-visualização</Badge> : null}
          </DialogTitle>
          <DialogDescription style={{ color: campaign.text_color ?? undefined }}>
            {campaign.subtitle}
          </DialogDescription>
        </DialogHeader>

        <ul className={listClass}>
          {items.map(({ product, badge }) => {
            const prices = displayPrices(product);
            return (
              <li key={product.id} className={layout === "carousel" ? "min-w-[15rem] snap-start" : undefined}>
                <div
                  className={cn(
                    "flex h-full gap-3 rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--store-shadow)]",
                    layout === "list" ? "flex-row items-center" : "flex-col",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onEvent?.("click");
                      onOpenDetail(product);
                    }}
                    className={cn("flex flex-1 gap-3 text-left", layout === "list" ? "items-center" : "flex-col")}
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        className={cn(
                          "shrink-0 rounded-[var(--radius)] object-cover",
                          layout === "list" ? "size-16" : "h-28 w-full",
                        )}
                      />
                    ) : null}
                    <span className="flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{product.name}</span>
                        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
                      </span>
                      {product.description ? (
                        <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                          {product.description}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-sm font-semibold text-foreground">
                        {formatCurrency(prices.price)}
                        {campaign.show_original_price && prices.original !== null ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                            {formatCurrency(prices.original)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                  <Button
                    size="sm"
                    disabled={preview}
                    onClick={() => {
                      onAdd(product);
                      onEvent?.("add_to_cart");
                    }}
                    aria-label={`${campaign.add_button_text} ${product.name}`}
                  >
                    {campaign.add_button_text}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Versão em seção fixa, para quem prefere destaques dentro do catálogo. */
export function HighlightsSection({
  campaign,
  items,
  onAdd,
  onOpenDetail,
}: Pick<Props, "campaign" | "items" | "onAdd" | "onOpenDetail">) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="destaques-secao">
      <h2 id="destaques-secao" className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Sparkles className="size-4 text-accent" aria-hidden="true" /> {campaign.title}
      </h2>
      <p className="text-sm text-muted-foreground">{campaign.subtitle}</p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ product, badge }) => {
          const prices = displayPrices(product);
          return (
            <li key={product.id}>
              <div className="flex h-full flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--store-shadow)]">
                <button type="button" onClick={() => onOpenDetail(product)} className="flex flex-1 flex-col gap-2 text-left">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                      className="h-28 w-full rounded-[var(--radius)] object-cover"
                    />
                  ) : null}
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{product.name}</span>
                    {badge ? <Badge variant="secondary">{badge}</Badge> : null}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(prices.price)}
                    {campaign.show_original_price && prices.original !== null ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                        {formatCurrency(prices.original)}
                      </span>
                    ) : null}
                  </span>
                </button>
                <Button size="sm" onClick={() => onAdd(product)} aria-label={`${campaign.add_button_text} ${product.name}`}>
                  {campaign.add_button_text}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

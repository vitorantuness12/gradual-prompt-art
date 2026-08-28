import { Clock, MapPin, Phone, Search, ShoppingBag, Star } from "lucide-react";

import { StoreThemeProvider } from "@/components/store/StoreThemeProvider";
import { formatCurrency } from "@/lib/format";
import { blockByKey, isSectionVisibleNow, type StoreSectionDraft, type StoreThemeConfig } from "@/lib/store-theme";
import { cn } from "@/lib/utils";

/**
 * Pré-visualização da loja dentro do editor.
 *
 * Mostra o rascunho aplicado a itens reais do catálogo. É apenas visual:
 * nada aqui grava pedidos nem altera o que o cliente vê.
 */
export type PreviewDevice = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

interface PreviewProduct {
  id: string;
  name: string;
  price: number;
  promo_price: number | null;
}

interface Props {
  config: StoreThemeConfig;
  sections: StoreSectionDraft[];
  device: PreviewDevice;
  storeName: string;
  storeSlug: string;
  products: PreviewProduct[];
  categories: { id: string; name: string }[];
}

export function StorePreview({ config, sections, device, storeName, storeSlug, products, categories }: Props) {
  const active = [...sections].filter((section) => isSectionVisibleNow(section)).sort((a, b) => a.sort_order - b.sort_order);
  const items = products.slice(0, 4);
  const cardClass =
    config.layout.cardStyle === "grid"
      ? "grid grid-cols-2 gap-3"
      : config.layout.cardStyle === "compact"
        ? "grid gap-2"
        : "grid gap-3";

  return (
    <div className="flex justify-center overflow-x-auto rounded-xl border border-border bg-muted/40 p-4">
      <div style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}>
        <StoreThemeProvider config={config} className="overflow-hidden rounded-xl border border-border">
          <div className="bg-background text-foreground">
            <header className="border-b border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {config.branding.logoUrl ? (
                    <img src={config.branding.logoUrl} alt="" className="size-8 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-8 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                      {storeName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span
                    className="font-semibold"
                    style={{
                      fontSize: `calc(1rem * var(--store-title-scale))`,
                      fontWeight: Number(config.typography.titleWeight),
                    }}
                  >
                    {storeName}
                  </span>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground">
                  <ShoppingBag className="size-3" aria-hidden="true" /> 0
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-[var(--store-button-radius)] border border-border px-2 py-1.5 text-xs text-muted-foreground">
                <Search className="size-3" aria-hidden="true" /> Buscar no catálogo
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">oseupedido.com.br/{storeSlug}</p>
            </header>

            <div className="p-4" style={{ display: "grid", gap: "var(--store-section-gap)" }}>
              {active.map((section) => {
                const definition = blockByKey(section.block_key);
                if (!definition || section.block_key === "header" || section.block_key === "footer") return null;
                const title = section.title ?? definition.defaultTitle;

                if (section.block_key === "banner") {
                  return (
                    <div
                      key={section.block_key}
                      className="grid h-28 place-items-center rounded-[var(--radius)] bg-secondary text-sm text-muted-foreground"
                      style={
                        section.image_url || config.branding.coverUrl
                          ? {
                              backgroundImage: `url(${section.image_url ?? config.branding.coverUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : undefined
                      }
                    >
                      {section.image_url || config.branding.coverUrl ? "" : "Banner principal"}
                    </div>
                  );
                }

                if (section.block_key === "status") {
                  return (
                    <div key={section.block_key} className="flex flex-wrap gap-2 text-xs">
                      <span
                        className="rounded-full px-2 py-1"
                        style={{ background: config.colors.statusOpen, color: "#fff" }}
                      >
                        Aberto agora
                      </span>
                      <span
                        className="rounded-full px-2 py-1"
                        style={{ background: config.colors.statusScheduling, color: "#fff" }}
                      >
                        Aberto para agendamentos
                      </span>
                    </div>
                  );
                }

                if (section.block_key === "categories") {
                  return (
                    <div key={section.block_key} className="space-y-2">
                      {title ? <PreviewTitle config={config}>{title}</PreviewTitle> : null}
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {(categories.length > 0 ? categories : [{ id: "x", name: "Categoria" }]).map((category) => (
                          <span
                            key={category.id}
                            className="whitespace-nowrap rounded-[var(--store-button-radius)] bg-secondary px-3 py-1 text-xs text-secondary-foreground"
                          >
                            {category.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (
                  ["highlights", "promotions", "best_sellers", "new_items", "combos", "offers", "recommended"].includes(
                    section.block_key,
                  )
                ) {
                  return (
                    <div key={section.block_key} className="space-y-2">
                      {title ? <PreviewTitle config={config}>{title}</PreviewTitle> : null}
                      {section.subtitle ? <p className="text-xs text-muted-foreground">{section.subtitle}</p> : null}
                      <div className={cardClass}>
                        {(items.length > 0 ? items : [{ id: "demo", name: "Item de exemplo", price: 24.9, promo_price: null }]).map(
                          (product) => (
                            <div
                              key={`${section.block_key}-${product.id}`}
                              className={cn(
                                "rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--store-shadow)]",
                                config.layout.cardStyle === "list" && config.layout.imagePosition === "left"
                                  ? "flex items-center gap-3"
                                  : "",
                              )}
                            >
                              {config.layout.cardStyle !== "compact" ? (
                                <div className="h-12 w-12 shrink-0 rounded-[var(--radius)] bg-secondary" />
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{product.name}</p>
                                <p className="text-sm font-semibold" style={{ color: config.colors.accent }}>
                                  {formatCurrency(Number(product.promo_price ?? product.price))}
                                  {config.display.showPromoPrices && product.promo_price ? (
                                    <span className="ml-1 text-[11px] font-normal text-muted-foreground line-through">
                                      {formatCurrency(Number(product.price))}
                                    </span>
                                  ) : null}
                                </p>
                                {config.display.showRatings ? (
                                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Star className="size-3" aria-hidden="true" /> avaliações reais da loja
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={section.block_key} className="rounded-[var(--radius)] border border-border bg-card p-3">
                    {title ? <PreviewTitle config={config}>{title}</PreviewTitle> : null}
                    <p className="text-xs text-muted-foreground">{section.subtitle ?? definition.description}</p>
                    {section.block_key === "address" && config.display.showAddress ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" aria-hidden="true" /> Endereço da loja
                      </p>
                    ) : null}
                    {section.block_key === "contact" && config.display.showPhone ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" aria-hidden="true" /> WhatsApp da loja
                      </p>
                    ) : null}
                    {section.block_key === "hours" && config.display.showHours ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" aria-hidden="true" /> Horários cadastrados
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <footer className="border-t border-border bg-card p-4 text-[11px] text-muted-foreground">
              {storeName} · feito com O Seu Pedido
            </footer>
          </div>
        </StoreThemeProvider>
      </div>
    </div>
  );
}

function PreviewTitle({ config, children }: { config: StoreThemeConfig; children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: `calc(0.95rem * ${config.typography.titleSize})`,
        fontWeight: config.typography.titleWeight,
      }}
    >
      {children}
    </h3>
  );
}

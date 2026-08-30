import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Clock, Heart, History, MapPin, MessageCircle, Phone, Search, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { useStoreDocumentTitle } from "@/hooks/useStoreDocumentTitle";
import { HighlightsPopup, HighlightsSection } from "@/components/store/HighlightsPopup";
import { RepeatOrderModal } from "@/components/store/RepeatOrderModal";
import { InstallAppBanner } from "@/components/store/InstallAppBanner";
import { StoreThemeProvider } from "@/components/store/StoreThemeProvider";
import { ProductDetailDialog } from "@/components/store/ProductDetailDialog";
import { StoreReviews } from "@/components/store/StoreReviews";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { buildLineId, useCart, type CartOption } from "@/hooks/useCart";
import { useFavorites } from "@/hooks/useFavorites";
import { currentPrice, hasPromo, layoutForStore, productAvailability, PRODUCT_KIND_LABEL } from "@/lib/catalog";
import { fetchRatingSummary } from "@/lib/avaliacoes";
import { formatCurrency } from "@/lib/format";
import { storeAvailability } from "@/lib/store-config";
import { computeDynamicEta } from "@/lib/operacao";
import { getStoreLoad } from "@/lib/operacao.functions";
import { publicAppearanceQuery, publishedTheme } from "@/lib/store-theme-queries";
import { isSectionVisibleNow, resolvedFooterColors, resolvedFooterConfig } from "@/lib/store-theme";
import { publicStoreQuery, resolveSlugRedirect, type ProductRow } from "@/lib/store-queries";
import { publicEntryPopupsQuery } from "@/lib/entry-popup-queries";
import { isCampaignActive, selectCampaignProducts } from "@/lib/destaques";
import {
  manualAccessEnabled,
  modalEnabled,
  sectionEnabled,
  type RepeatPopupContent,
} from "@/lib/entry-popups";
import { browserKey, useEntryPopups } from "@/hooks/useEntryPopups";
import { logPopupEvent, savePopupPreference } from "@/lib/popups.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$slug/")({
  head: ({ params }) => ({
    meta: [
      { title: `Cardápio e pedidos — ${params.slug} | O Seu Pedido` },
      {
        name: "description",
        content: "Veja o catálogo completo, monte seu pedido e escolha entre entrega ou retirada nesta loja.",
      },
      { property: "og:title", content: "Faça seu pedido online" },
      { property: "og:description", content: "Catálogo, entrega e retirada direto com a loja, sem marketplace." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `https://oseupedido.com.br/${params.slug}` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `https://oseupedido.com.br/${params.slug}` }],

  }),
  component: PublicStorePage,
});

type Filter = "all" | "featured" | "promo" | "favorites";

function PublicStorePage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery(publicStoreQuery(slug));
  const cart = useCart(slug, data?.store.id ?? null);
  const favorites = useFavorites(slug);
  const appearance = useQuery(publicAppearanceQuery(data?.store.id ?? null));
  const theme = publishedTheme(appearance.data);
  useStoreDocumentTitle(data?.store.name);
  const load = useQuery({
    queryKey: ["store-load", data?.store.id],
    enabled: Boolean(data?.store.id),
    refetchInterval: 120_000,
    queryFn: () => getStoreLoad({ data: { storeId: data!.store.id } }),
  });
  const rating = useQuery({
    queryKey: ["store-rating", data?.store.id],
    enabled: Boolean(data?.store.id),
    queryFn: () => fetchRatingSummary(data!.store.id),
  });



  // Janelas de entrada publicadas pelo lojista (podem não existir).
  const entry = useQuery(publicEntryPopupsQuery(data?.store.id ?? null));
  const campaigns = entry.data?.campaigns ?? [];
  const campaign = campaigns.find((item) => isCampaignActive(item)) ?? null;
  const campaignItems = useMemo(() => {
    if (!campaign) return [];
    const manualItems = (entry.data?.items ?? [])
      .filter((item) => item.campaign_id === campaign.id)
      .map((item) => ({ product_id: item.product_id, badge: item.badge, sort_order: item.sort_order }));
    return selectCampaignProducts(campaign, data?.products ?? [], {
      manualItems,
      cartProductIds: cart.items.map((item) => item.productId),
    });
  }, [campaign, entry.data?.items, data?.products, cart.items]);

  const popups = useEntryPopups({
    slug,
    popups: entry.data?.popups ?? [],
    readiness: { repeat: true, highlights: campaignItems.length > 0 },
    hasActiveCampaign: campaign !== null,
    ready: Boolean(data && entry.data),
  });

  const repeatConfig = popups.configFor("repeat");
  const highlightsConfig = popups.configFor("highlights");

  /** Registra o evento sem travar a experiência se falhar. */
  function trackPopup(kind: "repeat" | "highlights", event: string) {
    void logPopupEvent({
      data: { slug, kind, event: event as never, browserKey: browserKey() },
    }).catch(() => undefined);
  }

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<ProductRow | null>(null);

  // Endereço antigo continua funcionando: levamos o visitante ao endereço atual.
  useEffect(() => {
    if (isLoading || data) return;
    let active = true;
    void resolveSlugRedirect(slug).then((current) => {
      if (active && current) void navigate({ to: "/$slug", params: { slug: current }, replace: true });
    });
    return () => {
      active = false;
    };
  }, [slug, data, isLoading, navigate]);

  const products = data?.products ?? [];

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (activeCategory !== "all" && (product.category_id ?? "none") !== activeCategory) return false;
      if (filter === "featured" && !product.is_featured) return false;
      if (filter === "promo" && !hasPromo(product)) return false;
      if (filter === "favorites" && !favorites.has(product.id)) return false;
      if (!term) return true;
      return [product.name, product.description, ...(product.tags ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [products, search, activeCategory, filter, favorites]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-foreground">Loja não encontrada</h1>
        <p className="mt-2 text-muted-foreground">
          O endereço informado não existe ou a loja está temporariamente indisponível.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    );
  }

  const { store, categories } = data;
  /** Um bloco só aparece se o lojista deixou visível e dentro da regra de horário. */
  const showBlock = (key: string) => {
    const sections = appearance.data?.sections ?? [];
    const section = sections.find((item) => item.block_key === key);
    if (!section) return true;
    return isSectionVisibleNow(section);
  };
  const availability = storeAvailability(store);
  /** Prazo estimado que cresce conforme a fila da cozinha. */
  const eta = load.data
    ? computeDynamicEta({
        baseMinutes: load.data.baseMinutes,
        activeOrders: load.data.activeOrders,
        capacity: load.data.capacity,
      })
    : null;
  const layout = layoutForStore(store.segment, products);
  const promos = products.filter((product) => hasPromo(product)).slice(0, 6);
  const recommended = products.filter((product) => product.is_featured && !hasPromo(product)).slice(0, 6);
  const contactNumber = (store.whatsapp || store.phone || "").replace(/\D/g, "");
  const coverUrl = theme.branding?.coverUrl ?? store.cover_url ?? null;
  const logoUrl = theme.branding?.logoUrl ?? store.logo_url ?? null;

  // O lojista escolhe o estilo dos itens no editor; o segmento é só o ponto de partida.
  const cardStyle = theme.layout.cardStyle;
  const imagePosition = theme.layout.imagePosition;
  const display = theme.display;
  /** Largura máxima do conteúdo vem do tema (variável do StoreThemeProvider). */
  const shellStyle = { maxWidth: "var(--store-max-width)" } as const;

  const gridClass =
    cardStyle === "grid"
      ? "grid grid-cols-2 items-stretch gap-2.5 sm:gap-4 lg:grid-cols-3"
      : cardStyle === "compact"
        ? "grid items-stretch gap-2 sm:grid-cols-2"
        : "grid items-stretch gap-2.5 sm:gap-3";

  function addToCart(
    product: ProductRow,
    unitPrice: number,
    options: CartOption[],
    notes: string | null,
    variant?: { id: string | null; name: string | null },
  ) {
    cart.add({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      name: variant?.name ? `${product.name} (${variant.name})` : product.name,
      unitPrice,
      options,
      notes,
      maxQuantity: product.max_quantity_per_order,
      lineId: buildLineId({ productId: product.id, variantId: variant?.id ?? null, options, notes }),
    });
  }


  return (
    <StoreThemeProvider config={theme} paintDocument className="flex min-h-screen flex-col bg-muted/30 text-foreground">
      <header>
        {coverUrl ? (
          <div className="relative h-36 w-full overflow-hidden sm:h-56 lg:h-64">
            <img
              src={coverUrl}
              alt={`Capa de ${store.name}`}
              className="size-full object-cover"
              loading="eager"
            />
          </div>
        ) : (
          <div className="h-16 w-full bg-primary/10" />
        )}

        <div className="mx-auto w-full px-3 sm:px-6" style={shellStyle}>
          <div className={cn("relative rounded-2xl bg-card p-4 shadow-sm sm:p-6", coverUrl && "-mt-10 sm:-mt-10")}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`Logo de ${store.name}`}
                className="absolute -top-8 left-4 size-16 rounded-xl border-4 border-card bg-card object-cover shadow-sm sm:-top-12 sm:left-5 sm:size-24 sm:rounded-2xl"
              />
            ) : null}
            <div className={cn(logoUrl ? "pt-10 sm:pt-14" : undefined)}>
              <span
                className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide sm:text-xs"
                style={{ color: availability.accepting ? theme.colors.statusOpen : theme.colors.statusClosed }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: availability.accepting ? theme.colors.statusOpen : theme.colors.statusClosed }}
                />
                {availability.message}
              </span>

              <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">{store.name}</h1>
                {store.is_demo ? <DemoBadge /> : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-muted-foreground sm:text-sm">
                {display.showRatings && rating.data && rating.data.count > 0 ? (
                  <>
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Star className="size-4 fill-current text-amber-500" aria-hidden="true" />
                      {rating.data.average.toFixed(1)}
                    </span>
                    <span aria-hidden="true">•</span>
                  </>
                ) : null}
                {eta && availability.accepting ? (
                  <>
                    <span className="font-medium text-foreground">{eta.label}</span>
                    {eta.load !== "tranquilo" ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                        {eta.load === "lotado" ? "Cozinha lotada" : "Movimento alto"}
                      </span>
                    ) : null}
                    <span aria-hidden="true">•</span>
                  </>
                ) : null}
                <span>Entrega {formatCurrency(Number(store.delivery_fee))}</span>
                <span aria-hidden="true">•</span>
                <span>
                  Pedido mín. <strong className="font-semibold text-foreground">{formatCurrency(Number(store.min_order_value))}</strong>
                </span>
              </div>

              {store.description ? (
                <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">{store.description}</p>
              ) : null}

              <ul className="mt-3 flex flex-col gap-2 text-[13px] text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6 sm:text-sm">
                {display.showAddress && store.address_street ? (
                  <li className="flex min-w-0 items-start gap-1.5">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      {store.address_street}, {store.address_number} — {store.address_district}, {store.address_city}/
                      {store.address_state}
                    </span>
                  </li>
                ) : null}
                {display.showPhone && store.phone ? (
                  <li className="flex items-center gap-1.5">
                    <Phone className="size-4 shrink-0" aria-hidden="true" />
                    {store.phone}
                  </li>
                ) : null}
                {display.showHours ? (
                  <li className="flex min-w-0 items-center gap-1.5">
                    <Clock className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">{availability.message}</span>
                  </li>
                ) : null}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
                {display.showPhone && contactNumber ? (
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild>
                    <a href={`https://wa.me/55${contactNumber}`} target="_blank" rel="noreferrer">
                      <MessageCircle className="mr-2 size-4" aria-hidden="true" /> Falar com a loja
                    </a>
                  </Button>
                ) : null}
                {display.showRepeatOrder && repeatConfig && manualAccessEnabled(repeatConfig) && !popups.isHidden("repeat") ? (
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => popups.openManually("repeat")}>
                    <History className="mr-2 size-4" aria-hidden="true" /> Repetir pedido
                  </Button>
                ) : null}

                {highlightsConfig && manualAccessEnabled(highlightsConfig) && campaign && campaignItems.length > 0 ? (
                  <Button variant="outline" size="sm" className="max-w-full flex-1 truncate sm:flex-none" onClick={() => popups.openManually("highlights")}>
                    <Sparkles className="mr-2 size-4 shrink-0" aria-hidden="true" /> <span className="truncate">{campaign.title}</span>
                  </Button>
                ) : null}
                <Link
                  to="/$slug/acompanhar"
                  params={{ slug }}
                  search={{ codigo: undefined }}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Acompanhar um pedido
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>


      <main
        className="mx-auto w-full px-4 py-8 sm:px-6"
        style={{ ...shellStyle, display: "flex", flexDirection: "column", gap: "var(--store-section-gap)" }}
      >
        <InstallAppBanner storeName={store.name} />

        {/* Busca e filtros */}

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={layout === "schedule" ? "Buscar serviço" : "Buscar no catálogo"}
              className="pl-9"
              aria-label="Buscar no catálogo"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "all", label: "Tudo" },
                { value: "featured", label: "Destaques" },
                { value: "promo", label: "Promoções" },
                { value: "favorites", label: "Favoritos" },
              ] as const
            ).map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={filter === option.value ? "default" : "outline"}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={activeCategory === "all" ? "secondary" : "ghost"}
              onClick={() => setActiveCategory("all")}
            >
              Todas as categorias
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                size="sm"
                variant={activeCategory === category.id ? "secondary" : "ghost"}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Promoções */}
        {promos.length > 0 && filter === "all" && activeCategory === "all" && !search ? (
          <section aria-labelledby="promocoes">
            <h2 id="promocoes" className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sparkles className="size-4 text-accent" aria-hidden="true" /> Promoções
            </h2>
            <div className={cn("mt-3", gridClass)}>
              {promos.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  layout={layout}
                  isFavorite={favorites.has(product.id)}
                  onToggleFavorite={() => favorites.toggle(product.id)}
                  onOpen={() => setDetail(product)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Coleções (lookbook) */}
        {filter === "all" && activeCategory === "all" && !search
          ? data.collections.map((collection) => {
              const items = data.collectionItems
                .filter((item) => item.collection_id === collection.id)
                .map((item) => products.find((product) => product.id === item.product_id))
                .filter((product): product is ProductRow => Boolean(product));
              if (items.length === 0) return null;
              return (
                <section key={collection.id} aria-labelledby={`colecao-${collection.id}`}>
                  {collection.cover_url ? (
                    <img
                      src={collection.cover_url}
                      alt={collection.name}
                      loading="lazy"
                      className="mb-3 h-32 w-full rounded-2xl object-cover sm:h-44"
                    />
                  ) : null}
                  <h2
                    id={`colecao-${collection.id}`}
                    className="text-lg font-semibold text-foreground"
                  >
                    {collection.name}
                  </h2>
                  {collection.description ? (
                    <p className="text-sm text-muted-foreground">{collection.description}</p>
                  ) : null}
                  <div className={cn("mt-3", gridClass)}>
                    {items.map((product) => (
                      <ProductCard
                        key={`${collection.id}-${product.id}`}
                        product={product}
                        layout={layout}
                        isFavorite={favorites.has(product.id)}
                        onToggleFavorite={() => favorites.toggle(product.id)}
                        onOpen={() => setDetail(product)}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          : null}



        {/* Catálogo por categoria */}
        {categories
          .filter((category) => activeCategory === "all" || category.id === activeCategory)
          .map((category) => {
            const items = visible.filter((product) => product.category_id === category.id);
            if (items.length === 0) return null;
            return (
              <section key={category.id} aria-labelledby={`cat-${category.id}`}>
                <h2 id={`cat-${category.id}`} className="text-lg font-semibold text-foreground">
                  {category.name}
                </h2>
                {category.description ? (
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                ) : null}
                <div className={cn("mt-3", gridClass)}>
                  {items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      layout={layout}
                      isFavorite={favorites.has(product.id)}
                      onToggleFavorite={() => favorites.toggle(product.id)}
                      onOpen={() => setDetail(product)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

        {(() => {
          const uncategorized = visible.filter((product) => !product.category_id);
          if (uncategorized.length === 0 || (activeCategory !== "all" && activeCategory !== "none")) return null;
          return (
            <section aria-labelledby="cat-outros">
              <h2 id="cat-outros" className="text-lg font-semibold text-foreground">
                Outros itens
              </h2>
              <div className={cn("mt-3", gridClass)}>
                {uncategorized.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    layout={layout}
                    isFavorite={favorites.has(product.id)}
                    onToggleFavorite={() => favorites.toggle(product.id)}
                    onOpen={() => setDetail(product)}
                  />
                ))}
              </div>
            </section>
          );
        })()}

        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            {products.length === 0
              ? "Esta loja ainda não publicou itens no catálogo."
              : "Nenhum item encontrado com os filtros atuais."}
          </p>
        ) : null}

        {highlightsConfig && sectionEnabled(highlightsConfig) && campaign && campaignItems.length > 0
          ? (
            <HighlightsSection
              campaign={campaign}
              items={campaignItems}
              onAdd={(product) => addToCart(product, currentPrice(product), [], null)}
              onOpenDetail={(product) => setDetail(product)}
            />
          )
          : null}

        {/* Recomendados */}
        {recommended.length > 0 ? (
          <section aria-labelledby="recomendados">
            <h2 id="recomendados" className="text-lg font-semibold text-foreground">
              Você também pode gostar
            </h2>
            <div className={cn("mt-3", gridClass)}>
              {recommended.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  layout={layout}
                  isFavorite={favorites.has(product.id)}
                  onToggleFavorite={() => favorites.toggle(product.id)}
                  onOpen={() => setDetail(product)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {repeatConfig && modalEnabled(repeatConfig) ? (
        <RepeatOrderModal
          slug={slug}
          products={products}
          groups={data.optionGroups}
          options={data.options}
          content={repeatConfig.content as RepeatPopupContent}
          theme={theme}
          open={popups.current === "repeat"}
          onOpenChange={(open) => (open ? popups.openManually("repeat") : popups.close("repeat"))}
          onAddLines={(lines) => {
            for (const item of lines) {
              cart.add({
                productId: item.line.productId,
                name: item.line.name,
                unitPrice: item.line.currentPrice,
                options: item.options,
                notes: item.line.notes,
                maxQuantity: item.line.maxQuantity,
                lineId: item.lineId,
              });
            }
            popups.close("repeat");
          }}
          onDismissForever={() => {
            popups.dismissForever("repeat");
            void savePopupPreference({
              data: {
                slug,
                kind: "repeat",
                browserKey: browserKey(),
                dontShowAgain: true,
                dismissedVersion: popups.versionFor("repeat"),
              },
            }).catch(() => undefined);
          }}
          onEvent={(event) => trackPopup("repeat", event)}
        />
      ) : null}

      {highlightsConfig && modalEnabled(highlightsConfig) && campaign ? (
        <HighlightsPopup
          campaign={campaign}
          items={campaignItems}
          theme={theme}
          open={popups.current === "highlights"}
          onOpenChange={(open) => (open ? popups.openManually("highlights") : popups.close("highlights"))}
          onAdd={(product) => addToCart(product, currentPrice(product), [], null)}
          onOpenDetail={(product) => {
            popups.close("highlights");
            setDetail(product);
          }}
          onEvent={(event) => trackPopup("highlights", event)}
        />
      ) : null}

      <div className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        <StoreReviews storeId={data.store.id} />
      </div>

      <ProductDetailDialog
        product={detail}
        groups={data.optionGroups}
        options={data.options}
        variants={data.variants}
        related={data.related}
        allProducts={data.products}
        onOpenProduct={(product) => setDetail(product)}
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        onAdd={({ product, unitPrice, options, notes, variantId, variantName }) =>
          addToCart(product, unitPrice, options, notes, {
            id: variantId ?? null,
            name: variantName ?? null,
          })
        }
      />

      {cart.hydrated && cart.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {cart.count} {cart.count === 1 ? "item" : "itens"}
              </p>
              <p className="text-muted-foreground">{formatCurrency(cart.subtotal)}</p>
            </div>
            {availability.accepting ? (
              <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/$slug/carrinho" params={{ slug }}>
                  <ShoppingBag className="mr-2 size-4" aria-hidden="true" />
                  Ver carrinho
                </Link>
              </Button>
            ) : (
              <Button disabled className="bg-accent text-accent-foreground">
                <ShoppingBag className="mr-2 size-4" aria-hidden="true" />
                Loja indisponível
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex-1" aria-hidden="true" />

      <StoreFooter theme={theme} store={store} cartActive={cart.hydrated && cart.count > 0} />
    </StoreThemeProvider>
  );
}

function StoreFooter({
  theme,
  store,
  cartActive,
}: {
  theme: ReturnType<typeof publishedTheme>;
  store: {
    name: string;
    phone?: string | null;
    address_street?: string | null;
    address_number?: string | null;
    address_district?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    address_zip?: string | null;
  };
  cartActive: boolean;
}) {
  const footer = resolvedFooterConfig(theme.footer, store);
  // Por padrão o rodapé segue a cor principal; respeita personalização do lojista.
  const footerColors = resolvedFooterColors(theme.footer, theme.colors.primary);
  const hasContent = footer.name || footer.phone || footer.address;

  if (!hasContent) return null;

  return (
    <footer
      className="py-6 text-center sm:py-8"
      style={{
        background: footerColors.background,
        color: footerColors.text,
        paddingBottom: cartActive ? "5.5rem" : undefined,
      }}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {footer.name ? (
          <p className="text-base font-bold leading-tight sm:text-lg">{footer.name}</p>
        ) : null}
        {footer.phone ? (
          <p className="mt-1.5 text-sm opacity-90">{footer.phone}</p>
        ) : null}
        {footer.address ? (
          <p className="mt-1.5 text-sm leading-snug opacity-90">{footer.address}</p>
        ) : null}
        <p className="mt-4 text-xs opacity-90">
          Feito com{" "}
          <a
            href="https://www.oseupedido.com.br"
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline underline-offset-2 hover:opacity-100"
          >
            O Seu Pedido
          </a>
        </p>

      </div>
    </footer>
  );
}

interface ProductCardProps {
  product: ProductRow;
  layout: "menu" | "showcase" | "schedule";
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
}

function ProductCard({ product, layout, isFavorite, onToggleFavorite, onOpen }: ProductCardProps) {
  const availability = productAvailability(product);
  const price = currentPrice(product);

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm transition hover:shadow-md">
      <CardContent
        className={cn(
          "p-3 sm:p-4 sm:pt-6",
          layout === "showcase" ? "space-y-2.5" : "flex items-start justify-between gap-3 sm:gap-4",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h3 className="min-w-0 break-words text-[15px] font-medium leading-snug text-foreground sm:text-base">
              {product.name}
            </h3>
            {product.is_featured ? (
              <Badge className="gap-1 px-1.5 py-0 text-[10px] sm:text-xs">
                <Star className="size-3 shrink-0" aria-hidden="true" /> Destaque
              </Badge>
            ) : null}
            {product.kind !== "product" ? (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] sm:text-xs">
                {PRODUCT_KIND_LABEL[product.kind]}
              </Badge>
            ) : null}
          </div>
          {product.description ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground sm:text-sm">
              {product.description}
            </p>
          ) : null}
          {(product.tags ?? []).length > 0 ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{(product.tags ?? []).join(" · ")}</p>
          ) : null}
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[13px] sm:text-sm">
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {formatCurrency(price)}
            </span>

            {hasPromo(product) ? (
              <span className="text-muted-foreground line-through">{formatCurrency(Number(product.price))}</span>
            ) : null}
            {product.kind === "service" && product.duration_minutes ? (
              <span className="text-muted-foreground">· {product.duration_minutes} min</span>
            ) : null}
          </p>
          {!availability.available ? <p className="mt-1 text-xs text-destructive">{availability.reason}</p> : null}
        </div>

        <div
          className={cn(
            "flex shrink-0 gap-1.5 sm:gap-2",
            layout === "showcase" ? "items-center justify-between" : "flex-col items-end",
          )}
        >
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 sm:size-9"
            aria-label={isFavorite ? `Remover ${product.name} dos favoritos` : `Salvar ${product.name} nos favoritos`}
            aria-pressed={isFavorite}
            onClick={onToggleFavorite}
          >
            <Heart className={cn("size-4", isFavorite && "fill-accent text-accent")} aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm", layout === "showcase" && "flex-1")}
            disabled={!availability.available}
            onClick={onOpen}
          >
            {product.kind === "service" ? "Agendar" : "Adicionar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Copy,
  ExternalLink,
  GripVertical,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AiCatalogTab } from "@/components/catalogo/AiCatalogTab";
import { CatalogCsvTools } from "@/components/catalogo/CatalogCsvTools";
import { BuilderEditor } from "@/components/catalogo/BuilderEditor";
import { PricingCalculator } from "@/components/catalogo/PricingCalculator";
import { CategoryManager } from "@/components/catalogo/CategoryManager";
import { ProductDialog } from "@/components/catalogo/ProductDialog";
import { ScheduleManager } from "@/components/catalogo/ScheduleManager";
import { SortableList } from "@/components/catalogo/SortableList";
import { CollectionsTab } from "@/components/varejo/CollectionsTab";
import { VariantsTab } from "@/components/varejo/VariantsTab";
import { PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { persistOrder, useCatalog, useCatalogRefresh, type ProductRow } from "@/hooks/useCatalog";
import { useActiveStore } from "@/hooks/useMyStores";
import { useStoreFeatures } from "@/hooks/useStoreFeatures";
import { catalogPreset, catalogTabLabel } from "@/lib/catalogo-segmento";
import { supabase } from "@/integrations/supabase/client";
import {
  PRODUCT_KINDS,
  PRODUCT_KIND_LABEL,
  currentPrice,
  productAvailability,
} from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import { fetchRetail, retailKey } from "@/lib/varejo";

export const Route = createFileRoute("/_authenticated/painel/produtos")({
  component: CatalogPage,
  head: () => ({
    meta: [
      { title: "Catálogo da loja | O Seu Pedido" },
      {
        name: "description",
        content:
          "Cadastre produtos, grade de variações com SKU, coleções e categorias da sua loja em um só lugar.",
      },
      { property: "og:title", content: "Catálogo da loja | O Seu Pedido" },
      {
        property: "og:description",
        content: "Produtos, grade de SKUs, etiquetas e coleções da sua loja.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CatalogPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const { data, isLoading } = useCatalog(storeId);
  const { data: featuresConfig } = useStoreFeatures(storeId, active?.store.segment ?? null);
  const preset = catalogPreset(featuresConfig?.segment);
  const refresh = useCatalogRefresh(storeId);
  const queryClient = useQueryClient();
  const { data: retail } = useQuery({
    queryKey: retailKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchRetail(storeId!),
  });
  const refreshAll = () => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: retailKey(storeId) });
  };


  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const products = data?.products ?? [];
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (showArchived !== Boolean(product.archived_at)) return false;
      if (kindFilter !== "all" && product.kind !== kindFilter) return false;
      if (categoryFilter !== "all" && (product.category_id ?? "none") !== categoryFilter)
        return false;
      if (!term) return true;
      return [product.name, product.description, product.sku, ...(product.tags ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [data?.products, search, kindFilter, categoryFilter, showArchived]);

  async function toggleField(product: ProductRow, patch: Partial<ProductRow>) {
    const { error } = await supabase.from("products").update(patch).eq("id", product.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function duplicate(product: ProductRow) {
    const { id, created_at, updated_at, ...rest } = product;
    void id;
    void created_at;
    void updated_at;
    const { error } = await supabase.from("products").insert({
      ...rest,
      name: `${product.name} (cópia)`,
      sku: null,
      barcode: null,
      is_active: false,
      sort_order: (data?.products.length ?? 0) + 1,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Item duplicado como rascunho inativo.");
    refresh();
  }

  async function remove(product: ProductRow) {
    if (!window.confirm(`Excluir "${product.name}" definitivamente?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      toast.error("Este item já foi usado em pedidos. Arquive-o em vez de excluir.");
      return;
    }
    toast.success("Item excluído.");
    refresh();
  }

  if (!storeId) {
    return <p className="text-muted-foreground">Selecione uma loja para gerenciar o catálogo.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={preset.pageTitle}
        description={preset.pageDescription}
        actions={
          active?.store.slug ? (
            <Button variant="outline" asChild>
              <a href={`/${active.store.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 size-4" aria-hidden="true" /> Ver como cliente
              </a>
            </Button>
          ) : null
        }
      />

      {isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <>
        <Tabs defaultValue="itens">
          <TabsList className="flex flex-wrap">
            {preset.tabs.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {catalogTabLabel(preset, tab)}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* -------------------- ITENS -------------------- */}
          <TabsContent value="itens" className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, SKU ou etiqueta"
                className="min-w-52 flex-1"
                aria-label="Buscar itens"
              />
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="w-44" aria-label="Filtrar por tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {PRODUCT_KINDS.filter((kind) => preset.kinds.includes(kind.value)).map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>
                      {kind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48" aria-label="Filtrar por categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {data.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                  aria-label="Mostrar arquivados"
                />
                Arquivados
              </label>
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                Novo {preset.itemNoun}
              </Button>
            </div>

            {filtered.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum item encontrado com os filtros atuais.
                </CardContent>
              </Card>
            ) : (
              <SortableList
                items={filtered}
                getId={(product) => product.id}
                onReorder={(ids) => {
                  void persistOrder("products", ids).then(refresh);
                }}
                renderItem={(product, dragProps) => {
                  const availability = productAvailability(product);
                  const lowStock =
                    product.track_stock &&
                    Number(product.stock_quantity) <= Number(product.min_stock ?? 0);
                  return (
                    <Card className="border-border/70">
                      <CardContent className="flex flex-wrap items-center gap-3 py-4">
                        <span
                          {...dragProps}
                          className="cursor-grab text-muted-foreground"
                          aria-label="Reordenar item"
                        >
                          <GripVertical className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-48 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{product.name}</p>
                            <Badge variant="secondary">{PRODUCT_KIND_LABEL[product.kind]}</Badge>
                            {product.is_featured ? (
                              <Badge className="gap-1">
                                <Star className="size-3" aria-hidden="true" /> Destaque
                              </Badge>
                            ) : null}
                            {lowStock ? <Badge variant="destructive">Estoque baixo</Badge> : null}
                            {!availability.available ? (
                              <Badge variant="outline">{availability.reason}</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(currentPrice(product))}
                            {product.sku ? ` · SKU ${product.sku}` : ""}
                            {product.track_stock ? ` · ${product.stock_quantity} em estoque` : ""}
                          </p>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch
                            checked={product.is_available}
                            aria-label={`Disponibilidade de ${product.name}`}
                            onCheckedChange={(checked) =>
                              void toggleField(product, { is_available: checked })
                            }
                          />
                          Disponível
                        </label>

                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(product);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="mr-1 size-3.5" aria-hidden="true" /> Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void duplicate(product)}>
                            <Copy className="mr-1 size-3.5" aria-hidden="true" /> Duplicar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void toggleField(product, {
                                archived_at: product.archived_at ? null : new Date().toISOString(),
                                is_active: Boolean(product.archived_at),
                              })
                            }
                          >
                            {product.archived_at ? (
                              <>
                                <RotateCcw className="mr-1 size-3.5" aria-hidden="true" /> Restaurar
                              </>
                            ) : (
                              <>
                                <Archive className="mr-1 size-3.5" aria-hidden="true" /> Arquivar
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void remove(product)}
                          >
                            <Trash2 className="mr-1 size-3.5" aria-hidden="true" /> Excluir
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }}
              />
            )}
          </TabsContent>

          {/* -------------------- PRECIFICAÇÃO -------------------- */}
          <TabsContent value="precificacao" className="pt-4">
            <PricingCalculator storeId={storeId} products={data.products} />
          </TabsContent>

          {/* -------------------- MONTADOR -------------------- */}
          <TabsContent value="montador" className="pt-4">
            <BuilderEditor storeId={storeId} products={data.products} />
          </TabsContent>

          {/* -------------------- CATEGORIAS -------------------- */}
          <TabsContent value="categorias" className="pt-4">
            <CategoryManager
              storeId={storeId}
              categories={data.categories}
              productCount={(categoryId) =>
                data.products.filter((item) => item.category_id === categoryId).length
              }
              onChanged={refresh}
            />
          </TabsContent>

          {/* -------------------- GRADE DE VARIAÇÕES -------------------- */}
          <TabsContent value="grade" className="pt-4">
            <VariantsTab
              storeId={storeId}
              storeName={active?.store.name ?? "Minha loja"}
              products={data.products}
              variants={retail?.variants ?? []}
              onChanged={refreshAll}
            />
          </TabsContent>

          {/* -------------------- COLEÇÕES -------------------- */}
          <TabsContent value="colecoes" className="pt-4">
            <CollectionsTab
              storeId={storeId}
              products={data.products}
              collections={retail?.collections ?? []}
              collectionItems={retail?.collectionItems ?? []}
              related={retail?.related ?? []}
              onChanged={refreshAll}
            />
          </TabsContent>


          {/* -------------------- AGENDA -------------------- */}
          <TabsContent value="agenda" className="pt-4">
            <ScheduleManager storeId={storeId} catalog={data} onChanged={refresh} />
          </TabsContent>

          {/* -------------------- CSV -------------------- */}
          <TabsContent value="ia" className="pt-4">
            {storeId ? (
              <AiCatalogTab
                storeId={storeId}
                segment={featuresConfig?.segment ?? "alimentacao"}
                categories={data.categories}
                productCount={data.products.length}
                onChanged={refresh}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="csv" className="pt-4">
            <CatalogCsvTools
              storeId={storeId}
              products={data.products}
              categories={data.categories}
              onChanged={refresh}
            />
          </TabsContent>
        </Tabs>
        </>
      )}

      {data ? (
        <ProductDialog
          key={editing?.id ?? "new"}
          storeId={storeId}
          catalog={data}
          product={editing}
          kinds={preset.kinds}
          defaultKind={preset.defaultKind}
          segment={featuresConfig?.segment ?? "alimentacao"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}

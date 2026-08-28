import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Download, PackageMinus, PackagePlus, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { LowStockAlert } from "@/components/painel/LowStockAlert";
import { PageHeader } from "@/components/painel/PageHeader";
import { BatchesTab } from "@/components/varejo/BatchesTab";
import { ReservationsTab } from "@/components/varejo/ReservationsTab";
import { ReturnsTab } from "@/components/varejo/ReturnsTab";
import { StockEntriesTab } from "@/components/varejo/StockEntriesTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useActiveStore } from "@/hooks/useMyStores";
import {
  MOVEMENT_LABEL,
  availabilityKey,
  fetchAvailabilityEvents,
  MOVEMENT_TYPES,
  adjustProductStock,
  deleteIngredient,
  fetchStock,
  movementsToCsv,
  stockKey,
  summarizeStock,
  unitCost,
  updateProductStockFields,
  upsertIngredient,
  type MovementType,
  type StockProduct,
} from "@/lib/estoque";
import { batchesKey, fetchBatches } from "@/lib/lotes";
import { fetchSalesVolume, ruptureItems, ruptureKey } from "@/lib/estoque";
import { formatCurrency } from "@/lib/format";
import { fetchRetail, retailKey, type RetailData } from "@/lib/varejo";

/** Estado vazio usado enquanto os dados de varejo ainda estão carregando. */
const EMPTY_RETAIL: RetailData = {
  variants: [],
  collections: [],
  collectionItems: [],
  related: [],
  suppliers: [],
  entries: [],
  entryItems: [],
  returns: [],
  returnItems: [],
  credits: [],
  reservations: [],
};

export const Route = createFileRoute("/_authenticated/painel/estoque")({
  component: StockPage,
  head: () => ({
    meta: [
      { title: "Estoque | O Seu Pedido" },
      { name: "description", content: "Controle de estoque, ajustes, ingredientes e histórico de movimentações da sua loja." },
    ],
  }),
});

type Filter = "all" | "below" | "out" | "untracked";

function StockPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: stockKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchStock(storeId!),
  });

  const { data: retail } = useQuery({
    queryKey: retailKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchRetail(storeId!),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: stockKey(storeId) });
    void queryClient.invalidateQueries({ queryKey: ["low-stock", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["catalog", storeId] });
    void queryClient.invalidateQueries({ queryKey: retailKey(storeId) });
    void queryClient.invalidateQueries({ queryKey: availabilityKey(storeId) });
  };


  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adjusting, setAdjusting] = useState<StockProduct | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("in");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [ingredientDraft, setIngredientDraft] = useState<{
    id?: string;
    name: string;
    unit: string;
    stock: string;
    min: string;
  } | null>(null);

  const { data: batches } = useQuery({
    queryKey: batchesKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchBatches(storeId!),
  });

  const { data: salesVolume } = useQuery({
    queryKey: ruptureKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchSalesVolume(storeId!),
  });

  /** Itens zerados que continuam vendendo — ruptura de verdade. */
  const rupture = useMemo(
    () => ruptureItems(data?.products ?? [], salesVolume ?? {}),
    [data?.products, salesVolume],
  );

  const { data: pauseEvents } = useQuery({
    queryKey: availabilityKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchAvailabilityEvents(storeId!),
  });

  const summary = useMemo(() => summarizeStock(data?.products ?? []), [data?.products]);

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.products ?? []).filter((product) => {
      const stock = Number(product.stock_quantity ?? 0);
      const min = Number(product.min_stock ?? 0);
      if (filter === "untracked" && product.track_stock) return false;
      if (filter !== "untracked" && filter !== "all" && !product.track_stock) return false;
      if (filter === "out" && stock > 0) return false;
      if (filter === "below" && !(stock > 0 && stock <= min)) return false;
      if (!term) return true;
      return [product.name, product.sku].filter(Boolean).some((value) =>
        String(value).toLowerCase().includes(term),
      );
    });
  }, [data?.products, search, filter]);

  const productName = (id: string) =>
    data?.products.find((product) => product.id === id)?.name ?? "Item removido";

  async function saveAdjustment() {
    if (!adjusting || !storeId) return;
    const value = Number(quantity.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    try {
      const next = await adjustProductStock({
        storeId,
        product: adjusting,
        type: movementType,
        quantity: value,
        reason,
      });
      toast.success(`${adjusting.name}: estoque agora é ${next}.`);
      setAdjusting(null);
      setQuantity("1");
      setReason("");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao ajustar o estoque.");
    }
  }

  async function saveIngredient() {
    if (!ingredientDraft || !storeId) return;
    if (ingredientDraft.name.trim().length < 2) {
      toast.error("Informe o nome do insumo.");
      return;
    }
    try {
      await upsertIngredient({
        id: ingredientDraft.id,
        storeId,
        name: ingredientDraft.name,
        unit: ingredientDraft.unit,
        stockQuantity: Number(ingredientDraft.stock.replace(",", ".")) || 0,
        minStock: Number(ingredientDraft.min.replace(",", ".")) || 0,
      });
      toast.success("Insumo salvo.");
      setIngredientDraft(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar o insumo.");
    }
  }

  function exportMovements() {
    const csv = movementsToCsv(data?.movements ?? [], productName);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "movimentacoes-estoque.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Controle quantidades, ajustes, insumos da ficha técnica e o histórico de movimentações."
      />

      {isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Itens com controle" value={String(summary.tracked)} icon={Boxes} />
            <SummaryCard title="Sem estoque" value={String(summary.outOfStock)} icon={PackageMinus} />
            <SummaryCard title="Abaixo do mínimo" value={String(summary.belowMin)} icon={TriangleAlert} />
            <SummaryCard title="Valor em estoque" value={formatCurrency(summary.totalValue)} icon={PackagePlus} />
          </div>

          <LowStockAlert storeId={storeId} />

          <Tabs defaultValue="itens">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="itens">Itens</TabsTrigger>
              <TabsTrigger value="lotes">Lotes e validade</TabsTrigger>
              <TabsTrigger value="entradas">Entradas e fornecedores</TabsTrigger>
              <TabsTrigger value="devolucoes">Trocas e devoluções</TabsTrigger>
              <TabsTrigger value="reservas">Reservas</TabsTrigger>
              <TabsTrigger value="ingredientes">Ingredientes</TabsTrigger>
              <TabsTrigger value="historico">Movimentações</TabsTrigger>
              <TabsTrigger value="pausas">Pausas de itens</TabsTrigger>
            </TabsList>

            <TabsContent value="itens" className="space-y-3 pt-4">
              {rupture.length > 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>
                    <strong>Ruptura:</strong> {rupture.length} item(ns) zerados que venderam nos últimos 30 dias —{" "}
                    {rupture.slice(0, 4).map((item) => `${item.product.name} (${item.sold})`).join(", ")}
                    {rupture.length > 4 ? " e outros" : ""}. Reponha para não perder venda.
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome ou SKU"
                  className="min-w-52 flex-1"
                  aria-label="Buscar itens no estoque"
                />
                <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
                  <SelectTrigger className="w-52" aria-label="Filtrar estoque">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="below">Abaixo do mínimo</SelectItem>
                    <SelectItem value="out">Sem estoque</SelectItem>
                    <SelectItem value="untracked">Sem controle</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {products.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum item com os filtros atuais.
                  </CardContent>
                </Card>
              ) : (
                products.map((product) => {
                  const stock = Number(product.stock_quantity ?? 0);
                  const min = Number(product.min_stock ?? 0);
                  return (
                    <Card key={product.id} className="border-border/70">
                      <CardContent className="flex flex-wrap items-center gap-3 py-4">
                        <div className="min-w-48 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{product.name}</p>
                            {product.track_stock && stock <= 0 ? (
                              <Badge variant="destructive">Sem estoque</Badge>
                            ) : null}
                            {product.track_stock && stock > 0 && stock <= min ? (
                              <Badge variant="secondary">Abaixo do mínimo</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {product.sku ? `SKU ${product.sku} · ` : ""}
                            custo estimado {formatCurrency(unitCost(product))} · valor em estoque{" "}
                            {formatCurrency(stock * unitCost(product))}
                          </p>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch
                            checked={product.track_stock}
                            aria-label={`Controlar estoque de ${product.name}`}
                            onCheckedChange={(checked) => {
                              void updateProductStockFields(product.id, { track_stock: checked })
                                .then(refresh)
                                .catch(() => toast.error("Falha ao atualizar."));
                            }}
                          />
                          Controlar
                        </label>

                        <div className="flex items-center gap-2">
                          <NumberField
                            label="Qtd."
                            value={stock}
                            onCommit={(value) => {
                              void updateProductStockFields(product.id, { stock_quantity: value })
                                .then(refresh)
                                .catch(() => toast.error("Falha ao atualizar."));
                            }}
                          />
                          <NumberField
                            label="Mín."
                            value={min}
                            onCommit={(value) => {
                              void updateProductStockFields(product.id, { min_stock: value })
                                .then(refresh)
                                .catch(() => toast.error("Falha ao atualizar."));
                            }}
                          />
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAdjusting(product);
                            setMovementType("in");
                            setQuantity("1");
                            setReason("");
                          }}
                        >
                          Ajustar
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="ingredientes" className="space-y-3 pt-4">
              <div className="flex justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Insumos usados na ficha técnica: a baixa acontece automaticamente a cada venda.
                </p>
                <Button
                  onClick={() => setIngredientDraft({ name: "", unit: "un", stock: "0", min: "0" })}
                >
                  Novo insumo
                </Button>
              </div>

              {data.ingredients.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum insumo cadastrado ainda.
                  </CardContent>
                </Card>
              ) : (
                data.ingredients.map((ingredient) => (
                  <Card key={ingredient.id} className="border-border/70">
                    <CardContent className="flex flex-wrap items-center gap-3 py-4">
                      <div className="min-w-48 flex-1">
                        <p className="font-medium text-foreground">{ingredient.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {Number(ingredient.stock_quantity)} {ingredient.unit} · mínimo{" "}
                          {Number(ingredient.min_stock)} {ingredient.unit}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setIngredientDraft({
                            id: ingredient.id,
                            name: ingredient.name,
                            unit: ingredient.unit,
                            stock: String(ingredient.stock_quantity),
                            min: String(ingredient.min_stock),
                          })
                        }
                      >
                        Editar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Excluir ${ingredient.name}`}
                        onClick={() => {
                          void deleteIngredient(ingredient.id)
                            .then(() => {
                              toast.success("Insumo removido.");
                              refresh();
                            })
                            .catch(() => toast.error("Não foi possível remover."));
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="historico" className="space-y-3 pt-4">
              <div className="flex justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Últimas {data.movements.length} movimentações (vendas, cancelamentos e ajustes).
                </p>
                <Button variant="outline" onClick={exportMovements} disabled={data.movements.length === 0}>
                  <Download className="mr-2 size-4" aria-hidden="true" /> Exportar CSV
                </Button>
              </div>

              {data.movements.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    Nenhuma movimentação registrada.
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border/70">
                  <CardContent className="divide-y divide-border/60 p-0">
                    {data.movements.map((movement) => (
                      <div
                        key={movement.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                      >
                        <span className="font-medium text-foreground">
                          {productName(movement.product_id)}
                        </span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Badge variant="secondary">
                            {MOVEMENT_LABEL[movement.movement_type] ?? movement.movement_type}
                          </Badge>
                          {Number(movement.quantity)} un
                          {movement.reason ? ` · ${movement.reason}` : ""}
                          <span className="text-xs">
                            {new Date(movement.created_at).toLocaleString("pt-BR")}
                          </span>
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="pausas" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                Histórico de quando cada item saiu do cardápio e quando voltou a vender, com motivo,
                saldo de estoque no momento e responsável.
              </p>

              {(pauseEvents ?? []).length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    Nenhuma pausa registrada até agora.
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border/70">
                  <CardContent className="divide-y divide-border/60 p-0">
                    {(pauseEvents ?? []).map((event) => (
                      <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <span className="font-medium text-foreground">{productName(event.product_id)}</span>
                        <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                          <Badge
                            variant="outline"
                            className={
                              event.action === "paused"
                                ? "border-destructive/50 bg-destructive/10 text-destructive"
                                : "border-emerald-500/50 bg-emerald-500/10 text-emerald-600"
                            }
                          >
                            {event.action === "paused" ? "Pausado" : "Voltou a vender"}
                          </Badge>
                          <Badge variant="secondary">{event.automatic ? "Automático" : "Manual"}</Badge>
                          {event.reason ? <span>{event.reason}</span> : null}
                          <span>Estoque: {Number(event.stock_quantity ?? 0)}</span>
                          <span className="text-xs">{new Date(event.created_at).toLocaleString("pt-BR")}</span>
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="lotes" className="pt-4">
              <BatchesTab
                storeId={storeId}
                batches={batches ?? []}
                products={(data?.products ?? []).map((product) => ({ id: product.id, name: product.name }))}
                suppliers={(retail ?? EMPTY_RETAIL).suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
              />
            </TabsContent>

            <TabsContent value="entradas" className="pt-4">
              <StockEntriesTab
                storeId={storeId!}
                products={data.products}
                data={retail ?? EMPTY_RETAIL}
                onChanged={refresh}
              />
            </TabsContent>

            <TabsContent value="devolucoes" className="pt-4">
              <ReturnsTab
                storeId={storeId!}
                products={data.products}
                data={retail ?? EMPTY_RETAIL}
                onChanged={refresh}
              />
            </TabsContent>

            <TabsContent value="reservas" className="pt-4">
              <ReservationsTab
                storeId={storeId!}
                storeName={active?.store.name ?? "Minha loja"}
                products={data.products}
                data={retail ?? EMPTY_RETAIL}
                onChanged={refresh}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={Boolean(adjusting)} onOpenChange={(open) => !open && setAdjusting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar estoque</DialogTitle>
            <DialogDescription>{adjusting?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="movement-type">Tipo de movimentação</Label>
              <Select value={movementType} onValueChange={(value) => setMovementType(value as MovementType)}>
                <SelectTrigger id="movement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="movement-qty">
                {movementType === "balance" ? "Quantidade contada" : "Quantidade"}
              </Label>
              <Input
                id="movement-qty"
                value={quantity}
                inputMode="decimal"
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="movement-reason">Motivo (opcional)</Label>
              <Input
                id="movement-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex.: compra do fornecedor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjusting(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveAdjustment()}>Salvar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(ingredientDraft)} onOpenChange={(open) => !open && setIngredientDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ingredientDraft?.id ? "Editar insumo" : "Novo insumo"}</DialogTitle>
            <DialogDescription>Insumos alimentam a baixa automática por ficha técnica.</DialogDescription>
          </DialogHeader>
          {ingredientDraft ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ing-name">Nome</Label>
                <Input
                  id="ing-name"
                  value={ingredientDraft.name}
                  onChange={(event) =>
                    setIngredientDraft({ ...ingredientDraft, name: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="ing-unit">Unidade</Label>
                  <Input
                    id="ing-unit"
                    value={ingredientDraft.unit}
                    onChange={(event) =>
                      setIngredientDraft({ ...ingredientDraft, unit: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ing-stock">Estoque</Label>
                  <Input
                    id="ing-stock"
                    inputMode="decimal"
                    value={ingredientDraft.stock}
                    onChange={(event) =>
                      setIngredientDraft({ ...ingredientDraft, stock: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ing-min">Mínimo</Label>
                  <Input
                    id="ing-min"
                    inputMode="decimal"
                    value={ingredientDraft.min}
                    onChange={(event) =>
                      setIngredientDraft({ ...ingredientDraft, min: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIngredientDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveIngredient()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: typeof Boxes;
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" aria-hidden="true" /> {title}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0" />
    </Card>
  );
}

/** Campo numérico com confirmação ao sair do foco, para edição rápida na lista. */
function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        value={draft}
        inputMode="decimal"
        className="h-8 w-20"
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number(draft.replace(",", "."));
          if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
          else setDraft(String(value));
        }}
      />
    </label>
  );
}

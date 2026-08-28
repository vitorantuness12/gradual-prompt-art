import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import {
  BATCH_STATUS_LABEL,
  EXPIRY_WARNING_DAYS,
  batchStatus,
  batchesKey,
  daysUntilExpiry,
  deleteBatch,
  discardBatch,
  notifyBatchDiscard,
  notifyExpiringBatches,
  sortFefo,
  summarizeBatches,
  upsertBatch,
  type BatchStatus,
  type ProductBatch,
} from "@/lib/lotes";

type Filter = "all" | "vencido" | "vencendo" | "ok";

interface Draft {
  id?: string;
  productId: string;
  supplierId: string;
  batchCode: string;
  expiresAt: string;
  quantity: string;
  unitCost: string;
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  productId: "",
  supplierId: "",
  batchCode: "",
  expiresAt: "",
  quantity: "1",
  unitCost: "0",
  notes: "",
};

const STATUS_STYLE: Record<BatchStatus, string> = {
  vencido: "border-destructive/50 bg-destructive/10 text-destructive",
  vencendo: "border-amber-500/50 bg-amber-500/10 text-amber-600",
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  "sem-validade": "border-border bg-secondary text-muted-foreground",
  esgotado: "border-border bg-secondary text-muted-foreground",
};

/**
 * Lotes e validade: cadastro do lote com data de vencimento, filtros por
 * situação e descarte com baixa automática no estoque.
 */
export function BatchesTab({
  storeId,
  batches,
  products,
  suppliers,
}: {
  storeId: string | undefined;
  batches: ProductBatch[];
  products: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const productName = (id: string) => products.find((product) => product.id === id)?.name ?? "Item removido";
  const summary = useMemo(() => summarizeBatches(batches), [batches]);

  // Avisa o time uma vez por dia sobre lotes vencidos ou vencendo em 15 dias.
  const notified = useRef(false);
  useEffect(() => {
    if (!storeId || notified.current || batches.length === 0) return;
    notified.current = true;
    void notifyExpiringBatches(storeId, batches, productName).then((count) => {
      if (count > 0) void queryClient.invalidateQueries({ queryKey: ["notifications", storeId] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, batches.length]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: batchesKey(storeId) });
    void queryClient.invalidateQueries({ queryKey: ["estoque", storeId] });
  };

  const saveMutation = useMutation({
    mutationFn: async (value: Draft) => {
      if (!storeId) throw new Error("Loja não encontrada.");
      if (!value.productId) throw new Error("Escolha o produto do lote.");
      await upsertBatch({
        id: value.id,
        storeId,
        productId: value.productId,
        supplierId: value.supplierId || null,
        batchCode: value.batchCode,
        expiresAt: value.expiresAt || null,
        quantity: Number(value.quantity.replace(",", ".")) || 0,
        unitCost: Number(value.unitCost.replace(",", ".")) || 0,
        notes: value.notes,
      });
    },
    onSuccess: () => {
      toast.success("Lote salvo.");
      setDraft(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteBatch(id),
    onSuccess: () => {
      toast.success("Lote removido.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const discardMutation = useMutation({
    mutationFn: async (batch: ProductBatch) => {
      const reason = `Descarte por validade — ${batch.batch_code || "sem código"}`;
      const quantity = Number(batch.quantity ?? 0);
      await discardBatch(batch, reason);
      await notifyBatchDiscard(batch, quantity, productName(batch.product_id), reason);
      void queryClient.invalidateQueries({ queryKey: ["notifications", storeId] });
    },
    onSuccess: () => {
      toast.success("Lote descartado e estoque ajustado.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sortFefo(batches).filter((batch) => {
      const status = batchStatus(batch);
      if (filter === "vencido" && status !== "vencido") return false;
      if (filter === "vencendo" && status !== "vencendo") return false;
      if (filter === "ok" && (status === "vencido" || status === "vencendo")) return false;
      if (!term) return true;
      return (
        productName(batch.product_id).toLowerCase().includes(term) ||
        (batch.batch_code ?? "").toLowerCase().includes(term)
      );
    });
  }, [batches, filter, search, products]);

  return (
    <div className="space-y-3">
      {summary.expired + summary.expiring > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>{summary.expired} lote(s) vencido(s)</strong> e {summary.expiring} vencendo nos próximos{" "}
            {EXPIRY_WARNING_DAYS} dias — {summary.quantityAtRisk} unidade(s), {formatCurrency(summary.valueAtRisk)} em
            risco.
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" aria-hidden="true" />
              Lotes e validade
            </CardTitle>
            <CardDescription>
              O saldo sai sempre do lote que vence primeiro. Alertas aparecem aqui e no PDV.
            </CardDescription>
          </div>
          <Button onClick={() => setDraft({ ...EMPTY_DRAFT })} className="gap-1">
            <Plus className="size-4" aria-hidden="true" />
            Novo lote
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Buscar por produto ou código do lote"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <SelectTrigger className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os lotes</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
                <SelectItem value="vencendo">Vencendo em breve</SelectItem>
                <SelectItem value="ok">Dentro da validade</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lote encontrado para este filtro.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {visible.map((batch) => {
                const status = batchStatus(batch);
                const days = daysUntilExpiry(batch.expires_at);
                return (
                  <li key={batch.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-40 flex-1">
                      <p className="text-sm font-semibold">{productName(batch.product_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        Lote {batch.batch_code || "sem código"} · {Number(batch.quantity)} un ·{" "}
                        {formatCurrency(Number(batch.unit_cost))} de custo
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {batch.expires_at ? new Date(`${batch.expires_at}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
                      {days !== null ? (
                        <span className="block">{days < 0 ? `há ${Math.abs(days)} dia(s)` : `em ${days} dia(s)`}</span>
                      ) : null}
                    </div>
                    <Badge variant="outline" className={STATUS_STYLE[status]}>
                      {BATCH_STATUS_LABEL[status]}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDraft({
                            id: batch.id,
                            productId: batch.product_id,
                            supplierId: batch.supplier_id ?? "",
                            batchCode: batch.batch_code ?? "",
                            expiresAt: batch.expires_at ?? "",
                            quantity: String(batch.quantity ?? 0),
                            unitCost: String(batch.unit_cost ?? 0),
                            notes: batch.notes ?? "",
                          })
                        }
                      >
                        Editar
                      </Button>
                      {status === "vencido" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => discardMutation.mutate(batch)}
                          disabled={discardMutation.isPending}
                        >
                          Descartar
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover lote"
                        onClick={() => removeMutation.mutate(batch.id)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar lote" : "Novo lote"}</DialogTitle>
            <DialogDescription>Informe validade e saldo para acompanhar o vencimento.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Produto</Label>
                <Select
                  value={draft.productId}
                  onValueChange={(value) => setDraft({ ...draft, productId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-code">Código do lote</Label>
                <Input
                  id="batch-code"
                  value={draft.batchCode}
                  onChange={(event) => setDraft({ ...draft, batchCode: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-expires">Validade</Label>
                <Input
                  id="batch-expires"
                  type="date"
                  value={draft.expiresAt}
                  onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-qty">Quantidade</Label>
                <Input
                  id="batch-qty"
                  inputMode="decimal"
                  value={draft.quantity}
                  onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-cost">Custo unitário</Label>
                <Input
                  id="batch-cost"
                  inputMode="decimal"
                  value={draft.unitCost}
                  onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Fornecedor (opcional)</Label>
                <Select
                  value={draft.supplierId || "none"}
                  onValueChange={(value) => setDraft({ ...draft, supplierId: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem fornecedor</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="batch-notes">Observação</Label>
                <Input
                  id="batch-notes"
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button disabled={saveMutation.isPending} onClick={() => draft && saveMutation.mutate(draft)}>
              Salvar lote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

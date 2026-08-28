import { useMemo, useState } from "react";
import { CheckCircle2, FileText, Pencil, Plus, Trash2, Truck } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import {
  applyStockEntry,
  createStockEntry,
  deleteStockEntry,
  deleteSupplier,
  upsertSupplier,
  variantLabel,
  type EntryItemDraft,
  type RetailData,
} from "@/lib/varejo";
import type { StockProduct } from "@/lib/estoque";

interface StockEntriesTabProps {
  storeId: string;
  products: StockProduct[];
  data: RetailData;
  onChanged: () => void;
}

interface SupplierDraft {
  id?: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  notes: string;
}

/** Entrada de mercadoria por nota do fornecedor, com recálculo de custo médio. */
export function StockEntriesTab({ storeId, products, data, onChanged }: StockEntriesTabProps) {
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [freight, setFreight] = useState("0");
  const [otherCosts, setOtherCosts] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<EntryItemDraft[]>([
    { productId: null, variantId: null, description: "", quantity: 1, unitCost: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  /** Cada linha da nota aponta para um produto simples ou para um SKU da grade. */
  const targets = useMemo(() => {
    const list: { value: string; label: string; productId: string; variantId: string | null }[] = [];
    for (const product of products) {
      const variants = data.variants.filter((variant) => variant.product_id === product.id);
      if (variants.length === 0) {
        list.push({ value: `p:${product.id}`, label: product.name, productId: product.id, variantId: null });
      } else {
        for (const variant of variants) {
          list.push({
            value: `v:${variant.id}`,
            label: `${product.name} · ${variantLabel(variant)}`,
            productId: product.id,
            variantId: variant.id,
          });
        }
      }
    }
    return list;
  }, [products, data.variants]);

  const total =
    items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) +
    (Number(freight.replace(",", ".")) || 0) +
    (Number(otherCosts.replace(",", ".")) || 0);

  function resetEntry() {
    setSupplierId("");
    setInvoiceNumber("");
    setIssuedAt(new Date().toISOString().slice(0, 10));
    setFreight("0");
    setOtherCosts("0");
    setNotes("");
    setItems([{ productId: null, variantId: null, description: "", quantity: 1, unitCost: 0 }]);
  }

  async function saveEntry(apply: boolean) {
    setBusy(true);
    try {
      const id = await createStockEntry({
        storeId,
        supplierId: supplierId || null,
        invoiceNumber,
        issuedAt,
        freight: Number(freight.replace(",", ".")) || 0,
        otherCosts: Number(otherCosts.replace(",", ".")) || 0,
        notes,
        items,
      });
      if (apply) await applyStockEntry(id);
      toast.success(apply ? "Nota lançada: estoque e custo médio atualizados." : "Nota salva como rascunho.");
      setEntryOpen(false);
      resetEntry();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar a nota.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSupplier() {
    if (!supplierDraft) return;
    if (supplierDraft.name.trim().length < 2) {
      toast.error("Informe o nome do fornecedor.");
      return;
    }
    try {
      await upsertSupplier({ ...supplierDraft, storeId });
      toast.success("Fornecedor salvo.");
      setSupplierDraft(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar o fornecedor.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Fornecedores</CardTitle>
            <CardDescription>Quem abastece a loja. Usado nas notas de entrada.</CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setSupplierDraft({ name: "", document: "", phone: "", email: "", notes: "" })}
          >
            <Truck className="mr-2 size-4" aria-hidden="true" /> Novo fornecedor
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.suppliers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p>
          ) : (
            data.suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
              >
                <div className="min-w-40 flex-1">
                  <p className="font-medium text-foreground">{supplier.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[supplier.document, supplier.phone, supplier.email].filter(Boolean).join(" · ") ||
                      "sem contato cadastrado"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setSupplierDraft({
                      id: supplier.id,
                      name: supplier.name,
                      document: supplier.document ?? "",
                      phone: supplier.phone ?? "",
                      email: supplier.email ?? "",
                      notes: supplier.notes ?? "",
                    })
                  }
                >
                  <Pencil className="mr-1 size-3.5" aria-hidden="true" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (!window.confirm(`Excluir "${supplier.name}"?`)) return;
                    void deleteSupplier(supplier.id)
                      .then(onChanged)
                      .catch(() => toast.error("Falha ao excluir."));
                  }}
                >
                  <Trash2 className="mr-1 size-3.5" aria-hidden="true" /> Excluir
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Notas de entrada</CardTitle>
            <CardDescription>
              Ao lançar a nota, o saldo entra no estoque e o custo médio de cada item é recalculado.
            </CardDescription>
          </div>
          <Button onClick={() => setEntryOpen(true)}>
            <FileText className="mr-2 size-4" aria-hidden="true" /> Nova entrada
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma entrada registrada.</p>
          ) : (
            data.entries.map((entry) => {
              const entryItems = data.entryItems.filter((item) => item.entry_id === entry.id);
              const supplier = data.suppliers.find((item) => item.id === entry.supplier_id);
              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
                >
                  <div className="min-w-40 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">
                        Nota {entry.invoice_number || "sem número"}
                      </p>
                      <Badge variant={entry.status === "applied" ? "secondary" : "outline"}>
                        {entry.status === "applied" ? "Lançada" : "Rascunho"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${entry.issued_at}T12:00:00`).toLocaleDateString("pt-BR")} ·{" "}
                      {supplier?.name ?? "sem fornecedor"} · {entryItems.length} item(ns) ·{" "}
                      {formatCurrency(Number(entry.total))}
                    </p>
                  </div>
                  {entry.status !== "applied" ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        void applyStockEntry(entry.id)
                          .then(() => {
                            toast.success("Nota lançada no estoque.");
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Falha ao lançar."),
                          );
                      }}
                    >
                      <CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" /> Lançar no estoque
                    </Button>
                  ) : null}
                  {entry.status !== "applied" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (!window.confirm("Excluir esta nota?")) return;
                        void deleteStockEntry(entry.id)
                          .then(onChanged)
                          .catch(() => toast.error("Falha ao excluir."));
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ---------- diálogo de fornecedor ---------- */}
      <Dialog open={Boolean(supplierDraft)} onOpenChange={(open) => !open && setSupplierDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{supplierDraft?.id ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
            <DialogDescription>Dados usados nas notas de entrada de mercadoria.</DialogDescription>
          </DialogHeader>
          {supplierDraft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sup-name">Nome</Label>
                <Input
                  id="sup-name"
                  value={supplierDraft.name}
                  onChange={(event) => setSupplierDraft({ ...supplierDraft, name: event.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sup-doc">CNPJ / CPF</Label>
                  <Input
                    id="sup-doc"
                    value={supplierDraft.document}
                    onChange={(event) => setSupplierDraft({ ...supplierDraft, document: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sup-phone">Telefone</Label>
                  <Input
                    id="sup-phone"
                    value={supplierDraft.phone}
                    onChange={(event) => setSupplierDraft({ ...supplierDraft, phone: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-email">E-mail</Label>
                <Input
                  id="sup-email"
                  value={supplierDraft.email}
                  onChange={(event) => setSupplierDraft({ ...supplierDraft, email: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-notes">Observações</Label>
                <Textarea
                  id="sup-notes"
                  rows={2}
                  value={supplierDraft.notes}
                  onChange={(event) => setSupplierDraft({ ...supplierDraft, notes: event.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveSupplier()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- diálogo da nota ---------- */}
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova entrada de mercadoria</DialogTitle>
            <DialogDescription>
              Informe os itens recebidos e o custo unitário pago. O custo médio é recalculado ao lançar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger aria-label="Fornecedor da nota">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-number">Número da nota</Label>
                <Input
                  id="entry-number"
                  value={invoiceNumber}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-date">Data</Label>
                <Input
                  id="entry-date"
                  type="date"
                  value={issuedAt}
                  onChange={(event) => setIssuedAt(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Itens recebidos</Label>
              {items.map((item, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2 rounded-xl border border-border/70 p-3">
                  <div className="min-w-48 flex-1 space-y-1">
                    <span className="text-[11px] text-muted-foreground">Item</span>
                    <Select
                      value={item.variantId ? `v:${item.variantId}` : item.productId ? `p:${item.productId}` : ""}
                      onValueChange={(value) => {
                        const target = targets.find((option) => option.value === value);
                        setItems((current) =>
                          current.map((row, position) =>
                            position === index
                              ? {
                                  ...row,
                                  productId: target?.productId ?? null,
                                  variantId: target?.variantId ?? null,
                                  description: target?.label ?? "",
                                }
                              : row,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger aria-label={`Item ${index + 1}`}>
                        <SelectValue placeholder="Escolha o produto ou SKU" />
                      </SelectTrigger>
                      <SelectContent>
                        {targets.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    Quantidade
                    <Input
                      className="w-24"
                      value={String(item.quantity)}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, position) =>
                            position === index
                              ? { ...row, quantity: Number(event.target.value.replace(",", ".")) || 0 }
                              : row,
                          ),
                        )
                      }
                      aria-label="Quantidade recebida"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    Custo unitário
                    <Input
                      className="w-28"
                      value={String(item.unitCost)}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, position) =>
                            position === index
                              ? { ...row, unitCost: Number(event.target.value.replace(",", ".")) || 0 }
                              : row,
                          ),
                        )
                      }
                      aria-label="Custo unitário"
                    />
                  </label>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover item"
                    onClick={() => setItems((current) => current.filter((_, position) => position !== index))}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((current) => [
                    ...current,
                    { productId: null, variantId: null, description: "", quantity: 1, unitCost: 0 },
                  ])
                }
              >
                <Plus className="mr-1 size-3.5" aria-hidden="true" /> Adicionar item
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="entry-freight">Frete</Label>
                <Input id="entry-freight" value={freight} onChange={(event) => setFreight(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entry-other">Outros custos</Label>
                <Input id="entry-other" value={otherCosts} onChange={(event) => setOtherCosts(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Total da nota</Label>
                <p className="pt-2 text-lg font-semibold text-foreground">{formatCurrency(total)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-notes">Observações</Label>
              <Textarea id="entry-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => void saveEntry(false)}>
              Salvar rascunho
            </Button>
            <Button disabled={busy} onClick={() => void saveEntry(true)}>
              Lançar no estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

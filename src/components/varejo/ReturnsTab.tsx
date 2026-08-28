import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2, Wallet } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import type { StockProduct } from "@/lib/estoque";
import {
  REFUND_METHOD_LABEL,
  RETURN_KIND_LABEL,
  RETURN_STATUS_LABEL,
  createReturn,
  useCredit,
  variantLabel,
  variantPrice,
  type RetailData,
  type ReturnItemDraft,
} from "@/lib/varejo";

interface ReturnsTabProps {
  storeId: string;
  products: StockProduct[];
  data: RetailData;
  onChanged: () => void;
}

/** Troca e devolução com retorno ao estoque e crédito na loja para o cliente. */
export function ReturnsTab({ storeId, products, data, onChanged }: ReturnsTabProps) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [kind, setKind] = useState<"return" | "exchange">("return");
  const [refundMethod, setRefundMethod] = useState<"credit" | "money" | "exchange">("credit");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [items, setItems] = useState<ReturnItemDraft[]>([
    { productId: null, variantId: null, productName: "", quantity: 1, unitPrice: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  const targets = useMemo(() => {
    const list: {
      value: string;
      label: string;
      productId: string;
      variantId: string | null;
      price: number;
    }[] = [];
    for (const product of products) {
      const variants = data.variants.filter((variant) => variant.product_id === product.id);
      if (variants.length === 0) {
        list.push({
          value: `p:${product.id}`,
          label: product.name,
          productId: product.id,
          variantId: null,
          price: Number(product.price ?? 0),
        });
      } else {
        for (const variant of variants) {
          list.push({
            value: `v:${variant.id}`,
            label: `${product.name} · ${variantLabel(variant)}`,
            productId: product.id,
            variantId: variant.id,
            price: variantPrice(variant, Number(product.price ?? 0)),
          });
        }
      }
    }
    return list;
  }, [products, data.variants]);

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const openCredits = data.credits.filter((credit) => Number(credit.balance) > 0);

  async function save() {
    if (customerName.trim().length < 2) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    setBusy(true);
    try {
      const days = Number(expiresInDays) || 0;
      await createReturn({
        storeId,
        orderId: null,
        customerName,
        customerPhone,
        kind,
        reason,
        refundMethod,
        restock,
        items,
        creditExpiresAt:
          refundMethod === "credit" && days > 0
            ? new Date(Date.now() + days * 86_400_000).toISOString()
            : null,
      });
      toast.success(
        refundMethod === "credit"
          ? `Registrado. Crédito de ${formatCurrency(total)} liberado para o cliente.`
          : "Devolução registrada.",
      );
      setOpen(false);
      setItems([{ productId: null, variantId: null, productName: "", quantity: 1, unitPrice: 0 }]);
      setCustomerName("");
      setCustomerPhone("");
      setReason("");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Trocas e devoluções</CardTitle>
            <CardDescription>
              Registre o item devolvido, devolva ao estoque e gere crédito na loja para o cliente.
            </CardDescription>
          </div>
          <Button onClick={() => setOpen(true)}>
            <RotateCcw className="mr-2 size-4" aria-hidden="true" /> Nova devolução
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.returns.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma devolução registrada.</p>
          ) : (
            data.returns.map((row) => {
              const rowItems = data.returnItems.filter((item) => item.return_id === row.id);
              return (
                <div key={row.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{RETURN_KIND_LABEL[row.kind] ?? row.kind}</Badge>
                    <p className="font-medium text-foreground">{row.customer_name ?? "Cliente"}</p>
                    <Badge variant="outline">{RETURN_STATUS_LABEL[row.status] ?? row.status}</Badge>
                    <span className="ml-auto font-semibold text-foreground">
                      {formatCurrency(Number(row.total))}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("pt-BR")} ·{" "}
                    {REFUND_METHOD_LABEL[row.refund_method] ?? row.refund_method}
                    {row.restock ? " · devolvido ao estoque" : ""}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {rowItems
                      .map((item) => `${Number(item.quantity)}× ${item.product_name}`)
                      .join(", ")}
                  </p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Créditos de clientes</CardTitle>
          <CardDescription>Saldo disponível para abater em uma próxima compra.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {openCredits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum crédito em aberto.</p>
          ) : (
            openCredits.map((credit) => (
              <div
                key={credit.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
              >
                <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-40 flex-1">
                  <p className="font-medium text-foreground">{credit.customer_name ?? "Cliente"}</p>
                  <p className="text-xs text-muted-foreground">
                    {credit.customer_phone ?? "sem telefone"} · gerado em{" "}
                    {new Date(credit.created_at).toLocaleDateString("pt-BR")}
                    {credit.expires_at
                      ? ` · vence em ${new Date(credit.expires_at).toLocaleDateString("pt-BR")}`
                      : ""}
                  </p>
                </div>
                <span className="font-semibold text-foreground">
                  {formatCurrency(Number(credit.balance))}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const raw = window.prompt(
                      "Quanto do crédito foi usado agora?",
                      String(Number(credit.balance)),
                    );
                    if (!raw) return;
                    const amount = Number(raw.replace(",", "."));
                    if (!Number.isFinite(amount) || amount <= 0) return;
                    void useCredit(credit, amount)
                      .then(() => {
                        toast.success("Crédito atualizado.");
                        onChanged();
                      })
                      .catch(() => toast.error("Falha ao atualizar o crédito."));
                  }}
                >
                  Usar crédito
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar troca ou devolução</DialogTitle>
            <DialogDescription>
              O item volta ao estoque (se marcado) e o cliente recebe crédito, dinheiro ou outro produto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ret-name">Cliente</Label>
                <Input
                  id="ret-name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-phone">Telefone</Label>
                <Input
                  id="ret-phone"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
                  <SelectTrigger aria-label="Tipo de registro">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="return">Devolução</SelectItem>
                    <SelectItem value="exchange">Troca</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reembolso</Label>
                <Select
                  value={refundMethod}
                  onValueChange={(value) => setRefundMethod(value as typeof refundMethod)}
                >
                  <SelectTrigger aria-label="Forma de reembolso">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Crédito na loja</SelectItem>
                    <SelectItem value="money">Dinheiro / estorno</SelectItem>
                    <SelectItem value="exchange">Troca por outro item</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Itens devolvidos</Label>
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
                                  productName: target?.label ?? "",
                                  unitPrice: target?.price ?? row.unitPrice,
                                }
                              : row,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger aria-label={`Item devolvido ${index + 1}`}>
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
                      aria-label="Quantidade devolvida"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    Valor unitário
                    <Input
                      className="w-28"
                      value={String(item.unitPrice)}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, position) =>
                            position === index
                              ? { ...row, unitPrice: Number(event.target.value.replace(",", ".")) || 0 }
                              : row,
                          ),
                        )
                      }
                      aria-label="Valor unitário"
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
                    { productId: null, variantId: null, productName: "", quantity: 1, unitPrice: 0 },
                  ])
                }
              >
                <Plus className="mr-1 size-3.5" aria-hidden="true" /> Adicionar item
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ret-reason">Motivo</Label>
              <Textarea
                id="ret-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex.: tamanho errado, defeito de fábrica..."
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={restock} onCheckedChange={setRestock} aria-label="Devolver ao estoque" />
                Devolver o item ao estoque
              </label>
              {refundMethod === "credit" ? (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  Validade do crédito (dias)
                  <Input
                    className="w-20"
                    value={expiresInDays}
                    onChange={(event) => setExpiresInDays(event.target.value)}
                    aria-label="Validade do crédito em dias"
                  />
                </label>
              ) : null}
              <span className="ml-auto text-lg font-semibold text-foreground">{formatCurrency(total)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

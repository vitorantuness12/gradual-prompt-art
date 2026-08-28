import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { saleTotals, type SuspendedSale } from "@/lib/pos-sale";
import { TABLE_STATUS_LABEL, TABLE_STATUS_TONE } from "@/lib/salao";
import { cn } from "@/lib/utils";
import { Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/* ---------------- Vendas suspensas ---------------- */

export function SuspendedSalesDialog({
  open,
  onOpenChange,
  suspended,
  onResume,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suspended: SuspendedSale[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vendas suspensas</DialogTitle>
          <DialogDescription>
            Retome uma venda guardada. A venda aberta agora volta para esta lista automaticamente.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-96">
          {suspended.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma venda suspensa.</p>
          ) : (
            <ul className="space-y-2">
              {suspended.map((sale) => {
                const totals = saleTotals(sale);
                return (
                  <li key={sale.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {sale.label || sale.customerName || (sale.tableNumber ? `Mesa ${sale.tableNumber}` : "Venda sem nome")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {totals.itemCount} item(ns) · {formatCurrency(totals.total)} · suspensa em{" "}
                          {formatDateTime(sale.suspendedAt)}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-10"
                          onClick={() => {
                            onResume(sale.id);
                            onOpenChange(false);
                          }}
                        >
                          Retomar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-10 text-destructive" onClick={() => onDiscard(sale.id)}>
                          Descartar
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Cliente ---------------- */

export interface PosCustomer {
  id: string;
  name: string;
  phone: string | null;
  cashback?: number;
  points?: number;
}

export function CustomerPickerDialog({
  open,
  onOpenChange,
  customers,
  selectedId,
  onSelect,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: PosCustomer[];
  selectedId: string | null;
  onSelect: (customer: PosCustomer) => void;
  onClear: () => void;
}) {
  const [term, setTerm] = useState("");

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const filtered = useMemo(() => {
    const query = term.trim().toLowerCase();
    if (!query) return customers.slice(0, 60);
    return customers
      .filter(
        (customer) =>
          customer.name.toLowerCase().includes(query) || (customer.phone ?? "").replace(/\D/g, "").includes(query.replace(/\D/g, "")),
      )
      .slice(0, 60);
  }, [customers, term]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Associar cliente</DialogTitle>
          <DialogDescription>Busque por nome ou telefone para vincular a venda e a fidelidade.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="h-11 pl-10"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Nome ou telefone"
            autoFocus
          />
        </div>

        <ScrollArea className="max-h-72">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-1 py-3 text-left transition-colors hover:bg-secondary",
                      selectedId === customer.id && "bg-primary/10",
                    )}
                    onClick={() => {
                      onSelect(customer);
                      onOpenChange(false);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.phone ?? "sem telefone"}</p>
                    </div>
                    {customer.cashback && customer.cashback > 0 ? (
                      <Badge variant="outline" className="shrink-0">
                        {formatCurrency(customer.cashback)} cashback
                      </Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
          >
            Vender sem cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Mesas e comandas ---------------- */

export interface PosTable {
  id: string;
  label: string;
  status: string;
  seats: number;
  areaName?: string | null;
  session?: { id: string; code: string; guests: number; label: string | null; total: number } | null;
}

export function TableMapDialog({
  open,
  onOpenChange,
  tables,
  selectedSessionId,
  onSelect,
  onPrintPreBill,
  onCallWaiter,
  onTransfer,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: PosTable[];
  selectedSessionId: string | null;
  onSelect: (table: PosTable) => void;
  onPrintPreBill: (table: PosTable) => void;
  onCallWaiter: (table: PosTable) => void;
  onTransfer: (table: PosTable) => void;
  onMerge: (table: PosTable) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mapa de mesas e comandas</DialogTitle>
          <DialogDescription>
            Escolha a mesa antes de lançar os produtos. Comandas abertas mostram o total já consumido.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60dvh]">
          {tables.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma mesa cadastrada. Cadastre o salão em Mesas para usar comandas.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {tables.map((table) => (
                <li key={table.id}>
                  <div
                    className={cn(
                      "flex h-full flex-col gap-2 rounded-2xl border-2 p-3",
                      TABLE_STATUS_TONE[table.status] ?? "border-border",
                      selectedSessionId && table.session?.id === selectedSessionId && "ring-2 ring-primary",
                    )}
                  >
                    <button type="button" className="text-left" onClick={() => onSelect(table)}>
                      <p className="text-lg leading-tight font-bold">{table.label}</p>
                      <p className="text-xs font-medium">{TABLE_STATUS_LABEL[table.status] ?? table.status}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs">
                        <Users className="size-3" aria-hidden="true" />
                        {table.session?.guests ?? table.seats} pessoa(s)
                      </p>
                      {table.session ? (
                        <p className="mt-1 text-xs font-semibold">
                          Comanda {table.session.code}
                          <span className="block tabular-nums">{formatCurrency(table.session.total)}</span>
                        </p>
                      ) : null}
                    </button>
                    <div className="mt-auto flex flex-wrap gap-1">
                      <Button size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={() => onSelect(table)}>
                        Lançar
                      </Button>
                      {table.session ? (
                        <>
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onPrintPreBill(table)}>
                            Pré-conta
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onTransfer(table)}>
                            Transferir
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onMerge(table)}>
                            Juntar
                          </Button>
                        </>
                      ) : null}
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onCallWaiter(table)}>
                        Chamar garçom
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Desconto e observação da venda ---------------- */

export function SaleDiscountDialog({
  open,
  onOpenChange,
  subtotal,
  discount,
  reason,
  couponCode,
  cashbackAvailable,
  cashbackUsed,
  fee,
  canDiscount,
  onSave,
  onRequestApproval,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
  discount: number;
  reason: string;
  couponCode: string;
  cashbackAvailable: number;
  cashbackUsed: number;
  fee: number;
  canDiscount: boolean;
  onSave: (input: { discount: number; discountReason: string; couponCode: string; cashbackUsed: number; fee: number }) => void;
  onRequestApproval: () => void;
}) {
  const [discountValue, setDiscountValue] = useState("");
  const [reasonValue, setReasonValue] = useState("");
  const [coupon, setCoupon] = useState("");
  const [cashback, setCashback] = useState("");
  const [feeValue, setFeeValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setDiscountValue(discount > 0 ? String(discount) : "");
    setReasonValue(reason);
    setCoupon(couponCode);
    setCashback(cashbackUsed > 0 ? String(cashbackUsed) : "");
    setFeeValue(fee > 0 ? String(fee) : "");
  }, [open, discount, reason, couponCode, cashbackUsed, fee]);

  const parsedDiscount = Number(discountValue.replace(",", ".")) || 0;
  // Desconto acima de 20% do subtotal é considerado sensível.
  const overLimit = subtotal > 0 && parsedDiscount > subtotal * 0.2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Descontos e acréscimos da venda</DialogTitle>
          <DialogDescription>Aplique desconto, cupom, cashback do cliente e taxa de entrega.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if ((parsedDiscount > 0 || overLimit) && !canDiscount) {
              onRequestApproval();
              return;
            }
            onSave({
              discount: parsedDiscount,
              discountReason: reasonValue.trim(),
              couponCode: coupon.trim(),
              cashbackUsed: Math.min(Number(cashback.replace(",", ".")) || 0, cashbackAvailable),
              fee: Number(feeValue.replace(",", ".")) || 0,
            });
            onOpenChange(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="venda-desconto">Desconto na venda (R$)</Label>
            <Input
              id="venda-desconto"
              className="h-11"
              inputMode="decimal"
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
              placeholder="0,00"
            />
            {overLimit ? (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Desconto acima de 20% do subtotal exige autorização da gerência.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-motivo">Motivo do desconto</Label>
            <Input
              id="venda-motivo"
              className="h-11"
              value={reasonValue}
              onChange={(event) => setReasonValue(event.target.value)}
              placeholder="Cliente fiel, avaria, cortesia..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-cupom">Cupom</Label>
            <Input
              id="venda-cupom"
              className="h-11 uppercase"
              value={coupon}
              onChange={(event) => setCoupon(event.target.value.toUpperCase())}
              placeholder="PROMO10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-cashback">Cashback a usar (R$)</Label>
            <Input
              id="venda-cashback"
              className="h-11"
              inputMode="decimal"
              disabled={cashbackAvailable <= 0}
              value={cashback}
              onChange={(event) => setCashback(event.target.value)}
              placeholder={cashbackAvailable > 0 ? `disponível ${formatCurrency(cashbackAvailable)}` : "cliente sem saldo"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venda-taxa">Taxa de entrega / acréscimo (R$)</Label>
            <Input
              id="venda-taxa"
              className="h-11"
              inputMode="decimal"
              value={feeValue}
              onChange={(event) => setFeeValue(event.target.value)}
              placeholder="0,00"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{(parsedDiscount > 0 || overLimit) && !canDiscount ? "Pedir autorização" : "Aplicar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaleNotesDialog({
  open,
  onOpenChange,
  notes,
  label,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: string;
  label: string;
  onSave: (input: { notes: string; label: string }) => void;
}) {
  const [value, setValue] = useState("");
  const [labelValue, setLabelValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setValue(notes);
    setLabelValue(label);
  }, [open, notes, label]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Observação da venda</DialogTitle>
          <DialogDescription>Aparece no cupom e nas vias de preparo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="venda-apelido">Apelido da venda</Label>
            <Input
              id="venda-apelido"
              className="h-11"
              value={labelValue}
              onChange={(event) => setLabelValue(event.target.value.slice(0, 40))}
              placeholder="João da moto, mesa da varanda..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="venda-obs">Observação</Label>
            <Textarea
              id="venda-obs"
              rows={3}
              value={value}
              onChange={(event) => setValue(event.target.value.slice(0, 400))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave({ notes: value.trim(), label: labelValue.trim() });
              onOpenChange(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Consulta de pedido ---------------- */

export interface PosRecentSale {
  id: string;
  code: string;
  customer_name: string;
  total: number | string;
  status: string;
  payment_method: string | null;
  created_at: string;
}

export function OrderLookupDialog({
  open,
  onOpenChange,
  sales,
  canCancel,
  onReprint,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: PosRecentSale[];
  canCancel: boolean;
  onReprint: (sale: PosRecentSale) => void;
  onCancel: (sale: PosRecentSale) => void;
}) {
  const [term, setTerm] = useState("");

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const filtered = useMemo(() => {
    const query = term.trim().toLowerCase();
    if (!query) return sales;
    return sales.filter(
      (sale) => sale.code.toLowerCase().includes(query) || sale.customer_name.toLowerCase().includes(query),
    );
  }, [sales, term]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Consultar pedido do PDV</DialogTitle>
          <DialogDescription>Reimprima o comprovante ou cancele uma venda deste turno.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="h-11 pl-10"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Número da venda ou cliente"
          />
        </div>

        <ScrollArea className="max-h-80">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma venda encontrada.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {filtered.map((sale) => (
                <li key={sale.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      #{sale.code} · <span className="tabular-nums">{formatCurrency(Number(sale.total))}</span>
                      {sale.status === "cancelled" ? (
                        <Badge variant="secondary" className="ml-2">
                          Cancelada
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sale.customer_name} · {formatDateTime(sale.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-9" onClick={() => onReprint(sale)}>
                      Reimprimir
                    </Button>
                    {sale.status !== "cancelled" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 text-destructive"
                        disabled={!canCancel}
                        onClick={() => onCancel(sale)}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

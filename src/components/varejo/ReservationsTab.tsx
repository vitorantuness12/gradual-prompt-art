import { useMemo, useState } from "react";
import { BellRing, CalendarClock, CheckCircle2, PackageCheck, XCircle } from "lucide-react";
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
import type { StockProduct } from "@/lib/estoque";
import {
  RESERVATION_STATUS_LABEL,
  createReservation,
  pickupMessage,
  reservationIsLate,
  updateReservation,
  variantLabel,
  whatsappLink,
  type RetailData,
} from "@/lib/varejo";

interface ReservationsTabProps {
  storeId: string;
  storeName: string;
  products: StockProduct[];
  data: RetailData;
  onChanged: () => void;
}

/** Reserva de item para retirada em loja, com prazo e aviso ao cliente. */
export function ReservationsTab({ storeId, storeName, products, data, onChanged }: ReservationsTabProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [deadlineHours, setDeadlineHours] = useState("48");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function save() {
    const chosen = targets.find((option) => option.value === target);
    if (!chosen) {
      toast.error("Escolha o item reservado.");
      return;
    }
    if (customerName.trim().length < 2) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    setBusy(true);
    try {
      await createReservation({
        storeId,
        productId: chosen.productId,
        variantId: chosen.variantId,
        productName: chosen.label,
        customerName,
        customerPhone,
        quantity: Number(quantity.replace(",", ".")) || 1,
        deadlineHours: Number(deadlineHours) || 48,
        notes,
      });
      toast.success("Reserva criada.");
      setOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar a reserva.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, values: Parameters<typeof updateReservation>[1], message: string) {
    try {
      await updateReservation(id, values);
      toast.success(message);
      onChanged();
    } catch {
      toast.error("Falha ao atualizar a reserva.");
    }
  }

  const openReservations = data.reservations.filter(
    (reservation) => !["picked_up", "cancelled"].includes(reservation.status),
  );
  const closed = data.reservations.filter((reservation) =>
    ["picked_up", "cancelled"].includes(reservation.status),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Reservas para retirada</CardTitle>
            <CardDescription>
              Guarde o item para o cliente com prazo definido e avise pelo WhatsApp quando estiver pronto.
            </CardDescription>
          </div>
          <Button onClick={() => setOpen(true)}>
            <CalendarClock className="mr-2 size-4" aria-hidden="true" /> Nova reserva
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {openReservations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma reserva em aberto.</p>
          ) : (
            openReservations.map((reservation) => {
              const late = reservationIsLate(reservation);
              const link = whatsappLink(
                reservation.customer_phone,
                pickupMessage(reservation, storeName),
              );
              return (
                <div
                  key={reservation.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"
                >
                  <div className="min-w-44 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{reservation.customer_name}</p>
                      <Badge variant={late ? "destructive" : "secondary"}>
                        {late ? "Prazo vencido" : (RESERVATION_STATUS_LABEL[reservation.status] ?? reservation.status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {Number(reservation.quantity)}× {reservation.product_name}
                      {reservation.pickup_deadline
                        ? ` · retirar até ${new Date(reservation.pickup_deadline).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                        : ""}
                    </p>
                  </div>

                  {link ? (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() =>
                          void patch(
                            reservation.id,
                            { status: "notified", notified_at: new Date().toISOString() },
                            "Cliente marcado como avisado.",
                          )
                        }
                      >
                        <BellRing className="mr-1 size-3.5" aria-hidden="true" /> Avisar
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void patch(reservation.id, { status: "ready" }, "Marcado como pronto.")}
                  >
                    <PackageCheck className="mr-1 size-3.5" aria-hidden="true" /> Pronto
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void patch(
                        reservation.id,
                        { status: "picked_up", picked_up_at: new Date().toISOString() },
                        "Retirada confirmada.",
                      )
                    }
                  >
                    <CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" /> Retirado
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void patch(reservation.id, { status: "cancelled" }, "Reserva cancelada.")}
                  >
                    <XCircle className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              );
            })
          )}

          {closed.length > 0 ? (
            <details className="rounded-xl border border-dashed border-border/70 p-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Histórico ({closed.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {closed.map((reservation) => (
                  <li key={reservation.id}>
                    {new Date(reservation.updated_at).toLocaleDateString("pt-BR")} ·{" "}
                    {reservation.customer_name} · {reservation.product_name} ·{" "}
                    {RESERVATION_STATUS_LABEL[reservation.status] ?? reservation.status}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova reserva</DialogTitle>
            <DialogDescription>O item fica guardado até o prazo combinado.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Item</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger aria-label="Item reservado">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="res-name">Cliente</Label>
                <Input
                  id="res-name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-phone">WhatsApp</Label>
                <Input
                  id="res-phone"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="res-qty">Quantidade</Label>
                <Input id="res-qty" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-deadline">Prazo (horas)</Label>
                <Input
                  id="res-deadline"
                  value={deadlineHours}
                  onChange={(event) => setDeadlineHours(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-notes">Observações</Label>
              <Textarea id="res-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              Reservar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

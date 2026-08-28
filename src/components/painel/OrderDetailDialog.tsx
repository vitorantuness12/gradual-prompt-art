import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { dispatchWhatsappOrderEvent } from "@/lib/whatsapp.functions";

/** Mapeia a situação do pedido para o evento de automação do WhatsApp. */
const WHATSAPP_EVENT_BY_STATUS: Record<string, string> = {
  confirmed: "order_confirmed",
  preparing: "order_preparing",
  ready: "order_ready",
  out_for_delivery: "order_out_for_delivery",
  delivered: "order_delivered",
  picked_up: "order_ready_pickup",
  completed: "order_completed",
  cancelled: "order_cancelled",
  rejected: "order_rejected",
  paid: "payment_approved",
};
import {
  ORDER_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
  formatCurrency,
  formatDateTime,
} from "@/lib/format";
import {
  ALL_ORDER_STATUSES,
  CANCEL_REASONS,
  nextStatuses,
  statusClass,
  statusLabel,
  type OrderStatus,
} from "@/lib/orders";
import { defaultPrintSettings, printOrder } from "@/lib/print";
import { PAYMENT_METHOD_LABEL } from "@/lib/store-config";
import type { PanelOrder } from "@/lib/panel-orders";

interface Props {
  order: PanelOrder | null;
  storeId: string | undefined;
  couriers: { userId: string; name: string }[];
  onOpenChange: (open: boolean) => void;
}

function addressText(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const raw = address as Record<string, string | undefined>;
  const parts = [
    [raw["street"], raw["number"]].filter(Boolean).join(", "),
    raw["district"],
    raw["complement"],
    raw["reference"] ? `Ref.: ${raw["reference"]}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

import { OrderTimeline } from "@/components/painel/OrderTimeline";

export function OrderDetailDialog({ order, storeId, couriers, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const { data: history } = useQuery({
    queryKey: ["order-history", order?.id],
    enabled: Boolean(order?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select("id, status, previous_status, reason, created_at")
        .eq("order_id", order!.id)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: printData } = useQuery({
    queryKey: ["print-context", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [settings, store] = await Promise.all([
        supabase.from("print_settings").select("*").eq("store_id", storeId!).maybeSingle(),
        supabase
          .from("stores")
          .select("name, phone, address_street, address_number, address_district, address_city")
          .eq("id", storeId!)
          .maybeSingle(),
      ]);
      return { settings: settings.data, store: store.data };
    },
  });

  /** Imprime o cupom do pedido no formato escolhido. */
  function handlePrint(mode: "thermal" | "common") {
    if (!order) return;
    const saved = printData?.settings;
    const settings = {
      ...defaultPrintSettings(),
      ...(saved
        ? {
            paper_width: saved.paper_width,
            copies: saved.copies,
            auto_print: saved.auto_print,
            printer_name: saved.printer_name,
            header_text: saved.header_text,
            footer_text: saved.footer_text,
            show_prices: saved.show_prices,
            show_customer: saved.show_customer,
            stations: saved.stations,
          }
        : {}),
      mode,
    };
    printOrder(
      {
        code: order.code,
        type: order.type,
        status: order.status,
        created_at: order.created_at,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        address: order.address,
        notes: order.notes,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        discount: order.discount,
        total: order.total,
        payment_method: order.payment_method
          ? (PAYMENT_METHOD_LABEL[order.payment_method as keyof typeof PAYMENT_METHOD_LABEL] ??
            order.payment_method)
          : null,
        payment_status: order.payment_status,
        table_number: order.table_number,
        items: (order.order_items ?? []).map((item) => ({
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: Number(item.total) / Math.max(1, item.quantity),
          total: item.total,
          notes: item.notes,
        })),
      },
      {
        name: printData?.store?.name ?? "Loja",
        phone: printData?.store?.phone ?? null,
        address_street: printData?.store?.address_street ?? null,
        address_number: printData?.store?.address_number ?? null,
        address_district: printData?.store?.address_district ?? null,
        address_city: printData?.store?.address_city ?? null,
      },
      settings,
    );
  }

  const dispatchOrderEvent = useServerFn(dispatchWhatsappOrderEvent);

  const mutate = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const nextStatus = typeof patch["status"] === "string" ? (patch["status"] as string) : null;
      const { error } = await supabase
        .from("orders")
        .update(patch as never)
        .eq("id", order!.id);
      if (error) throw new Error(error.message);
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user && storeId) {
        await supabase.from("audit_logs").insert({
          store_id: storeId,
          user_id: userData.user.id,
          action: "update_order",
          entity: "order",
          entity_id: order!.id,
          metadata: patch as never,
        });
      }

      // Automações de WhatsApp da loja (silenciosas: nunca quebram a atualização).
      const event = nextStatus ? WHATSAPP_EVENT_BY_STATUS[nextStatus] : null;
      if (event && storeId) {
        try {
          await dispatchOrderEvent({ data: { storeId, orderId: order!.id, event } });
        } catch {
          // A falha de automação não impede a mudança de status.
        }
      }
    },
    onSuccess: async () => {
      toast.success("Pedido atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["orders", storeId] });
      await queryClient.invalidateQueries({ queryKey: ["order-history", order?.id] });
      await queryClient.invalidateQueries({ queryKey: ["notifications", storeId] });
    },
    onError: () => toast.error("Não foi possível atualizar o pedido."),
  });

  if (!order) return null;

  const suggestions = nextStatuses(order.status as OrderStatus, order.type);
  const address = addressText(order.address);

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Pedido #{order.code}
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(order.status)}`}
            >
              {statusLabel(order.status)}
            </span>
          </DialogTitle>
          <DialogDescription>
            {ORDER_TYPE_LABEL[order.type]} · {formatDateTime(order.created_at)}
            {order.scheduled_for ? ` · agendado para ${formatDateTime(order.scheduled_for)}` : ""}
            {order.table_number ? ` · mesa ${order.table_number}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <section>
            <h3 className="font-medium text-foreground">Cliente</h3>
            <p className="text-muted-foreground">
              {order.customer_name} · {order.customer_phone ?? "sem telefone"}
              {order.customer_email ? ` · ${order.customer_email}` : ""}
            </p>
            {address ? <p className="text-muted-foreground">{address}</p> : null}
            {order.notes ? <p className="mt-1 text-foreground">Obs.: {order.notes}</p> : null}
          </section>

          <Separator />

          <section>
            <h3 className="font-medium text-foreground">Itens</h3>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {(order.order_items ?? []).map((item) => (
                <li key={item.id}>
                  {item.quantity}× {item.product_name} — {formatCurrency(Number(item.total))}
                  {item.notes ? <span className="block text-xs">{item.notes}</span> : null}
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatCurrency(Number(order.subtotal))}</dd>
              </div>
              {Number(order.discount) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Desconto {order.coupon_code ? `(${order.coupon_code})` : ""}
                  </dt>
                  <dd>−{formatCurrency(Number(order.discount))}</dd>
                </div>
              ) : null}
              {Number(order.cashback_used) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Saldo de fidelidade</dt>
                  <dd>−{formatCurrency(Number(order.cashback_used))}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Taxa de entrega</dt>
                <dd>{formatCurrency(Number(order.delivery_fee))}</dd>
              </div>
              <div className="flex justify-between font-semibold text-foreground">
                <dt>Total</dt>
                <dd>{formatCurrency(Number(order.total))}</dd>
              </div>
            </dl>
            <p className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">
                {order.payment_method
                  ? (PAYMENT_METHOD_LABEL[
                      order.payment_method as keyof typeof PAYMENT_METHOD_LABEL
                    ] ?? order.payment_method)
                  : "Pagamento não informado"}
              </Badge>
              <Badge variant="outline">
                {PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}
              </Badge>
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="font-medium text-foreground">Linha do tempo</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              Tudo que este pedido movimentou: situação, pagamento, impressão, entrega, avisos e
              fidelidade.
            </p>
            {storeId ? <OrderTimeline orderId={order.id} storeId={storeId} /> : null}
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="font-medium text-foreground">Ações</h3>

            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={
                      status === "rejected" || status === "cancelled" ? "outline" : "default"
                    }
                    disabled={mutate.isPending}
                    onClick={() => {
                      if (status === "cancelled" || status === "rejected") {
                        if (!reason.trim()) {
                          toast.error("Informe o motivo antes de cancelar ou recusar.");
                          return;
                        }
                        mutate.mutate({ status, cancel_reason: reason.trim() });
                        return;
                      }
                      mutate.mutate({ status });
                    }}
                  >
                    {statusLabel(status)}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Alterar situação</Label>
                <Select
                  value={order.status}
                  onValueChange={(value) => mutate.mutate({ status: value })}
                >
                  <SelectTrigger aria-label="Situação do pedido">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ORDER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Entregador</Label>
                <Select
                  value={order.delivery_person_id ?? "none"}
                  onValueChange={(value) =>
                    mutate.mutate({ delivery_person_id: value === "none" ? null : value })
                  }
                >
                  <SelectTrigger aria-label="Entregador responsável">
                    <SelectValue placeholder="Sem entregador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem entregador</SelectItem>
                    {couriers.map((courier) => (
                      <SelectItem key={courier.userId} value={courier.userId}>
                        {courier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo do cancelamento ou recusa</Label>
              <Textarea
                id="motivo"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Escolha ou descreva o motivo"
              />
              <div className="flex flex-wrap gap-1">
                {CANCEL_REASONS.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setReason(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handlePrint("thermal")}
                className="gap-2"
              >
                <Printer className="size-4" /> Cupom térmico
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handlePrint("common")}
                className="gap-2"
              >
                <Printer className="size-4" /> Folha comum
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TRACK_STEPS, formatOrderAddress, publicTrackingPath, trackStepIndex } from "@/lib/acompanhamento";
import {
  SUBSCRIPTION_PERIODS,
  SUBSCRIPTION_PERIOD_LABEL,
  type SubscriptionPeriod,
} from "@/lib/assinaturas";
import { createSubscriptionFromOrder } from "@/lib/assinaturas.functions";
import { customerOrderDetail, type CustomerHistory } from "@/lib/cliente.functions";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, formatCurrency, formatDateTime } from "@/lib/format";


type OrderRow = CustomerHistory["orders"][number];

/**
 * Cartão de um pedido do histórico: abre o acompanhamento ao vivo (atualiza
 * sozinho a cada 15 segundos enquanto o pedido está em andamento) e permite
 * repetir o pedido com os preços de hoje.
 */
interface Props {
  order: OrderRow;
  session: string;
  onRepeat: (order: OrderRow) => void;
  repeating: boolean;
}

const OPEN_STATUSES = new Set([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "awaiting_payment",
  "paid",
]);

export function CustomerOrderCard({ order, session, onRepeat, repeating }: Props) {
  const [open, setOpen] = useState(false);
  /** Periodicidade escolhida ao transformar este pedido em assinatura. */
  const [period, setPeriod] = useState<SubscriptionPeriod>("month");
  const fetchDetail = useServerFn(customerOrderDetail);
  const createSubscription = useServerFn(createSubscriptionFromOrder);
  const queryClient = useQueryClient();

  const subscribe = useMutation({
    mutationFn: () => createSubscription({ data: { session, orderId: order.id, period } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["cliente-assinaturas", session] });
      } else {
        toast.error(result.message);
      }
    },
    onError: () => toast.error("Não foi possível criar a assinatura agora."),
  });


  const detail = useQuery({
    queryKey: ["cliente-pedido", order.id],
    queryFn: () => fetchDetail({ data: { session, orderId: order.id } }),
    enabled: open,
    refetchInterval: OPEN_STATUSES.has(order.status) ? 15_000 : false,
  });

  const live = detail.data?.order ?? null;
  const status = live?.status ?? order.status;
  const currentStep = trackStepIndex(status);
  const cancelled = status === "cancelled" || status === "rejected";

  return (
    <Card className="border-border/70">
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            Pedido {order.code} · {order.storeName}
          </CardTitle>
          <Badge variant={cancelled ? "destructive" : "secondary"}>
            {ORDER_STATUS_LABEL[status] ?? status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(order.createdAt)} · {ORDER_TYPE_LABEL[order.type] ?? order.type} ·{" "}
          {formatCurrency(order.total)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? <ChevronUp className="mr-1 size-4" /> : <ChevronDown className="mr-1 size-4" />}
            {open ? "Fechar acompanhamento" : "Acompanhar em tempo real"}
          </Button>
          {order.canRepeat ? (
            <Button size="sm" onClick={() => onRepeat(order)} disabled={repeating}>
              <RefreshCw className="mr-1 size-4" />
              Repetir pedido
            </Button>
          ) : null}
          {order.canRepeat ? (
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={(value) => setPeriod(value as SubscriptionPeriod)}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBSCRIPTION_PERIODS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {SUBSCRIPTION_PERIOD_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={subscribe.isPending}
                onClick={() => subscribe.mutate()}
              >
                <CalendarClock className="mr-1 size-4" aria-hidden="true" />
                Assinar
              </Button>
            </div>
          ) : null}

          <Button asChild variant="ghost" size="sm">
            <Link to="/acompanhar" search={{ codigo: order.publicToken }}>
              Link de acompanhamento
            </Link>
          </Button>
        </div>

        {open ? (
          detail.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : live ? (
            <div className="space-y-4">
              {cancelled ? (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Este pedido foi encerrado sem conclusão. Fale com a loja se precisar de ajuda.
                </p>
              ) : (
                <ol className="space-y-2">
                  {TRACK_STEPS.map((step, index) => {
                    const done = currentStep >= index;
                    const at = live.timeline.find((entry) => entry.status === step);
                    return (
                      <li key={step} className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`size-2.5 rounded-full ${done ? "bg-success" : "bg-muted"}`}
                        />
                        <span
                          className={
                            done ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"
                          }
                        >
                          {ORDER_STATUS_LABEL[step]}
                          {at ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {formatDateTime(at.createdAt)}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              <ul className="space-y-1 rounded-xl border border-border p-3 text-sm">
                {live.items.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                    <span>
                      {item.quantity}× {item.name}
                    </span>
                    <span>{formatCurrency(item.total)}</span>
                  </li>
                ))}
              </ul>

              {live.address ? (
                <div className="rounded-xl border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">Endereço de entrega</p>
                  <p className="text-muted-foreground">{formatOrderAddress(live.address)}</p>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">
                Atualiza automaticamente. Link público:{" "}
                <Link to={publicTrackingPath(live.publicToken)} className="underline">
                  compartilhar
                </Link>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {detail.data?.message ?? "Não foi possível carregar o pedido."}
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/format";
import {
  CARD_PADDING,
  DELAY_CLASS,
  ITEM_PREP_LABEL,
  KDS_CHANNEL_LABEL,
  canCompleteOrder,
  delayTone,
  formatElapsed,
  itemProgress,
  itemsForStation,
  minutesSince,
  nextKdsStatus,
  normalizeItemPrepStatus,
  stationsOfOrder,
  type KdsItem,
  type KdsOrderLike,
  type PosKdsSettings,
} from "@/lib/pos-kds";
import { STATION_LABEL, stationForItem } from "@/lib/salao";
import { cn } from "@/lib/utils";
import {
  AlarmClock,
  Ban,
  Check,
  ChevronRight,
  CircleDot,
  Clock,
  Flame,
  Info,
  Pause,
  Printer,
  TriangleAlert,
} from "lucide-react";

interface KdsOrderCardProps {
  order: KdsOrderLike;
  settings: PosKdsSettings;
  now: number;
  isBusy: boolean;
  canReject: boolean;
  onAdvance: (order: KdsOrderLike) => void;
  onItemStatus: (item: KdsItem, status: "pending" | "preparing" | "ready" | "paused") => void;
  onPriority: (order: KdsOrderLike) => void;
  onPrint: (order: KdsOrderLike, reprint: boolean) => void;
  onReject: (order: KdsOrderLike) => void;
  onDetails: (order: KdsOrderLike) => void;
}

/** Card de pedido do monitor de preparo, com cronômetro e ações por item. */
export function KdsOrderCard({
  order,
  settings,
  now,
  isBusy,
  canReject,
  onAdvance,
  onItemStatus,
  onPriority,
  onPrint,
  onReject,
  onDetails,
}: KdsOrderCardProps) {
  const items = (order.order_items ?? []) as KdsItem[];
  const visibleItems = itemsForStation(items, settings.station);
  const reference = order.prep_started_at ?? order.created_at;
  const minutes = minutesSince(reference, now);
  const tone = delayTone(minutes, settings);
  const progress = itemProgress(items, settings.station);
  const next = nextKdsStatus(order.status);
  const ready = canCompleteOrder(items, {
    station: settings.station,
    stationCanCompleteOrder: settings.stationCanCompleteOrder,
  });
  const scheduled = order.scheduled_for ? new Date(order.scheduled_for) : null;
  const compact = settings.kdsView === "compact";

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border-2 bg-card shadow-sm",
        CARD_PADDING[settings.density],
        tone === "late" ? "border-destructive" : tone === "warning" ? "border-amber-500/70" : "border-border",
        order.priority > 0 && "ring-2 ring-primary/40",
      )}
      aria-label={`Pedido ${order.code}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("leading-none font-bold tabular-nums", compact ? "text-xl" : "text-3xl")}>#{order.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ORDER_TYPE_LABEL[order.type] ?? order.type} · {KDS_CHANNEL_LABEL[order.channel] ?? order.channel}
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0 gap-1 font-bold tabular-nums", DELAY_CLASS[tone])}>
          {tone === "late" ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : <Clock className="size-3.5" aria-hidden="true" />}
          {formatElapsed(reference, now)}
        </Badge>
      </header>

      <div className="mt-2 flex flex-wrap gap-1">
        {order.priority > 0 ? (
          <Badge className="gap-1 bg-primary text-primary-foreground">
            <Flame className="size-3" aria-hidden="true" />
            Prioritário
          </Badge>
        ) : null}
        {scheduled ? (
          <Badge variant="outline" className="gap-1">
            <AlarmClock className="size-3" aria-hidden="true" />
            {scheduled.toLocaleTimeString("pt-BR", { timeStyle: "short" })}
          </Badge>
        ) : null}
        <Badge
          variant="outline"
          className={cn(
            order.payment_status === "paid"
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          {order.payment_status === "paid" ? "Pago" : "Pagamento pendente"}
        </Badge>
        {stationsOfOrder(items).map((station) => (
          <Badge key={station} variant="secondary">
            {STATION_LABEL[station] ?? station}
          </Badge>
        ))}
        {order.table_number ? <Badge variant="secondary">Mesa {order.table_number}</Badge> : null}
        {order.delivery_person_id ? <Badge variant="secondary">Entregador definido</Badge> : null}
      </div>

      {settings.showCustomerName ? (
        <p className="mt-2 truncate text-sm font-semibold">{order.customer_name}</p>
      ) : null}

      {progress.total > 0 ? (
        <div className="mt-2 space-y-1">
          <Progress value={(progress.ready / progress.total) * 100} className="h-1.5" />
          <p className="text-xs text-muted-foreground tabular-nums">
            {progress.ready} de {progress.total} item(ns) preparado(s)
          </p>
        </div>
      ) : null}

      <ul className="mt-2 space-y-1.5">
        {visibleItems.map((item) => {
          const status = normalizeItemPrepStatus(item.prep_status);
          return (
            <li key={item.id} className="flex items-start gap-2">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "mt-0.5 size-8 shrink-0 rounded-full border",
                  status === "ready"
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : status === "paused"
                      ? "border-amber-500/60 bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      : "border-border",
                )}
                aria-label={`${ITEM_PREP_LABEL[status]} — alternar ${item.product_name}`}
                disabled={isBusy}
                onClick={() => onItemStatus(item, status === "ready" ? "pending" : "ready")}
              >
                {status === "ready" ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : status === "paused" ? (
                  <Pause className="size-4" aria-hidden="true" />
                ) : (
                  <CircleDot className="size-4" aria-hidden="true" />
                )}
              </Button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm leading-snug", status === "ready" && "text-muted-foreground line-through")}>
                  <span className="font-bold tabular-nums">{item.quantity}x</span> {item.product_name}
                </p>
                {settings.showNotes && item.notes ? (
                  <p className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    {item.notes}
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  {STATION_LABEL[stationForItem(item.prep_station)] ?? "Cozinha"}
                  {settings.showPrices && item.total ? ` · ${formatCurrency(Number(item.total))}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {next ? (
          <Button
            size="lg"
            className="h-11 flex-1 font-semibold"
            disabled={isBusy}
            onClick={() => onAdvance(order)}
            title={
              next === "ready" && !ready
                ? "Ainda há itens sem marcação — ao confirmar, todos serão marcados como preparados."
                : undefined
            }
          >
            {order.status === "pending"
              ? "Aceitar"
              : order.status === "confirmed"
                ? "Iniciar preparo"
                : order.status === "preparing"
                  ? "Marcar pronto"
                  : order.status === "ready"
                    ? "Chamar expedição"
                    : "Concluir"}
            <ChevronRight className="ml-1 size-4" aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="outline"
          className="size-11"
          aria-label={order.priority > 0 ? "Remover prioridade" : "Priorizar pedido"}
          disabled={isBusy}
          onClick={() => onPriority(order)}
        >
          <Flame className="size-4" aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-11"
          aria-label="Imprimir pedido"
          onClick={() => onPrint(order, order.status !== "pending")}
        >
          <Printer className="size-4" aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-11"
          aria-label="Abrir detalhes do pedido"
          onClick={() => onDetails(order)}
        >
          <Info className="size-4" aria-hidden="true" />
        </Button>
        {canReject && ["pending", "confirmed"].includes(order.status) ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-11 text-destructive"
            aria-label="Recusar pedido"
            disabled={isBusy}
            onClick={() => onReject(order)}
          >
            <Ban className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

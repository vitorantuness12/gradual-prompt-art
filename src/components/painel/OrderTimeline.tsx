import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { CHANNEL_LABEL } from "@/lib/producao";
import { formatCurrency, formatDateTime } from "@/lib/format";

/**
 * Linha do tempo única do pedido.
 *
 * Junta, em ordem cronológica, tudo que o pedido provocou no sistema:
 * criação e canal de origem, mudanças de situação, pagamentos, impressões
 * por setor, entrega, avisos enviados e pontos de fidelidade.
 */
interface TimelineEvent {
  at: string;
  label: string;
  detail?: string;
  group: string;
}

const GROUP_TONE: Record<string, string> = {
  pedido: "bg-primary",
  pagamento: "bg-emerald-500",
  impressao: "bg-sky-500",
  entrega: "bg-amber-500",
  aviso: "bg-violet-500",
  fidelidade: "bg-pink-500",
};

export function OrderTimeline({ orderId, storeId }: { orderId: string; storeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["order-timeline", orderId],
    queryFn: async (): Promise<TimelineEvent[]> => {
      const [order, history, payments, prints, deliveries, notifications, loyalty] =
        await Promise.all([
          supabase
            .from("orders")
            .select("created_at, channel, type, code, total")
            .eq("id", orderId)
            .maybeSingle(),
          supabase
            .from("order_status_history")
            .select("status, previous_status, reason, created_at")
            .eq("order_id", orderId),
          supabase
            .from("payments")
            .select("status, method, amount, created_at, paid_at")
            .eq("order_id", orderId),
          supabase.from("print_jobs").select("station, status, created_at").eq("order_id", orderId),
          supabase
            .from("deliveries")
            .select("status, created_at, accepted_at, picked_up_at, delivered_at")
            .eq("order_id", orderId),
          supabase
            .from("notifications")
            .select("event, title, channel, created_at")
            .eq("order_id", orderId),
          supabase
            .from("loyalty_transactions")
            .select("points, kind, created_at")
            .eq("order_id", orderId)
            .eq("store_id", storeId),
        ]);

      const events: TimelineEvent[] = [];

      if (order.data) {
        events.push({
          at: order.data.created_at,
          label: `Pedido #${order.data.code} criado`,
          detail: `Origem: ${CHANNEL_LABEL[order.data.channel] ?? order.data.channel} · ${formatCurrency(Number(order.data.total))}`,
          group: "pedido",
        });
      }

      for (const row of history.data ?? []) {
        events.push({
          at: row.created_at,
          label: `Situação: ${row.status}`,
          detail: [row.previous_status ? `antes: ${row.previous_status}` : "", row.reason ?? ""]
            .filter(Boolean)
            .join(" · "),
          group: "pedido",
        });
      }

      for (const row of payments.data ?? []) {
        events.push({
          at: row.paid_at ?? row.created_at,
          label: `Pagamento ${row.status}`,
          detail: `${row.method} · ${formatCurrency(Number(row.amount))}`,
          group: "pagamento",
        });
      }

      for (const row of prints.data ?? []) {
        events.push({
          at: row.created_at,
          label: `Impressão ${row.status}`,
          detail: `setor ${row.station}`,
          group: "impressao",
        });
      }

      for (const row of deliveries.data ?? []) {
        events.push({ at: row.created_at, label: "Entrega criada", group: "entrega" });
        if (row.accepted_at)
          events.push({ at: row.accepted_at, label: "Entregador aceitou", group: "entrega" });
        if (row.picked_up_at)
          events.push({ at: row.picked_up_at, label: "Saiu para entrega", group: "entrega" });
        if (row.delivered_at)
          events.push({ at: row.delivered_at, label: "Entregue", group: "entrega" });
      }

      for (const row of notifications.data ?? []) {
        events.push({
          at: row.created_at,
          label: row.title,
          detail: `aviso por ${row.channel}`,
          group: "aviso",
        });
      }

      for (const row of loyalty.data ?? []) {
        events.push({
          at: row.created_at,
          label: `Fidelidade: ${row.points > 0 ? "+" : ""}${row.points} pontos`,
          detail: row.kind,
          group: "fidelidade",
        });
      }

      return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    },
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Carregando a linha do tempo...</p>;
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum evento registrado para este pedido.</p>
    );
  }

  return (
    <ol className="space-y-3">
      {data.map((event, index) => (
        <li key={`${event.at}-${index}`} className="flex gap-3">
          <span
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${GROUP_TONE[event.group] ?? "bg-muted-foreground"}`}
            aria-hidden
          />
          <div className="text-sm">
            <p className="font-medium">{event.label}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(event.at)}
              {event.detail ? ` · ${event.detail}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

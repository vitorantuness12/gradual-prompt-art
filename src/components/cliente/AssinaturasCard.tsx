import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SUBSCRIPTION_PERIOD_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  isSubscriptionPeriod,
} from "@/lib/assinaturas";
import { listCustomerSubscriptions, updateSubscriptionState } from "@/lib/assinaturas.functions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AssinaturasCardProps extends React.ComponentPropsWithoutRef<"div"> {
  /** Sessão assinada do cliente (login por telefone). */
  session: string;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function periodLabel(period: string) {
  return isSubscriptionPeriod(period) ? SUBSCRIPTION_PERIOD_LABEL[period] : period;
}

/**
 * Assinaturas recorrentes do cliente: mostra o que vem no próximo pedido,
 * quando ele será gerado e permite pausar, retomar ou cancelar.
 */
export function AssinaturasCard({ session, className, ...props }: AssinaturasCardProps) {
  const fetchSubscriptions = useServerFn(listCustomerSubscriptions);
  const changeState = useServerFn(updateSubscriptionState);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["cliente-assinaturas", session],
    queryFn: () => fetchSubscriptions({ data: { session } }),
  });

  const mutation = useMutation({
    mutationFn: (input: { subscriptionId: string; action: "pause" | "resume" | "cancel" }) =>
      changeState({ data: { session, ...input } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["cliente-assinaturas", session] });
      } else {
        toast.error(result.message);
      }
    },
    onError: () => toast.error("Não foi possível atualizar a assinatura agora."),
  });

  if (query.isPending) return <Skeleton className={cn("h-32 w-full", className)} />;

  const data = query.data;
  if (!data?.ok || data.subscriptions.length === 0) return null;

  return (
    <Card className={cn("border-border/70", className)} {...props}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Minhas assinaturas</CardTitle>
        <CardDescription>
          A cada ciclo geramos um pedido novo na loja com os mesmos itens. Você pode pausar ou cancelar
          antes do próximo pedido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.subscriptions.map((item) => {
          const active = item.status === "active" && !item.paused;
          const closed = item.status === "canceled" || item.status === "expired";
          return (
            <div key={item.id} className="space-y-2 rounded-lg border border-border/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.storeName}</p>
                  <p className="text-xs text-muted-foreground">
                    {periodLabel(item.period)} · {formatCurrency(item.total)} por ciclo
                  </p>
                </div>
                <Badge variant={closed ? "outline" : item.paused ? "secondary" : "default"}>
                  {item.paused ? "Pausada" : (SUBSCRIPTION_STATUS_LABEL[item.status] ?? item.status)}
                </Badge>
              </div>

              <ul className="space-y-1 text-xs text-muted-foreground">
                {item.items.map((line, index) => (
                  <li key={`${item.id}-${index}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {line.quantity}× {line.name}
                    </span>
                    <span>{formatCurrency(line.quantity * line.unitPrice)}</span>
                  </li>
                ))}
              </ul>

              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                {closed
                  ? `Encerrada · ${item.ordersCount} pedido(s) gerado(s)`
                  : item.paused
                    ? item.resumesAt
                      ? `Pausada até ${formatDate(item.resumesAt)}`
                      : "Pausada — nenhum pedido novo será gerado"
                    : `Próximo pedido em ${formatDate(item.nextOrderAt)}`}
              </p>

              {!closed ? (
                <div className="flex flex-wrap gap-2">
                  {active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ subscriptionId: item.id, action: "pause" })}
                    >
                      <Pause className="mr-1 size-4" aria-hidden="true" />
                      Pausar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ subscriptionId: item.id, action: "resume" })}
                    >
                      <Play className="mr-1 size-4" aria-hidden="true" />
                      Retomar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ subscriptionId: item.id, action: "cancel" })}
                  >
                    <X className="mr-1 size-4" aria-hidden="true" />
                    Cancelar
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

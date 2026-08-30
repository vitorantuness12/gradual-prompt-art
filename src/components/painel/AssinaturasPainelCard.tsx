import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SUBSCRIPTION_PERIOD_LABEL, SUBSCRIPTION_STATUS_LABEL } from "@/lib/assinaturas";
import {
  subscriptionPanelReport,
  type SubscriptionPanelReport,
  type SubscriptionPanelRow,
} from "@/lib/assinaturas-painel.functions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AssinaturasPainelCardProps extends React.ComponentPropsWithoutRef<"div"> {
  storeId: string | undefined;
}

const PERIODS = [7, 30, 60, 90] as const;
type Period = (typeof PERIODS)[number];

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function periodLabel(period: string): string {
  return SUBSCRIPTION_PERIOD_LABEL[period as keyof typeof SUBSCRIPTION_PERIOD_LABEL] ?? period;
}

function nextCycleLabel(row: SubscriptionPanelRow): string {
  if (row.paused) return "Pausada";
  if (!row.nextOrderAt) return "Sem próximo ciclo";
  const date = new Date(row.nextOrderAt);
  const label = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return row.overdue ? `Vencido em ${label}` : `Próximo em ${label}`;
}

/** Blocos de resumo no topo do card. */
function Summary({ report }: { report: SubscriptionPanelReport }) {
  const metrics = [
    {
      label: "Assinaturas ativas",
      value: String(report.activeCount),
      hint: `${report.pausedCount} pausadas · ${report.canceledCount} encerradas`,
    },
    {
      label: "Receita recorrente prevista",
      value: formatCurrency(report.monthlyRecurringRevenue),
      hint: "por mês, somando os ciclos ativos",
    },
    {
      label: "Pedidos gerados",
      value: String(report.periodOrders),
      hint: `${formatCurrency(report.periodRevenue)} nos últimos ${report.days} dias`,
    },
    {
      label: "Próximos ciclos",
      value: String(report.dueNext7Days),
      hint: report.overdueCount
        ? `nos próximos 7 dias · ${report.overdueCount} atrasado(s)`
        : "nos próximos 7 dias",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {metric.label}
          </p>
          <p className="text-2xl font-semibold text-foreground">{metric.value}</p>
          <p className="text-xs text-muted-foreground">{metric.hint}</p>
        </div>
      ))}
    </div>
  );
}

/** Evolução diária: receita recorrente (linha) e pedidos gerados (barras). */
function DailyCharts({ report }: { report: SubscriptionPanelReport }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border/70 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Receita recorrente por dia
        </p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={report.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={dayLabel}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-muted-foreground"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-muted-foreground"
                width={54}
                tickFormatter={(value: number) => formatCurrency(Number(value))}
              />
              <Tooltip
                labelFormatter={(value) => dayLabel(String(value))}
                formatter={(value: number) => [formatCurrency(Number(value)), "Receita"]}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pedidos de assinatura por dia
        </p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={dayLabel}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-muted-foreground"
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-muted-foreground"
                width={32}
              />
              <Tooltip
                labelFormatter={(value) => dayLabel(String(value))}
                formatter={(value: number) => [String(value), "Pedidos"]}
              />
              <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/** Lista das assinaturas com status do próximo ciclo. */
function SubscriptionList({ rows }: { rows: SubscriptionPanelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma assinatura ainda. Seus clientes podem transformar um pedido em assinatura na área
        “Meus pedidos”.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/70 rounded-lg border border-border/70">
      {rows.slice(0, 25).map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.customerName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {periodLabel(row.period)} · {row.ordersCount} pedido(s) gerado(s)
              {row.itemsLabel ? ` · ${row.itemsLabel}` : ""}
            </p>
            {row.lastError ? (
              <p className="text-xs text-destructive">{row.lastError}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{formatCurrency(row.total)}</p>
              <p className="text-xs text-muted-foreground">{nextCycleLabel(row)}</p>
            </div>
            <Badge
              variant={
                row.overdue
                  ? "destructive"
                  : row.status === "active" || row.status === "trialing"
                    ? "default"
                    : "secondary"
              }
            >
              {SUBSCRIPTION_STATUS_LABEL[row.status] ?? row.status}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Painel de assinaturas recorrentes do lojista: quantas estão ativas, quanto
 * elas representam por mês, quais ciclos vencem em seguida e como a receita
 * recorrente evoluiu dia a dia.
 */
export function AssinaturasPainelCard({
  storeId,
  className,
  ...props
}: AssinaturasPainelCardProps) {
  const [days, setDays] = useState<Period>(30);
  const fetchReport = useServerFn(subscriptionPanelReport);

  const query = useQuery({
    queryKey: ["painel-assinaturas", storeId, days],
    enabled: Boolean(storeId),
    queryFn: () => fetchReport({ data: { storeId: storeId as string, days } }),
  });

  return (
    <Card className={cn("border-border/70", className)} {...props}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Assinaturas recorrentes</CardTitle>
            <CardDescription>
              Assinaturas ativas, receita prevista por mês e status dos próximos ciclos.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-1" role="group" aria-label="Período do relatório">
            {PERIODS.map((period) => (
              <Button
                key={period}
                type="button"
                size="sm"
                variant={period === days ? "default" : "outline"}
                onClick={() => setDays(period)}
              >
                {period}d
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!storeId ? (
          <p className="text-sm text-muted-foreground">Selecione uma loja para ver as assinaturas.</p>
        ) : query.isPending ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : query.isError || !query.data ? (
          <p className="text-sm text-destructive">Não foi possível carregar as assinaturas agora.</p>
        ) : (
          <>
            <Summary report={query.data} />
            <DailyCharts report={query.data} />
            <SubscriptionList rows={query.data.subscriptions} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

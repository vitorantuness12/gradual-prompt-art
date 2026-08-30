import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { growthReport, type GrowthReport } from "@/lib/relatorios-crescimento.functions";
import { cn } from "@/lib/utils";

export interface RelatorioCrescimentoCardProps
  extends React.ComponentPropsWithoutRef<"div"> {
  storeId: string | undefined;
}

const PERIODS = [7, 30, 60, 90] as const;
type Period = (typeof PERIODS)[number];

interface Metric {
  label: string;
  value: string;
  hint: string;
}

function buildMetrics(report: GrowthReport): Metric[] {
  return [
    {
      label: "Carrinhos recuperados",
      value: String(report.cartsRecovered),
      hint: `${report.cartsReminded} lembretes enviados · ${report.recoveryRate.toFixed(0)}% de retorno · ${formatCurrency(report.recoveredRevenue)}`,
    },
    {
      label: "Uso de cupons",
      value: String(report.couponOrders),
      hint: `${formatCurrency(report.couponDiscount)} de desconto concedido`,
    },
    {
      label: "Upsell aceitos",
      value: String(report.upsellOrders),
      hint: `${report.upsellItems} itens do "leve também" · ${formatCurrency(report.upsellRevenue)} extra`,
    },
    {
      label: "Resgates de cashback",
      value: String(report.cashbackRedemptions),
      hint: `${formatCurrency(report.cashbackRedeemed)} resgatados · ${formatCurrency(report.cashbackGranted)} creditados`,
    },
  ];
}

/**
 * Relatório por período das alavancas de receita: recuperação de carrinho,
 * cupons, upsell e cashback. Serve para o lojista decidir onde investir.
 */
export function RelatorioCrescimentoCard({
  storeId,
  className,
  ...props
}: RelatorioCrescimentoCardProps) {
  const [days, setDays] = useState<Period>(30);
  const fetchReport = useServerFn(growthReport);

  const query = useQuery({
    queryKey: ["relatorio-crescimento", storeId, days],
    enabled: Boolean(storeId),
    queryFn: () => fetchReport({ data: { storeId: storeId as string, days } }),
  });

  return (
    <Card className={cn("border-border/70", className)} {...props}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Relatório de crescimento</CardTitle>
            <CardDescription>
              Carrinhos recuperados, cupons, upsell e cashback no período escolhido.
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
          <p className="text-sm text-muted-foreground">Selecione uma loja para ver o relatório.</p>
        ) : query.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : query.isError || !query.data ? (
          <p className="text-sm text-destructive">Não foi possível carregar o relatório agora.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {buildMetrics(query.data).map((metric) => (
                <div key={metric.label} className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="text-2xl font-semibold text-foreground">{metric.value}</p>
                  <p className="text-xs text-muted-foreground">{metric.hint}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Base do período: {query.data.totalOrders} pedidos ·{" "}
              {formatCurrency(query.data.totalRevenue)} em vendas.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

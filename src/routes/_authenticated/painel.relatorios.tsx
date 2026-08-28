import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { BatchRiskReport } from "@/components/varejo/BatchRiskReport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { downloadCsv, printReport, type CsvRow } from "@/lib/relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios")({
  component: ReportsPage,
});

const PERIODS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
] as const;

interface OrderRow {
  id: string;
  total: number | string;
  status: string;
  created_at: string;
  type: string | null;
  payment_method: string | null;
}

interface ItemRow {
  product_name: string;
  quantity: number;
  total: number | string;
  created_at: string;
}

function ReportsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const [period, setPeriod] = useState<string>("30");
  const days = Number(period);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", storeId, days],
    enabled: Boolean(storeId),
    queryFn: async () => {
      // Busca o dobro do período para permitir a comparação com o intervalo anterior.
      const since = new Date();
      since.setDate(since.getDate() - days * 2);

      const [orders, items] = await Promise.all([
        supabase
          .from("orders")
          .select("id, total, status, created_at, type, payment_method")
          .eq("store_id", storeId!)
          .gte("created_at", since.toISOString()),
        supabase
          .from("order_items")
          .select("product_name, quantity, total, created_at")
          .eq("store_id", storeId!)
          .gte("created_at", since.toISOString()),
      ]);
      if (orders.error) throw new Error(orders.error.message);
      if (items.error) throw new Error(items.error.message);
      return { orders: (orders.data ?? []) as OrderRow[], items: (items.data ?? []) as ItemRow[] };
    },
  });

  const analysis = useMemo(() => {
    const cut = new Date();
    cut.setDate(cut.getDate() - days);
    const cutIso = cut.toISOString();

    const allOrders = data?.orders ?? [];
    const current = allOrders.filter((order) => order.created_at >= cutIso);
    const previous = allOrders.filter((order) => order.created_at < cutIso);

    const valid = (rows: OrderRow[]) => rows.filter((row) => row.status !== "cancelled");
    const revenue = (rows: OrderRow[]) => valid(rows).reduce((sum, row) => sum + Number(row.total), 0);

    const currentRevenue = revenue(current);
    const previousRevenue = revenue(previous);
    const currentCount = valid(current).length;
    const previousCount = valid(previous).length;

    const items = (data?.items ?? []).filter((item) => item.created_at >= cutIso);
    const grouped = Object.values(
      items.reduce<Record<string, { name: string; quantity: number; total: number }>>((acc, item) => {
        const key = item.product_name;
        acc[key] = acc[key] ?? { name: key, quantity: 0, total: 0 };
        acc[key].quantity += item.quantity;
        acc[key].total += Number(item.total);
        return acc;
      }, {}),
    ).sort((a, b) => b.total - a.total);

    // Curva ABC: A até 80% do faturamento, B até 95%, C o restante.
    const itemsRevenue = grouped.reduce((sum, row) => sum + row.total, 0);
    let cumulative = 0;
    const abc = grouped.map((row) => {
      cumulative += row.total;
      const share = itemsRevenue > 0 ? (cumulative / itemsRevenue) * 100 : 0;
      const curve = share <= 80 ? "A" : share <= 95 ? "B" : "C";
      return { ...row, share, curve, participation: itemsRevenue > 0 ? (row.total / itemsRevenue) * 100 : 0 };
    });

    const byChannel = Object.entries(
      valid(current).reduce<Record<string, { count: number; total: number }>>((acc, order) => {
        const key = order.type ?? "outro";
        acc[key] = acc[key] ?? { count: 0, total: 0 };
        acc[key].count += 1;
        acc[key].total += Number(order.total);
        return acc;
      }, {}),
    ).map(([key, value]) => ({ key, ...value }));

    return {
      currentRevenue,
      previousRevenue,
      currentCount,
      previousCount,
      average: currentCount > 0 ? currentRevenue / currentCount : 0,
      previousAverage: previousCount > 0 ? previousRevenue / previousCount : 0,
      cancelled: current.filter((order) => order.status === "cancelled").length,
      abc,
      byChannel,
      current,
    };
  }, [data, days]);

  function variation(now: number, before: number) {
    if (before <= 0) return now > 0 ? 100 : 0;
    return ((now - before) / before) * 100;
  }

  function exportOrders() {
    const rows: CsvRow[] = analysis.current.map((order) => ({
      data: new Date(order.created_at).toLocaleString("pt-BR"),
      situacao: order.status,
      canal: order.type ?? "",
      pagamento: order.payment_method ?? "",
      total: Number(order.total).toFixed(2).replace(".", ","),
    }));
    downloadCsv(`pedidos-${days}-dias`, rows);
  }

  function exportAbc() {
    const rows: CsvRow[] = analysis.abc.map((row) => ({
      item: row.name,
      curva: row.curve,
      quantidade: row.quantity,
      faturamento: row.total.toFixed(2).replace(".", ","),
      participacao: `${row.participation.toFixed(1)}%`,
    }));
    downloadCsv(`curva-abc-${days}-dias`, rows);
  }

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Desempenho da loja, comparativo de períodos e curva ABC do catálogo."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[190px]" aria-label="Período do relatório">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={exportOrders}>
          <Download className="mr-2 size-4" aria-hidden="true" /> Pedidos (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportAbc}>
          <Download className="mr-2 size-4" aria-hidden="true" /> Curva ABC (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={() => printReport()}>
          Exportar PDF
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (
        <div id="relatorio-conteudo">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Pedidos"
              value={String(analysis.currentCount)}
              hint={comparisonHint(variation(analysis.currentCount, analysis.previousCount))}
            />
            <StatCard
              label="Faturamento"
              value={formatCurrency(analysis.currentRevenue)}
              hint={comparisonHint(variation(analysis.currentRevenue, analysis.previousRevenue))}
            />
            <StatCard
              label="Ticket médio"
              value={formatCurrency(analysis.average)}
              hint={comparisonHint(variation(analysis.average, analysis.previousAverage))}
            />
            <StatCard label="Cancelados" value={String(analysis.cancelled)} />
          </div>

          <Card className="mt-6 border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Comparativo com o período anterior</CardTitle>
              <CardDescription>
                Últimos {days} dias contra os {days} dias imediatamente anteriores.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <ComparisonRow label="Faturamento" now={analysis.currentRevenue} before={analysis.previousRevenue} money />
              <ComparisonRow label="Pedidos" now={analysis.currentCount} before={analysis.previousCount} />
              <ComparisonRow label="Ticket médio" now={analysis.average} before={analysis.previousAverage} money />
            </CardContent>
          </Card>

          <Tabs defaultValue="abc" className="mt-6">
            <TabsList>
              <TabsTrigger value="abc">Curva ABC</TabsTrigger>
              <TabsTrigger value="canais">Canais de venda</TabsTrigger>
              <TabsTrigger value="lotes">Lotes e perdas</TabsTrigger>
            </TabsList>

            <TabsContent value="abc">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Curva ABC de produtos</CardTitle>
                  <CardDescription>
                    A = 80% do faturamento, B = próximos 15%, C = cauda longa.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.abc.length === 0 ? (
                    <EmptyState title="Sem vendas no período" />
                  ) : (
                    <table className="w-full text-sm">
                      <caption className="sr-only">Curva ABC dos produtos vendidos no período</caption>
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th scope="col" className="py-2 font-medium">Item</th>
                          <th scope="col" className="py-2 font-medium">Curva</th>
                          <th scope="col" className="py-2 text-right font-medium">Qtd.</th>
                          <th scope="col" className="py-2 text-right font-medium">Faturamento</th>
                          <th scope="col" className="py-2 text-right font-medium">Participação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.abc.map((row) => (
                          <tr key={row.name} className="border-t border-border">
                            <td className="py-2">{row.name}</td>
                            <td className="py-2">
                              <Badge variant={row.curve === "A" ? "default" : "secondary"}>{row.curve}</Badge>
                            </td>
                            <td className="py-2 text-right">{row.quantity}</td>
                            <td className="py-2 text-right">{formatCurrency(row.total)}</td>
                            <td className="py-2 text-right">{row.participation.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="canais">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Vendas por canal</CardTitle>
                </CardHeader>
                <CardContent>
                  {analysis.byChannel.length === 0 ? (
                    <EmptyState title="Sem vendas no período" />
                  ) : (
                    <ul className="divide-y divide-border text-sm">
                      {analysis.byChannel.map((row) => (
                        <li key={row.key} className="flex items-center justify-between py-2">
                          <span className="capitalize text-foreground">{row.key}</span>
                          <span className="text-muted-foreground">
                            {row.count} pedidos · {formatCurrency(row.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="lotes">
              <BatchRiskReport storeId={storeId} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function comparisonHint(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}% vs. período anterior`;
}

function ComparisonRow({
  label,
  now,
  before,
  money,
}: {
  label: string;
  now: number;
  before: number;
  money?: boolean;
}) {
  const diff = before <= 0 ? (now > 0 ? 100 : 0) : ((now - before) / before) * 100;
  const positive = diff >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-xl border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{money ? formatCurrency(now) : now.toFixed(0)}</p>
      <p className={positive ? "flex items-center gap-1 text-xs text-emerald-600" : "flex items-center gap-1 text-xs text-destructive"}>
        <Icon className="size-3" aria-hidden="true" />
        {diff.toFixed(1)}% · antes {money ? formatCurrency(before) : before.toFixed(0)}
      </p>
    </div>
  );
}

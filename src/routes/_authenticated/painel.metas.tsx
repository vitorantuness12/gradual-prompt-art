import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { GoalsForm } from "@/components/painel/GoalsForm";
import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { InstallPanelCard } from "@/components/painel/InstallPanelCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { formatCurrency } from "@/lib/format";
import { goalsKey } from "@/lib/metas";
import { getGoalsOverview } from "@/lib/metas.functions";

export const Route = createFileRoute("/_authenticated/painel/metas")({
  component: MetasPage,
  head: () => ({
    meta: [
      { title: "Metas e resumo do dia | O Seu Pedido" },
      {
        name: "description",
        content:
          "Acompanhe quanto sua loja já vendeu hoje e no mês, defina metas e receba o resumo diário no WhatsApp.",
      },
      { property: "og:title", content: "Metas e resumo do dia | O Seu Pedido" },
      {
        property: "og:description",
        content: "Metas de vendas, ticket médio e resumo diário no WhatsApp do lojista.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function MetasPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const overviewFn = useServerFn(getGoalsOverview);

  const overview = useQuery({
    queryKey: goalsKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => overviewFn({ data: { storeId: storeId! } }),
  });

  if (!storeId) {
    return <EmptyState title="Escolha uma loja" description="Selecione a loja para ver as metas." />;
  }

  const data = overview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas e resumo do dia"
        description="Veja o quanto falta para bater a meta e receba o resumo no WhatsApp."
      />

      {overview.isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Vendas hoje"
              value={formatCurrency(data.progress.todayRevenue)}
              hint={`${data.progress.todayOrders} pedidos`}
            />
            <StatCard
              label="Vendas no mês"
              value={formatCurrency(data.progress.monthRevenue)}
              hint={`${data.progress.monthOrders} pedidos`}
            />
            <StatCard label="Ticket médio" value={formatCurrency(data.progress.ticket)} />
            <StatCard
              label="Falta hoje"
              value={
                data.goals.dailyRevenueGoal > 0 ? formatCurrency(data.progress.dailyRemaining) : "—"
              }
              hint={data.goals.dailyRevenueGoal > 0 ? `${data.progress.dailyPercent}% da meta` : "Sem meta diária"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progresso das metas</CardTitle>
              <CardDescription>Atualiza automaticamente conforme os pedidos entram.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Meta do dia", percent: data.progress.dailyPercent, goal: data.goals.dailyRevenueGoal },
                { label: "Meta do mês", percent: data.progress.monthlyPercent, goal: data.goals.monthlyRevenueGoal },
                { label: "Pedidos no mês", percent: data.progress.ordersPercent, goal: data.goals.monthlyOrdersGoal },
                { label: "Ticket médio", percent: data.progress.ticketPercent, goal: data.goals.ticketGoal },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="text-muted-foreground">
                      {row.goal > 0 ? `${row.percent}%` : "sem meta definida"}
                    </span>
                  </div>
                  <Progress value={row.goal > 0 ? row.percent : 0} />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <GoalsForm storeId={storeId} overview={data} />
            <InstallPanelCard />
          </div>
        </>
      )}
    </div>
  );
}

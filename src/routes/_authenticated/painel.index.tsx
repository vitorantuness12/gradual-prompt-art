import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUS_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import { FEATURE_LABEL, suggestSegmentGroup, type FeatureKey } from "@/lib/painel-segmentos";

export const Route = createFileRoute("/_authenticated/painel/")({
  component: OverviewPage,
});

const SHORTCUT_PATH: Record<FeatureKey, string> = {
  dashboard: "/painel",
  pedidos: "/painel/pedidos",
  encomendas: "/painel/encomendas",
  pdv: "/pdv",
  salao: "/painel/salao",
  kds: "/kds",
  agendamentos: "/painel/agendamentos",
  produtos: "/painel/produtos",
  estoque: "/painel/estoque",
  personalizar: "/painel/personalizar",
  entregas: "/painel/entregas",
  entregadores: "/painel/entregadores",
  frete: "/painel/frete",
  clientes: "/painel/clientes",
  avaliacoes: "/painel/avaliacoes",
  promocoes: "/painel/promocoes",
  fidelidade: "/painel/fidelidade",
  relatorios: "/painel/relatorios",
  pagamentos: "/painel/pagamentos",
  fiscal: "/painel/fiscal",
  marketing: "/painel/marketing",
  inteligencia: "/painel/inteligencia",
  metas: "/painel/metas",
  whatsapp: "/painel/whatsapp",
  impressao: "/painel/impressao",
  integracoes: "/painel/integracoes",
  equipe: "/painel/equipe",
  assinatura: "/painel/assinatura",
  privacidade: "/painel/privacidade",
  configuracoes: "/painel/configuracoes",
  suporte: "/painel/suporte",
};

function OverviewPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const segment = suggestSegmentGroup(active?.store.segment);

  const { data, isLoading } = useQuery({
    queryKey: ["overview", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, code, status, total, created_at, customer_name, is_demo")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return orders ?? [];
    },
  });

  const showAgenda = Boolean(active?.store.accepts_scheduling);

  const { data: appointments } = useQuery({
    queryKey: ["overview-agenda", storeId],
    enabled: Boolean(storeId) && showAgenda,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { data: rows, error } = await supabase
        .from("appointments")
        .select("id, starts_at, status, customer_name")
        .eq("store_id", storeId!)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const orders = data ?? [];
  const today = new Date().toDateString();
  const todayOrders = orders.filter((order) => new Date(order.created_at).toDateString() === today);
  const valid = todayOrders.filter((order) => order.status !== "cancelled");
  const revenue = valid.reduce((sum, order) => sum + Number(order.total), 0);
  const pending = orders.filter((order) => order.status === "pending").length;
  const average = valid.length > 0 ? revenue / valid.length : 0;
  const inKitchen = orders.filter((order) => order.status === "preparing").length;
  const onRoute = orders.filter((order) => order.status === "out_for_delivery").length;
  const kind = segment === "alimentacao" ? "alimentacao" : "varejo";

  const cards: { label: string; value: string }[] = [
    { label: "Pedidos hoje", value: String(todayOrders.length) },
    { label: "Faturamento hoje", value: formatCurrency(revenue) },
  ];
  if (kind === "alimentacao") {
    cards.push({ label: "Em preparo", value: String(inKitchen) }, { label: "Saiu para entrega", value: String(onRoute) });
  } else if (kind === "varejo") {
    cards.push({ label: "Ticket médio", value: formatCurrency(average) }, { label: "Aguardando confirmação", value: String(pending) });
  } else {
    cards.push({ label: "Ticket médio", value: formatCurrency(average) }, { label: "Vendas concluídas", value: String(valid.length) });
  }

  const shortcuts: FeatureKey[] = segment === "alimentacao"
    ? ["pedidos", "pdv", "kds", "agendamentos"]
    : ["produtos", "estoque", "pedidos", "agendamentos"];

  return (
    <div>
      <PageHeader
        title={active ? active.store.name : "Visão geral"}
        description="Resumo da operação de hoje."
        actions={
          active ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/$slug" params={{ slug: active.store.slug }} target="_blank">
                Ver loja pública
              </Link>
            </Button>
          ) : null
        }
      />

      {shortcuts.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {shortcuts.map((key) => (
            <Button key={key} asChild variant="secondary" size="sm">
              <Link to={SHORTCUT_PATH[key] as never}>{FEATURE_LABEL[key]}</Link>
            </Button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>
      )}

      {showAgenda ? (
        <Card className="mt-6 border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Próximos horários de hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {(appointments ?? []).length === 0 ? (
              <EmptyState title="Sem agendamentos hoje" description="Os horários marcados aparecem aqui." />
            ) : (
              <ul className="divide-y divide-border">
                {(appointments ?? []).slice(0, 6).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                    <span className="font-medium text-foreground">{item.customer_name}</span>
                    <span className="text-muted-foreground">{formatDateTime(item.starts_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6 border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Últimos pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <EmptyState title="Nenhum pedido ainda" description="Os pedidos recebidos aparecem aqui." />
          ) : (
            <ul className="divide-y divide-border">
              {orders.slice(0, 8).map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">#{order.code}</span>
                    {order.is_demo ? <DemoBadge /> : null}
                    <span className="text-muted-foreground">{order.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>{ORDER_STATUS_LABEL[order.status]}</span>
                    <span>{formatDateTime(order.created_at)}</span>
                    <span className="font-medium text-foreground">{formatCurrency(Number(order.total))}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

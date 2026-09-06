import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { MarketingRecipeCard } from "@/components/marketing/MarketingRecipeCard";
import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { MARKETING_RECIPES, marketingOverviewKey, totalSent } from "@/lib/marketing";
import { getMarketingOverview, runMarketingNow } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/painel/marketing")({
  component: MarketingPage,
  head: () => ({
    meta: [
      { title: "Marketing automático | O Seu Pedido" },
      {
        name: "description",
        content:
          "Ative mensagens automáticas de aniversário, retorno de clientes e pedido de avaliação pelo WhatsApp da sua loja.",
      },
      { property: "og:title", content: "Marketing automático | O Seu Pedido" },
      {
        property: "og:description",
        content: "Cupom de aniversário, reativação de clientes e pedido de avaliação no automático.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function MarketingPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getMarketingOverview);
  const runFn = useServerFn(runMarketingNow);

  const overview = useQuery({
    queryKey: marketingOverviewKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => overviewFn({ data: { storeId: storeId! } }),
  });

  const run = useMutation({
    mutationFn: async () => {
      const result = await runFn({ data: { storeId: storeId! } });
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: marketingOverviewKey(storeId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!storeId) {
    return <EmptyState title="Escolha uma loja" description="Selecione a loja para configurar o marketing." />;
  }

  const data = overview.data;
  const activeCount = data?.rules.filter((row) => row.isActive).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing automático"
        description="Mensagens que saem sozinhas: aniversário, retorno de quem parou de comprar e pedido de avaliação."
        actions={
          <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Enviando..." : "Enviar agora"}
          </Button>
        }
      />

      {overview.isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Mensagens ativas" value={`${activeCount} de ${MARKETING_RECIPES.length}`} />
            <StatCard label="Enviadas em 30 dias" value={String(totalSent(data.stats))} />
            <StatCard
              label="WhatsApp da loja"
              value={data.channelReady ? "Conectado" : "Não conectado"}
              hint={data.channelReady ? "" : "Conecte em Configurações › WhatsApp"}
            />
          </div>

          {!data.channelReady && (
            <Card className="border-destructive/40">
              <CardContent className="py-4 text-sm text-muted-foreground">
                O WhatsApp da loja ainda não está conectado, então as mensagens não saem. Você pode configurar tudo
                aqui e ligar o WhatsApp depois.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {MARKETING_RECIPES.map((recipe) => (
              <MarketingRecipeCard
                key={recipe.event}
                storeId={storeId}
                recipe={recipe}
                overview={data}
                onSaved={() => queryClient.invalidateQueries({ queryKey: marketingOverviewKey(storeId) })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

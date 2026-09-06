import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { BestSellersCard } from "@/components/catalogo/BestSellersCard";
import { SmartCatalogCard } from "@/components/catalogo/SmartCatalogCard";
import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { catalogIntelligenceKey } from "@/lib/catalogo-inteligente";
import { getCatalogIntelligence } from "@/lib/catalogo-inteligente.functions";

export const Route = createFileRoute("/_authenticated/painel/inteligencia")({
  component: InteligenciaPage,
  head: () => ({
    meta: [
      { title: "Catálogo inteligente | O Seu Pedido" },
      {
        name: "description",
        content:
          "Sugestões de itens combinados feitas por inteligência artificial e vitrine ordenada pelos produtos que mais vendem.",
      },
      { property: "og:title", content: "Catálogo inteligente | O Seu Pedido" },
      {
        property: "og:description",
        content: "Aumente o valor do pedido com combinações sugeridas e vitrine organizada pelas vendas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function InteligenciaPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const overviewFn = useServerFn(getCatalogIntelligence);

  const overview = useQuery({
    queryKey: catalogIntelligenceKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => overviewFn({ data: { storeId: storeId! } }),
  });

  if (!storeId) {
    return (
      <EmptyState
        title="Escolha uma loja"
        description="Selecione a loja para configurar as sugestões do catálogo."
      />
    );
  }

  const data = overview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo inteligente"
        description="Sugestões de itens que combinam e vitrine organizada pelo que mais vende."
      />

      {overview.isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Itens no catálogo" value={String(data.productCount)} />
            <StatCard
              label="Itens com combinação"
              value={String(data.productsWithSuggestions)}
              hint={`${data.suggestionCount} combinações no total`}
            />
            <StatCard
              label="Sugestões na sacola"
              value={data.settings.upsellAiEnabled ? "Ativas" : "Desligadas"}
              hint={
                data.settings.lastAiRunAt
                  ? `IA usada em ${new Date(data.settings.lastAiRunAt).toLocaleDateString("pt-BR")}`
                  : "IA ainda não usada"
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SmartCatalogCard storeId={storeId} overview={data} />
            <BestSellersCard storeId={storeId} overview={data} />
          </div>
        </>
      )}
    </div>
  );
}

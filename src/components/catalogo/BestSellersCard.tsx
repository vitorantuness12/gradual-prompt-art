import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalogIntelligenceKey, type CatalogIntelligenceOverview } from "@/lib/catalogo-inteligente";
import { applyBestSellerOrder } from "@/lib/catalogo-inteligente.functions";
import { formatCurrency } from "@/lib/format";

export interface BestSellersCardProps {
  storeId: string;
  overview: CatalogIntelligenceOverview;
}

/** Ranking de vendas do período e botão para aplicar a nova ordem da vitrine. */
export function BestSellersCard({ storeId, overview }: BestSellersCardProps) {
  const queryClient = useQueryClient();
  const applyFn = useServerFn(applyBestSellerOrder);

  const apply = useMutation({
    mutationFn: () => applyFn({ data: { storeId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.info(result.message);
      void queryClient.invalidateQueries({ queryKey: catalogIntelligenceKey(storeId) });
      void queryClient.invalidateQueries({ queryKey: ["catalog", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["public-store"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mais vendidos do período</CardTitle>
        <CardDescription>
          Ranking dos últimos {overview.settings.autosortWindowDays} dias. Aplique a ordem para deixar
          os campeões no topo da vitrine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {overview.bestSellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há vendas suficientes no período escolhido.
          </p>
        ) : (
          <ol className="space-y-2">
            {overview.bestSellers.map((item, index) => (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm">{item.name}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {item.quantity} vendidos
                  <br />
                  {formatCurrency(item.revenue)}
                </span>
              </li>
            ))}
          </ol>
        )}

        <Button variant="outline" onClick={() => apply.mutate()} disabled={apply.isPending}>
          <ArrowUpDown className="mr-2 size-4" aria-hidden="true" />
          {apply.isPending ? "Reorganizando..." : "Aplicar ordem na vitrine"}
        </Button>
        {overview.settings.lastSortRunAt ? (
          <p className="text-xs text-muted-foreground">
            Última reorganização em{" "}
            {new Date(overview.settings.lastSortRunAt).toLocaleString("pt-BR")}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

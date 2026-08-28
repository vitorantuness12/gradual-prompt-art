import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPublicReviews, fetchRatingSummary } from "@/lib/avaliacoes";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Estrelas somente leitura. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Nota ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("size-4", i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** Bloco público com média e últimas avaliações da loja. */
export function StoreReviews({ storeId }: { storeId: string }) {
  const summary = useQuery({
    queryKey: ["store-rating", storeId],
    queryFn: () => fetchRatingSummary(storeId),
  });
  const reviews = useQuery({
    queryKey: ["store-reviews-public", storeId],
    queryFn: () => fetchPublicReviews(storeId),
  });

  const count = summary.data?.count ?? 0;

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">Avaliações</CardTitle>
        {count > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <Stars value={summary.data?.average ?? 0} />
            <span className="font-medium text-foreground">{(summary.data?.average ?? 0).toFixed(1)}</span>
            <span className="text-muted-foreground">
              ({count} {count === 1 ? "avaliação" : "avaliações"})
            </span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">
            Esta loja ainda não tem avaliações. Faça um pedido e seja o primeiro a avaliar.
          </p>
        ) : (
          <ul className="space-y-4">
            {(reviews.data ?? []).map((review) => (
              <li key={review.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={review.rating} />
                  <span className="text-sm font-medium text-foreground">{review.customer_name}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(review.created_at)}</span>
                </div>
                {review.comment ? <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p> : null}
                {review.reply ? (
                  <p className="mt-2 rounded-lg bg-secondary/60 p-3 text-sm text-foreground">
                    <span className="font-medium">Resposta da loja: </span>
                    {review.reply}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Stars } from "@/components/store/StoreReviews";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { fetchStoreReviews, type StoreReview } from "@/lib/avaliacoes";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel/avaliacoes")({
  component: ReviewsPage,
});

function ReviewsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["store-reviews", storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchStoreReviews(storeId!),
  });

  const reviews = data ?? [];
  const published = reviews.filter((review) => review.is_published);
  const average =
    published.length > 0 ? published.reduce((sum, review) => sum + review.rating, 0) / published.length : 0;
  const pendingReply = published.filter((review) => !review.reply).length;

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<StoreReview> }) => {
      const { error } = await supabase.from("store_reviews").update(input.patch).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["store-reviews", storeId] });
      toast.success("Avaliação atualizada.");
    },
    onError: () => toast.error("Não foi possível atualizar a avaliação."),
  });

  return (
    <div>
      <PageHeader
        title="Avaliações"
        description="Notas e comentários enviados pelos clientes após a conclusão dos pedidos."
      />

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Nota média" value={average > 0 ? average.toFixed(1) : "—"} hint="Somente publicadas" />
            <StatCard label="Avaliações" value={String(reviews.length)} />
            <StatCard label="Sem resposta" value={String(pendingReply)} />
          </div>

          <div className="mt-6 space-y-3">
            {reviews.length === 0 ? (
              <EmptyState title="Nenhuma avaliação ainda" description="Elas aparecem aqui assim que o cliente avaliar um pedido concluído." />
            ) : (
              reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  onSave={(patch) => update.mutate({ id: review.id, patch })}
                  saving={update.isPending}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  onSave,
  saving,
}: {
  review: StoreReview;
  onSave: (patch: Partial<StoreReview>) => void;
  saving: boolean;
}) {
  const [reply, setReply] = useState(review.reply ?? "");

  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Stars value={review.rating} />
          <span className="text-sm font-medium text-foreground">{review.customer_name}</span>
          <span className="text-xs text-muted-foreground">{formatDateTime(review.created_at)}</span>
          {!review.is_published ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Oculta</span>
          ) : null}
        </div>

        {review.comment ? <p className="text-sm text-muted-foreground">{review.comment}</p> : null}

        <Textarea
          value={reply}
          rows={2}
          maxLength={600}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Responder publicamente ao cliente"
          aria-label={`Resposta para a avaliação de ${review.customer_name}`}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={saving}
            onClick={() => onSave({ reply: reply.trim() || null, replied_at: new Date().toISOString() })}
          >
            Salvar resposta
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => onSave({ is_published: !review.is_published })}
          >
            {review.is_published ? "Ocultar da loja" : "Publicar na loja"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

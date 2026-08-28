import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { QUOTE_STATUS_LABEL, type QuoteStatus } from "@/lib/encomendas";
import { getPublicQuote, respondQuote } from "@/lib/encomendas.functions";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/orcamento/$token")({
  component: QuotePage,
  head: () => ({
    meta: [
      { title: "Sua proposta de encomenda | O Seu Pedido" },
      {
        name: "description",
        content: "Veja os itens, o valor, o sinal e aprove a proposta da sua encomenda em poucos toques.",
      },
      { property: "og:title", content: "Sua proposta de encomenda" },
      { property: "og:description", content: "Confira os detalhes e aprove sua encomenda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function QuotePage() {
  const { token } = Route.useParams();
  const fetchQuote = useServerFn(getPublicQuote);
  const respond = useServerFn(respondQuote);
  const [reason, setReason] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["public-quote", token],
    queryFn: () => fetchQuote({ data: { token } }),
  });

  const answer = useMutation({
    mutationFn: async (approve: boolean) => respond({ data: { token, approve, reason: reason.trim() || undefined } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      void refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <div className="mx-auto max-w-2xl p-6"><Skeleton className="h-72 rounded-2xl" /></div>;

  if (!data?.found) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Proposta não encontrada</h1>
        <p className="text-muted-foreground">Confira o link enviado pela loja.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Proposta de encomenda</h1>
        <p className="text-muted-foreground">
          {data.storeName} • Olá, {data.customerName}
        </p>
        <Badge variant="secondary" className="mt-2">
          {QUOTE_STATUS_LABEL[(data.status as QuoteStatus) ?? "draft"] ?? data.status}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens</CardTitle>
          {data.eventAt ? <CardDescription>Para {formatDateTime(data.eventAt)}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.items.map((item, index) => (
            <div key={index} className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
              <div>
                <p className="font-medium">
                  {item.quantity}x {item.name}
                </p>
                {Object.entries(item.customization).length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {Object.entries(item.customization)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(" • ")}
                  </p>
                ) : null}
                {item.notes ? <p className="text-xs text-muted-foreground">{item.notes}</p> : null}
              </div>
              <span>{formatCurrency(item.total)}</span>
            </div>
          ))}
          {data.discount > 0 ? <p>Desconto: −{formatCurrency(data.discount)}</p> : null}
          {data.deliveryFee > 0 ? <p>Entrega: {formatCurrency(data.deliveryFee)}</p> : null}
          <p className="text-base font-semibold">Total: {formatCurrency(data.total)}</p>
          <p className="text-muted-foreground">
            Sinal de {data.depositPercent}%: {formatCurrency(data.depositAmount)} • Saldo na entrega:{" "}
            {formatCurrency(Math.max(0, data.total - data.depositAmount))}
          </p>
          {data.notes ? <p className="text-muted-foreground">{data.notes}</p> : null}
          {data.validUntil ? (
            <p className="text-xs text-muted-foreground">Válida até {formatDateTime(data.validUntil)}</p>
          ) : null}
        </CardContent>
      </Card>

      {data.canRespond ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que você decide?</CardTitle>
            <CardDescription>Ao aprovar, a loja confirma a produção e combina o sinal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Quer ajustar algo? Conte aqui (opcional)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => answer.mutate(true)} disabled={answer.isPending}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar proposta
              </Button>
              <Button variant="outline" onClick={() => answer.mutate(false)} disabled={answer.isPending}>
                <XCircle className="mr-1 h-4 w-4" /> Recusar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}

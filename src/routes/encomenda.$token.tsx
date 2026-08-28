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
import { CHECKLIST_STATUS_LABEL, type ChecklistStatus } from "@/lib/encomendas";
import { confirmBalancePayment, getPublicOrder, reviewAttachmentByCustomer } from "@/lib/encomendas.functions";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/encomenda/$token")({
  component: OrderTrackPage,
  head: () => ({
    meta: [
      { title: "Acompanhe sua encomenda | O Seu Pedido" },
      {
        name: "description",
        content: "Veja o andamento da produção, aprove a prova e confirme o pagamento do saldo da sua encomenda.",
      },
      { property: "og:title", content: "Acompanhe sua encomenda" },
      { property: "og:description", content: "Produção, prova de produção e pagamento em um só link." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ATTACHMENT_STATUS: Record<string, string> = {
  pending: "Aguardando sua avaliação",
  approved: "Aprovado",
  rejected: "Ajuste solicitado",
};

function OrderTrackPage() {
  const { token } = Route.useParams();
  const fetchOrder = useServerFn(getPublicOrder);
  const confirmBalance = useServerFn(confirmBalancePayment);
  const reviewFile = useServerFn(reviewAttachmentByCustomer);
  const [note, setNote] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["public-order", token],
    queryFn: () => fetchOrder({ data: { token } }),
  });

  const balance = useMutation({
    mutationFn: async () => confirmBalance({ data: { token, note: note.trim() || undefined } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      void refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const review = useMutation({
    mutationFn: async (input: { attachmentId: string; approve: boolean }) =>
      reviewFile({ data: { token, ...input, note: note.trim() || undefined } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      void refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (!data?.found) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Encomenda não encontrada</h1>
        <p className="text-muted-foreground">Confira o link enviado pela loja.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Encomenda {data.code}</h1>
        <p className="text-muted-foreground">
          {data.storeName} • Olá, {data.customerName}
        </p>
        <p className="text-sm text-muted-foreground">
          Entrega prevista: {data.scheduledFor ? formatDateTime(data.scheduledFor) : "a combinar"}
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Produção</CardTitle>
          <CardDescription>
            {CHECKLIST_STATUS_LABEL[(data.progress.status as ChecklistStatus) ?? "sem_ficha"]} (
            {data.progress.done}/{data.progress.total})
          </CardDescription>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${data.progress.percent}%` }} />
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {data.steps.map((step, index) => (
            <p key={index} className={step.done ? "text-muted-foreground line-through" : ""}>
              {step.done ? "✓" : "•"} {step.title}
            </p>
          ))}
          {data.steps.length === 0 ? (
            <p className="text-muted-foreground">A loja ainda não abriu a ficha de produção.</p>
          ) : null}
        </CardContent>
      </Card>

      {data.attachments.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Personalização e prova de produção</CardTitle>
            <CardDescription>Confira e aprove antes de finalizarmos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.attachments.map((file) => (
              <div key={file.id} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{file.title}</span>
                  <Badge variant={file.status === "approved" ? "secondary" : "outline"}>
                    {ATTACHMENT_STATUS[file.status] ?? file.status}
                  </Badge>
                </div>
                {file.url ? (
                  <img src={file.url} alt={file.title} className="max-h-72 w-full rounded-lg object-contain" loading="lazy" />
                ) : null}
                {file.status === "pending" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => review.mutate({ attachmentId: file.id, approve: true })}>
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => review.mutate({ attachmentId: file.id, approve: false })}
                    >
                      <XCircle className="mr-1 h-4 w-4" /> Pedir ajuste
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pagamento</CardTitle>
          <CardDescription>
            Total {formatCurrency(data.total)} • sinal {formatCurrency(data.depositAmount)}{" "}
            {data.depositPaid ? "(recebido)" : "(pendente)"} • saldo {formatCurrency(data.balanceDue)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Quer deixar um recado para a loja? (opcional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
          />
          {data.balanceConfirmed ? (
            <p className="text-sm text-muted-foreground">Você já avisou o pagamento do saldo. Obrigado!</p>
          ) : (
            <Button onClick={() => balance.mutate()} disabled={balance.isPending || data.balanceDue <= 0}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Já paguei o saldo
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

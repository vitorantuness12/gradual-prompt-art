import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAppointmentByToken,
  getRescheduleOptions,
  rescheduleAppointment,
  respondAppointment,
} from "@/lib/agenda.functions";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/agendamento/$token")({
  component: ConfirmAppointmentPage,
  head: () => ({
    meta: [
      { title: "Confirmar horário | O Seu Pedido" },
      { name: "description", content: "Confirme, remarque ou cancele o seu horário em um clique, sem instalar nada." },
      { property: "og:title", content: "Confirmar horário" },
      { property: "og:description", content: "Confirme, remarque ou cancele o seu horário em um clique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_TEXT: Record<string, string> = {
  scheduled: "Aguardando sua confirmação",
  confirmed: "Presença confirmada",
  cancelled: "Horário cancelado",
  done: "Atendimento concluído",
  no_show: "Marcado como falta",
};

function ConfirmAppointmentPage() {
  const { token } = Route.useParams();
  const load = useServerFn(getAppointmentByToken);
  const respond = useServerFn(respondAppointment);
  const loadSlots = useServerFn(getRescheduleOptions);
  const reschedule = useServerFn(rescheduleAppointment);
  const [showSlots, setShowSlots] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["agendamento-token", token],
    queryFn: () => load({ data: { token } }),
  });

  const slots = useQuery({
    queryKey: ["agendamento-horarios", token],
    enabled: showSlots,
    queryFn: () => loadSlots({ data: { token } }),
  });

  const action = useMutation({
    mutationFn: (kind: "confirm" | "cancel") => respond({ data: { token, action: kind } }),
    onSuccess: async (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await refetch();
    },
    onError: () => toast.error("Não foi possível responder agora."),
  });

  const remark = useMutation({
    mutationFn: (startsAt: string) => reschedule({ data: { token, startsAt } }),
    onSuccess: async (result) => {
      if (result.ok) {
        toast.success(result.message);
        setShowSlots(false);
      } else {
        toast.error(result.message);
      }
      await Promise.all([refetch(), slots.refetch()]);
    },
    onError: () => toast.error("Não foi possível reagendar agora."),
  });

  const canAct = data && (data.status === "scheduled" || data.status === "confirmed");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      {isLoading ? (
        <Skeleton className="h-56 w-full rounded-2xl" />
      ) : !data ? (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Link inválido</CardTitle>
            <CardDescription>Este link de confirmação não existe mais.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Olá, {data.customerName}!</CardTitle>
            <CardDescription>
              Seu horário na {data.storeName} é {new Date(data.startsAt).toLocaleString("pt-BR")}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Situação atual: <strong className="text-foreground">{STATUS_TEXT[data.status] ?? data.status}</strong>
            </p>

            {data.depositAmount > 0 ? (
              <p className="text-sm text-muted-foreground">
                Sinal de {formatCurrency(data.depositAmount)} —{" "}
                {data.depositStatus === "paid"
                  ? "já pago"
                  : data.depositStatus === "refunded"
                    ? "devolvido"
                    : "pendente"}
                . Ao remarcar, o sinal continua valendo para o novo horário.
              </p>
            ) : null}

            {data.cancellationPolicy ? (
              <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{data.cancellationPolicy}</p>
            ) : (
              <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                Cancelamentos com menos de {data.cancellationHours}h de antecedência podem gerar cobrança do sinal.
              </p>
            )}

            {canAct ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => action.mutate("confirm")} disabled={action.isPending || data.status === "confirmed"}>
                  Confirmar presença
                </Button>
                {data.allowReschedule && data.remainingReschedules > 0 ? (
                  <Button variant="secondary" onClick={() => setShowSlots((value) => !value)}>
                    {showSlots ? "Fechar horários" : "Quero remarcar"}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => action.mutate("cancel")} disabled={action.isPending}>
                  Não vou poder ir
                </Button>
              </div>
            ) : null}

            {canAct && showSlots ? (
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-foreground">Escolha um novo horário</h2>
                <p className="text-xs text-muted-foreground">
                  Remarcações com pelo menos {data.rescheduleMinHours}h de antecedência. Você ainda pode remarcar{" "}
                  {data.remainingReschedules}x.
                </p>
                {slots.isLoading ? (
                  <Skeleton className="h-24 w-full rounded-xl" />
                ) : (slots.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem horários livres no momento. Fale com a loja.</p>
                ) : (
                  <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                    {(slots.data ?? []).map((slot) => (
                      <Button
                        key={slot.startsAt}
                        variant="outline"
                        size="sm"
                        disabled={remark.isPending}
                        onClick={() => remark.mutate(slot.startsAt)}
                      >
                        {slot.label}
                      </Button>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

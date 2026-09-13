import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";

import { BlocksTab } from "@/components/agenda/BlocksTab";
import { CommissionsTab } from "@/components/agenda/CommissionsTab";
import { FinanceTab } from "@/components/agenda/FinanceTab";
import { RecordsTab } from "@/components/agenda/RecordsTab";
import { SchedulingSettingsTab } from "@/components/agenda/SchedulingSettingsTab";
import { WaitlistTab } from "@/components/agenda/WaitlistTab";
import { DemoBadge } from "@/components/brand/DemoBadge";
import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatDateTime } from "@/lib/format";

type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  done: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

export const Route = createFileRoute("/_authenticated/painel/agendamentos")({
  component: AppointmentsPage,
  head: () => ({
    meta: [
      { title: "Agendamentos | O Seu Pedido" },
      { name: "description", content: "Gerencie reservas, serviços e horários programados da sua loja." },
      { property: "og:title", content: "Agendamentos | O Seu Pedido" },
      { property: "og:description", content: "Reservas, serviços e retiradas programadas em uma agenda organizada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function agendaCopy(segment: string | null | undefined) {
  const value = (segment ?? "").toLowerCase();
  if (value.includes("pet") || value.includes("veter")) {
    return { description: "Organize banho, tosa, consultas e outros serviços com horário.", examples: "Banho e tosa · Consulta · Retorno" };
  }
  if (value.includes("merc") || value.includes("farm") || value.includes("drogar")) {
    return { description: "Organize retiradas e entregas programadas sem misturar com pedidos imediatos.", examples: "Retirada · Entrega programada · Atendimento" };
  }
  return { description: "Organize reservas de mesa, retiradas e entregas programadas.", examples: "Reserva de mesa · Retirada · Entrega programada" };
}

function AppointmentsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      if (!storeId) return [];
      const { data: rows, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("store_id", storeId)
        .order("starts_at", { ascending: true });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Agendamento atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["appointments", storeId] });
    },
    onError: () => toast.error("Não foi possível atualizar o agendamento."),
  });

  const appointments = data ?? [];
  const copy = agendaCopy(active?.store.segment);
  const summary = useMemo(() => {
    const today = new Date().toDateString();
    return {
      today: appointments.filter((item) => new Date(item.starts_at).toDateString() === today).length,
      pending: appointments.filter((item) => item.status === "scheduled").length,
      confirmed: appointments.filter((item) => item.status === "confirmed").length,
    };
  }, [appointments]);

  return (
    <div>
      <PageHeader
        title="Agendamentos"
        description={copy.description}
      />

      {!storeId ? (
        <EmptyState title="Escolha uma loja" description="Selecione a loja no topo do painel." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Hoje</p><p className="text-2xl font-semibold">{summary.today}</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Aguardando confirmação</p><p className="text-2xl font-semibold">{summary.pending}</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Confirmados</p><p className="text-2xl font-semibold">{summary.confirmed}</p></CardContent></Card>
          </div>
          <p className="text-sm text-muted-foreground">{copy.examples}</p>
          <Tabs defaultValue="marcados">
          <TabsList className="mb-4 flex flex-wrap">
            <TabsTrigger value="marcados">Agendamentos</TabsTrigger>
            <TabsTrigger value="bloqueios">Bloqueios</TabsTrigger>
            <TabsTrigger value="espera">Lista de espera</TabsTrigger>
            <TabsTrigger value="comissoes">Comissões</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro do cliente</TabsTrigger>
            <TabsTrigger value="fichas">Fichas de clientes</TabsTrigger>
            <TabsTrigger value="config">Sinal e lembretes</TabsTrigger>
          </TabsList>

          <TabsContent value="marcados">
            {isLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : appointments.length === 0 ? (
              <EmptyState
                title="Nenhum agendamento"
                description="As reservas, serviços e horários feitos pelos clientes aparecerão aqui."
              />
            ) : (
              <div className="space-y-3">
                {appointments.map((appointment) => (
                  <Card key={appointment.id} className="border-border/70 shadow-sm">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-medium text-foreground">
                            {appointment.customer_name}
                          </h2>
                          {appointment.is_demo ? <DemoBadge /> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDateTime(appointment.starts_at)}
                          {appointment.customer_phone ? ` · ${appointment.customer_phone}` : ""}
                        </p>
                        {appointment.notes ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Obs.: {appointment.notes}
                          </p>
                        ) : null}
                      </div>
                      <Select
                        value={appointment.status}
                        onValueChange={(value) =>
                          updateStatus.mutate({
                            id: appointment.id,
                            status: value as AppointmentStatus,
                          })
                        }
                      >
                        <SelectTrigger className="w-52" aria-label="Situação do agendamento">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="bloqueios">
            <BlocksTab storeId={storeId} />
          </TabsContent>

          <TabsContent value="espera">
            <WaitlistTab storeId={storeId} />
          </TabsContent>

          <TabsContent value="comissoes">
            <CommissionsTab storeId={storeId} appointments={appointments} />
          </TabsContent>

          <TabsContent value="financeiro">
            <FinanceTab appointments={appointments} />
          </TabsContent>



          <TabsContent value="fichas">
            <RecordsTab storeId={storeId} appointments={appointments} />
          </TabsContent>

          <TabsContent value="config">
            <SchedulingSettingsTab storeId={storeId} />
          </TabsContent>

          </Tabs>
        </div>
      )}
    </div>
  );
}

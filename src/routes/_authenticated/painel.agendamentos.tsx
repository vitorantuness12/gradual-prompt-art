import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { BlocksTab } from "@/components/agenda/BlocksTab";
import { CommissionsTab } from "@/components/agenda/CommissionsTab";
import { FinanceTab } from "@/components/agenda/FinanceTab";
import { RecordsTab } from "@/components/agenda/RecordsTab";
import { SchedulingSettingsTab } from "@/components/agenda/SchedulingSettingsTab";
import { WaitlistTab } from "@/components/agenda/WaitlistTab";
import { DemoBadge } from "@/components/brand/DemoBadge";
import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatDateTime } from "@/lib/format";
import { parseProduction } from "@/lib/producao";
import { saveProductionSettings } from "@/lib/producao.functions";

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
});

function AppointmentsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("store_id", storeId!)
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

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Horários marcados, capacidade de produção por intervalo e fila de encomendas — tudo no mesmo lugar."
      />

      {!storeId ? (
        <EmptyState title="Escolha uma loja" description="Selecione a loja no topo do painel." />
      ) : (
        <Tabs defaultValue="marcados">
          <TabsList className="mb-4 flex flex-wrap">
            <TabsTrigger value="marcados">Agendamentos</TabsTrigger>
            <TabsTrigger value="bloqueios">Bloqueios</TabsTrigger>
            <TabsTrigger value="espera">Lista de espera</TabsTrigger>
            <TabsTrigger value="comissoes">Comissões</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro do cliente</TabsTrigger>
            <TabsTrigger value="fichas">Fichas de clientes</TabsTrigger>
            <TabsTrigger value="config">Sinal e lembretes</TabsTrigger>
            <TabsTrigger value="capacidade">Capacidade e preparo</TabsTrigger>
            <TabsTrigger value="fila">Fila de encomendas</TabsTrigger>
          </TabsList>

          <TabsContent value="marcados">
            {isLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : appointments.length === 0 ? (
              <EmptyState
                title="Nenhum agendamento"
                description="Ative o agendamento nas configurações da loja para receber marcações."
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

          <TabsContent value="capacidade">
            <CapacityTab storeId={storeId} />
          </TabsContent>

          <TabsContent value="fila">
            <QueueTab storeId={storeId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/** Limites de produção por intervalo, janela de preparo e antecedência. */
function CapacityTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveProductionSettings);
  const [enabled, setEnabled] = useState(false);
  const [queue, setQueue] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["production-settings", storeId],
    queryFn: async () => {
      const { data: row } = await supabase
        .from("production_settings")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (row) {
        setEnabled(row.is_enabled);
        setQueue(row.queue_enabled);
      }
      return parseProduction(row);
    },
  });

  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const num = (key: string, fallback: number) => Math.round(Number(fd.get(key)) || fallback);
      const result = await save({
        data: {
          storeId,
          isEnabled: enabled,
          queueEnabled: queue,
          slotMinutes: num("slotMinutes", 30),
          prepWindowMinutes: num("prepWindowMinutes", 40),
          maxOrdersPerSlot: num("maxOrdersPerSlot", 6),
          maxItemsPerSlot: num("maxItemsPerSlot", 40),
          minLeadMinutes: num("minLeadMinutes", 60),
          maxDaysAhead: num("maxDaysAhead", 15),
          queueMessage: String(fd.get("queueMessage") ?? ""),
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: async (message) => {
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["production-settings", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) return <Skeleton className="h-64 rounded-2xl" />;

  const fields: { name: string; label: string; value: number; help: string }[] = [
    {
      name: "slotMinutes",
      label: "Tamanho do intervalo (min)",
      value: data.slotMinutes,
      help: "A agenda é dividida nesses blocos.",
    },
    {
      name: "prepWindowMinutes",
      label: "Janela de preparo (min)",
      value: data.prepWindowMinutes,
      help: "Quanto tempo antes a produção começa.",
    },
    {
      name: "maxOrdersPerSlot",
      label: "Máx. de pedidos por intervalo",
      value: data.maxOrdersPerSlot,
      help: "Limite de pedidos aceitos no mesmo bloco.",
    },
    {
      name: "maxItemsPerSlot",
      label: "Máx. de itens por intervalo",
      value: data.maxItemsPerSlot,
      help: "Limite de itens somados no mesmo bloco.",
    },
    {
      name: "minLeadMinutes",
      label: "Antecedência mínima (min)",
      value: data.minLeadMinutes,
      help: "Tempo mínimo entre o pedido e a entrega.",
    },
    {
      name: "maxDaysAhead",
      label: "Dias de antecedência",
      value: data.maxDaysAhead,
      help: "Até quando o cliente pode agendar.",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Capacidade de produção</CardTitle>
        <CardDescription>
          Com a capacidade ligada, a loja recusa pedidos acima do limite do horário e explica o
          motivo ao cliente, oferecendo outro horário ou a fila de encomendas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(event.currentTarget);
          }}
        >
          <div className="flex flex-wrap gap-4 rounded-xl border border-border/70 p-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              Controlar capacidade por horário
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={queue} onCheckedChange={setQueue} />
              Aceitar fila de encomendas quando lotar
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => (
              <div key={field.name}>
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="number"
                  min="0"
                  defaultValue={field.value}
                />
                <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="queueMessage">Mensagem quando o horário lotar</Label>
            <Input
              id="queueMessage"
              name="queueMessage"
              defaultValue={data.queueMessage ?? ""}
              placeholder="Estamos com a produção cheia neste horário. Escolha outro ou entre na fila."
            />
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar capacidade"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Fila de encomendas para quem não coube na capacidade do horário. */
function QueueTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["production-queue", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("production_queue")
        .select("*")
        .eq("store_id", storeId)
        .order("desired_at", { ascending: true });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("production_queue").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Fila atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["production-queue", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-32 rounded-2xl" />;
  if ((data ?? []).length === 0) {
    return (
      <EmptyState
        title="Fila vazia"
        description="Clientes entram aqui quando o horário desejado está sem vaga na produção."
      />
    );
  }

  return (
    <div className="space-y-3">
      {(data ?? []).map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <h3 className="font-medium">
                #{item.position} · {item.customer_name}
              </h3>
              <p className="text-sm text-muted-foreground">
                Deseja para {formatDateTime(item.desired_at)} · {item.items_count} item(ns)
                {item.customer_phone ? ` · ${item.customer_phone}` : ""}
              </p>
              {item.notes ? (
                <p className="text-sm text-muted-foreground">Obs.: {item.notes}</p>
              ) : null}
            </div>
            <Select
              value={item.status}
              onValueChange={(status) => update.mutate({ id: item.id, status })}
            >
              <SelectTrigger className="w-48" aria-label="Situação na fila">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="waiting">Aguardando</SelectItem>
                <SelectItem value="contacted">Cliente avisado</SelectItem>
                <SelectItem value="scheduled">Encaixado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

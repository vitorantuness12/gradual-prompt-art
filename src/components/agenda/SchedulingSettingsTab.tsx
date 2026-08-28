import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchReminderQueue,
  fetchSchedulingSettings,
  reminderQueueKey,
  saveSchedulingSettings,
  schedulingSettingsKey,
} from "@/lib/agenda";
import { sendAppointmentRemindersNow } from "@/lib/agenda.functions";

/** Sinal, política de cancelamento e lembretes automáticos por WhatsApp. */
export function SchedulingSettingsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const sendNow = useServerFn(sendAppointmentRemindersNow);

  const [requireDeposit, setRequireDeposit] = useState(false);
  const [reminder24h, setReminder24h] = useState(true);
  const [reminder2h, setReminder2h] = useState(true);
  const [allowReschedule, setAllowReschedule] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: schedulingSettingsKey(storeId),
    queryFn: () => fetchSchedulingSettings(storeId),
  });

  useEffect(() => {
    if (!data) return;
    setRequireDeposit(data.require_deposit);
    setReminder24h(data.reminder_24h);
    setReminder2h(data.reminder_2h);
    setAllowReschedule(data.allow_reschedule);
  }, [data]);

  const save = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      await saveSchedulingSettings({
        storeId,
        requireDeposit,
        depositPercent: Number(fd.get("depositPercent")) || 0,
        cancellationHours: Number(fd.get("cancellationHours")) || 0,
        cancellationPolicy: String(fd.get("cancellationPolicy") ?? ""),
        reminder24h,
        reminder2h,
        reminderTemplate: String(fd.get("reminderTemplate") ?? ""),
        allowReschedule,
        rescheduleMinHours: Number(fd.get("rescheduleMinHours")) || 0,
        maxReschedules: Number(fd.get("maxReschedules")) || 0,
        slotMinutes: Number(fd.get("slotMinutes")) || 30,
        openTime: String(fd.get("openTime") ?? "09:00"),
        closeTime: String(fd.get("closeTime") ?? "18:00"),
      });
    },
    onSuccess: async () => {
      toast.success("Configuração da agenda salva.");
      await queryClient.invalidateQueries({ queryKey: schedulingSettingsKey(storeId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reminders = useMutation({
    mutationFn: () => sendNow({ data: { storeId, baseUrl: window.location.origin } }),
    onSuccess: (result) =>
      toast.success(`${result.sent} lembrete(s) enviado(s) de ${result.checked} horário(s) na janela.`),
    onError: (error: Error) => toast.error(error.message),
  });

  const queue = useQuery({
    queryKey: reminderQueueKey(storeId),
    queryFn: () => fetchReminderQueue(storeId),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(event.currentTarget);
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sinal e política de cancelamento</CardTitle>
          <CardDescription>O sinal segura o horário e reduz falta; a política aparece no link de confirmação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={requireDeposit} onCheckedChange={setRequireDeposit} />
            Exigir sinal para confirmar o horário
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="depositPercent">Percentual do sinal (%)</Label>
              <Input
                id="depositPercent"
                name="depositPercent"
                type="number"
                min="0"
                max="100"
                defaultValue={Number(data?.deposit_percent ?? 50)}
              />
            </div>
            <div>
              <Label htmlFor="cancellationHours">Cancelamento sem cobrança até (h antes)</Label>
              <Input
                id="cancellationHours"
                name="cancellationHours"
                type="number"
                min="0"
                defaultValue={data?.cancellation_hours ?? 24}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cancellationPolicy">Texto da política</Label>
            <Textarea
              id="cancellationPolicy"
              name="cancellationPolicy"
              rows={3}
              defaultValue={data?.cancellation_policy ?? ""}
              placeholder="Cancelamentos com menos de 24h de antecedência perdem o sinal."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lembretes automáticos por WhatsApp</CardTitle>
          <CardDescription>
            Enviados pela conexão de WhatsApp da loja, com link de confirmação em um clique.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={reminder24h} onCheckedChange={setReminder24h} />
              24 horas antes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={reminder2h} onCheckedChange={setReminder2h} />
              2 horas antes
            </label>
          </div>

          <div>
            <Label htmlFor="reminderTemplate">Mensagem do lembrete</Label>
            <Textarea
              id="reminderTemplate"
              name="reminderTemplate"
              rows={3}
              defaultValue={data?.reminder_template ?? ""}
              placeholder="Olá, {{nome_cliente}}! Lembrete do seu horário na {{nome_loja}}: {{data}} às {{hora}}. Confirme: {{link}}"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Variáveis: {"{{nome_cliente}}"}, {"{{nome_loja}}"}, {"{{data}}"}, {"{{hora}}"} e {"{{link}}"}.
            </p>
          </div>

          <Button type="button" variant="outline" onClick={() => reminders.mutate()} disabled={reminders.isPending}>
            {reminders.isPending ? "Enviando..." : "Enviar lembretes pendentes agora"}
          </Button>

          <p className="text-xs text-muted-foreground">
            A verificação automática roda a cada 5 minutos: cada lembrete entra numa fila e é reenviado até 5 vezes
            se o WhatsApp falhar, então nenhum aviso se perde.
          </p>

          {(queue.data ?? []).length > 0 ? (
            <div className="rounded-xl border border-border p-3">
              <h3 className="mb-2 text-sm font-medium text-foreground">Fila de envio (últimos 50)</h3>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {(queue.data ?? []).slice(0, 10).map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {item.kind === "2h" ? "2h antes" : "24h antes"} —{" "}
                      {new Date(item.scheduled_for).toLocaleString("pt-BR")}
                    </span>
                    <span>
                      {item.status === "sent"
                        ? "Enviado"
                        : item.status === "failed"
                          ? `Falhou: ${item.last_error ?? ""}`
                          : item.status === "skipped"
                            ? "Ignorado"
                            : `Na fila (${item.attempts} tentativa(s))`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reagendamento pelo link do cliente</CardTitle>
          <CardDescription>
            O cliente escolhe um novo horário entre as janelas livres, respeitando bloqueios e agenda ocupada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={allowReschedule} onCheckedChange={setAllowReschedule} />
            Permitir que o cliente remarque pelo link
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="rescheduleMinHours">Antecedência mínima (h)</Label>
              <Input
                id="rescheduleMinHours"
                name="rescheduleMinHours"
                type="number"
                min="0"
                defaultValue={data?.reschedule_min_hours ?? 6}
              />
            </div>
            <div>
              <Label htmlFor="maxReschedules">Máximo de remarcações</Label>
              <Input
                id="maxReschedules"
                name="maxReschedules"
                type="number"
                min="0"
                defaultValue={data?.max_reschedules ?? 2}
              />
            </div>
            <div>
              <Label htmlFor="slotMinutes">Intervalo entre horários (min)</Label>
              <Input
                id="slotMinutes"
                name="slotMinutes"
                type="number"
                min="10"
                step="5"
                defaultValue={data?.slot_minutes ?? 30}
              />
            </div>
            <div>
              <Label htmlFor="openTime">Abre às</Label>
              <Input id="openTime" name="openTime" type="time" defaultValue={(data?.open_time ?? "09:00").slice(0, 5)} />
            </div>
            <div>
              <Label htmlFor="closeTime">Fecha às</Label>
              <Input id="closeTime" name="closeTime" type="time" defaultValue={(data?.close_time ?? "18:00").slice(0, 5)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Salvando..." : "Salvar configuração"}
      </Button>
    </form>
  );
}

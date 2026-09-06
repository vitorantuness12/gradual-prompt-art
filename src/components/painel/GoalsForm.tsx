import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { goalsKey, type GoalsOverview } from "@/lib/metas";
import { saveGoals, sendGoalsSummaryNow } from "@/lib/metas.functions";

export interface GoalsFormProps {
  storeId: string;
  overview: GoalsOverview;
}

/** Define as metas da loja e o horário do resumo diário no WhatsApp. */
export function GoalsForm({ storeId, overview }: GoalsFormProps) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveGoals);
  const sendFn = useServerFn(sendGoalsSummaryNow);

  const [form, setForm] = useState({
    monthlyRevenueGoal: String(overview.goals.monthlyRevenueGoal || ""),
    dailyRevenueGoal: String(overview.goals.dailyRevenueGoal || ""),
    monthlyOrdersGoal: String(overview.goals.monthlyOrdersGoal || ""),
    ticketGoal: String(overview.goals.ticketGoal || ""),
    dailySummaryEnabled: overview.goals.dailySummaryEnabled,
    summaryHour: overview.goals.summaryHour,
    summaryWhatsapp: overview.goals.summaryWhatsapp,
  });

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          storeId,
          monthlyRevenueGoal: Number(form.monthlyRevenueGoal || 0),
          dailyRevenueGoal: Number(form.dailyRevenueGoal || 0),
          monthlyOrdersGoal: Number(form.monthlyOrdersGoal || 0),
          ticketGoal: Number(form.ticketGoal || 0),
          dailySummaryEnabled: form.dailySummaryEnabled,
          summaryHour: form.summaryHour,
          summaryWhatsapp: form.summaryWhatsapp,
        },
      }),
    onSuccess: () => {
      toast.success("Metas salvas.");
      void queryClient.invalidateQueries({ queryKey: goalsKey(storeId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const send = useMutation({
    mutationFn: () => sendFn({ data: { storeId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.info(result.message);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const fields: { key: keyof typeof form; label: string; hint: string }[] = [
    { key: "dailyRevenueGoal", label: "Meta de vendas por dia (R$)", hint: "Ex.: 800" },
    { key: "monthlyRevenueGoal", label: "Meta de vendas no mês (R$)", hint: "Ex.: 20000" },
    { key: "monthlyOrdersGoal", label: "Meta de pedidos no mês", hint: "Ex.: 300" },
    { key: "ticketGoal", label: "Meta de ticket médio (R$)", hint: "Ex.: 65" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suas metas</CardTitle>
        <CardDescription>
          Defina quanto você quer vender e receba o resumo do dia no WhatsApp, no horário que escolher.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`goal-${field.key}`}>{field.label}</Label>
              <Input
                id={`goal-${field.key}`}
                inputMode="decimal"
                placeholder={field.hint}
                value={String(form[field.key])}
                onChange={(event) =>
                  setForm((state) => ({ ...state, [field.key]: event.target.value.replace(/[^\d.,]/g, "").replace(",", ".") }))
                }
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3">
          <div>
            <p className="text-sm font-medium">Receber resumo do dia no WhatsApp</p>
            <p className="text-sm text-muted-foreground">
              {overview.channelReady
                ? "O WhatsApp da loja está conectado."
                : "Conecte o WhatsApp da loja para o envio automático."}
            </p>
          </div>
          <Switch
            checked={form.dailySummaryEnabled}
            onCheckedChange={(checked) => setForm((state) => ({ ...state, dailySummaryEnabled: checked }))}
            aria-label="Receber resumo do dia no WhatsApp"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="summary-phone">WhatsApp que recebe o resumo</Label>
            <Input
              id="summary-phone"
              inputMode="tel"
              placeholder="(11) 99999-9999"
              value={form.summaryWhatsapp}
              onChange={(event) => setForm((state) => ({ ...state, summaryWhatsapp: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary-hour">Horário do resumo</Label>
            <Select
              value={String(form.summaryHour)}
              onValueChange={(value) => setForm((state) => ({ ...state, summaryHour: Number(value) }))}
            >
              <SelectTrigger id="summary-hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, hour) => (
                  <SelectItem key={hour} value={String(hour)}>
                    {String(hour).padStart(2, "0")}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar metas"}
          </Button>
          <Button variant="outline" onClick={() => send.mutate()} disabled={send.isPending}>
            <Send className="mr-2 size-4" aria-hidden="true" />
            {send.isPending ? "Enviando..." : "Enviar resumo agora"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

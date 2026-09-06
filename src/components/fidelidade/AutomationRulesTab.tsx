import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  AUTOMATION_CHANNELS,
  AUTOMATION_EVENTS,
  AUTOMATION_EVENT_LABEL,
  automationsKey,
  defaultMessageFor,
  readAutomationConfig,
  type AutomationRuleRow,
} from "@/lib/automacoes";

/** Mensagens automáticas de aniversário, cliente inativo e pós-compra. */
export function AutomationRulesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();

  const rules = useQuery({
    queryKey: automationsKey(storeId),
    queryFn: async (): Promise<AutomationRuleRow[]> => {
      const { data, error } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const byEvent = new Map((rules.data ?? []).map((row) => [row.event, row]));

  const refresh = () => queryClient.invalidateQueries({ queryKey: automationsKey(storeId) });

  if (rules.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
          <CardDescription>
            A loja envia a mensagem sozinha quando o momento chega. Use {"{cliente}"},{" "}
            {"{loja}"} e {"{cupom}"} para personalizar o texto. Só recebem quem aceitou receber
            mensagens.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {rules.data?.length ? null : (
            <EmptyState
              title="Nenhuma automação ativa"
              description="Ligue as automações abaixo para começar a recuperar e encantar clientes."
            />
          )}
        </CardContent>
      </Card>

      {AUTOMATION_EVENTS.map((event) => (
        <AutomationCard
          key={event.key}
          storeId={storeId}
          event={event.key}
          help={event.help}
          rule={byEvent.get(event.key) ?? null}
          onSaved={refresh}
        />
      ))}
    </div>
  );
}

interface CardProps {
  storeId: string;
  event: string;
  help: string;
  rule: AutomationRuleRow | null;
  onSaved: () => void | Promise<unknown>;
}

function AutomationCard({ storeId, event, help, rule, onSaved }: CardProps) {
  const config = readAutomationConfig(rule?.config);
  const [active, setActive] = useState(rule?.is_active ?? false);
  const [channel, setChannel] = useState(rule?.channel ?? "whatsapp");
  const [message, setMessage] = useState(config.message ?? defaultMessageFor(event));
  const [coupon, setCoupon] = useState(config.couponCode ?? "");
  const [days, setDays] = useState(String(config.inactiveDays ?? 30));
  const [delay, setDelay] = useState(String(rule?.delay_minutes ?? 0));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        store_id: storeId,
        event,
        name: AUTOMATION_EVENT_LABEL[event] ?? event,
        channel,
        template_key: event,
        is_active: active,
        delay_minutes: Number(delay) || 0,
        config: {
          message: message.trim(),
          couponCode: coupon.trim().toUpperCase(),
          inactiveDays: Number(days) || 30,
          requireConsent: true,
        },
      };
      const query = rule
        ? supabase.from("automation_rules").update(payload).eq("id", rule.id)
        : supabase.from("automation_rules").insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Automação salva.");
      await onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {AUTOMATION_EVENT_LABEL[event]}
            {active ? <Badge variant="secondary">Ativa</Badge> : null}
          </CardTitle>
          <CardDescription>{help}</CardDescription>
        </div>
        <Switch
          checked={active}
          onCheckedChange={setActive}
          aria-label={`Ativar ${AUTOMATION_EVENT_LABEL[event]}`}
        />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`canal-${event}`}>Canal</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger id={`canal-${event}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTOMATION_CHANNELS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`cupom-${event}`}>Cupom (opcional)</Label>
          <Input
            id={`cupom-${event}`}
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
            placeholder="VOLTASEMPRE10"
          />
        </div>

        {event === "inactive" ? (
          <div className="space-y-1.5">
            <Label htmlFor={`dias-${event}`}>Dias sem comprar</Label>
            <Input
              id={`dias-${event}`}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
        ) : null}

        {event === "post_purchase" ? (
          <div className="space-y-1.5">
            <Label htmlFor={`atraso-${event}`}>Enviar depois de (minutos)</Label>
            <Input
              id={`atraso-${event}`}
              inputMode="numeric"
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
            />
          </div>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`msg-${event}`}>Mensagem</Label>
          <Textarea
            id={`msg-${event}`}
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <Button
          type="button"
          className="sm:col-span-2"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Salvando..." : "Salvar automação"}
        </Button>
      </CardContent>
    </Card>
  );
}

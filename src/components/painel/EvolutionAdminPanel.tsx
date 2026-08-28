import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  clearEvolutionCredential,
  getEvolutionSettings,
  saveEvolutionSettings,
  testEvolutionConnection,
} from "@/lib/evolution-admin.functions";
import { DEFAULT_EVENT_KEYS } from "@/lib/whatsapp/eventos.admin";

/** Área "WhatsApp — Configuração global" do painel da plataforma. */
export function EvolutionAdminPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(getEvolutionSettings);
  const save = useServerFn(saveEvolutionSettings);
  const test = useServerFn(testEvolutionConnection);
  const clear = useServerFn(clearEvolutionCredential);

  const { data, isLoading } = useQuery({ queryKey: ["evolution-settings"], queryFn: () => load() });

  const [form, setForm] = useState({
    baseUrl: "",
    apiKey: "",
    environment: "production" as "production" | "sandbox",
    webhookBaseUrl: "",
    webhookSecret: "",
    integration: "WHATSAPP-BAILEYS",
    events: DEFAULT_EVENT_KEYS.join(","),
    timeoutMs: 15000,
    maxRetries: 3,
    retryDelayMs: 2000,
    isEnabled: false,
  });

  useEffect(() => {
    if (!data) return;
    setForm((current) => ({
      ...current,
      baseUrl: data.baseUrl,
      environment: (data.environment as "production" | "sandbox") ?? "production",
      webhookBaseUrl: data.webhookBaseUrl,
      integration: data.integration,
      events: (data.events.length > 0 ? data.events : DEFAULT_EVENT_KEYS).join(","),
      timeoutMs: data.timeoutMs,
      maxRetries: data.maxRetries,
      retryDelayMs: data.retryDelayMs,
      isEnabled: data.isEnabled,
      apiKey: "",
      webhookSecret: "",
    }));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          baseUrl: form.baseUrl,
          apiKey: form.apiKey || undefined,
          environment: form.environment,
          webhookBaseUrl: form.webhookBaseUrl,
          webhookSecret: form.webhookSecret || undefined,
          integration: form.integration,
          events: form.events.split(",").map((item) => item.trim()).filter(Boolean),
          timeoutMs: Number(form.timeoutMs),
          maxRetries: Number(form.maxRetries),
          retryDelayMs: Number(form.retryDelayMs),
          isEnabled: form.isEnabled,
        },
      }),
    onSuccess: async (result) => {
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey: ["evolution-settings"] });
    },
    onError: () => toast.error("Não foi possível salvar a configuração."),
  });

  const testMutation = useMutation({
    mutationFn: () => test(),
    onSuccess: async (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await queryClient.invalidateQueries({ queryKey: ["evolution-settings"] });
    },
    onError: () => toast.error("Falha ao testar a conexão."),
  });

  const clearMutation = useMutation({
    mutationFn: (field: "api_key" | "webhook_secret") => clear({ data: { field } }),
    onSuccess: async () => {
      toast.success("Credencial removida. Cadastre uma nova.");
      await queryClient.invalidateQueries({ queryKey: ["evolution-settings"] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando configuração…</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>WhatsApp — Configuração global (Evolution API)</CardTitle>
            <CardDescription>
              Cada lojista conecta o próprio número por QR Code. A API key global fica só no servidor.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={data?.lastCheckOk ? "default" : "secondary"}>
              {data?.lastCheckOk ? "API online" : "API não verificada"}
            </Badge>
            {data?.detectedVersion ? <Badge variant="outline">v{data.detectedVersion}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="evo-base">URL base da Evolution API</Label>
            <Input
              id="evo-base"
              value={form.baseUrl}
              onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
              placeholder="https://evolution.suaempresa.com.br"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evo-key">API key global</Label>
            <div className="flex gap-2">
              <Input
                id="evo-key"
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                placeholder={data?.apiKeyHint ?? "Cole a API key"}
              />
              {data?.apiKeyHint ? (
                <Button variant="outline" type="button" onClick={() => clearMutation.mutate("api_key")}>
                  Substituir
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {data?.apiKeyHint ? `Guardada com segurança (${data.apiKeyHint}).` : "Nenhuma credencial cadastrada."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evo-env">Ambiente</Label>
            <Select
              value={form.environment}
              onValueChange={(value) => setForm({ ...form, environment: value as "production" | "sandbox" })}
            >
              <SelectTrigger id="evo-env">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Produção</SelectItem>
                <SelectItem value="sandbox">Teste</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evo-webhook">URL pública do Seu Pedido (webhook)</Label>
            <Input
              id="evo-webhook"
              value={form.webhookBaseUrl}
              onChange={(event) => setForm({ ...form, webhookBaseUrl: event.target.value })}
              placeholder="https://oseupedido.com.br"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evo-secret">Secret de autenticação dos webhooks</Label>
            <div className="flex gap-2">
              <Input
                id="evo-secret"
                type="password"
                value={form.webhookSecret}
                onChange={(event) => setForm({ ...form, webhookSecret: event.target.value })}
                placeholder={data?.webhookSecretHint ?? "Cole o secret"}
              />
              {data?.webhookSecretHint ? (
                <Button variant="outline" type="button" onClick={() => clearMutation.mutate("webhook_secret")}>
                  Substituir
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evo-integration">Integração padrão</Label>
            <Input
              id="evo-integration"
              value={form.integration}
              onChange={(event) => setForm({ ...form, integration: event.target.value })}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="evo-events">Eventos habilitados (separados por vírgula)</Label>
            <Input
              id="evo-events"
              value={form.events}
              onChange={(event) => setForm({ ...form, events: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evo-timeout">Timeout (ms)</Label>
            <Input
              id="evo-timeout"
              type="number"
              value={form.timeoutMs}
              onChange={(event) => setForm({ ...form, timeoutMs: Number(event.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evo-retries">Tentativas em caso de falha</Label>
            <Input
              id="evo-retries"
              type="number"
              value={form.maxRetries}
              onChange={(event) => setForm({ ...form, maxRetries: Number(event.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evo-delay">Intervalo entre tentativas (ms)</Label>
            <Input
              id="evo-delay"
              type="number"
              value={form.retryDelayMs}
              onChange={(event) => setForm({ ...form, retryDelayMs: Number(event.target.value) })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3 md:col-span-2">
            <div>
              <p className="text-sm font-medium">Integração ativa para toda a plataforma</p>
              <p className="text-xs text-muted-foreground">
                Desligado, nenhuma loja consegue conectar ou enviar mensagens.
              </p>
            </div>
            <Switch checked={form.isEnabled} onCheckedChange={(value) => setForm({ ...form, isEnabled: value })} />
          </div>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando…" : "Salvar configuração"}
            </Button>
            <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              {testMutation.isPending ? "Testando…" : "Testar conexão"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Instâncias criadas" value={String(data?.instancesActive ?? 0)} />
        <StatCard label="Lojas conectadas" value={String(data?.storesConnected ?? 0)} />
        <StatCard
          label="Última verificação"
          value={data?.lastCheckAt ? new Date(data.lastCheckAt).toLocaleString("pt-BR") : "—"}
        />
        <StatCard label="Último retorno" value={data?.lastCheckMessage ?? "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logs de conexão</CardTitle>
          <CardDescription>Eventos recentes das instâncias, sem exibir tokens.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.logs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            (data?.logs ?? []).map((log) => (
              <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium">{log.status}</span>
                <span className="text-muted-foreground">{log.error ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

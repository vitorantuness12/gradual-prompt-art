import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  API_SCOPES,
  CATEGORY_LABEL,
  MERCHANT_CONNECTORS,
  OUTBOUND_EVENTS,
  STATUS_LABEL,
  STATUS_TONE,
  webhookUrl,
  type Connector,
} from "@/lib/integrations/catalog";
import {
  createApiKey,
  createWebhookEndpoint,
  integrationStatuses,
  retryWebhookDelivery,
  revokeApiKey,
  rotateApiKey,
  saveIntegration,
  sendTestWebhook,
  testIntegration,
  updateWebhookEndpoint,
  type IntegrationStatus,
} from "@/lib/integracoes.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel/integracoes")({
  component: IntegrationsPage,
  head: () => ({
    meta: [
      { title: "Central de integrações e API | O Seu Pedido" },
      {
        name: "description",
        content:
          "Conecte WhatsApp, Mercado Pago, PagBank, Asaas, marketplaces, Hotmart, mapas, fiscal, e-mail e push, e gerencie chaves da API pública.",
      },
    ],
  }),
});

function IntegrationsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;

  return (
    <div>
      <PageHeader
        title="Central de integrações"
        description="Ative conectores, guarde credenciais com segurança, acompanhe eventos e publique a API da sua loja."
      />

      {!storeId ? (
        <EmptyState
          title="Escolha uma loja"
          description="Selecione a loja no topo do painel para configurar as integrações."
        />
      ) : (
        <Tabs defaultValue="conectores">
          <TabsList className="mb-4 flex flex-wrap">
            <TabsTrigger value="conectores">Conectores</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks de saída</TabsTrigger>
            <TabsTrigger value="api">API pública</TabsTrigger>
            <TabsTrigger value="logs">Eventos e logs</TabsTrigger>
          </TabsList>

          <TabsContent value="conectores">
            <ConnectorsTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="webhooks">
            <WebhooksTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="api">
            <ApiTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="logs">
            <LogsTab storeId={storeId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/** ---------- Conectores ---------- */

function ConnectorsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const loadStatuses = useServerFn(integrationStatuses);
  const test = useServerFn(testIntegration);
  const [openKind, setOpenKind] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["integration-statuses", storeId],
    queryFn: () => loadStatuses({ data: { storeId } }),
  });

  const byKind = new Map((data ?? []).map((row) => [row.kind, row]));

  const runTest = useMutation({
    mutationFn: async (kind: string) => test({ data: { storeId, kind } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["integration-statuses", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  const categories = [...new Set(MERCHANT_CONNECTORS.map((connector) => connector.category))];

  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <section key={category}>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {CATEGORY_LABEL[category]}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {MERCHANT_CONNECTORS.filter((connector) => connector.category === category).map((connector) => {
              const status = byKind.get(connector.kind);
              const state = status?.isEnabled ? status.status : "not_configured";
              return (
                <Card key={connector.kind}>
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium">{connector.label}</h3>
                        <p className="text-sm text-muted-foreground">{connector.summary}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[state]}`}
                      >
                        {STATUS_LABEL[state]}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {status?.lastEventAt
                        ? `Último evento: ${status.lastEventKind ?? "evento"} em ${formatDate(status.lastEventAt)}`
                        : `Sem eventos ainda · ${connector.fallback}`}
                    </p>
                    {status?.lastError ? (
                      <p className="text-xs text-destructive">{status.lastError}</p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Dialog
                        open={openKind === connector.kind}
                        onOpenChange={(open) => setOpenKind(open ? connector.kind : null)}
                      >
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            Configurar
                          </Button>
                        </DialogTrigger>
                        <ConnectorDialog
                          connector={connector}
                          storeId={storeId}
                          status={status ?? null}
                          onSaved={async () => {
                            setOpenKind(null);
                            await queryClient.invalidateQueries({
                              queryKey: ["integration-statuses", storeId],
                            });
                          }}
                        />
                      </Dialog>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={runTest.isPending}
                        onClick={() => runTest.mutate(connector.kind)}
                      >
                        Testar conexão
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ConnectorDialog({
  connector,
  storeId,
  status,
  onSaved,
}: {
  connector: Connector;
  storeId: string;
  status: IntegrationStatus | null;
  onSaved: () => void;
}) {
  const save = useServerFn(saveIntegration);
  const [enabled, setEnabled] = useState(status?.isEnabled ?? false);
  const [sandbox, setSandbox] = useState(status?.isSandbox ?? true);
  const [provider, setProvider] = useState(status?.provider ?? connector.providers[0]?.key ?? "");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const fd = new FormData(form);
      const result = await save({
        data: {
          storeId,
          kind: connector.kind,
          provider,
          isEnabled: enabled,
          isSandbox: sandbox,
          apiKey: String(fd.get("apiKey") ?? ""),
          apiSecret: String(fd.get("apiSecret") ?? ""),
          accessToken: String(fd.get("accessToken") ?? ""),
          webhookSecret: String(fd.get("webhookSecret") ?? ""),
          extra: String(fd.get("extra") ?? ""),
          verifyToken: String(fd.get("verifyToken") ?? ""),
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{connector.label}</DialogTitle>
        <DialogDescription>{connector.summary}</DialogDescription>
      </DialogHeader>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(event.currentTarget);
        }}
      >
        <div className="flex flex-wrap gap-4 rounded-xl border border-border/70 p-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Ativar integração" />
            Ativa
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={sandbox} onCheckedChange={setSandbox} aria-label="Ambiente de teste" />
            Ambiente de teste
          </label>
        </div>

        {connector.providers.length > 1 ? (
          <div>
            <Label>Provedor</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {connector.providers.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {connector.fields.map((field) => (
          <div key={field.key}>
            <Label htmlFor={`${connector.kind}-${field.key}`}>{field.label}</Label>
            <Input
              id={`${connector.kind}-${field.key}`}
              name={field.key}
              type={field.secret ? "password" : "text"}
              autoComplete="off"
              placeholder={
                status?.hints[field.key]
                  ? `Salvo: ${status.hints[field.key]} (deixe vazio para manter)`
                  : field.optional
                    ? "Opcional"
                    : ""
              }
            />
            {field.help ? <p className="mt-1 text-xs text-muted-foreground">{field.help}</p> : null}
          </div>
        ))}

        {connector.hasWebhook ? (
          <div className="rounded-xl bg-secondary/40 p-3 text-sm">
            <p className="font-medium">Endereço do webhook</p>
            <code className="mt-1 block break-all text-xs text-muted-foreground">
              {webhookUrl(origin, connector.kind, storeId)}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Assinatura conferida a cada chamada, eventos repetidos são descartados e falhas entram
              em fila de retentativa.
            </p>
          </div>
        ) : null}

        <div className="rounded-xl border border-border/70 p-3">
          <p className="text-sm font-medium">Como conectar</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
            {connector.instructions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          {connector.docsUrl ? (
            <a
              className="mt-2 inline-block text-sm text-primary underline"
              href={connector.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Documentação oficial
            </a>
          ) : null}
        </div>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar integração"}
        </Button>
      </form>
    </DialogContent>
  );
}

/** ---------- Webhooks de saída ---------- */

function WebhooksTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const create = useServerFn(createWebhookEndpoint);
  const update = useServerFn(updateWebhookEndpoint);
  const retry = useServerFn(retryWebhookDelivery);
  const sendTest = useServerFn(sendTestWebhook);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);

  const { data: endpoints, isLoading } = useQuery({
    queryKey: ["webhook-endpoints", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select(
          "id, url, description, events, is_active, last_delivery_at, last_status, failure_count",
        )
        .eq("store_id", storeId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: deliveries } = useQuery({
    queryKey: ["webhook-deliveries", storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("webhook_deliveries")
        .select("id, event, status, response_status, attempts, error, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (fd: FormData) =>
      create({
        data: {
          storeId,
          url: String(fd.get("url") ?? ""),
          description: String(fd.get("description") ?? ""),
          events,
        },
      }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      if (result.ok) {
        setSecret(result.secret ?? null);
        setOpen(false);
        setEvents([]);
      }
      await queryClient.invalidateQueries({ queryKey: ["webhook-endpoints", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { endpointId: string; isActive?: boolean; remove?: boolean }) =>
      update({ data: { storeId, ...input, remove: input.remove ?? false } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["webhook-endpoints", storeId] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (deliveryId: string) => retry({ data: { storeId, deliveryId } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", storeId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => sendTest({ data: { storeId } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", storeId] });
    },
  });

  const toggleEvent = (event: string) =>
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como validar a assinatura</CardTitle>
          <CardDescription>
            Cada entrega leva o cabeçalho <code>x-seupedido-signature</code> no formato{" "}
            <code>t=&lt;timestamp&gt;,v1=&lt;HMAC-SHA256&gt;</code>, calculado sobre{" "}
            <code>{"`${timestamp}.${corpo}`"}</code> com o segredo do endpoint. Rejeite entregas com
            mais de 5 minutos.
          </CardDescription>
        </CardHeader>
      </Card>

      {secret ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">Segredo do novo webhook (aparece só agora)</p>
            <code className="mt-1 block break-all">{secret}</code>
            <Button className="mt-2" size="sm" variant="outline" onClick={() => setSecret(null)}>
              Já copiei
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Novo webhook</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo webhook de saída</DialogTitle>
              <DialogDescription>
                Enviamos os eventos assinados para o seu sistema.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createMutation.mutate(new FormData(event.currentTarget));
              }}
            >
              <div>
                <Label htmlFor="url">URL (https)</Label>
                <Input
                  id="url"
                  name="url"
                  required
                  placeholder="https://seusistema.com.br/webhooks/seupedido"
                />
              </div>
              <div>
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" name="description" placeholder="ERP da loja" />
              </div>
              <div>
                <Label>Eventos (vazio = todos)</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OUTBOUND_EVENTS.map((event) => (
                    <Button
                      key={event}
                      type="button"
                      size="sm"
                      variant={events.includes(event) ? "default" : "outline"}
                      onClick={() => toggleEvent(event)}
                    >
                      {event}
                    </Button>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                Cadastrar webhook
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          disabled={testMutation.isPending}
          onClick={() => testMutation.mutate()}
        >
          Enviar evento de teste
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (endpoints ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum webhook"
          description="Cadastre um endereço para receber eventos da sua loja."
        />
      ) : (
        <div className="space-y-3">
          {(endpoints ?? []).map((endpoint) => (
            <Card key={endpoint.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div className="min-w-0">
                  <p className="truncate font-medium">{endpoint.url}</p>
                  <p className="text-sm text-muted-foreground">
                    {endpoint.events.length === 0 ? "todos os eventos" : endpoint.events.join(", ")}
                    {endpoint.last_delivery_at
                      ? ` · última entrega ${formatDate(endpoint.last_delivery_at)} (HTTP ${endpoint.last_status ?? "—"})`
                      : " · sem entregas"}
                    {endpoint.failure_count > 0 ? ` · ${endpoint.failure_count} falha(s)` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={endpoint.is_active}
                    aria-label="Ativar webhook"
                    onCheckedChange={(checked) =>
                      updateMutation.mutate({ endpointId: endpoint.id, isActive: checked })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateMutation.mutate({ endpointId: endpoint.id, remove: true })}
                  >
                    Remover
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Últimas entregas</h2>
        {(deliveries ?? []).length === 0 ? (
          <EmptyState
            title="Sem entregas"
            description="Os eventos aparecem aqui assim que forem disparados."
          />
        ) : (
          <div className="space-y-2">
            {(deliveries ?? []).map((delivery) => (
              <Card key={delivery.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6 text-sm">
                  <div>
                    <span className="font-medium">{delivery.event}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatDate(delivery.created_at)} · {delivery.attempts} tentativa(s)
                      {delivery.response_status ? ` · HTTP ${delivery.response_status}` : ""}
                    </span>
                    {delivery.error ? (
                      <p className="text-xs text-destructive">{delivery.error}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={delivery.status === "delivered" ? "secondary" : "destructive"}>
                      {delivery.status}
                    </Badge>
                    {delivery.status !== "delivered" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryMutation.mutate(delivery.id)}
                      >
                        Tentar de novo
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** ---------- API pública ---------- */

function ApiTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const create = useServerFn(createApiKey);
  const rotate = useServerFn(rotateApiKey);
  const revoke = useServerFn(revokeApiKey);
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["pedidos:ler", "catalogo:ler"]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys", storeId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("api_keys")
        .select(
          "id, name, prefix, scopes, rate_limit_per_minute, is_active, expires_at, last_used_at, requests_count, revoked_at",
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (fd: FormData) =>
      create({
        data: {
          storeId,
          name: String(fd.get("name") ?? ""),
          scopes,
          rateLimitPerMinute: Number(fd.get("rateLimit") ?? 120) || 120,
          expiresInDays: Number(fd.get("expiresInDays") ?? 0) || 0,
          sandbox: fd.get("sandbox") === "on",
        },
      }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      if (result.ok) {
        setNewKey(result.key ?? null);
        setOpen(false);
      }
      await queryClient.invalidateQueries({ queryKey: ["api-keys", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rotateMutation = useMutation({
    mutationFn: async (keyId: string) => rotate({ data: { storeId, keyId } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      if (result.key) setNewKey(result.key);
      await queryClient.invalidateQueries({ queryKey: ["api-keys", storeId] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => revoke({ data: { storeId, keyId } }),
    onSuccess: async (result) => {
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey: ["api-keys", storeId] });
    },
  });

  const toggleScope = (scope: string) =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API REST v1</CardTitle>
          <CardDescription>
            Base: <code>{origin}/api/public/v1</code> · Documentação:{" "}
            <a
              className="text-primary underline"
              href={`${origin}/api/public/v1/openapi.json`}
              target="_blank"
              rel="noreferrer noopener"
            >
              openapi.json
            </a>
            . Autentique com <code>Authorization: Bearer sua_chave</code>. Recursos: lojas,
            catálogo, clientes, pedidos, pagamentos, entregas, mesas, estoque, cupons e webhooks —
            com paginação, filtros e limite por minuto.
          </CardDescription>
        </CardHeader>
      </Card>

      {newKey ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">Sua nova chave (aparece só agora)</p>
            <code className="mt-1 block break-all">{newKey}</code>
            <Button className="mt-2" size="sm" variant="outline" onClick={() => setNewKey(null)}>
              Já copiei
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Nova chave</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
            <DialogDescription>
              Escolha somente os escopos necessários para esta integração.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate(new FormData(event.currentTarget));
            }}
          >
            <div>
              <Label htmlFor="key-name">Nome</Label>
              <Input id="key-name" name="name" required placeholder="ERP da loja" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rateLimit">Limite por minuto</Label>
                <Input
                  id="rateLimit"
                  name="rateLimit"
                  type="number"
                  min="10"
                  max="1000"
                  defaultValue={120}
                />
              </div>
              <div>
                <Label htmlFor="expiresInDays">Validade (dias, 0 = sem prazo)</Label>
                <Input
                  id="expiresInDays"
                  name="expiresInDays"
                  type="number"
                  min="0"
                  max="3650"
                  defaultValue={0}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sandbox" className="h-4 w-4" />
              Chave de teste (prefixo sp_test)
            </label>
            <div>
              <Label>Escopos</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {API_SCOPES.map((scope) => (
                  <Button
                    key={scope.key}
                    type="button"
                    size="sm"
                    variant={scopes.includes(scope.key) ? "default" : "outline"}
                    onClick={() => toggleScope(scope.key)}
                  >
                    {scope.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={createMutation.isPending || scopes.length === 0}>
              Criar chave
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma chave"
          description="Crie uma chave para integrar seu ERP ou aplicativo próprio."
        />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((key) => (
            <Card key={key.id} className={key.is_active ? "" : "opacity-70"}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{key.name}</h3>
                    <Badge variant={key.is_active ? "secondary" : "destructive"}>
                      {key.is_active ? "ativa" : "revogada"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <code>{key.prefix}…</code> · {key.scopes.length} escopo(s) ·{" "}
                    {key.rate_limit_per_minute}/min · {key.requests_count} chamadas
                    {key.last_used_at
                      ? ` · uso em ${formatDate(key.last_used_at)}`
                      : " · nunca usada"}
                    {key.expires_at ? ` · expira em ${formatDate(key.expires_at)}` : ""}
                  </p>
                </div>
                {key.is_active ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rotateMutation.mutate(key.id)}
                    >
                      Rotacionar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => revokeMutation.mutate(key.id)}>
                      Revogar
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** ---------- Logs ---------- */

function LogsTab({ storeId }: { storeId: string }) {
  const { data: events } = useQuery({
    queryKey: ["integration-events", storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_events")
        .select("id, kind, direction, event_type, status, attempts, error, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: apiLogs } = useQuery({
    queryKey: ["api-logs", storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("api_request_logs")
        .select("id, method, path, status, duration_ms, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos das integrações</CardTitle>
          <CardDescription>Entradas de webhook, testes e retentativas.</CardDescription>
        </CardHeader>
        <CardContent>
          {(events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(events ?? []).map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    {formatDate(event.created_at)} · {event.kind} · {event.event_type ?? "evento"}
                    {event.attempts > 0 ? ` · ${event.attempts} tentativa(s)` : ""}
                  </span>
                  <Badge variant={event.status === "failed" ? "destructive" : "secondary"}>
                    {event.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chamadas da API</CardTitle>
          <CardDescription>Últimas requisições recebidas pelas suas chaves.</CardDescription>
        </CardHeader>
        <CardContent>
          {(apiLogs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma chamada registrada ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(apiLogs ?? []).map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">
                    {log.method} {log.path}
                  </span>
                  <span className={log.status >= 400 ? "text-destructive" : "text-emerald-600"}>
                    {log.status} · {log.duration_ms}ms
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

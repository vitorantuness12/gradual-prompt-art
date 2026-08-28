import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { saveChannelCredentials, testChannelConnection } from "@/lib/atendimento.functions";
import { formatDateTime } from "@/lib/format";
import { INTEGRATIONS, INTEGRATION_STATUS_LABEL, PROVIDER_LABEL } from "@/lib/integrations";
import {
  CHANNEL_LABEL,
  DEFAULT_TEMPLATES,
  EVENT_LABEL,
  TEMPLATE_VARIABLES,
  defaultBusinessHours,
  parseBusinessHours,
  type MessageEvent,
} from "@/lib/messaging/templates";

export const Route = createFileRoute("/_authenticated/painel/canais")({
  component: ChannelsPage,
});

const CHANNELS = ["whatsapp"] as const;
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ChannelsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const saveCredentials = useServerFn(saveChannelCredentials);
  const testConnection = useServerFn(testChannelConnection);

  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("whatsapp");
  const [tokenDraft, setTokenDraft] = useState("");
  const [verifyDraft, setVerifyDraft] = useState("");
  const [secretDraft, setSecretDraft] = useState("");
  const [replyForm, setReplyForm] = useState({ shortcut: "", body: "", is_menu_option: false });

  const { data, isLoading } = useQuery({
    queryKey: ["channels", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [settings, templates, replies, automations, integrations, logs] = await Promise.all([
        supabase.from("channel_settings").select("*").eq("store_id", storeId!),
        supabase.from("message_templates").select("*").eq("store_id", storeId!).order("key"),
        supabase.from("quick_replies").select("*").eq("store_id", storeId!).order("sort_order"),
        supabase.from("automation_rules").select("*").eq("store_id", storeId!),
        supabase.from("store_integrations").select("*").eq("store_id", storeId!),
        supabase
          .from("message_logs")
          .select("*")
          .eq("store_id", storeId!)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      return {
        settings: settings.data ?? [],
        templates: templates.data ?? [],
        replies: replies.data ?? [],
        automations: automations.data ?? [],
        integrations: integrations.data ?? [],
        logs: logs.data ?? [],
      };
    },
  });

  const current = (data?.settings ?? []).find((item) => item.channel === channel);

  const [form, setForm] = useState({
    is_enabled: false,
    demo_mode: true,
    account_id: "",
    phone_number_id: "",
    display_number: "",
    from_email: "",
    bot_username: "",
    ai_assistant_enabled: false,
    transcription_enabled: false,
    max_messages_per_hour: 12,
    away_message: "",
    business_hours: defaultBusinessHours(),
  });

  useEffect(() => {
    setTokenDraft("");
    setVerifyDraft("");
    setSecretDraft("");
    if (!current) {
      setForm({
        is_enabled: false,
        demo_mode: true,
        account_id: "",
        phone_number_id: "",
        display_number: "",
        from_email: "",
        bot_username: "",
        ai_assistant_enabled: false,
        transcription_enabled: false,
        max_messages_per_hour: 12,
        away_message: "",
        business_hours: defaultBusinessHours(),
      });
      return;
    }
    setForm({
      is_enabled: current.is_enabled,
      demo_mode: current.demo_mode,
      account_id: current.account_id ?? "",
      phone_number_id: current.phone_number_id ?? "",
      display_number: current.display_number ?? "",
      from_email: current.from_email ?? "",
      bot_username: current.bot_username ?? "",
      ai_assistant_enabled: current.ai_assistant_enabled,
      transcription_enabled: current.transcription_enabled,
      max_messages_per_hour: current.max_messages_per_hour,
      away_message: current.away_message ?? "",
      business_hours: parseBusinessHours(current.business_hours),
    });
  }, [current?.id, channel]);

  const saveChannel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("channel_settings").upsert(
        {
          store_id: storeId!,
          channel,
          is_enabled: form.is_enabled,
          demo_mode: form.demo_mode,
          account_id: form.account_id || null,
          phone_number_id: form.phone_number_id || null,
          display_number: form.display_number || null,
          from_email: form.from_email || null,
          bot_username: form.bot_username || null,
          ai_assistant_enabled: form.ai_assistant_enabled,
          transcription_enabled: form.transcription_enabled,
          max_messages_per_hour: form.max_messages_per_hour,
          away_message: form.away_message || null,
          business_hours: form.business_hours as never,
          webhook_path: `/api/public/canais/${channel}/${storeId}`,
        },
        { onConflict: "store_id,channel" },
      );
      if (error) throw new Error(error.message);

      if (tokenDraft || verifyDraft || secretDraft) {
        const result = await saveCredentials({
          data: {
            storeId: storeId!,
            channel,
            ...(tokenDraft ? { accessToken: tokenDraft } : {}),
            ...(verifyDraft ? { verifyToken: verifyDraft } : {}),
            ...(secretDraft ? { appSecret: secretDraft } : {}),
          },
        });
        if (!result.ok) throw new Error(result.message);
      }
    },
    onSuccess: async () => {
      toast.success("Canal salvo.");
      setTokenDraft("");
      setVerifyDraft("");
      setSecretDraft("");
      await queryClient.invalidateQueries({ queryKey: ["channels", storeId] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar o canal."),
  });

  const runTest = useMutation({
    mutationFn: async () => testConnection({ data: { storeId: storeId!, channel } }),
    onSuccess: async (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await queryClient.invalidateQueries({ queryKey: ["channels", storeId] });
    },
    onError: () => toast.error("Não foi possível testar a conexão."),
  });

  const seedTemplates = useMutation({
    mutationFn: async () => {
      const rows = DEFAULT_TEMPLATES.map((template) => ({
        store_id: storeId!,
        key: template.key,
        title: template.title,
        body: template.body,
        channel,
      }));
      const { error } = await supabase.from("message_templates").upsert(rows, { onConflict: "store_id,key,channel" });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Modelos padrão criados.");
      await queryClient.invalidateQueries({ queryKey: ["channels", storeId] });
    },
    onError: () => toast.error("Não foi possível criar os modelos."),
  });

  const saveTemplate = useMutation({
    mutationFn: async ({ id, body, is_active }: { id: string; body?: string; is_active?: boolean }) => {
      const patch = body !== undefined ? { body } : { is_active: Boolean(is_active) };
      const { error } = await supabase.from("message_templates").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Modelo atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["channels", storeId] });
    },
  });

  const toggleAutomation = useMutation({
    mutationFn: async ({ event, isActive }: { event: string; isActive: boolean }) => {
      const { error } = await supabase.from("automation_rules").upsert(
        { store_id: storeId!, event, channel, template_key: event, is_active: isActive },
        { onConflict: "store_id,event,channel" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["channels", storeId] }),
    onError: () => toast.error("Não foi possível atualizar a automação."),
  });

  const addReply = useMutation({
    mutationFn: async () => {
      if (replyForm.body.trim().length < 3) throw new Error("Escreva a resposta.");
      const { error } = await supabase.from("quick_replies").insert({
        store_id: storeId!,
        shortcut: replyForm.shortcut.trim() || replyForm.body.slice(0, 20),
        body: replyForm.body.trim(),
        is_menu_option: replyForm.is_menu_option,
        sort_order: (data?.replies ?? []).length,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setReplyForm({ shortcut: "", body: "", is_menu_option: false });
      await queryClient.invalidateQueries({ queryKey: ["channels", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeReply = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["channels", storeId] }),
  });

  const saveIntegration = useMutation({
    mutationFn: async ({ kind, provider, isEnabled }: { kind: string; provider: string; isEnabled: boolean }) => {
      const { error } = await supabase.from("store_integrations").upsert(
        {
          store_id: storeId!,
          kind,
          provider,
          is_enabled: isEnabled,
          status: isEnabled ? "demo" : "not_configured",
        },
        { onConflict: "store_id,kind" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["channels", storeId] }),
  });

  const templates = (data?.templates ?? []).filter((item) => item.channel === channel);
  const webhookUrl = `${typeof window === "undefined" ? "" : window.location.origin}/api/public/canais/${channel}/${storeId ?? ""}`;

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div>
      <PageHeader
        title="Canais e automação"
        description="Conecte o WhatsApp oficial, Telegram e e-mail, edite modelos e acompanhe os registros de envio."
      />

      <Tabs defaultValue="canal" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="canal">Conexão</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="rapidas">Respostas rápidas</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="logs">Registros</TabsTrigger>
        </TabsList>

        {/* ---------- Conexão ---------- */}
        <TabsContent value="canal" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {CHANNELS.map((item) => (
              <Button
                key={item}
                variant={channel === item ? "default" : "outline"}
                size="sm"
                onClick={() => setChannel(item)}
              >
                {CHANNEL_LABEL[item]}
              </Button>
            ))}
            {form.demo_mode ? <Badge variant="secondary">Modo demonstração</Badge> : <Badge>Produção</Badge>}
          </div>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">
                {channel === "whatsapp" ? "WhatsApp Business Cloud API (oficial)" : CHANNEL_LABEL[channel]}
              </CardTitle>
              <CardDescription>
                {channel === "whatsapp"
                  ? "Integração oficial da Meta. Sem credenciais, o canal opera em demonstração e nada é enviado para fora."
                  : "Canal modular: as mesmas automações e modelos valem aqui."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                <p className="text-sm font-medium text-foreground">Canal ativo</p>
                <Switch
                  checked={form.is_enabled}
                  onCheckedChange={(checked) => setForm((old) => ({ ...old, is_enabled: checked }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Modo demonstração</p>
                  <p className="text-xs text-muted-foreground">Mensagens simuladas, sem envio real.</p>
                </div>
                <Switch
                  checked={form.demo_mode}
                  onCheckedChange={(checked) => setForm((old) => ({ ...old, demo_mode: checked }))}
                />
              </div>

              {channel === "whatsapp" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="waba">ID da conta (WABA ID)</Label>
                    <Input
                      id="waba"
                      value={form.account_id}
                      onChange={(event) => setForm((old) => ({ ...old, account_id: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone-id">ID do número (Phone Number ID)</Label>
                    <Input
                      id="phone-id"
                      value={form.phone_number_id}
                      onChange={(event) => setForm((old) => ({ ...old, phone_number_id: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="display">Número exibido</Label>
                    <Input
                      id="display"
                      value={form.display_number}
                      onChange={(event) => setForm((old) => ({ ...old, display_number: event.target.value }))}
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="token">Token de acesso</Label>
                <Input
                  id="token"
                  type="password"
                  autoComplete="off"
                  value={tokenDraft}
                  placeholder={current?.token_hint ?? "cole o token aqui"}
                  onChange={(event) => setTokenDraft(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Guardado apenas no servidor. Exibição: {current?.token_hint ?? "não configurado"}.
                </p>
              </div>

              {channel === "whatsapp" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="verify">Token de verificação do webhook</Label>
                    <Input
                      id="verify"
                      type="password"
                      autoComplete="off"
                      value={verifyDraft}
                      placeholder={current?.has_verify_token ? "configurado" : "defina um valor secreto"}
                      onChange={(event) => setVerifyDraft(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="secret">App Secret (assinatura do webhook)</Label>
                    <Input
                      id="secret"
                      type="password"
                      autoComplete="off"
                      value={secretDraft}
                      onChange={(event) => setSecretDraft(event.target.value)}
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5 sm:col-span-2">
                <Label>URL do webhook</Label>
                <code className="block break-all rounded-xl bg-secondary/50 p-3 text-xs text-foreground">{webhookUrl}</code>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Assistente de IA</p>
                  <p className="text-xs text-muted-foreground">Responde só com dados da loja e transfere quando não souber.</p>
                </div>
                <Switch
                  checked={form.ai_assistant_enabled}
                  onCheckedChange={(checked) => setForm((old) => ({ ...old, ai_assistant_enabled: checked }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Transcrição de áudio</p>
                  <p className="text-xs text-muted-foreground">Sem isso, áudios recebidos são recusados.</p>
                </div>
                <Switch
                  checked={form.transcription_enabled}
                  onCheckedChange={(checked) => setForm((old) => ({ ...old, transcription_enabled: checked }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="limit">Limite de mensagens por hora e contato</Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={60}
                  value={form.max_messages_per_hour}
                  onChange={(event) =>
                    setForm((old) => ({ ...old, max_messages_per_hour: Number(event.target.value) || 12 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="away">Mensagem fora do horário</Label>
                <Input
                  id="away"
                  value={form.away_message}
                  onChange={(event) => setForm((old) => ({ ...old, away_message: event.target.value }))}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Horário de atendimento</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {form.business_hours.map((day, index) => (
                    <div key={day.day} className="flex items-center gap-2 rounded-xl border border-border/70 p-2">
                      <span className="w-10 text-xs text-muted-foreground">{WEEK[index]}</span>
                      <Switch
                        checked={day.enabled}
                        onCheckedChange={(checked) =>
                          setForm((old) => ({
                            ...old,
                            business_hours: old.business_hours.map((item, position) =>
                              position === index ? { ...item, enabled: checked } : item,
                            ),
                          }))
                        }
                      />
                      <Input
                        type="time"
                        value={day.open}
                        className="h-8"
                        onChange={(event) =>
                          setForm((old) => ({
                            ...old,
                            business_hours: old.business_hours.map((item, position) =>
                              position === index ? { ...item, open: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                      <Input
                        type="time"
                        value={day.close}
                        className="h-8"
                        onChange={(event) =>
                          setForm((old) => ({
                            ...old,
                            business_hours: old.business_hours.map((item, position) =>
                              position === index ? { ...item, close: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button onClick={() => saveChannel.mutate()} disabled={saveChannel.isPending || !storeId}>
                  {saveChannel.isPending ? "Salvando..." : "Salvar canal"}
                </Button>
                <Button variant="outline" onClick={() => runTest.mutate()} disabled={runTest.isPending || !current}>
                  Testar conexão
                </Button>
              </div>

              {current?.last_test_at ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Último teste em {formatDateTime(current.last_test_at)}: {current.last_test_message}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Modelos ---------- */}
        <TabsContent value="modelos" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => seedTemplates.mutate()} disabled={!storeId}>
              Criar/restaurar modelos padrão
            </Button>
            <span className="text-xs text-muted-foreground">
              Variáveis: {TEMPLATE_VARIABLES.map((variable) => `{{${variable.key}}}`).join(" · ")}
            </span>
          </div>

          {templates.length === 0 ? (
            <EmptyState title="Nenhum modelo neste canal" description="Crie os modelos padrão para começar." />
          ) : (
            templates.map((template) => (
              <Card key={template.id} className="border-border/70">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">
                    {EVENT_LABEL[template.key as MessageEvent] ?? template.title}
                  </CardTitle>
                  <Switch
                    checked={template.is_active}
                    onCheckedChange={(checked) => saveTemplate.mutate({ id: template.id, is_active: checked })}
                  />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    rows={3}
                    defaultValue={template.body}
                    onBlur={(event) => {
                      if (event.target.value !== template.body) {
                        saveTemplate.mutate({ id: template.id, body: event.target.value });
                      }
                    }}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ---------- Automações ---------- */}
        <TabsContent value="automacoes" className="space-y-2">
          {(Object.keys(EVENT_LABEL) as MessageEvent[]).map((event) => {
            const rule = (data?.automations ?? []).find((item) => item.event === event && item.channel === channel);
            return (
              <Card key={event} className="border-border/70">
                <CardContent className="flex items-center justify-between gap-3 pt-6">
                  <div>
                    <p className="font-medium text-foreground">{EVENT_LABEL[event]}</p>
                    <p className="text-xs text-muted-foreground">
                      Envia o modelo “{EVENT_LABEL[event]}” por {CHANNEL_LABEL[channel]}.
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(rule?.is_active)}
                    onCheckedChange={(checked) => toggleAutomation.mutate({ event, isActive: checked })}
                  />
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ---------- Respostas rápidas ---------- */}
        <TabsContent value="rapidas" className="space-y-4">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Nova resposta rápida</CardTitle>
              <CardDescription>Marque como opção de menu para aparecer no menu numerado do cliente.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shortcut">Atalho</Label>
                <Input
                  id="shortcut"
                  value={replyForm.shortcut}
                  onChange={(event) => setReplyForm((old) => ({ ...old, shortcut: event.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                <p className="text-sm text-foreground">Opção de menu</p>
                <Switch
                  checked={replyForm.is_menu_option}
                  onCheckedChange={(checked) => setReplyForm((old) => ({ ...old, is_menu_option: checked }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="reply-body">Mensagem</Label>
                <Textarea
                  id="reply-body"
                  rows={2}
                  value={replyForm.body}
                  onChange={(event) => setReplyForm((old) => ({ ...old, body: event.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={() => addReply.mutate()} disabled={addReply.isPending || !storeId}>
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          {(data?.replies ?? []).map((reply) => (
            <Card key={reply.id} className="border-border/70">
              <CardContent className="flex items-center justify-between gap-3 pt-6">
                <div>
                  <p className="font-medium text-foreground">
                    {reply.shortcut} {reply.is_menu_option ? <Badge variant="secondary">Menu</Badge> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">{reply.body}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => removeReply.mutate(reply.id)}>
                  Remover
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ---------- Integrações ---------- */}
        <TabsContent value="integracoes" className="space-y-3">
          {INTEGRATIONS.map((integration) => {
            const saved = (data?.integrations ?? []).find((item) => item.kind === integration.kind);
            return (
              <Card key={integration.kind} className="border-border/70">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div className="min-w-[240px]">
                    <p className="font-medium text-foreground">
                      {integration.label}{" "}
                      <Badge variant="secondary">
                        {INTEGRATION_STATUS_LABEL[saved?.status ?? "not_configured"]}
                      </Badge>
                    </p>
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                    <p className="text-xs text-muted-foreground">Sem integração: {integration.fallback}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={saved?.provider ?? integration.providers[0] ?? ""}
                      onValueChange={(value) =>
                        saveIntegration.mutate({
                          kind: integration.kind,
                          provider: value,
                          isEnabled: saved?.is_enabled ?? false,
                        })
                      }
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {integration.providers.map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {PROVIDER_LABEL[provider] ?? provider}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={Boolean(saved?.is_enabled)}
                      onCheckedChange={(checked) =>
                        saveIntegration.mutate({
                          kind: integration.kind,
                          provider: saved?.provider ?? integration.providers[0]!,
                          isEnabled: checked,
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ---------- Logs ---------- */}
        <TabsContent value="logs" className="space-y-2">
          {(data?.logs ?? []).length === 0 ? (
            <EmptyState title="Sem registros ainda" description="Envios, falhas e webhooks aparecem aqui." />
          ) : (
            (data?.logs ?? []).map((log) => (
              <Card key={log.id} className={log.level === "error" ? "border-destructive/50" : "border-border/70"}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-5 text-sm">
                  <div>
                    <p className="font-medium text-foreground">
                      {log.event} · {CHANNEL_LABEL[log.channel] ?? log.channel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.direction === "inbound" ? "Recebida" : "Enviada"} · {log.contact ?? "sem contato"} ·{" "}
                      {log.attempts} tentativa(s)
                    </p>
                    {log.error ? <p className="text-xs text-destructive">{log.error}</p> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</span>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

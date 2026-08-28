import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useActiveStore } from "@/hooks/useMyStores";
import {
  AUTOMATION_EVENTS,
  CONNECTION_STATUS_LABEL,
  MESSAGE_VARIABLES,
  eventLabel,
  renderWhatsappTemplate,
} from "@/lib/whatsapp/eventos";
import {
  connectWhatsapp,
  deleteWhatsappAutomation,
  deleteWhatsappInstance,
  getWhatsappStatus,
  listWhatsappAutomations,
  logoutWhatsapp,
  saveWhatsappAutomation,
  sendWhatsappTest,
  type AutomationView,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/painel/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp da loja | O Seu Pedido" },
      { name: "description", content: "Conecte o WhatsApp da sua loja por QR Code e configure automações de pedidos." },
      { property: "og:title", content: "WhatsApp da loja | O Seu Pedido" },
      { property: "og:description", content: "Conecte o WhatsApp da sua loja por QR Code e configure automações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsappPage,
});

function WhatsappPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp da loja"
        description="Conecte o WhatsApp da sua loja lendo o QR Code com o celular. Depois de conectado, o Seu Pedido envia atualizações de pedidos e executa as automações que você escolher."
      />
      {!storeId ? (
        <p className="text-sm text-muted-foreground">Selecione uma loja para continuar.</p>
      ) : (
        <Tabs defaultValue="conexao">
          <TabsList>
            <TabsTrigger value="conexao">Conexão</TabsTrigger>
            <TabsTrigger value="automacoes">Automações do WhatsApp</TabsTrigger>
          </TabsList>
          <TabsContent value="conexao" className="mt-6">
            <ConnectionTab storeId={storeId} />
          </TabsContent>
          <TabsContent value="automacoes" className="mt-6">
            <AutomationsTab storeId={storeId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ConnectionTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const status = useServerFn(getWhatsappStatus);
  const connect = useServerFn(connectWhatsapp);
  const logout = useServerFn(logoutWhatsapp);
  const removeInstance = useServerFn(deleteWhatsappInstance);
  const sendTest = useServerFn(sendWhatsappTest);

  const [qr, setQr] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [testPhone, setTestPhone] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-status", storeId],
    queryFn: () => status({ data: { storeId } }),
    // Polling controlado: só enquanto a tela está aberta e aguardando conexão.
    refetchInterval: (query) => (query.state.data?.status === "connecting" ? 5000 : 30000),
  });

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setSeconds(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (data?.status === "open" && qr) {
      setQr(null);
      setExpiresAt(null);
      toast.success("WhatsApp conectado com sucesso.");
    }
  }, [data?.status, qr]);

  const connectMutation = useMutation({
    mutationFn: () => connect({ data: { storeId } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setQr(result.qrCode);
      setExpiresAt(result.qrExpiresAt);
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-status", storeId] });
    },
    onError: () => toast.error("Não foi possível iniciar a conexão agora."),
  });

  const logoutMutation = useMutation({
    mutationFn: () => logout({ data: { storeId } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      setQr(null);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-status", storeId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeInstance({ data: { storeId } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      setQr(null);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-status", storeId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      sendTest({ data: { storeId, phone: testPhone, body: "Teste de conexão do WhatsApp pelo Seu Pedido." } }),
    onSuccess: (result) => toast[result.ok ? "success" : "error"](result.message),
    onError: () => toast.error("Falha ao enviar a mensagem de teste."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando status…</p>;

  const expired = Boolean(qr) && seconds === 0;
  const connected = data?.status === "open";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Conexão
            <Badge variant={connected ? "default" : "secondary"}>
              {CONNECTION_STATUS_LABEL[data?.status ?? "close"] ?? "Desconectado"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {data?.configured
              ? data.globalEnabled
                ? "Tudo pronto para conectar o número da sua loja."
                : "A integração está temporariamente desativada pela plataforma."
              : "A plataforma ainda não configurou a integração de WhatsApp."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected ? (
            <div className="space-y-2 text-sm">
              <Row label="Número conectado" value={data?.phone ?? "—"} />
              <Row label="Perfil" value={data?.profileName ?? "—"} />
              <Row label="Conectado em" value={data?.connectedAt ? new Date(data.connectedAt).toLocaleString("pt-BR") : "—"} />
              <Row label="Última sincronização" value={data?.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString("pt-BR") : "—"} />
              <Row label="Último evento recebido" value={data?.lastEventAt ? new Date(data.lastEventAt).toLocaleString("pt-BR") : "—"} />
            </div>
          ) : qr && !expired ? (
            <div className="space-y-3">
              <img
                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                alt="QR Code para conectar o WhatsApp da loja"
                className="mx-auto w-56 rounded-xl border border-border bg-white p-2"
              />
              <p className="text-center text-sm text-muted-foreground">
                Expira em {seconds}s — abra o WhatsApp, toque em Configurações, Dispositivos conectados e Vincular
                dispositivo.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {expired
                ? "O QR Code expirou. Gere um novo para continuar."
                : "Nenhum número conectado. Clique em conectar para gerar o QR Code."}
            </div>
          )}

          {data?.lastError ? <p className="text-sm text-destructive">{data.lastError}</p> : null}

          <div className="flex flex-wrap gap-2">
            {!connected ? (
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending || !data?.configured || !data?.globalEnabled}
              >
                {connectMutation.isPending ? "Preparando…" : qr ? "Gerar novo QR Code" : "Conectar meu WhatsApp"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-status", storeId] })}
            >
              Atualizar status
            </Button>
            {data?.hasInstance ? (
              <>
                <Button variant="outline" onClick={() => connectMutation.mutate()}>
                  Reconectar WhatsApp
                </Button>
                <Button variant="outline" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
                  Desconectar este número
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm("Excluir a instância e criar outra? A sessão atual do WhatsApp será removida.")) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  Excluir instância
                </Button>
              </>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Desconectar remove a sessão do WhatsApp. Suas automações continuam salvas e voltam a funcionar assim que
            você reconectar.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo do dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Mensagens enviadas hoje" value={String(data?.sentToday ?? 0)} />
            <Row label="Mensagens com erro" value={String(data?.failedToday ?? 0)} />
            <Row label="Automações ativas" value={String(data?.automationsActive ?? 0)} />
            <Row label="Instância" value={data?.instanceName ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enviar mensagem de teste</CardTitle>
            <CardDescription>Confirme que o número conectado consegue enviar mensagens.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input
              value={testPhone}
              onChange={(event) => setTestPhone(event.target.value)}
              placeholder="(65) 99999-0000"
              className="max-w-56"
              aria-label="Telefone para teste"
            />
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={!connected || testPhone.length < 10 || testMutation.isPending}
            >
              {testMutation.isPending ? "Enviando…" : "Enviar teste"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

const EMPTY_FORM = {
  id: undefined as string | undefined,
  name: "",
  triggerEvent: AUTOMATION_EVENTS[0]!.key,
  isActive: true,
  category: "transactional" as "transactional" | "support" | "marketing",
  messageBody: AUTOMATION_EVENTS[0]!.suggestion,
  orderType: "",
  sendFrom: "",
  sendTo: "",
  maxPerDay: 200,
};

function AutomationsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listWhatsappAutomations);
  const save = useServerFn(saveWhatsappAutomation);
  const remove = useServerFn(deleteWhatsappAutomation);

  const [form, setForm] = useState(EMPTY_FORM);

  const { data: automations } = useQuery({
    queryKey: ["whatsapp-automations", storeId],
    queryFn: () => list({ data: { storeId } }),
  });

  const preview = useMemo(
    () =>
      renderWhatsappTemplate(form.messageBody, {
        nome_cliente: "Maria",
        nome_loja: "Sua loja",
        numero_pedido: "1042",
        valor_total: "R$ 89,64",
        status_pedido: "em preparo",
        tempo_estimado: "35 min",
        link_acompanhamento: "https://oseupedido.com.br/sua-loja/acompanhar",
        endereco_entrega: "Rua das Flores, 120",
        nome_entregador: "Carlos",
        codigo_confirmacao: "4821",
        data_agendada: "12/09/2026",
        horario_agendado: "19:30",
      }),
    [form.messageBody],
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          storeId,
          id: form.id,
          name: form.name,
          triggerEvent: form.triggerEvent,
          isActive: form.isActive,
          category: form.category,
          messageBody: form.messageBody,
          audience: "all",
          orderType: form.orderType || null,
          sendFrom: form.sendFrom || null,
          sendTo: form.sendTo || null,
          maxPerDay: Number(form.maxPerDay),
        },
      }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      if (result.ok) setForm(EMPTY_FORM);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-automations", storeId] });
    },
    onError: () => toast.error("Não foi possível salvar a automação."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { storeId, id } }),
    onSuccess: async () => {
      toast.success("Automação removida.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-automations", storeId] });
    },
  });

  function edit(rule: AutomationView) {
    setForm({
      id: rule.id,
      name: rule.name,
      triggerEvent: rule.triggerEvent,
      isActive: rule.isActive,
      category: rule.category as "transactional" | "support" | "marketing",
      messageBody: rule.messageBody,
      orderType: rule.orderType ?? "",
      sendFrom: rule.sendFrom?.slice(0, 5) ?? "",
      sendTo: rule.sendTo?.slice(0, 5) ?? "",
      maxPerDay: rule.maxPerDay,
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{form.id ? "Editar automação" : "Nova automação"}</CardTitle>
          <CardDescription>Sem código: escolha o evento, escreva a mensagem e ative.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auto-name">Nome interno</Label>
            <Input
              id="auto-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Aviso de pedido a caminho"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auto-event">Evento disparador</Label>
            <Select
              value={form.triggerEvent}
              onValueChange={(value) => {
                const found = AUTOMATION_EVENTS.find((item) => item.key === value);
                setForm({
                  ...form,
                  triggerEvent: value,
                  category: found?.category ?? form.category,
                  messageBody: form.messageBody.trim() ? form.messageBody : (found?.suggestion ?? ""),
                });
              }}
            >
              <SelectTrigger id="auto-event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_EVENTS.map((event) => (
                  <SelectItem key={event.key} value={event.key}>
                    {event.group} · {event.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="auto-body">Modelo de mensagem</Label>
            <Textarea
              id="auto-body"
              rows={5}
              value={form.messageBody}
              onChange={(event) => setForm({ ...form, messageBody: event.target.value })}
            />
            <div className="flex flex-wrap gap-1">
              {MESSAGE_VARIABLES.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  title={variable.description}
                  onClick={() => setForm({ ...form, messageBody: `${form.messageBody}{{${variable.key}}}` })}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                >
                  {`{{${variable.key}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-secondary/60 p-3 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Pré-visualização</p>
            <p className="whitespace-pre-wrap">{preview}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="auto-from">Enviar a partir de</Label>
              <Input
                id="auto-from"
                type="time"
                value={form.sendFrom}
                onChange={(event) => setForm({ ...form, sendFrom: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-to">Enviar até</Label>
              <Input
                id="auto-to"
                type="time"
                value={form.sendTo}
                onChange={(event) => setForm({ ...form, sendTo: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-type">Tipo de pedido</Label>
              <Select
                value={form.orderType || "all"}
                onValueChange={(value) => setForm({ ...form, orderType: value === "all" ? "" : value })}
              >
                <SelectTrigger id="auto-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="delivery">Entrega</SelectItem>
                  <SelectItem value="pickup">Retirada</SelectItem>
                  <SelectItem value="dine_in">Mesa</SelectItem>
                  <SelectItem value="scheduled">Agendado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-limit">Limite por dia</Label>
              <Input
                id="auto-limit"
                type="number"
                value={form.maxPerDay}
                onChange={(event) => setForm({ ...form, maxPerDay: Number(event.target.value) })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Automação ativa</p>
              <p className="text-xs text-muted-foreground">
                Mensagens promocionais só saem para quem deu consentimento.
              </p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(value) => setForm({ ...form, isActive: value })} />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={form.name.length < 2 || saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando…" : form.id ? "Salvar alterações" : "Criar automação"}
            </Button>
            {form.id ? (
              <Button variant="outline" onClick={() => setForm(EMPTY_FORM)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automações da loja</CardTitle>
          <CardDescription>Histórico de execução e status de cada regra.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(automations ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma automação criada ainda.</p>
          ) : (
            (automations ?? []).map((rule) => (
              <div key={rule.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{rule.name}</p>
                    <p className="text-xs text-muted-foreground">{eventLabel(rule.triggerEvent)}</p>
                  </div>
                  <Badge variant={rule.isActive ? "default" : "secondary"}>
                    {rule.isActive ? "Ativa" : "Pausada"}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{rule.messageBody}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Execuções: {rule.runCount}</span>
                  <span>
                    Último envio: {rule.lastRunAt ? new Date(rule.lastRunAt).toLocaleString("pt-BR") : "—"}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(rule)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(rule.id)}>
                    Excluir
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

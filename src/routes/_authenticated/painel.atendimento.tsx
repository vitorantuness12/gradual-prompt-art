import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { askStoreAssistant, sendChannelMessage, setContactConsent } from "@/lib/atendimento.functions";
import { formatDateTime } from "@/lib/format";
import { CHANNEL_LABEL, conversationLink } from "@/lib/messaging/templates";

export const Route = createFileRoute("/_authenticated/painel/atendimento")({
  component: SupportPage,
});

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  pending: "Aguardando cliente",
  closed: "Encerrada",
};

function SupportPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const send = useServerFn(sendChannelMessage);
  const ask = useServerFn(askStoreAssistant);
  const consent = useServerFn(setContactConsent);

  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [newContact, setNewContact] = useState({ channel: "whatsapp", contact: "", name: "" });

  const conversations = useQuery({
    queryKey: ["conversations", storeId],
    enabled: Boolean(storeId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("store_id", storeId!)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const team = useQuery({
    queryKey: ["team", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data: members } = await supabase.from("store_members").select("user_id, role").eq("store_id", storeId!);
      const ids = (members ?? []).map((member) => member.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return ids.map((id) => ({
        userId: id,
        name: profiles?.find((profile) => profile.id === id)?.full_name ?? "Integrante",
      }));
    },
  });

  const quickReplies = useQuery({
    queryKey: ["quick-replies", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data } = await supabase.from("quick_replies").select("*").eq("store_id", storeId!).order("sort_order");
      return data ?? [];
    },
  });

  const activeId = selected ?? conversations.data?.[0]?.id ?? null;
  const conversation = (conversations.data ?? []).find((item) => item.id === activeId) ?? null;

  const messages = useQuery({
    queryKey: ["messages", activeId],
    enabled: Boolean(activeId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId!)
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const consentQuery = useQuery({
    queryKey: ["consent", storeId, conversation?.contact, conversation?.channel],
    enabled: Boolean(storeId && conversation?.contact),
    queryFn: async () => {
      const { data } = await supabase
        .from("contact_consents")
        .select("*")
        .eq("store_id", storeId!)
        .eq("channel", conversation!.channel)
        .eq("contact", conversation!.contact!)
        .maybeSingle();
      return data;
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (body: string) => {
      if (!activeId || !storeId) throw new Error("Selecione uma conversa.");
      return send({ data: { storeId, conversationId: activeId, body } });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.demo) toast.info(result.message);
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível enviar a mensagem."),
  });

  const aiAnswer = useMutation({
    mutationFn: async () => {
      if (!activeId || !storeId) throw new Error("Selecione uma conversa.");
      const lastCustomer = [...(messages.data ?? [])].reverse().find((item) => item.direction === "inbound");
      const question = draft.trim() || lastCustomer?.body || "";
      if (question.length < 2) throw new Error("Escreva a pergunta do cliente.");
      return ask({ data: { storeId, conversationId: activeId, question } });
    },
    onSuccess: (result) => {
      setDraft(result.answer);
      if (result.handoff) toast.warning("O assistente não tinha essa informação — revise antes de enviar.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateConversation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("conversations").update(patch as never).eq("id", activeId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["conversations", storeId] }),
    onError: () => toast.error("Não foi possível atualizar a conversa."),
  });

  const toggleConsent = useMutation({
    mutationFn: async (optedIn: boolean) => {
      if (!conversation?.contact) throw new Error("Conversa sem contato.");
      return consent({
        data: { storeId: storeId!, channel: conversation.channel, contact: conversation.contact, optedIn },
      });
    },
    onSuccess: async () => {
      toast.success("Preferência de contato atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["consent", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createConversation = useMutation({
    mutationFn: async () => {
      if (newContact.contact.trim().length < 3) throw new Error("Informe o contato.");
      const { error } = await supabase.from("conversations").insert({
        store_id: storeId!,
        subject: "Novo atendimento",
        channel: newContact.channel,
        contact: newContact.contact.trim(),
        contact_name: newContact.name.trim() || null,
        last_message_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Conversa criada.");
      setNewContact({ channel: "whatsapp", contact: "", name: "" });
      await queryClient.invalidateQueries({ queryKey: ["conversations", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendMessage.mutate(text);
  }

  function addTag() {
    const tag = tagDraft.trim();
    if (!tag || !conversation) return;
    updateConversation.mutate({ tags: [...new Set([...(conversation.tags ?? []), tag])] });
    setTagDraft("");
  }

  const optedOut = consentQuery.data?.opted_in === false;

  return (
    <div>
      <PageHeader
        title="Atendimento"
        description="Caixa de entrada única com etiquetas, responsável, respostas rápidas e assistente de IA."
        actions={
          <Button variant="outline" asChild>
            <Link to="/painel/canais">Configurar canais</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Nova conversa</CardTitle>
              <CardDescription>Gera também o link direto para falar com o cliente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={newContact.channel}
                onValueChange={(value) => setNewContact((old) => ({ ...old, channel: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["whatsapp", "telegram", "email", "chat"].map((item) => (
                    <SelectItem key={item} value={item}>
                      {CHANNEL_LABEL[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Contato (telefone, @usuário ou e-mail)"
                value={newContact.contact}
                onChange={(event) => setNewContact((old) => ({ ...old, contact: event.target.value }))}
              />
              <Input
                placeholder="Nome do cliente"
                value={newContact.name}
                onChange={(event) => setNewContact((old) => ({ ...old, name: event.target.value }))}
              />
              <Button className="w-full" onClick={() => createConversation.mutate()} disabled={!storeId}>
                Criar conversa
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Conversas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {conversations.isLoading ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : (conversations.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conversa aberta.</p>
              ) : (
                (conversations.data ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      activeId === item.id ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-secondary"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {item.contact_name ?? item.contact ?? item.subject ?? "Atendimento"}
                      {item.is_demo ? <DemoBadge /> : null}
                      {item.unread_count > 0 ? <Badge variant="destructive">{item.unread_count}</Badge> : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {CHANNEL_LABEL[item.channel] ?? item.channel} · {STATUS_LABEL[item.status] ?? item.status} ·{" "}
                      {formatDateTime(item.last_message_at ?? item.updated_at)}
                    </span>
                    {(item.tags ?? []).length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {(item.tags ?? []).map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {conversation ? (conversation.contact_name ?? conversation.contact ?? "Conversa") : "Mensagens"}
            </CardTitle>
            {conversation ? (
              <CardDescription>
                {CHANNEL_LABEL[conversation.channel] ?? conversation.channel}
                {conversation.contact ? ` · ${conversation.contact}` : ""}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {!conversation ? (
              <EmptyState title="Selecione uma conversa" />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={conversation.status} onValueChange={(value) => updateConversation.mutate({ status: value })}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([id, label]) => (
                        <SelectItem key={id} value={id}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={conversation.assigned_to ?? ""}
                    onValueChange={(value) => updateConversation.mutate({ assigned_to: value })}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {(team.data ?? []).map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant={conversation.human_takeover ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateConversation.mutate({ human_takeover: !conversation.human_takeover })}
                  >
                    {conversation.human_takeover ? "Atendimento humano ativo" : "Assumir atendimento"}
                  </Button>

                  {conversation.contact ? (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={conversationLink(conversation.channel, conversation.contact)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir conversa
                      </a>
                    </Button>
                  ) : null}

                  {conversation.contact ? (
                    <Button
                      variant={optedOut ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleConsent.mutate(optedOut)}
                    >
                      {optedOut ? "Reativar contato" : "Registrar opt-out"}
                    </Button>
                  ) : null}
                </div>

                {optedOut ? (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                    Este contato pediu para não receber mensagens. Só responda se ele iniciar o contato.
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {(conversation.tags ?? []).map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() =>
                        updateConversation.mutate({ tags: (conversation.tags ?? []).filter((item) => item !== tag) })
                      }
                    >
                      {tag} ×
                    </Badge>
                  ))}
                  <div className="flex items-center gap-1">
                    <Label htmlFor="tag" className="sr-only">
                      Nova etiqueta
                    </Label>
                    <Input
                      id="tag"
                      value={tagDraft}
                      className="h-8 w-36"
                      placeholder="nova etiqueta"
                      onChange={(event) => setTagDraft(event.target.value)}
                    />
                    <Button size="sm" variant="outline" onClick={addTag}>
                      Adicionar
                    </Button>
                  </div>
                </div>

                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {(messages.data ?? []).map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        message.direction === "outbound"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      <p>{message.body}</p>
                      {message.transcript ? (
                        <p className="mt-1 rounded-lg bg-background/30 p-2 text-xs">
                          Transcrição: {message.transcript} — confirme com o cliente antes de criar o pedido.
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] opacity-70">
                        {formatDateTime(message.created_at)}
                        {message.is_demo ? " · simulada" : ""}
                        {message.status === "failed" ? ` · falhou: ${message.error ?? ""}` : ""}
                      </p>
                    </div>
                  ))}
                  {(messages.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {(quickReplies.data ?? []).map((reply) => (
                    <Button key={reply.id} type="button" size="sm" variant="outline" onClick={() => setDraft(reply.body)}>
                      {reply.shortcut}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => aiAnswer.mutate()}
                    disabled={aiAnswer.isPending}
                  >
                    {aiAnswer.isPending ? "Consultando IA..." : "Sugerir resposta com IA"}
                  </Button>
                </div>

                <form onSubmit={handleSend} className="flex gap-2">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Escreva uma mensagem"
                    aria-label="Mensagem"
                  />
                  <Button type="submit" disabled={sendMessage.isPending || optedOut}>
                    Enviar
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

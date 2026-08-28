import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
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
import { Textarea } from "@/components/ui/textarea";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel/suporte")({
  component: SupportPage,
  head: () => ({
    meta: [
      { title: "Suporte da loja | O Seu Pedido" },
      {
        name: "description",
        content:
          "Abra chamados, acompanhe respostas e consulte o histórico de suporte da sua loja.",
      },
    ],
  }),
});

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  pending: "Aguardando você",
  resolved: "Resolvido",
  closed: "Encerrado",
};

function SupportPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState("duvida");

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support-tickets", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("store_id", storeId!)
        .order("last_message_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["support-messages", selected],
    enabled: Boolean(selected),
    queryFn: async () => {
      const { data } = await supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", selected!)
        .order("created_at");
      return data ?? [];
    },
  });

  const createTicket = useMutation({
    mutationFn: async (fd: FormData) => {
      const { data: user } = await supabase.auth.getUser();
      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({
          store_id: storeId!,
          subject: String(fd.get("subject") ?? "").trim(),
          category,
          priority: String(fd.get("priority") ?? "normal"),
          created_by: user.user?.id ?? null,
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const body = String(fd.get("body") ?? "").trim();
      if (ticket && body) {
        await supabase.from("support_ticket_messages").insert({
          ticket_id: ticket.id,
          body,
          author_id: user.user?.id ?? null,
          author_type: "store",
        });
      }
    },
    onSuccess: async () => {
      toast.success("Chamado aberto. Nossa equipe responde por aqui.");
      await queryClient.invalidateQueries({ queryKey: ["support-tickets", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reply = useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        body,
        author_id: user.user?.id ?? null,
        author_type: "store",
      });
      if (error) throw new Error(error.message);
      await supabase
        .from("support_tickets")
        .update({ last_message_at: new Date().toISOString(), status: "open" })
        .eq("id", ticketId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["support-messages", selected] });
      await queryClient.invalidateQueries({ queryKey: ["support-tickets", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Suporte"
        description="Abra um chamado e acompanhe as respostas da equipe da plataforma."
      />

      {!storeId ? (
        <EmptyState title="Escolha uma loja" description="Selecione a loja no topo do painel." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo chamado</CardTitle>
              <CardDescription>
                Descreva o que aconteceu; respondemos por aqui e por e-mail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  createTicket.mutate(new FormData(event.currentTarget));
                  event.currentTarget.reset();
                }}
              >
                <div>
                  <Label htmlFor="subject">Assunto</Label>
                  <Input
                    id="subject"
                    name="subject"
                    required
                    placeholder="Pedido não imprimiu na cozinha"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="category">Tipo</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="duvida">Dúvida</SelectItem>
                        <SelectItem value="problema">Problema</SelectItem>
                        <SelectItem value="financeiro">Financeiro</SelectItem>
                        <SelectItem value="sugestao">Sugestão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="priority">Prioridade</Label>
                    <Select name="priority" defaultValue="normal">
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="body">Descrição</Label>
                  <Textarea id="body" name="body" rows={4} required />
                </div>
                <Button type="submit" disabled={createTicket.isPending}>
                  Abrir chamado
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : (tickets ?? []).length === 0 ? (
              <EmptyState
                title="Nenhum chamado"
                description="Quando precisar de ajuda, abra um chamado ao lado."
              />
            ) : (
              (tickets ?? []).map((ticket) => {
                const isOpen = selected === ticket.id;
                return (
                  <Card key={ticket.id}>
                    <CardContent className="pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-medium">{ticket.subject}</h3>
                          <p className="text-sm text-muted-foreground">
                            {ticket.category} · {formatDateTime(ticket.last_message_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={ticket.status === "resolved" ? "secondary" : "default"}>
                            {STATUS_LABEL[ticket.status] ?? ticket.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelected(isOpen ? null : ticket.id)}
                          >
                            {isOpen ? "Fechar" : "Abrir"}
                          </Button>
                        </div>
                      </div>

                      {isOpen ? (
                        <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
                          <ul className="space-y-2 text-sm">
                            {(messages ?? []).map((message) => (
                              <li
                                key={message.id}
                                className={
                                  message.author_type === "store"
                                    ? "rounded-xl bg-secondary/50 p-3"
                                    : "rounded-xl border border-border/70 p-3"
                                }
                              >
                                <p className="text-xs text-muted-foreground">
                                  {message.author_type === "store" ? "Você" : "Suporte"} ·{" "}
                                  {formatDateTime(message.created_at)}
                                </p>
                                <p className="whitespace-pre-line">{message.body}</p>
                              </li>
                            ))}
                            {(messages ?? []).length === 0 ? (
                              <li className="text-muted-foreground">Sem mensagens ainda.</li>
                            ) : null}
                          </ul>

                          <form
                            className="space-y-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = event.currentTarget;
                              const body = String(new FormData(form).get("reply") ?? "").trim();
                              if (!body) return;
                              reply.mutate({ ticketId: ticket.id, body });
                              form.reset();
                            }}
                          >
                            <Label htmlFor={`reply-${ticket.id}`} className="sr-only">
                              Responder
                            </Label>
                            <Textarea
                              id={`reply-${ticket.id}`}
                              name="reply"
                              rows={2}
                              placeholder="Escreva uma resposta"
                            />
                            <Button size="sm" type="submit" disabled={reply.isPending}>
                              Enviar
                            </Button>
                          </form>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

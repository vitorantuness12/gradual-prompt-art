import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CheckCircle2, Copy, Download, FileText, Plus, Printer, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import {
  CHECKLIST_STATUS_LABEL,
  DEFAULT_CHECKLIST,
  QUOTE_STATUS_LABEL,
  buildDayLoad,
  capacityCalendar,
  ATTACHMENT_STATUS_LABEL,
  checklistProgress,
  dayKey,
  delayRisk,
  depositSplit,
  quoteTotals,
  teamByDay,
  type QuoteStatus,
} from "@/lib/encomendas";
import { convertQuoteToOrder, markDepositPaid, rescheduleOrder } from "@/lib/encomendas.functions";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { compressImage } from "@/lib/image-upload";
import { downloadCsv, printReport } from "@/lib/relatorios";
import { DEFAULT_PRODUCTION, parseProduction } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/painel/encomendas")({
  component: EncomendasPage,
  head: () => ({
    meta: [
      { title: "Encomendas e eventos | O Seu Pedido" },
      {
        name: "description",
        content:
          "Orçamentos com aprovação do cliente, sinal de 50%, checklist de produção e calendário de capacidade por dia.",
      },
      { property: "og:title", content: "Encomendas e eventos | O Seu Pedido" },
      {
        property: "og:description",
        content: "Proposta, aprovação, sinal e produção das suas encomendas em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface QuoteItemForm {
  name: string;
  quantity: string;
  unitPrice: string;
  notes: string;
}

function EncomendasPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;

  if (!storeId) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div>
      <PageHeader
        title="Encomendas e eventos"
        description="Proposta aprovada pelo cliente, sinal de 50%, ficha de produção e capacidade por dia."
      />
      <Tabs defaultValue="orcamentos">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="orcamentos">Orçamentos</TabsTrigger>
          <TabsTrigger value="producao">Ficha de produção</TabsTrigger>
          <TabsTrigger value="calendario">Calendário de capacidade</TabsTrigger>
          <TabsTrigger value="auditoria">Histórico</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
        </TabsList>
        <TabsContent value="orcamentos">
          <QuotesTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="producao">
          <ProductionTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="calendario">
          <CalendarTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="auditoria">
          <AuditTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="regras">
          <RulesTab storeId={storeId} />
        </TabsContent>
      </Tabs>

    </div>
  );
}

/* ---------------- Orçamentos ---------------- */

function QuotesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const convert = useServerFn(convertQuoteToOrder);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [depositPercent, setDepositPercent] = useState("50");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [items, setItems] = useState<QuoteItemForm[]>([
    { name: "", quantity: "1", unitPrice: "0", notes: "" },
  ]);

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["quotes", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_items(id, name, quantity, unit_price, total)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const totals = useMemo(
    () =>
      quoteTotals(
        items.map((item) => ({
          name: item.name,
          quantity: Number(item.quantity.replace(",", ".")) || 0,
          unitPrice: Number(item.unitPrice.replace(",", ".")) || 0,
        })),
        {
          discount: Number(discount.replace(",", ".")) || 0,
          deliveryFee: Number(deliveryFee.replace(",", ".")) || 0,
          depositPercent: Number(depositPercent) || 0,
        },
      ),
    [items, discount, deliveryFee, depositPercent],
  );

  const createQuote = useMutation({
    mutationFn: async (status: QuoteStatus) => {
      const valid = items.filter((item) => item.name.trim());
      if (!customerName.trim()) throw new Error("Informe o nome do cliente.");
      if (valid.length === 0) throw new Error("Adicione pelo menos um item na proposta.");

      const code = `ORC${Date.now().toString().slice(-6)}`;
      const { data: quote, error } = await supabase
        .from("quotes")
        .insert({
          store_id: storeId,
          code,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.replace(/\D/g, "") || null,
          event_at: eventAt ? new Date(eventAt).toISOString() : null,
          valid_until: validUntil ? new Date(validUntil).toISOString() : null,
          notes: notes.trim() || null,
          status,
          subtotal: totals.subtotal,
          discount: Number(discount.replace(",", ".")) || 0,
          delivery_fee: Number(deliveryFee.replace(",", ".")) || 0,
          total: totals.total,
          deposit_percent: Number(depositPercent) || 0,
          deposit_amount: totals.deposit,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const { error: itemsError } = await supabase.from("quote_items").insert(
        valid.map((item) => {
          const quantity = Number(item.quantity.replace(",", ".")) || 1;
          const unitPrice = Number(item.unitPrice.replace(",", ".")) || 0;
          return {
            quote_id: quote.id,
            store_id: storeId,
            name: item.name.trim(),
            quantity,
            unit_price: unitPrice,
            total: Math.round(quantity * unitPrice * 100) / 100,
            notes: item.notes.trim() || null,
          };
        }),
      );
      if (itemsError) throw new Error(itemsError.message);
    },
    onSuccess: () => {
      toast.success("Orçamento salvo.");
      setCustomerName("");
      setCustomerPhone("");
      setEventAt("");
      setValidUntil("");
      setNotes("");
      setItems([{ name: "", quantity: "1", unitPrice: "0", notes: "" }]);
      void queryClient.invalidateQueries({ queryKey: ["quotes", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendQuote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").update({ status: "sent" }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Proposta liberada para o cliente aprovar pelo link.");
      void queryClient.invalidateQueries({ queryKey: ["quotes", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toOrder = useMutation({
    mutationFn: async (id: string) => convert({ data: { quoteId: id } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      void queryClient.invalidateQueries({ queryKey: ["quotes", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function copyLink(token: string) {
    const url = `${window.location.origin}/orcamento/${token}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link da proposta copiado.");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova proposta</CardTitle>
          <CardDescription>O cliente aprova pelo link e a proposta vira pedido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="quote-name">Cliente</Label>
            <Input id="quote-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="quote-phone">WhatsApp</Label>
              <Input id="quote-phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-event">Data do evento</Label>
              <Input
                id="quote-event"
                type="datetime-local"
                value={eventAt}
                onChange={(event) => setEventAt(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Itens</Label>
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[1fr_70px_90px_auto] gap-2">
                <Input
                  placeholder="Item"
                  value={item.name}
                  onChange={(event) =>
                    setItems((list) => list.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))
                  }
                />
                <Input
                  placeholder="Qtd"
                  value={item.quantity}
                  onChange={(event) =>
                    setItems((list) =>
                      list.map((row, i) => (i === index ? { ...row, quantity: event.target.value } : row)),
                    )
                  }
                />
                <Input
                  placeholder="Valor"
                  value={item.unitPrice}
                  onChange={(event) =>
                    setItems((list) =>
                      list.map((row, i) => (i === index ? { ...row, unitPrice: event.target.value } : row)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover item"
                  onClick={() => setItems((list) => list.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((list) => [...list, { name: "", quantity: "1", unitPrice: "0", notes: "" }])}
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar item
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="quote-discount">Desconto</Label>
              <Input id="quote-discount" value={discount} onChange={(event) => setDiscount(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-fee">Entrega</Label>
              <Input id="quote-fee" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-deposit">Sinal %</Label>
              <Input id="quote-deposit" value={depositPercent} onChange={(event) => setDepositPercent(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quote-valid">Proposta válida até</Label>
            <Input
              id="quote-valid"
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="quote-notes">Observações</Label>
            <Textarea id="quote-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </div>
          <div className="rounded-xl bg-secondary/50 p-3 text-sm">
            <p>Total: <strong>{formatCurrency(totals.total)}</strong></p>
            <p className="text-muted-foreground">
              Sinal {depositPercent}%: {formatCurrency(totals.deposit)} • Saldo na entrega: {formatCurrency(totals.balance)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => createQuote.mutate("sent")} disabled={createQuote.isPending}>
              Enviar ao cliente
            </Button>
            <Button variant="outline" onClick={() => createQuote.mutate("draft")} disabled={createQuote.isPending}>
              Rascunho
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? <Skeleton className="h-40 rounded-2xl" /> : null}
        {(quotes ?? []).map((quote) => (
          <Card key={quote.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{quote.code}</strong>
                  <Badge variant="secondary">
                    {QUOTE_STATUS_LABEL[(quote.status as QuoteStatus) ?? "draft"] ?? quote.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {quote.customer_name} • {formatCurrency(Number(quote.total ?? 0))} • sinal{" "}
                  {formatCurrency(Number(quote.deposit_amount ?? 0))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {quote.event_at ? `Evento em ${formatDateTime(quote.event_at)}` : "Sem data definida"}
                  {quote.rejection_reason ? ` • Motivo: ${quote.rejection_reason}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copyLink(quote.public_token)}>
                  <Copy className="mr-1 h-4 w-4" /> Link
                </Button>
                {quote.status === "draft" ? (
                  <Button size="sm" variant="outline" onClick={() => sendQuote.mutate(quote.id)}>
                    <FileText className="mr-1 h-4 w-4" /> Enviar
                  </Button>
                ) : null}
                {quote.status === "approved" ? (
                  <Button size="sm" onClick={() => toOrder.mutate(quote.id)} disabled={toOrder.isPending}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Virar pedido
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && (quotes ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum orçamento criado ainda.</p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Ficha de produção ---------------- */

function ProductionTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const payDeposit = useServerFn(markDepositPaid);
  const moveOrder = useServerFn(rescheduleOrder);
  const [newStep, setNewStep] = useState<Record<string, string>>({});
  const [newMember, setNewMember] = useState<Record<string, string>>({});
  const [newDate, setNewDate] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["encomendas-producao", storeId],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, code, customer_name, scheduled_for, total, deposit_amount, balance_due, deposit_paid_at, balance_confirmed_at, public_token, status")
        .eq("store_id", storeId)
        .not("scheduled_for", "is", null)
        .not("status", "in", "(cancelled,rejected,delivered,completed)")
        .order("scheduled_for", { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);

      const ids = (orders ?? []).map((order) => order.id);
      const [{ data: checklist }, { data: assignments }, { data: files }] = ids.length
        ? await Promise.all([
            supabase
              .from("order_checklist_items")
              .select("*")
              .in("order_id", ids)
              .order("position", { ascending: true }),
            supabase.from("order_assignments").select("*").in("order_id", ids),
            supabase
              .from("order_attachments")
              .select("*")
              .in("order_id", ids)
              .order("created_at", { ascending: false }),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];

      const attachments = await Promise.all(
        (files ?? []).map(async (file) => {
          const { data: signed } = await supabase.storage
            .from("store-images")
            .createSignedUrl(file.file_path, 60 * 60);
          return { ...file, url: signed?.signedUrl ?? null };
        }),
      );

      return {
        orders: orders ?? [],
        checklist: checklist ?? [],
        assignments: assignments ?? [],
        attachments,
      };
    },
  });

  // Atualização em tempo real: a equipe vê as marcações de todo mundo na hora.
  useEffect(() => {
    const channel = supabase
      .channel(`encomendas-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_checklist_items", filter: `store_id=eq.${storeId}` },
        () => queryClient.invalidateQueries({ queryKey: ["encomendas-producao", storeId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_assignments", filter: `store_id=eq.${storeId}` },
        () => queryClient.invalidateQueries({ queryKey: ["encomendas-producao", storeId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, queryClient]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["encomendas-producao", storeId] });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("order_checklist_items")
        .update({ done: input.done, done_at: input.done ? new Date().toISOString() : null })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const addStep = useMutation({
    mutationFn: async (input: { orderId: string; title: string; position: number }) => {
      const { error } = await supabase.from("order_checklist_items").insert({
        store_id: storeId,
        order_id: input.orderId,
        title: input.title,
        position: input.position,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const seedChecklist = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from("order_checklist_items").insert(
        DEFAULT_CHECKLIST.map((title, index) => ({
          store_id: storeId,
          order_id: orderId,
          title,
          position: index,
        })),
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const addMember = useMutation({
    mutationFn: async (input: { orderId: string; name: string; workDate: string | null }) => {
      const { error } = await supabase.from("order_assignments").insert({
        store_id: storeId,
        order_id: input.orderId,
        member_name: input.name,
        work_date: input.workDate,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_assignments").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadFile = useMutation({
    mutationFn: async (input: { orderId: string; file: File; kind: string }) => {
      if (input.file.size > 8 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 8 MB.");
      const blob = await compressImage(input.file, { maxWidth: 1600, maxHeight: 1600 });
      const path = `encomendas/${storeId}/${input.orderId}-${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("store-images")
        .upload(path, blob, { contentType: "image/webp", upsert: false });
      if (uploadError) throw new Error("Não foi possível enviar o arquivo.");

      const { error } = await supabase.from("order_attachments").insert({
        store_id: storeId,
        order_id: input.orderId,
        kind: input.kind,
        file_path: path,
        title: input.file.name.slice(0, 80),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Arquivo enviado. O cliente pode aprovar pelo link da encomenda.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviewFile = useMutation({
    mutationFn: async (input: { id: string; status: string }) => {
      const { error } = await supabase
        .from("order_attachments")
        .update({ status: input.status, reviewed_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const reschedule = useMutation({
    mutationFn: async (input: { orderId: string; scheduledFor: string }) =>
      moveOrder({ data: { orderId: input.orderId, scheduledFor: new Date(input.scheduledFor).toISOString() } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deposit = useMutation({
    mutationFn: async (orderId: string) => payDeposit({ data: { orderId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      void invalidate();
    },
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;

  return (
    <div className="space-y-3">
      {(data?.orders ?? []).map((order) => {
        const steps = (data?.checklist ?? []).filter((item) => item.order_id === order.id);
        const team = (data?.assignments ?? []).filter((item) => item.order_id === order.id);
        const files = (data?.attachments ?? []).filter((item) => item.order_id === order.id);
        const progress = checklistProgress(steps);
        const risk = delayRisk(order.scheduled_for, progress);
        return (
          <Card key={order.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {order.code} • {order.customer_name}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={order.deposit_paid_at ? "secondary" : "outline"}>
                    Sinal {formatCurrency(Number(order.deposit_amount ?? 0))}{" "}
                    {order.deposit_paid_at ? "recebido" : "pendente"}
                  </Badge>
                  <Badge variant="outline">Saldo {formatCurrency(Number(order.balance_due ?? 0))}</Badge>
                  {order.balance_confirmed_at ? <Badge variant="secondary">Saldo avisado pelo cliente</Badge> : null}
                  {!order.deposit_paid_at ? (
                    <Button size="sm" variant="outline" onClick={() => deposit.mutate(order.id)}>
                      Registrar sinal
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}/encomenda/${order.public_token}`);
                      toast.success("Link da encomenda copiado.");
                    }}
                  >
                    <Copy className="mr-1 h-4 w-4" /> Link do cliente
                  </Button>
                </div>
              </div>
              <CardDescription>
                Entrega em {order.scheduled_for ? formatDateTime(order.scheduled_for) : "—"} •{" "}
                {CHECKLIST_STATUS_LABEL[progress.status]} ({progress.done}/{progress.total})
              </CardDescription>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {steps.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  Esta encomenda ainda não tem ficha de produção.
                  <Button size="sm" variant="outline" onClick={() => seedChecklist.mutate(order.id)}>
                    Criar etapas padrão
                  </Button>
                </div>
              ) : null}
              {steps.map((step) => (
                <label key={step.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={step.done}
                    onCheckedChange={(checked) => toggle.mutate({ id: step.id, done: checked === true })}
                  />
                  <span className={step.done ? "text-muted-foreground line-through" : ""}>{step.title}</span>
                  {step.done && step.done_at ? (
                    <span className="text-xs text-muted-foreground">{formatDateTime(step.done_at)}</span>
                  ) : null}
                </label>
              ))}

              <div className="flex flex-wrap gap-2">
                <Input
                  className="max-w-64"
                  placeholder="Nova etapa"
                  value={newStep[order.id] ?? ""}
                  onChange={(event) => setNewStep((current) => ({ ...current, [order.id]: event.target.value }))}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const title = (newStep[order.id] ?? "").trim();
                    if (!title) return;
                    addStep.mutate({ orderId: order.id, title, position: steps.length });
                    setNewStep((current) => ({ ...current, [order.id]: "" }));
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Etapa
                </Button>
              </div>

              {risk.atRisk ? (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium">{risk.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input
                      type="datetime-local"
                      className="max-w-56"
                      value={newDate[order.id] ?? ""}
                      onChange={(event) => setNewDate((current) => ({ ...current, [order.id]: event.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const value = newDate[order.id];
                        if (!value) {
                          toast.error("Escolha a nova data de entrega.");
                          return;
                        }
                        reschedule.mutate({ orderId: order.id, scheduledFor: value });
                      }}
                    >
                      <CalendarClock className="mr-1 h-4 w-4" /> Reprogramar
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Personalização e prova de produção</p>
                  <label className="cursor-pointer text-sm text-primary">
                    Enviar arquivo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadFile.mutate({ orderId: order.id, file, kind: "prova" });
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-3">
                  {files.map((file) => (
                    <div key={file.id} className="w-40 space-y-1">
                      {file.url ? (
                        <img src={file.url} alt={file.title ?? "Arquivo"} className="h-28 w-full rounded-lg object-cover" loading="lazy" />
                      ) : null}
                      <p className="truncate text-xs">{file.title}</p>
                      <Badge variant={file.status === "approved" ? "secondary" : "outline"} className="text-xs">
                        {ATTACHMENT_STATUS_LABEL[file.status] ?? file.status}
                      </Badge>
                      {file.status === "pending" ? (
                        <Button size="sm" variant="ghost" onClick={() => reviewFile.mutate({ id: file.id, status: "approved" })}>
                          Marcar aprovado
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {files.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Nenhum arquivo enviado.</span>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-sm font-medium">Responsáveis</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {team.map((member) => (
                    <Badge key={member.id} variant="secondary" className="gap-1">
                      {member.member_name}
                      {member.work_date ? ` • ${new Date(`${member.work_date}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
                      <button
                        type="button"
                        aria-label={`Remover ${member.member_name}`}
                        onClick={() => removeMember.mutate(member.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {team.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Ninguém alocado ainda.</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="max-w-56"
                    placeholder="Nome do responsável"
                    value={newMember[order.id] ?? ""}
                    onChange={(event) => setNewMember((current) => ({ ...current, [order.id]: event.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const name = (newMember[order.id] ?? "").trim();
                      if (!name) return;
                      addMember.mutate({
                        orderId: order.id,
                        name,
                        workDate: order.scheduled_for ? dayKey(order.scheduled_for) : null,
                      });
                      setNewMember((current) => ({ ...current, [order.id]: "" }));
                    }}
                  >
                    <Users className="mr-1 h-4 w-4" /> Alocar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {(data?.orders ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma encomenda programada em aberto.</p>
      ) : null}
    </div>
  );
}


/* ---------------- Calendário de capacidade ---------------- */

function CalendarTab({ storeId }: { storeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["encomendas-calendario", storeId],
    queryFn: async () => {
      const [{ data: settingsRow }, { data: orders }, { data: assignments }] = await Promise.all([
        supabase.from("production_settings").select("*").eq("store_id", storeId).maybeSingle(),
        supabase
          .from("orders")
          .select("id, code, customer_name, scheduled_for, total, balance_due, order_items(quantity)")
          .eq("store_id", storeId)
          .not("scheduled_for", "is", null)
          .not("status", "in", "(cancelled,rejected)")
          .gte("scheduled_for", new Date().toISOString())
          .order("scheduled_for", { ascending: true }),
        supabase.from("order_assignments").select("order_id, member_name, work_date").eq("store_id", storeId),
      ]);
      const settings = parseProduction(settingsRow);
      const load = buildDayLoad(
        (orders ?? []).map((order) => ({
          scheduled_for: order.scheduled_for,
          items: (order.order_items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
        })),
      );
      return {
        settings,
        orders: orders ?? [],
        team: teamByDay(assignments ?? []),
        days: capacityCalendar(load, settings.dailyMaxOrders, settings.dailyMaxItems, 30),
      };
    },
  });

  if (isLoading || !data) return <Skeleton className="h-40 rounded-2xl" />;

  const totalOrders = data.days.reduce((sum, day) => sum + day.usedOrders, 0);
  const fullDays = data.days.filter((day) => day.full).length;
  const peopleFor = (day: string) => data.team.find((item) => item.day === day)?.people ?? [];

  function exportCapacity() {
    downloadCsv(
      "capacidade-encomendas",
      data!.days.map((day) => ({
        Dia: day.day,
        Pedidos: day.usedOrders,
        Itens: day.usedItems,
        "Vagas restantes": day.remainingOrders ?? "sem limite",
        "Itens restantes": day.remainingItems ?? "sem limite",
        Equipe: peopleFor(day.day).join("; "),
        Situação: day.full ? "Lotado" : "Disponível",
      })),
    );
  }

  function exportAgenda() {
    downloadCsv(
      "agenda-encomendas",
      data!.orders.map((order) => ({
        Dia: order.scheduled_for ? dayKey(order.scheduled_for) : "",
        Entrega: order.scheduled_for ? formatDateTime(order.scheduled_for) : "",
        Pedido: order.code,
        Cliente: order.customer_name,
        Total: Number(order.total ?? 0),
        Saldo: Number(order.balance_due ?? 0),
        Equipe: (data!.team.flatMap((item) => item.people) ?? []).length ? peopleFor(order.scheduled_for ? dayKey(order.scheduled_for) : "").join("; ") : "",
      })),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Encomendas nos próximos 30 dias" value={String(totalOrders)} />
        <StatCard label="Dias lotados" value={String(fullDays)} />
        <StatCard
          label="Limite por dia"
          value={data.settings.dailyMaxOrders > 0 ? `${data.settings.dailyMaxOrders} pedidos` : "Sem limite"}
        />
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={exportCapacity}>
          <Download className="mr-1 h-4 w-4" /> Capacidade em CSV
        </Button>
        <Button size="sm" variant="outline" onClick={exportAgenda}>
          <Download className="mr-1 h-4 w-4" /> Agenda em CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => printReport()}>
          <Printer className="mr-1 h-4 w-4" /> Imprimir / PDF
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {data.days.map((day) => {
          const people = peopleFor(day.day);
          return (
            <div
              key={day.day}
              className={`rounded-xl border p-3 text-sm ${day.full ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"}`}
            >
              <p className="font-medium">
                {new Date(`${day.day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </p>
              <p className="text-xs text-muted-foreground">
                {day.usedOrders} pedido(s) • {day.usedItems} item(ns)
              </p>
              <p className="text-xs">
                {day.full ? "Lotado" : day.remainingOrders === null ? "Livre" : `Restam ${day.remainingOrders}`}
              </p>
              {people.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Equipe: {people.join(", ")}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Agenda de encomendas por dia</CardTitle>
          <CardDescription>Use a impressão para gerar o PDF da produção.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.orders.map((order) => (
            <div key={order.id} className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
              <span>
                {order.scheduled_for ? formatDateTime(order.scheduled_for) : "—"} • {order.code} • {order.customer_name}
              </span>
              <span className="text-muted-foreground">
                {formatCurrency(Number(order.total ?? 0))} • saldo {formatCurrency(Number(order.balance_due ?? 0))}
              </span>
            </div>
          ))}
          {data.orders.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma encomenda programada.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Histórico e auditoria ---------------- */

function AuditTab({ storeId }: { storeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["encomendas-auditoria", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("store_id", storeId)
        .in("entity", ["quotes", "orders"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Histórico de alterações</CardTitle>
            <CardDescription>Aprovações, mudanças de valor, personalização e etapas de produção.</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv(
                "historico-encomendas",
                (data ?? []).map((row) => ({
                  Quando: formatDateTime(row.created_at),
                  Ação: AUDIT_LABEL[row.action] ?? row.action,
                  Registro: row.entity,
                  Usuário: row.user_id ?? "sistema",
                  Detalhes: JSON.stringify(row.metadata ?? {}),
                })),
              )
            }
          >
            <Download className="mr-1 h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {(data ?? []).map((row) => (
          <div key={row.id} className="border-b border-border/60 pb-2 last:border-0">
            <p className="font-medium">{AUDIT_LABEL[row.action] ?? row.action}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(row.created_at)} • {row.user_id ? `usuário ${row.user_id.slice(0, 8)}` : "automático"} •{" "}
              {JSON.stringify(row.metadata ?? {})}
            </p>
          </div>
        ))}
        {(data ?? []).length === 0 ? (
          <p className="text-muted-foreground">Nenhuma alteração registrada ainda.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  "orcamento.criado": "Orçamento criado",
  "orcamento.status": "Situação do orçamento alterada",
  "orcamento.valor": "Valor do orçamento alterado",
  "encomenda.etapa_concluida": "Etapa de produção concluída",
  "encomenda.etapa_reaberta": "Etapa de produção reaberta",
  "encomenda.personalizacao": "Personalização alterada",
};


/* ---------------- Regras ---------------- */

function RulesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["production-settings", storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("production_settings")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      return parseProduction(data);
    },
  });

  const [form, setForm] = useState<{
    cutoffDays: string;
    dailyMaxOrders: string;
    dailyMaxItems: string;
    requireDeposit: boolean;
    depositPercent: string;
  } | null>(null);

  const current = form ?? {
    cutoffDays: String(settings?.cutoffDays ?? DEFAULT_PRODUCTION.cutoffDays),
    dailyMaxOrders: String(settings?.dailyMaxOrders ?? 0),
    dailyMaxItems: String(settings?.dailyMaxItems ?? 0),
    requireDeposit: settings?.requireDeposit ?? false,
    depositPercent: String(settings?.depositPercent ?? 50),
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("production_settings").upsert(
        {
          store_id: storeId,
          cutoff_days: Math.trunc(Number(current.cutoffDays) || 0),
          daily_max_orders: Math.trunc(Number(current.dailyMaxOrders) || 0),
          daily_max_items: Math.trunc(Number(current.dailyMaxItems) || 0),
          require_deposit: current.requireDeposit,
          deposit_percent: Number(current.depositPercent) || 0,
        },
        { onConflict: "store_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Regras de encomenda atualizadas.");
      void queryClient.invalidateQueries({ queryKey: ["production-settings", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;

  const example = depositSplit(200, Number(current.depositPercent) || 0);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Regras das encomendas</CardTitle>
        <CardDescription>Data de corte, capacidade por dia e política de sinal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="cutoff">Aceito até X dias antes</Label>
            <Input
              id="cutoff"
              value={current.cutoffDays}
              onChange={(event) => setForm({ ...current, cutoffDays: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="daily-orders">Pedidos por dia (0 = livre)</Label>
            <Input
              id="daily-orders"
              value={current.dailyMaxOrders}
              onChange={(event) => setForm({ ...current, dailyMaxOrders: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="daily-items">Itens por dia (0 = livre)</Label>
            <Input
              id="daily-items"
              value={current.dailyMaxItems}
              onChange={(event) => setForm({ ...current, dailyMaxItems: event.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <p className="font-medium">Exigir sinal na encomenda</p>
            <p className="text-sm text-muted-foreground">
              Sinal de {current.depositPercent}% e saldo na entrega — em R$ 200,00 fica{" "}
              {formatCurrency(example.deposit)} + {formatCurrency(example.balance)}.
            </p>
          </div>
          <Switch
            checked={current.requireDeposit}
            onCheckedChange={(checked) => setForm({ ...current, requireDeposit: checked })}
          />
        </div>
        <div className="space-y-1 sm:max-w-40">
          <Label htmlFor="deposit-percent">Percentual do sinal</Label>
          <Input
            id="deposit-percent"
            value={current.depositPercent}
            onChange={(event) => setForm({ ...current, depositPercent: event.target.value })}
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Salvar regras
        </Button>
      </CardContent>
    </Card>
  );
}

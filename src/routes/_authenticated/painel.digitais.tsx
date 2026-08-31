import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Copy, FileText, Link2, Mail, Plus, RefreshCcw, RotateCcw, Undo2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MembrosTab } from "@/components/painel/MembrosTab";
import { PageHeader, StatCard } from "@/components/painel/PageHeader";
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
import {
  DEFAULT_LINK_DAYS,
  DEFAULT_MAX_DOWNLOADS,
  INVOICE_STATUS_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  affiliateCommission,
  affiliateLink,
  deliveryAccess,
  expiryFrom,
  REFUND_KIND_LABEL,
  REFUND_METHOD_LABEL,
  buildFunnel,
  monthlyEquivalent,
  offerConversionRate,
} from "@/lib/digitais";
import { registerStoreRefund, runStoreSubscriptionBilling, sendDeliveryEmail } from "@/lib/digitais.functions";
import {
  DIGITAL_EVENT_LABEL,
  DIGITAL_VARIABLES,
  PREVIEW_VARS,
  defaultTemplate,
  renderDigitalTemplate,
  templateKey,
  type DigitalChannel,
  type DigitalMessageEvent,
} from "@/lib/digitais-templates";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { downloadCsv, printReport } from "@/lib/relatorios";

export const Route = createFileRoute("/_authenticated/painel/digitais")({
  component: DigitalPage,
  head: () => ({
    meta: [
      { title: "Produtos digitais | O Seu Pedido" },
      {
        name: "description",
        content: "Entregas protegidas, assinaturas recorrentes, afiliados, order bump e notas fiscais dos seus infoprodutos.",
      },
    ],
  }),
});

function DigitalPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const slug = active?.store.slug ?? "";

  if (!storeId) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div>
      <PageHeader
        title="Produtos digitais"
        description="Entrega protegida, assinatura recorrente, afiliados, order bump e nota fiscal."
      />
      <Tabs defaultValue="entregas">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="assinaturas">Assinaturas</TabsTrigger>
          <TabsTrigger value="afiliados">Afiliados e origem</TabsTrigger>
          <TabsTrigger value="bump">Order bump</TabsTrigger>
          <TabsTrigger value="mensagens">Mensagens</TabsTrigger>
          <TabsTrigger value="reembolsos">Reembolsos</TabsTrigger>
          <TabsTrigger value="funil">Funil do checkout</TabsTrigger>
          <TabsTrigger value="membros">Área de membros</TabsTrigger>
          <TabsTrigger value="fiscal">Nota fiscal</TabsTrigger>
        </TabsList>
        <TabsContent value="membros">
          <MembrosTab storeId={storeId} slug={slug} />
        </TabsContent>
        <TabsContent value="entregas">
          <DeliveriesTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="assinaturas">
          <SubscriptionsTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="afiliados">
          <AffiliatesTab storeId={storeId} slug={slug} />
        </TabsContent>
        <TabsContent value="bump">
          <OffersTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="mensagens">
          <MessagesTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="reembolsos">
          <RefundsTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="funil">
          <FunnelTab storeId={storeId} />
        </TabsContent>
        <TabsContent value="fiscal">
          <FiscalTab storeId={storeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------- Entregas -------------------------------- */

function DeliveriesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(String(DEFAULT_LINK_DAYS));
  const [max, setMax] = useState(String(DEFAULT_MAX_DOWNLOADS));

  const deliveries = useQuery({
    queryKey: ["digital-deliveries", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_deliveries")
        .select(
          "id, access_token, created_at, expires_at, revoked_at, download_count, max_downloads, last_download_at, customer_email, product:products(name), order:orders(code, customer_name, customer_email, payment_status)",
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; values: Partial<{ expires_at: string | null; max_downloads: number; download_count: number; revoked_at: string | null }> }) => {
      const { error } = await supabase.from("digital_deliveries").update(input.values).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Entrega atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["digital-deliveries", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const emailFn = useServerFn(sendDeliveryEmail);
  const sendEmail = useMutation({
    mutationFn: (deliveryId: string) =>
      emailFn({ data: { storeId, deliveryId, baseUrl: window.location.origin } }),
    onSuccess: (result) => (result.ok ? toast.success(result.message) : toast.error(result.message)),
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = deliveries.data ?? [];
  const active = rows.filter((row) => deliveryAccess(row).allowed).length;
  const downloads = rows.reduce((sum, row) => sum + (row.download_count ?? 0), 0);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Entregas geradas" value={String(rows.length)} hint="Últimas 200" />
        <StatCard label="Links ativos" value={String(active)} hint="Dentro da validade e do limite" />
        <StatCard label="Downloads" value={String(downloads)} hint="Total consumido" />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Padrão de proteção</CardTitle>
          <CardDescription>Aplique validade e limite de downloads às entregas selecionadas abaixo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-32 space-y-1.5">
            <Label htmlFor="validade">Validade (dias)</Label>
            <Input id="validade" value={days} onChange={(event) => setDays(event.target.value)} inputMode="numeric" />
          </div>
          <div className="w-40 space-y-1.5">
            <Label htmlFor="limite">Limite de downloads</Label>
            <Input id="limite" value={max} onChange={(event) => setMax(event.target.value)} inputMode="numeric" />
          </div>
          <p className="text-xs text-muted-foreground">Use “Renovar” em cada entrega para aplicar esses valores.</p>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardContent className="space-y-3 pt-6">
          {deliveries.isLoading ? <Skeleton className="h-24 rounded-xl" /> : null}
          {rows.length === 0 && !deliveries.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma entrega digital ainda. Elas são criadas quando um produto digital é pago.
            </p>
          ) : null}
          {rows.map((row) => {
            const access = deliveryAccess(row);
            const link = `${origin}/entrega/${row.access_token}`;
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{row.product?.name ?? "Produto digital"}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.order?.customer_name ?? row.customer_email ?? "Comprador"} ·{" "}
                    {row.download_count}/{row.max_downloads} downloads ·{" "}
                    {row.expires_at ? `vence ${formatDateTime(row.expires_at)}` : "sem validade"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={access.allowed ? "secondary" : "outline"}>
                    {access.allowed ? "Ativo" : row.revoked_at ? "Revogado" : access.reason === "expired" ? "Expirado" : "Limite atingido"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(link);
                      toast.success("Link copiado.");
                    }}
                  >
                    <Copy className="mr-1.5 size-3.5" aria-hidden="true" /> Copiar link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sendEmail.isPending}
                    onClick={() => sendEmail.mutate(row.id)}
                  >
                    <Mail className="mr-1.5 size-3.5" aria-hidden="true" /> Enviar por e-mail
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update.mutate({
                        id: row.id,
                        values: {
                          expires_at: expiryFrom(Number(days) || DEFAULT_LINK_DAYS),
                          max_downloads: Number(max) || DEFAULT_MAX_DOWNLOADS,
                          download_count: 0,
                          revoked_at: null,
                        },
                      })
                    }
                  >
                    <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" /> Renovar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      update.mutate({
                        id: row.id,
                        values: { revoked_at: row.revoked_at ? null : new Date().toISOString() },
                      })
                    }
                  >
                    <Ban className="mr-1.5 size-3.5" aria-hidden="true" />
                    {row.revoked_at ? "Reativar" : "Revogar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ Assinaturas ------------------------------ */

function SubscriptionsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const runBilling = useServerFn(runStoreSubscriptionBilling);

  const subscriptions = useQuery({
    queryKey: ["customer-subscriptions", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_subscriptions")
        .select(
          "id, customer_name, customer_email, amount, period, status, next_charge_at, failed_attempts, cancel_at_period_end, last_charge_at, product:products(name)",
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const charges = useQuery({
    queryKey: ["subscription-charges", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_charges")
        .select("id, amount, status, attempt, method, error_message, charged_at, subscription_id")
        .eq("store_id", storeId)
        .order("charged_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const mutateSubscription = useMutation({
    mutationFn: async (input: { id: string; values: Partial<{ status: string; canceled_at: string | null; cancel_at_period_end: boolean }> }) => {
      const { error } = await supabase.from("customer_subscriptions").update(input.values).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Assinatura atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["customer-subscriptions", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const billing = useMutation({
    mutationFn: () => runBilling({ data: { storeId } }),
    onSuccess: (result) => {
      toast.success(`${result.checked} assinatura(s) verificadas · ${result.charged} cobradas · ${result.failed} pendentes.`);
      void queryClient.invalidateQueries({ queryKey: ["customer-subscriptions", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["subscription-charges", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = subscriptions.data ?? [];
  const mrr = rows
    .filter((row) => row.status === "active")
    .reduce((sum, row) => sum + Number(row.amount) * (row.period === "year" ? 1 / 12 : row.period === "quarter" ? 1 / 3 : row.period === "week" ? 4 : 1), 0);
  const overdue = rows.filter((row) => row.status === "past_due").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Receita recorrente" value={formatCurrency(mrr)} hint="Estimativa mensal das assinaturas ativas" />
        <StatCard label="Assinantes ativos" value={String(rows.filter((row) => row.status === "active").length)} hint="" />
        <StatCard label="Inadimplentes" value={String(overdue)} hint="Cobranças não confirmadas" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => billing.mutate()} disabled={billing.isPending}>
          <RefreshCcw className="mr-2 size-4" aria-hidden="true" />
          {billing.isPending ? "Cobrando..." : "Rodar cobrança agora"}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv(
              "assinaturas",
              rows.map((row) => ({
                Cliente: row.customer_name,
                Produto: row.product?.name ?? "",
                Valor: Number(row.amount).toFixed(2),
                Ciclo: row.period,
                Situação: SUBSCRIPTION_STATUS_LABEL[row.status] ?? row.status,
                "Próxima cobrança": row.next_charge_at ?? "",
              })),
            )
          }
        >
          Exportar CSV
        </Button>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Assinantes</CardTitle>
          <CardDescription>Cobrança automática a cada ciclo, com retentativa e cancelamento por inadimplência.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma assinatura ainda.</p> : null}
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{row.customer_name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.product?.name ?? "Plano"} · {formatCurrency(Number(row.amount))} ·{" "}
                  {row.next_charge_at ? `próxima em ${formatDateTime(row.next_charge_at)}` : "sem próxima cobrança"}
                  {row.failed_attempts > 0 ? ` · ${row.failed_attempts} tentativa(s) falha(s)` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={row.status === "active" ? "secondary" : "outline"}>
                  {SUBSCRIPTION_STATUS_LABEL[row.status] ?? row.status}
                  {row.cancel_at_period_end ? " · cancela no fim" : ""}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mutateSubscription.mutate({ id: row.id, values: { cancel_at_period_end: !row.cancel_at_period_end } })}
                >
                  {row.cancel_at_period_end ? "Manter ativa" : "Cancelar no fim"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    mutateSubscription.mutate({
                      id: row.id,
                      values: { status: "canceled", canceled_at: new Date().toISOString() },
                    })
                  }
                >
                  Cancelar agora
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Histórico de cobranças</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(charges.data ?? []).length === 0 ? (
            <p className="text-muted-foreground">Nenhuma cobrança registrada.</p>
          ) : (
            (charges.data ?? []).map((charge) => (
              <div key={charge.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <span>{formatDateTime(charge.charged_at)}</span>
                <span className="text-muted-foreground">
                  tentativa {charge.attempt} · {charge.method ?? "manual"}
                </span>
                <span className="font-medium text-foreground">{formatCurrency(Number(charge.amount))}</span>
                <Badge variant={charge.status === "paid" ? "secondary" : "outline"}>
                  {charge.status === "paid" ? "Paga" : charge.status === "failed" ? "Falhou" : "Pendente"}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------- Afiliados ------------------------------- */

function AffiliatesTab({ storeId, slug }: { storeId: string; slug: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", code: "", email: "", commission: "10" });

  const affiliates = useQuery({
    queryKey: ["store-affiliates", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_affiliates")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const orders = useQuery({
    queryKey: ["affiliate-orders", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total, affiliate_code, utm_source, utm_medium, utm_campaign, created_at")
        .eq("store_id", storeId)
        .not("affiliate_code", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.code.trim()) throw new Error("Informe nome e código.");
      const { error } = await supabase.from("store_affiliates").insert({
        store_id: storeId,
        name: form.name.trim(),
        code: form.code.trim().toLowerCase().replace(/\s+/g, "-"),
        email: form.email.trim() || null,
        commission_percent: Number(form.commission) || 0,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Afiliado criado.");
      setForm({ name: "", code: "", email: "", commission: "10" });
      void queryClient.invalidateQueries({ queryKey: ["store-affiliates", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const origin = typeof window === "undefined" ? "https://oseupedido.com.br" : window.location.origin;

  const summary = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number }>();
    for (const order of orders.data ?? []) {
      const key = order.affiliate_code ?? "";
      const entry = map.get(key) ?? { orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += Number(order.total);
      map.set(key, entry);
    }
    return map;
  }, [orders.data]);

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" aria-hidden="true" /> Novo afiliado
          </CardTitle>
          <CardDescription>Cada afiliado recebe um link com código e UTM para medir a origem das vendas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="af-nome">Nome</Label>
            <Input id="af-nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="af-codigo">Código</Label>
            <Input id="af-codigo" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="joao" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="af-email">E-mail</Label>
            <Input id="af-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="af-comissao">Comissão (%)</Label>
            <div className="flex gap-2">
              <Input
                id="af-comissao"
                inputMode="decimal"
                value={form.commission}
                onChange={(event) => setForm({ ...form, commission: event.target.value })}
              />
              <Button onClick={() => create.mutate()} disabled={create.isPending} aria-label="Criar afiliado">
                <Plus className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Desempenho por afiliado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(affiliates.data ?? []).length === 0 ? (
            <p className="text-muted-foreground">Nenhum afiliado cadastrado.</p>
          ) : null}
          {(affiliates.data ?? []).map((affiliate) => {
            const stats = summary.get(affiliate.code) ?? { orders: 0, revenue: 0 };
            const link = affiliateLink(origin, slug, affiliate.code);
            return (
              <div key={affiliate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{affiliate.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.orders} pedido(s) · {formatCurrency(stats.revenue)} · comissão{" "}
                    {formatCurrency(affiliateCommission(stats.revenue, Number(affiliate.commission_percent)))}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(link);
                    toast.success("Link de afiliado copiado.");
                  }}
                >
                  <Link2 className="mr-1.5 size-3.5" aria-hidden="true" /> Copiar link
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Origem das vendas (UTM)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(orders.data ?? []).slice(0, 30).map((order) => (
            <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
              <span>{formatDateTime(order.created_at)}</span>
              <span className="text-muted-foreground">
                {order.affiliate_code} · {order.utm_source ?? "—"} / {order.utm_medium ?? "—"} / {order.utm_campaign ?? "—"}
              </span>
              <span className="font-medium text-foreground">{formatCurrency(Number(order.total))}</span>
            </div>
          ))}
          {(orders.data ?? []).length === 0 ? <p className="text-muted-foreground">Nenhuma venda com origem registrada.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ Order bump ------------------------------- */

function OffersTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ productId: "", title: "", description: "", discount: "10", kind: "bump" });

  const products = useQuery({
    queryKey: ["offer-products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("store_id", storeId)
        .is("archived_at", null)
        .eq("is_active", true)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const offers = useQuery({
    queryKey: ["checkout-offers", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkout_offers")
        .select("*, product:products!checkout_offers_product_id_fkey(name, price)")
        .eq("store_id", storeId)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.productId || !form.title.trim()) throw new Error("Escolha o produto e escreva a chamada.");
      const { error } = await supabase.from("checkout_offers").insert({
        store_id: storeId,
        product_id: form.productId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        discount_percent: Number(form.discount) || 0,
        kind: form.kind,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Oferta criada.");
      setForm({ productId: "", title: "", description: "", discount: "10", kind: "bump" });
      void queryClient.invalidateQueries({ queryKey: ["checkout-offers", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("checkout_offers").update({ is_active: input.is_active }).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["checkout-offers", storeId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Nova oferta no checkout</CardTitle>
          <CardDescription>Order bump aparece antes do pagamento; o upsell é ofertado após a escolha.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Produto ofertado</Label>
            <Select value={form.productId} onValueChange={(value) => setForm({ ...form, productId: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o produto" />
              </SelectTrigger>
              <SelectContent>
                {(products.data ?? []).map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} — {formatCurrency(Number(product.price))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.kind} onValueChange={(value) => setForm({ ...form, kind: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bump">Order bump (checkout)</SelectItem>
                <SelectItem value="upsell">Upsell (após escolher)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bump-titulo">Chamada</Label>
            <Input
              id="bump-titulo"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Leve também o pacote de bônus"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bump-desconto">Desconto (%)</Label>
            <Input
              id="bump-desconto"
              inputMode="decimal"
              value={form.discount}
              onChange={(event) => setForm({ ...form, discount: event.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bump-desc">Descrição</Label>
            <Textarea
              id="bump-desc"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={2}
            />
          </div>
          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Plus className="mr-2 size-4" aria-hidden="true" /> Criar oferta
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Ofertas ativas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(offers.data ?? []).length === 0 ? <p className="text-muted-foreground">Nenhuma oferta criada.</p> : null}
          {(offers.data ?? []).map((offer) => (
            <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{offer.title}</p>
                <p className="text-xs text-muted-foreground">
                  {offer.product?.name} · −{Number(offer.discount_percent)}% · {offer.impressions} exibições ·{" "}
                  {offer.conversions} aceites ({offerConversionRate(offer.impressions, offer.conversions)}%)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{offer.kind === "upsell" ? "Upsell" : "Order bump"}</Badge>
                <Switch
                  checked={offer.is_active}
                  onCheckedChange={(checked) => toggle.mutate({ id: offer.id, is_active: checked })}
                  aria-label="Ativar oferta"
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------- Fiscal -------------------------------- */

function FiscalTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ["fiscal-settings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("fiscal_settings").select("*").eq("store_id", storeId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const invoices = useQuery({
    queryKey: ["fiscal-invoices", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("id, number, amount, tax_amount, status, customer_name, issued_at, created_at, pdf_url")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [form, setForm] = useState<{ auto: boolean; cnpj: string; im: string; code: string; tax: string; description: string } | null>(null);
  const current = form ?? {
    auto: settings.data?.auto_issue ?? false,
    cnpj: settings.data?.cnpj ?? "",
    im: settings.data?.municipal_registration ?? "",
    code: settings.data?.service_code ?? "",
    tax: String(settings.data?.tax_percent ?? 0),
    description: settings.data?.default_description ?? "",
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fiscal_settings").upsert({
        store_id: storeId,
        auto_issue: current.auto,
        cnpj: current.cnpj || null,
        municipal_registration: current.im || null,
        service_code: current.code || null,
        tax_percent: Number(current.tax) || 0,
        default_description: current.description || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configuração fiscal salva.");
      void queryClient.invalidateQueries({ queryKey: ["fiscal-settings", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" aria-hidden="true" /> Nota fiscal de serviço
          </CardTitle>
          <CardDescription>
            Com a emissão automática ligada, cada venda paga e cada cobrança de assinatura gera a nota.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-border/70 p-3 text-sm sm:col-span-2">
            <Switch checked={current.auto} onCheckedChange={(checked) => setForm({ ...current, auto: checked })} />
            Emitir nota automaticamente
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-cnpj">CNPJ</Label>
            <Input id="fiscal-cnpj" value={current.cnpj} onChange={(event) => setForm({ ...current, cnpj: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-im">Inscrição municipal</Label>
            <Input id="fiscal-im" value={current.im} onChange={(event) => setForm({ ...current, im: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-cod">Código do serviço</Label>
            <Input id="fiscal-cod" value={current.code} onChange={(event) => setForm({ ...current, code: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-iss">ISS (%)</Label>
            <Input id="fiscal-iss" inputMode="decimal" value={current.tax} onChange={(event) => setForm({ ...current, tax: event.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fiscal-desc">Descrição padrão</Label>
            <Textarea
              id="fiscal-desc"
              rows={2}
              value={current.description}
              onChange={(event) => setForm({ ...current, description: event.target.value })}
            />
          </div>
          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Notas emitidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(invoices.data ?? []).length === 0 ? <p className="text-muted-foreground">Nenhuma nota registrada.</p> : null}
          {(invoices.data ?? []).map((invoice) => (
            <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
              <span>{invoice.number ?? "Sem número"}</span>
              <span className="text-muted-foreground">{invoice.customer_name ?? "—"}</span>
              <span className="font-medium text-foreground">{formatCurrency(Number(invoice.amount))}</span>
              <Badge variant={invoice.status === "issued" ? "secondary" : "outline"}>
                {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------- Reembolsos ------------------------------ */

function RefundsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const refundFn = useServerFn(registerStoreRefund);
  const [form, setForm] = useState({
    kind: "refund" as "refund" | "cancellation" | "chargeback",
    method: "money" as "money" | "credit",
    orderId: "",
    subscriptionId: "",
    amount: "",
    reason: "",
  });

  const orders = useQuery({
    queryKey: ["refundable-orders", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, code, customer_name, total, payment_status")
        .eq("store_id", storeId)
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const subscriptions = useQuery({
    queryKey: ["refundable-subscriptions", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_subscriptions")
        .select("id, customer_name, amount, status")
        .eq("store_id", storeId)
        .neq("status", "canceled")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const refunds = useQuery({
    queryKey: ["refunds", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refunds")
        .select("id, kind, method, amount, reason, customer_name, commission_reversed, revoked_access, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount.replace(",", "."));
      if (!amount || amount <= 0) throw new Error("Informe o valor do estorno.");
      if (!form.orderId && !form.subscriptionId) throw new Error("Escolha o pedido ou a assinatura.");
      return refundFn({
        data: {
          storeId,
          kind: form.kind,
          method: form.method,
          amount,
          ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
          ...(form.orderId ? { orderId: form.orderId } : {}),
          ...(form.subscriptionId ? { subscriptionId: form.subscriptionId } : {}),
        },
      });
    },
    onSuccess: (result) => {
      toast.success(
        result.revokedAccess ? "Estorno registrado e acesso digital revogado." : "Estorno registrado.",
      );
      setForm({ ...form, amount: "", reason: "", orderId: "", subscriptionId: "" });
      void queryClient.invalidateQueries({ queryKey: ["refunds", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["digital-deliveries", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["customer-subscriptions", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const total = (refunds.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const reversed = (refunds.data ?? []).reduce((sum, row) => sum + Number(row.commission_reversed), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Valor estornado" value={formatCurrency(total)} hint="Últimos 100 registros" />
        <StatCard label="Comissões estornadas" value={formatCurrency(reversed)} hint="Descontadas dos afiliados" />
        <StatCard label="Registros" value={String((refunds.data ?? []).length)} hint="Reembolsos e chargebacks" />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Undo2 className="size-4 text-primary" aria-hidden="true" /> Novo estorno
          </CardTitle>
          <CardDescription>
            O sistema baixa o pedido, gera crédito quando escolhido, cancela a nota, estorna a comissão e revoga o
            acesso digital em devoluções totais e chargebacks.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.kind} onValueChange={(value) => setForm({ ...form, kind: value as typeof form.kind })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refund">Reembolso</SelectItem>
                <SelectItem value="cancellation">Cancelamento de assinatura</SelectItem>
                <SelectItem value="chargeback">Chargeback</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <Select value={form.method} onValueChange={(value) => setForm({ ...form, method: value as typeof form.method })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="money">Devolução em dinheiro</SelectItem>
                <SelectItem value="credit">Crédito na loja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pedido</Label>
            <Select
              value={form.orderId}
              onValueChange={(value) => setForm({ ...form, orderId: value, subscriptionId: "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o pedido" />
              </SelectTrigger>
              <SelectContent>
                {(orders.data ?? []).map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    #{order.code} · {order.customer_name} · {formatCurrency(Number(order.total))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ou assinatura</Label>
            <Select
              value={form.subscriptionId}
              onValueChange={(value) => setForm({ ...form, subscriptionId: value, orderId: "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a assinatura" />
              </SelectTrigger>
              <SelectContent>
                {(subscriptions.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.customer_name} · {formatCurrency(Number(item.amount))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-valor">Valor</Label>
            <Input
              id="ref-valor"
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-motivo">Motivo</Label>
            <Input
              id="ref-motivo"
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
          </div>
          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Registrando..." : "Registrar estorno"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(refunds.data ?? []).length === 0 ? <p className="text-muted-foreground">Nenhum estorno registrado.</p> : null}
          {(refunds.data ?? []).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
              <span>{formatDateTime(row.created_at)}</span>
              <span className="text-muted-foreground">
                {row.customer_name ?? "Cliente"} · {REFUND_METHOD_LABEL[row.method] ?? row.method}
                {row.revoked_access ? " · acesso revogado" : ""}
              </span>
              <span className="font-medium text-foreground">{formatCurrency(Number(row.amount))}</span>
              <Badge variant="outline">{REFUND_KIND_LABEL[row.kind as keyof typeof REFUND_KIND_LABEL] ?? row.kind}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------- Funil do checkout --------------------------- */

function FunnelTab({ storeId }: { storeId: string }) {
  const [days, setDays] = useState("30");

  const since = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - (Number(days) || 30));
    return date.toISOString();
  }, [days]);

  const events = useQuery({
    queryKey: ["checkout-events", storeId, since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkout_events")
        .select("kind, amount, affiliate_code, utm_source, utm_campaign, coupon_code")
        .eq("store_id", storeId)
        .gte("created_at", since)
        .limit(5000);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const subscriptions = useQuery({
    queryKey: ["funnel-subscriptions", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_subscriptions")
        .select("amount, period, status")
        .eq("store_id", storeId)
        .eq("status", "active");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rows = buildFunnel(events.data ?? []);
  const totals = rows.reduce(
    (acc, row) => ({
      visits: acc.visits + row.visits,
      purchases: acc.purchases + row.purchases,
      revenue: acc.revenue + row.revenue,
      bumpAccepts: acc.bumpAccepts + row.bumpAccepts,
      coupons: acc.coupons + row.coupons,
    }),
    { visits: 0, purchases: 0, revenue: 0, bumpAccepts: 0, coupons: 0 },
  );
  const mrr = (subscriptions.data ?? []).reduce(
    (sum, row) => sum + monthlyEquivalent(Number(row.amount), row.period),
    0,
  );
  const conversion = totals.visits > 0 ? Math.round((totals.purchases / totals.visits) * 1000) / 10 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Visitas ao checkout" value={String(totals.visits)} hint={`Últimos ${days} dias`} />
        <StatCard label="Conversão" value={`${conversion}%`} hint={`${totals.purchases} pedido(s)`} />
        <StatCard label="Receita" value={formatCurrency(totals.revenue)} hint={`${totals.bumpAccepts} order bump(s)`} />
        <StatCard label="MRR" value={formatCurrency(mrr)} hint="Assinaturas ativas" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32 space-y-1.5">
          <Label htmlFor="funil-dias">Período (dias)</Label>
          <Input id="funil-dias" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv(
              "funil-checkout",
              rows.map((row) => ({
                Origem: row.origin,
                Visitas: row.visits,
                "Order bump exibido": row.bumpViews,
                "Order bump aceito": row.bumpAccepts,
                Cupons: row.coupons,
                Pedidos: row.purchases,
                "Conversão (%)": row.conversion,
                "Ticket médio": row.ticket.toFixed(2),
                Receita: row.revenue.toFixed(2),
              })),
            )
          }
        >
          Exportar CSV
        </Button>
        <Button variant="outline" onClick={() => printReport()}>
          Exportar PDF
        </Button>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Funil por origem</CardTitle>
          <CardDescription>Cliques no checkout, order bump, cupons, conversão e receita por afiliado/UTM.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Origem</th>
                <th className="py-2">Visitas</th>
                <th className="py-2">Bump</th>
                <th className="py-2">Cupons</th>
                <th className="py-2">Pedidos</th>
                <th className="py-2">Conversão</th>
                <th className="py-2">Ticket</th>
                <th className="py-2">Receita</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-muted-foreground">
                    Ainda não há visitas registradas no período.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.origin} className="border-t border-border/60">
                  <td className="py-2 font-medium text-foreground">{row.origin}</td>
                  <td className="py-2">{row.visits}</td>
                  <td className="py-2">
                    {row.bumpAccepts}/{row.bumpViews} ({row.bumpRate}%)
                  </td>
                  <td className="py-2">{row.coupons}</td>
                  <td className="py-2">{row.purchases}</td>
                  <td className="py-2">{row.conversion}%</td>
                  <td className="py-2">{formatCurrency(row.ticket)}</td>
                  <td className="py-2 font-medium text-foreground">{formatCurrency(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------- Mensagens ------------------------------- */

function MessagesTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [event, setEvent] = useState<DigitalMessageEvent>("entrega_digital");
  const [channel, setChannel] = useState<DigitalChannel>("email");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);

  const templates = useQuery({
    queryKey: ["digital-templates", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("id, key, title, body, is_active")
        .eq("store_id", storeId)
        .like("key", "digital:%");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const key = templateKey(event, channel);
  const saved = (templates.data ?? []).find((row) => row.key === key);
  const fallback = defaultTemplate(event, channel);
  const current = draft ?? {
    subject: saved?.title ?? fallback.subject,
    body: saved?.body ?? fallback.body,
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("message_templates").upsert(
        {
          store_id: storeId,
          key,
          channel,
          title: current.subject || DIGITAL_EVENT_LABEL[event],
          body: current.body,
          is_active: true,
        },
        { onConflict: "store_id,key,channel" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Modelo salvo.");
      void queryClient.invalidateQueries({ queryKey: ["digital-templates", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const preview = {
    subject: renderDigitalTemplate(current.subject, PREVIEW_VARS),
    body: renderDigitalTemplate(current.body, PREVIEW_VARS),
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4 text-primary" aria-hidden="true" /> Modelos de mensagem
          </CardTitle>
          <CardDescription>
            Use as variáveis entre chaves duplas. Elas são trocadas automaticamente no envio por e-mail e WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Momento</Label>
                <Select
                  value={event}
                  onValueChange={(value) => {
                    setEvent(value as DigitalMessageEvent);
                    setDraft(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DIGITAL_EVENT_LABEL) as DigitalMessageEvent[]).map((item) => (
                      <SelectItem key={item} value={item}>
                        {DIGITAL_EVENT_LABEL[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select
                  value={channel}
                  onValueChange={(value) => {
                    setChannel(value as DigitalChannel);
                    setDraft(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {channel === "email" ? (
              <div className="space-y-1.5">
                <Label htmlFor="tpl-assunto">Assunto</Label>
                <Input
                  id="tpl-assunto"
                  value={current.subject}
                  onChange={(input) => setDraft({ ...current, subject: input.target.value })}
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="tpl-corpo">Mensagem</Label>
              <Textarea
                id="tpl-corpo"
                rows={10}
                value={current.body}
                onChange={(input) => setDraft({ ...current, body: input.target.value })}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DIGITAL_VARIABLES.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  title={variable.description}
                  onClick={() => setDraft({ ...current, body: `${current.body}{{${variable.key}}}` })}
                  className="rounded-lg border border-border/70 px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  {`{{${variable.key}}}`}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Salvando..." : "Salvar modelo"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft({ subject: fallback.subject, body: fallback.body })}>
                Restaurar padrão
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pré-visualização</Label>
            <div className="rounded-2xl border border-border/70 bg-card p-4 text-sm">
              {channel === "email" ? (
                <p className="mb-2 font-semibold text-foreground">{preview.subject || "(sem assunto)"}</p>
              ) : (
                <p className="mb-2 text-xs uppercase text-muted-foreground">Mensagem de WhatsApp</p>
              )}
              <p className="whitespace-pre-wrap text-muted-foreground">{preview.body || "(vazio)"}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Exemplo com dados fictícios. No envio real, as variáveis usam o comprador, o produto e o link de entrega.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

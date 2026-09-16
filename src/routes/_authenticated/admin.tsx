import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Blocks, Building2, CreditCard, FileText, Headphones, LayoutDashboard, MessageCircle, Palette, ReceiptText, ScrollText, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";


import { PlanBillingTab } from "@/components/admin/PlanBillingTab";
import { AdminHealthTab } from "@/components/admin/AdminHealthTab";
import { AdminPrivacyTab } from "@/components/admin/AdminPrivacyTab";
import { PlatformBrandingTab } from "@/components/admin/PlatformBrandingTab";
import { DemoBadge } from "@/components/brand/DemoBadge";
import { Logo } from "@/components/brand/Logo";
import { EvolutionAdminPanel } from "@/components/painel/EvolutionAdminPanel";
import { EmptyState, StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { INTEGRATIONS, PROVIDER_LABEL } from "@/lib/integrations";
import { generatePlanHighlights } from "@/lib/plan-highlights.functions";

import {
  FEATURE_CONTROLS,
  FEATURE_KEYS,
  LIMIT_KEYS,
  PLAN_ESSENTIAL_MODULES,
  PLAN_MODULE_GROUPS,
  PLAN_MODULE_KEYS,
  PLAN_MODULE_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  parsePlanNumber,
  slugifyPlanKey,
  validatePlanForm,
  validatePlanModules,
  normalizePlanModules,
  planModules,
  type PlanFormErrors,
  type PlanModuleKey,
  type PlanRow,
} from "@/lib/plans";
import {
  listPlatformIntegrations,
  savePlatformIntegration,
  testPlatformIntegration,
  togglePlatformIntegration,
} from "@/lib/platform-integracoes.functions";
import { INTEGRATION_STATUS_TONE, PLATFORM_STATUS_LABEL, providerFields } from "@/lib/platform-integrations";
import type { PlatformIntegrationView } from "@/lib/platform-integrations.server";
import { storeRuntimeUrl } from "@/lib/store-url";
import {
  adminCreateStore,
  adminDeleteStore,
  adminEditStore,
  adminListContent,
  adminListIncidents,
  adminListSupportTickets,
  adminListAuditLogs,
  adminMutateContent,
  adminSaveIncident,
  adminUpdateSupportTicket,
  adminUpdateStore,
  endSupportAccess,
  getPlatformOverview,
  listPlatformUsers,
  setPlatformRole,
  startSupportAccess,
} from "@/lib/superadmin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: SuperAdminPage,
  head: () => ({
    meta: [
      { title: "Administração da plataforma | Pedi Um" },
      { name: "description", content: "Painel superadministrativo: lojas, usuários, planos, conteúdo, logs e suporte." },
      { property: "og:title", content: "Administração da plataforma | Pedi Um" },
      { property: "og:description", content: "Gestão administrativa da plataforma Pedi Um." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SuperAdminPage() {
  const roleQuery = useQuery({
    queryKey: ["is-super-admin"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });

  if (roleQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (!roleQuery.data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-foreground">Acesso restrito</h1>
        <p className="mt-2 text-muted-foreground">Esta área é exclusiva para super administradores da plataforma.</p>
        <Link to="/painel" className="mt-6 inline-block text-primary underline-offset-4 hover:underline">
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-secondary/30">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <div className="min-w-0 text-right">
            <h1 className="truncate text-base font-semibold text-foreground">Central da plataforma</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Operação, receita, saúde e governança da Pedi Um</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <Tabs defaultValue="overview" className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 overflow-visible bg-card p-2 shadow-sm sm:grid-cols-4 lg:sticky lg:top-24 lg:grid-cols-1">
              <AdminNavLabel label="Operação" />
              <AdminTab value="overview" icon={LayoutDashboard} label="Visão geral" />
              <AdminTab value="stores" icon={Building2} label="Lojas" />
              <AdminTab value="users" icon={Users} label="Usuários" />
              <AdminTab value="support" icon={Headphones} label="Suporte" />
              <AdminNavLabel label="Comercial" />
              <AdminTab value="plans" icon={ReceiptText} label="Planos" />
              <AdminTab value="billing" icon={CreditCard} label="Cobrança" />
              <AdminNavLabel label="Plataforma" />
              <AdminTab value="health" icon={Activity} label="Saúde" />
              <AdminTab value="integrations" icon={Blocks} label="Integrações" />
              <AdminTab value="evolution" icon={MessageCircle} label="WhatsApp" />
              <AdminTab value="content" icon={FileText} label="Conteúdo" />
              <AdminTab value="branding" icon={Palette} label="Identidade visual" />
              <AdminNavLabel label="Governança" />
              <AdminTab value="privacy" icon={ShieldCheck} label="Privacidade" />
              <AdminTab value="logs" icon={ScrollText} label="Auditoria" />
            </TabsList>
          </aside>

          <div className="min-w-0">

          <TabsContent value="overview" className="mt-6">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="stores" className="mt-6">
            <StoresTab />
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="plans" className="mt-6">
            <PlansTab />
          </TabsContent>
          <TabsContent value="billing" className="mt-6">
            <PlanBillingTab />
          </TabsContent>
          <TabsContent value="health" className="mt-6">
            <AdminSectionHeader title="Saúde da plataforma" description="Acompanhe falhas e conexões dos serviços usados pelas lojas." />
            <AdminHealthTab />
          </TabsContent>
          <TabsContent value="content" className="mt-6">
            <ContentTab />
          </TabsContent>
          <TabsContent value="branding" className="mt-6">
            <PlatformBrandingTab />
          </TabsContent>
          <TabsContent value="support" className="mt-6">
            <SupportTab />
          </TabsContent>
          <TabsContent value="privacy" className="mt-6">
            <AdminPrivacyTab />
          </TabsContent>
          <TabsContent value="logs" className="mt-6">
            <LogsTab />
          </TabsContent>
          <TabsContent value="integrations" className="mt-6">
            <IntegrationsTab />
          </TabsContent>
          <TabsContent value="evolution" className="mt-6">
            <EvolutionAdminPanel />
          </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}

function AdminTab({ value, icon: Icon, label }: { value: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <TabsTrigger value={value} className="min-w-0 justify-start gap-2 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </TabsTrigger>
  );
}

function AdminNavLabel({ label }: { label: string }) {
  return <p className="col-span-2 hidden px-3 pb-1 pt-3 text-[11px] font-semibold uppercase text-muted-foreground sm:col-span-1 lg:block">{label}</p>;
}

function AdminSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/* ---------------- Visão geral ---------------- */

function OverviewTab() {
  const overviewFn = useServerFn(getPlatformOverview);
  const { data, isLoading } = useQuery({ queryKey: ["platform-overview"], queryFn: () => overviewFn({}) });

  if (isLoading || !data) return <Skeleton className="h-52 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <AdminSectionHeader title="Visão geral" description="Indicadores comerciais e operacionais atualizados da plataforma." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lojas" value={String(data.stores)} hint={`${data.activeStores} ativas · ${data.publishedStores} publicadas`} />
        <StatCard label="Usuários" value={String(data.users)} />
        <StatCard label="Pedidos" value={String(data.orders)} hint={`${data.ordersMonth} neste mês`} />
        <StatCard label="Receita das lojas" value={formatCurrency(data.revenue)} hint={`${formatCurrency(data.revenueMonth)} no mês`} />
        <StatCard label="MRR das assinaturas" value={formatCurrency(data.mrr)} />
        <StatCard label="Ativação" value={`${data.activationRate}%`} hint="Lojas publicadas" />
        <StatCard label="Churn" value={`${data.churnRate}%`} hint="Assinaturas canceladas/expiradas" />
        <StatCard label="Suporte" value={String(data.openTickets)} hint={`${data.openIncidents} incidentes abertos`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AttentionCard label="Cobranças vencidas" value={data.overdueInvoices} tone="financial" />
        <AttentionCard label="Solicitações LGPD" value={data.pendingPrivacyRequests} tone="privacy" />
        <AttentionCard label="Falhas operacionais" value={data.failedPayments + data.fiscalErrors + data.failedWebhooks + data.failedMessages} tone="risk" />
        <AttentionCard label="Lojas sem assinatura" value={data.storesWithoutSubscription} tone="subscription" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Assinaturas por situação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.entries(data.subscriptionsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {SUBSCRIPTION_STATUS_LABEL[status as keyof typeof SUBSCRIPTION_STATUS_LABEL] ?? status}
                </span>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Distribuição por plano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.planDistribution.map((item) => (
              <div key={item.plan} className="flex items-center justify-between">
                <span className="text-muted-foreground">{item.plan}</span>
                <span className="font-medium text-foreground">{item.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AttentionCard({ label, value, tone }: { label: string; value: number; tone: "financial" | "privacy" | "risk" | "subscription" }) {
  const icon = tone === "financial" ? CreditCard : tone === "privacy" ? ShieldCheck : tone === "risk" ? Activity : Building2;
  const Icon = icon;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-card p-4">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 text-sm font-medium text-foreground">{label}</span>
      <Badge variant={value > 0 ? "destructive" : "secondary"}>{value}</Badge>
    </div>
  );
}

/* ---------------- Lojas ---------------- */

function StoresTab() {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(adminUpdateStore);
  const deleteFn = useServerFn(adminDeleteStore);
  const supportFn = useServerFn(startSupportAccess);
  const createFn = useServerFn(adminCreateStore);
  const editFn = useServerFn(adminEditStore);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [supportStore, setSupportStore] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [consent, setConsent] = useState("");

  const storesQuery = useQuery({
    queryKey: ["admin-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, slug, is_active, is_demo, is_published, created_at, address_city, address_state")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const subsQuery = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_subscriptions")
        .select("store_id, status, plan_id, plan:plans(name)");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as PlanRow[];
    },
  });

  const mutate = useMutation({
    mutationFn: (input: { storeId: string; isActive?: boolean; planId?: string; status?: "trialing" | "active" | "past_due" | "canceled" | "expired" }) =>
      updateFn({ data: input }),
    onSuccess: () => {
      toast.success("Loja atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (storeId: string) => deleteFn({ data: { storeId } }),
    onSuccess: () => {
      toast.success("Loja removida.");
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const create = useMutation({
    mutationFn: (input: { name: string; slug: string; segment: string; checkoutType?: "agendamento" | "loja" }) =>
      createFn({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const edit = useMutation({
    mutationFn: (input: {
      storeId: string;
      name?: string;
      slug?: string;
      segment?: string;
      checkoutType?: "agendamento" | "loja";
    }) => editFn({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const support = useMutation({
    mutationFn: () => supportFn({ data: { storeId: supportStore!, reason, consentReference: consent, minutes: 30 } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setSupportStore(null);
      setReason("");
      setConsent("");
      void queryClient.invalidateQueries({ queryKey: ["support-sessions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const subs = new Map((subsQuery.data ?? []).map((row) => [row.store_id, row]));
  const stores = (storesQuery.data ?? []).filter((store) =>
    search ? `${store.name} ${store.slug}`.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Lojas ({stores.length})</CardTitle>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome ou endereço"
          className="max-w-64"
        />
      </CardHeader>
      <CardContent>
        <StoreCreateForm pending={create.isPending} onSubmit={(values) => create.mutate(values)} />
        {storesQuery.isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : stores.length === 0 ? (
          <EmptyState title="Nenhuma loja encontrada" />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {stores.map((store) => {
              const sub = subs.get(store.id) as
                | { status: string; plan_id: string; plan: { name: string } | null }
                | undefined;
              return (
                <li key={store.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{store.name}</span>
                      {store.is_demo ? <DemoBadge /> : null}
                      <span className="text-muted-foreground">/{store.slug}</span>
                      {sub ? (
                        <Badge variant="secondary">
                          {sub.plan?.name} · {SUBSCRIPTION_STATUS_LABEL[sub.status as never] ?? sub.status}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={sub?.plan_id ?? ""}
                        onValueChange={(planId) => mutate.mutate({ storeId: store.id, planId })}
                      >
                        <SelectTrigger className="h-9 w-36">
                          <SelectValue placeholder="Plano" />
                        </SelectTrigger>
                        <SelectContent>
                          {(plansQuery.data ?? []).map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={sub?.status ?? ""}
                        onValueChange={(status) => mutate.mutate({ storeId: store.id, status: status as never })}
                      >
                        <SelectTrigger className="h-9 w-40">
                          <SelectValue placeholder="Situação" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SUBSCRIPTION_STATUS_LABEL).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={store.is_active}
                          onCheckedChange={(checked) => mutate.mutate({ storeId: store.id, isActive: checked })}
                          aria-label="Loja ativa"
                        />
                        <span className="text-xs text-muted-foreground">{store.is_active ? "ativa" : "inativa"}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSupportStore(supportStore === store.id ? null : store.id)}
                      >
                        Acesso de suporte
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(editing === store.id ? null : store.id)}
                      >
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(store.id)}>
                        Excluir
                      </Button>
                    </div>
                  </div>

                  <StoreCheckoutLink slug={store.slug} />

                  {editing === store.id ? (
                    <StoreEditForm
                      store={store}
                      pending={edit.isPending}
                      onSubmit={(values) => edit.mutate({ storeId: store.id, ...values })}
                    />
                  ) : null}

                  {supportStore === store.id ? (
                    <form
                      className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
                      onSubmit={(event: FormEvent) => {
                        event.preventDefault();
                        support.mutate();
                      }}
                    >
                      <Input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Motivo do acesso (mín. 10 caracteres)"
                        required
                      />
                      <Input
                        value={consent}
                        onChange={(event) => setConsent(event.target.value)}
                        placeholder="Referência do consentimento (ticket, e-mail)"
                        required
                      />
                      <Button type="submit" size="sm" disabled={support.isPending}>
                        Registrar 30 min
                      </Button>
                      <p className="text-xs text-muted-foreground sm:col-span-3">
                        O acesso é temporário, auditado e visível também para a equipe da loja.
                      </p>
                    </form>
                  ) : null}

                  <p className="text-xs text-muted-foreground">
                    {store.address_city ?? "—"}
                    {store.address_state ? `/${store.address_state}` : ""} · criada em {formatDate(store.created_at)} ·{" "}
                    {store.is_published ? "publicada" : "não publicada"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Usuários ---------------- */

function UsersTab() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPlatformUsers);
  const roleFn = useServerFn(setPlatformRole);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["platform-users", search],
    queryFn: () => listFn({ data: { search } }),
  });

  const toggleRole = useMutation({
    mutationFn: (input: { userId: string; grant: boolean }) =>
      roleFn({ data: { userId: input.userId, role: "super_admin", grant: input.grant } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["platform-users"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Usuários</CardTitle>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por e-mail ou nome"
          className="max-w-64"
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(data ?? []).map((user) => {
              const isSuper = user.roles.includes("super_admin");
              return (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-foreground">{user.fullName ?? user.email ?? "Usuário"}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email} · {user.stores} loja(s) ·{" "}
                      {user.lastSignInAt ? `último acesso ${formatDate(user.lastSignInAt)}` : "nunca acessou"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSuper ? <Badge>Super admin</Badge> : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleRole.mutate({ userId: user.id, grant: !isSuper })}
                    >
                      {isSuper ? "Remover acesso" : "Tornar super admin"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Planos ---------------- */

/** Estado compartilhado entre criação e edição de plano. */
interface PlanDraft {
  name: string;
  key: string;
  tagline: string;
  priceMonth: string;
  priceYear: string;
  trialDays: string;
  sortOrder: string;
  isActive: boolean;
  isHighlighted: boolean;
  limits: Record<string, string>;
  features: Record<string, string>;
  modules: PlanModuleKey[];
  highlights: string;
}

/**
 * Campo de destaques do plano com geração assistida por IA.
 * A IA recebe o que já foi marcado no formulário (limites, recursos e
 * módulos) e devolve de 4 a 6 frases curtas, uma por linha.
 */
function PlanHighlightsField({
  draft,
  update,
  rows,
}: {
  draft: PlanDraft;
  update: (patch: Partial<PlanDraft>) => void;
  rows: number;
}) {
  const generate = useServerFn(generatePlanHighlights);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const result = await generate({
        data: {
          name: draft.name,
          tagline: draft.tagline,
          priceMonth: draft.priceMonth,
          // Envia rótulos legíveis para a IA escrever com as palavras do painel.
          limits: Object.fromEntries(
            LIMIT_KEYS.map((item) => [item.label, draft.limits[item.key] ?? "0"]),
          ),
          features: Object.fromEntries(
            FEATURE_KEYS.map((item) => [item.label, draft.features[item.key] ?? "false"]),
          ),
          moduleLabels: normalizePlanModules(draft.modules).map((key) => PLAN_MODULE_LABEL[key]),

        },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      update({ highlights: result.highlights.join("\n") });
      // A geração só preenche o campo: sem salvar, nada muda na homepage/planos.
      toast.success(`${result.message} Clique em "Salvar plano" para publicar.`);
    } catch {
      toast.error("Não foi possível gerar os destaques agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>Destaques (um por linha)</Label>
        <Button type="button" size="sm" variant="outline" onClick={handleGenerate} disabled={loading}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {loading ? "Gerando…" : "Gerar com IA"}
        </Button>
      </div>
      <Textarea
        rows={rows}
        value={draft.highlights}
        onChange={(event) => update({ highlights: event.target.value })}
      />
      <p className="text-xs text-muted-foreground">
        A IA usa os limites, recursos e módulos marcados acima e cria uma linha por funcionalidade
        liberada. Depois de gerar ou editar, clique em "Salvar plano" para aparecer na homepage e em /planos.
      </p>
    </div>
  );
}



function emptyLimits(): Record<string, string> {
  return Object.fromEntries(LIMIT_KEYS.map((item) => [item.key, "0"]));
}

function defaultFeatures(): Record<string, string> {
  return Object.fromEntries(
    FEATURE_KEYS.map((item) => {
      const control = FEATURE_CONTROLS[item.key];
      return [item.key, control.kind === "toggle" ? "false" : (control.options[0]?.value ?? "false")];
    }),
  );
}

function draftFromPlan(plan: PlanRow): PlanDraft {
  const limitSource = (plan.limits ?? {}) as Record<string, unknown>;
  const featureSource = (plan.features ?? {}) as Record<string, unknown>;
  return {
    name: plan.name,
    key: plan.key,
    tagline: plan.tagline ?? "",
    priceMonth: String(plan.price_month ?? 0),
    priceYear: String(plan.price_year ?? 0),
    trialDays: String(plan.trial_days ?? 0),
    sortOrder: String(plan.sort_order ?? 0),
    isActive: plan.is_active,
    isHighlighted: plan.is_highlighted,
    limits: Object.fromEntries(LIMIT_KEYS.map((item) => [item.key, String(limitSource[item.key] ?? 0)])),
    features: Object.fromEntries(
      FEATURE_KEYS.map((item) => {
        const raw = featureSource[item.key];
        if (typeof raw === "boolean") return [item.key, raw ? "true" : "false"];
        if (typeof raw === "string") return [item.key, raw];
        const control = FEATURE_CONTROLS[item.key];
        return [item.key, control.kind === "toggle" ? "false" : (control.options[0]?.value ?? "false")];
      }),
    ),
    modules: planModules(plan),
    highlights: plan.highlights.join("\n"),
  };
}

/** Erros de limites: aceita -1 (ilimitado) ou inteiros >= 0. */
function limitErrors(limits: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of LIMIT_KEYS) {
    const raw = (limits[item.key] ?? "").trim();
    const parsed = Number(raw);
    if (!raw || !Number.isInteger(parsed) || parsed < -1) errors[item.key] = "Use -1 ou um inteiro ≥ 0.";
  }
  return errors;
}

function payloadFromDraft(draft: PlanDraft): Record<string, unknown> {
  return {
    key: slugifyPlanKey(draft.key || draft.name),
    name: draft.name.trim(),
    tagline: draft.tagline.trim() || null,
    price_month: parsePlanNumber(draft.priceMonth),
    price_year: parsePlanNumber(draft.priceYear),
    trial_days: parsePlanNumber(draft.trialDays),
    sort_order: parsePlanNumber(draft.sortOrder),
    is_active: draft.isActive,
    is_highlighted: draft.isHighlighted,
    limits: Object.fromEntries(LIMIT_KEYS.map((item) => [item.key, Number(draft.limits[item.key] ?? 0)])),
    features: {
      ...Object.fromEntries(
        FEATURE_KEYS.map((item) => {
          const value = draft.features[item.key] ?? "false";
          if (value === "true") return [item.key, true];
          if (value === "false") return [item.key, false];
          return [item.key, value];
        }),
      ),
      modules: normalizePlanModules(draft.modules),
    },
    highlights: draft.highlights
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

function PlansTab() {
  const queryClient = useQueryClient();
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as PlanRow[];
    },
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["admin-plans-all"] });
    void queryClient.invalidateQueries({ queryKey: ["plans"] });
    void queryClient.invalidateQueries({ queryKey: ["public-plans"] });
  }

  const save = useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("plans").update(input.patch as never).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Plano atualizado.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const create = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { error } = await supabase.from("plans").insert(input as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Plano criado e publicado na página inicial.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Plano removido.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-52 rounded-2xl" />;

  const keys = plans.map((plan) => plan.key);

  return (
    <div className="space-y-4">
      <NewPlanCard
        nextSortOrder={(plans.at(-1)?.sort_order ?? 0) + 1}
        existingKeys={keys}
        pending={create.isPending}
        onCreate={(payload) => create.mutate(payload)}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => (
          <PlanEditor
            key={plan.id}
            plan={plan}
            existingKeys={keys.filter((item) => item !== plan.key)}
            pending={save.isPending}
            onSave={(patch) => save.mutate({ id: plan.id, patch })}
            onDelete={() => remove.mutate(plan.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Campos de limites e recursos reutilizados na criação e na edição. */
function PlanCapabilityFields({
  draft,
  errors,
  update,
}: {
  draft: PlanDraft;
  errors: Record<string, string>;
  update: (patch: Partial<PlanDraft>) => void;
}) {
  return (
    <>
      <fieldset className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Quantidades incluídas (-1 = ilimitado, 0 = não incluso)
        </legend>
        {LIMIT_KEYS.map((item) => (
          <div key={item.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">{item.label}</Label>
              <Input
                className="h-8 w-24"
                inputMode="numeric"
                aria-invalid={Boolean(errors[item.key])}
                value={draft.limits[item.key] ?? "0"}
                onChange={(event) => update({ limits: { ...draft.limits, [item.key]: event.target.value } })}
              />
            </div>
            {errors[item.key] ? <p className="text-xs text-destructive">{errors[item.key]}</p> : null}
          </div>
        ))}
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Funcionalidades liberadas</legend>
        {FEATURE_KEYS.map((item) => {
          const control = FEATURE_CONTROLS[item.key];
          const value = draft.features[item.key] ?? "false";
          return (
            <div key={item.key} className="flex items-center justify-between gap-2">
              <Label className="text-xs">{item.label}</Label>
              {control.kind === "toggle" ? (
                <Switch
                  checked={value === "true"}
                  aria-label={item.label}
                  onCheckedChange={(checked) =>
                    update({ features: { ...draft.features, [item.key]: checked ? "true" : "false" } })
                  }
                />
              ) : (
                <Select
                  value={value}
                  onValueChange={(next) => update({ features: { ...draft.features, [item.key]: next } })}
                >
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {control.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </fieldset>

      <PlanModulesFields draft={draft} update={update} />
    </>
  );
}

/**
 * Seleção módulo por módulo do painel. Módulos essenciais ficam sempre
 * liberados (não podem ser desmarcados) para não travar a conta do lojista.
 */
function PlanModulesFields({
  draft,
  update,
}: {
  draft: PlanDraft;
  update: (patch: Partial<PlanDraft>) => void;
}) {
  const selected = new Set(draft.modules);
  const essential = new Set<PlanModuleKey>(PLAN_ESSENTIAL_MODULES);

  function setModules(next: PlanModuleKey[]) {
    update({ modules: normalizePlanModules(next) });
  }

  function toggle(key: PlanModuleKey, checked: boolean) {
    if (essential.has(key)) return;
    setModules(checked ? [...draft.modules, key] : draft.modules.filter((item) => item !== key));
  }

  const allSelected = PLAN_MODULE_KEYS.every((key) => selected.has(key));

  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        Módulos do painel liberados neste plano
      </legend>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {selected.size} de {PLAN_MODULE_KEYS.length} módulos liberados
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setModules(allSelected ? [] : [...PLAN_MODULE_KEYS])}
          >
            {allSelected ? "Limpar seleção" : "Selecionar tudo"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PLAN_MODULE_GROUPS.map((group) => {
          const groupAll = group.keys.every((key) => selected.has(key));
          return (
            <div key={group.title} className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{group.title}</span>
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                  onClick={() =>
                    setModules(
                      groupAll
                        ? draft.modules.filter((item) => !group.keys.includes(item))
                        : [...draft.modules, ...group.keys],
                    )
                  }
                >
                  {groupAll ? "Desmarcar" : "Marcar todos"}
                </button>
              </div>
              <div className="space-y-2">
                {group.keys.map((key) => {
                  const locked = essential.has(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-2 text-xs text-foreground"
                    >
                      <span className={locked ? "text-muted-foreground" : undefined}>
                        {PLAN_MODULE_LABEL[key]}
                        {locked ? " (sempre incluso)" : ""}
                      </span>
                      <Checkbox
                        checked={selected.has(key)}
                        disabled={locked}
                        aria-label={PLAN_MODULE_LABEL[key]}
                        onCheckedChange={(checked) => toggle(key, checked === true)}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <PlanModulesPreview draft={draft} />
    </fieldset>
  );
}

/**
 * Prévia do plano: mostra o que o lojista verá no painel e o que aparece
 * na homepage, para conferir a seleção antes de salvar.
 */
function PlanModulesPreview({ draft }: { draft: PlanDraft }) {
  const selected = normalizePlanModules(draft.modules);
  const blocked = PLAN_MODULE_KEYS.filter((key) => !selected.includes(key));
  const issue = validatePlanModules(selected);
  const highlights = draft.highlights
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-background p-3">
      <p className="text-xs font-semibold text-foreground">Prévia do plano</p>

      {issue ? <p className="text-xs text-destructive">{issue}</p> : null}

      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Menu do painel ({selected.length})
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {selected.map((key) => (
            <Badge key={key} variant="secondary" className="text-[11px]">
              {PLAN_MODULE_LABEL[key]}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Bloqueado no painel ({blocked.length})
        </p>
        {blocked.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Nenhum módulo bloqueado — plano completo.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {blocked.map((key) => (
              <Badge key={key} variant="outline" className="text-[11px] text-muted-foreground">
                {PLAN_MODULE_LABEL[key]}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Homepage e /planos
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {draft.isActive
            ? `Publicado como "${draft.name.trim() || "Sem nome"}"${draft.isHighlighted ? " com selo de destaque" : ""}, na posição #${draft.sortOrder || "0"}.`
            : "Plano inativo — não aparece na homepage nem em /planos."}
        </p>
        {highlights.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {highlights.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Sem destaques escritos para o cartão de preço.</p>
        )}
      </div>
    </div>
  );
}

/** Campos comuns de identidade/preço com mensagens de erro por campo. */
function PlanBasicFields({
  draft,
  errors,
  update,
  showKey,
}: {
  draft: PlanDraft;
  errors: PlanFormErrors;
  update: (patch: Partial<PlanDraft>) => void;
  showKey: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Nome</Label>
        <Input
          value={draft.name}
          aria-invalid={Boolean(errors.name)}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="Profissional"
        />
        {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
      </div>
      {showKey ? (
        <div className="space-y-1.5">
          <Label>Identificador (opcional)</Label>
          <Input
            value={draft.key}
            aria-invalid={Boolean(errors.key)}
            onChange={(event) => update({ key: event.target.value })}
            placeholder="pro"
          />
          {errors.key ? <p className="text-xs text-destructive">{errors.key}</p> : null}
        </div>
      ) : null}
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Chamada</Label>
        <Input
          value={draft.tagline}
          aria-invalid={Boolean(errors.tagline)}
          onChange={(event) => update({ tagline: event.target.value })}
          placeholder="Para negócios em crescimento."
        />
        {errors.tagline ? <p className="text-xs text-destructive">{errors.tagline}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label>Preço mensal (R$)</Label>
        <Input
          value={draft.priceMonth}
          inputMode="decimal"
          aria-invalid={Boolean(errors.priceMonth)}
          onChange={(event) => update({ priceMonth: event.target.value })}
        />
        {errors.priceMonth ? <p className="text-xs text-destructive">{errors.priceMonth}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label>Preço anual (R$)</Label>
        <Input
          value={draft.priceYear}
          inputMode="decimal"
          aria-invalid={Boolean(errors.priceYear)}
          onChange={(event) => update({ priceYear: event.target.value })}
        />
        {errors.priceYear ? <p className="text-xs text-destructive">{errors.priceYear}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label>Dias de teste</Label>
        <Input
          value={draft.trialDays}
          inputMode="numeric"
          aria-invalid={Boolean(errors.trialDays)}
          onChange={(event) => update({ trialDays: event.target.value })}
        />
        {errors.trialDays ? <p className="text-xs text-destructive">{errors.trialDays}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label>Ordem de exibição</Label>
        <Input
          value={draft.sortOrder}
          inputMode="numeric"
          aria-invalid={Boolean(errors.sortOrder)}
          onChange={(event) => update({ sortOrder: event.target.value })}
        />
        {errors.sortOrder ? <p className="text-xs text-destructive">{errors.sortOrder}</p> : null}
      </div>
      <div className="flex items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2">
          <Switch
            checked={draft.isActive}
            onCheckedChange={(checked) => update({ isActive: checked })}
            aria-label="Plano publicado"
          />
          <span className="text-muted-foreground">{draft.isActive ? "Publicado" : "Oculto"}</span>
        </label>
        <label className="flex items-center gap-2">
          <Switch
            checked={draft.isHighlighted}
            onCheckedChange={(checked) => update({ isHighlighted: checked })}
            aria-label="Plano destacado"
          />
          <span className="text-muted-foreground">Destaque (“Mais popular”)</span>
        </label>
      </div>
    </div>
  );
}

/** Formulário de criação de plano — o plano ativo aparece na página inicial e em /planos. */
function NewPlanCard({
  nextSortOrder,
  existingKeys,
  pending,
  onCreate,
}: {
  nextSortOrder: number;
  existingKeys: string[];
  pending: boolean;
  onCreate: (payload: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<PlanFormErrors & Record<string, string>>({});
  const [draft, setDraft] = useState<PlanDraft>(() => ({
    name: "",
    key: "",
    tagline: "",
    priceMonth: "0",
    priceYear: "0",
    trialDays: "0",
    sortOrder: String(nextSortOrder),
    isActive: true,
    isHighlighted: false,
    limits: emptyLimits(),
    features: defaultFeatures(),
    modules: [...PLAN_MODULE_KEYS],
    highlights: "",
  }));

  function update(patch: Partial<PlanDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function submit() {
    const moduleError = validatePlanModules(normalizePlanModules(draft.modules));
    const formErrors = {
      ...validatePlanForm(draft, existingKeys),
      ...limitErrors(draft.limits),
      ...(moduleError ? { modules: moduleError } : {}),
    };
    setErrors(formErrors);
    if (Object.keys(formErrors).length > 0) {
      toast.error("Corrija os campos destacados antes de criar o plano.");
      return;
    }
    onCreate(payloadFromDraft(draft));
    setOpen(false);
    setErrors({});
    setDraft({
      name: "",
      key: "",
      tagline: "",
      priceMonth: "0",
      priceYear: "0",
      trialDays: "0",
      sortOrder: String(nextSortOrder + 1),
      isActive: true,
      isHighlighted: false,
      limits: emptyLimits(),
      features: defaultFeatures(),
      modules: [...PLAN_MODULE_KEYS],
      highlights: "",
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
        Criar plano
      </Button>
    );
  }

  return (
    <Card className="border-accent/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Novo plano</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <PlanBasicFields draft={draft} errors={errors} update={update} showKey />
        <PlanCapabilityFields draft={draft} errors={errors} update={update} />
        <PlanHighlightsField draft={draft} update={update} rows={4} />

        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? "Criando…" : "Criar plano"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Edição completa de um plano existente. */
function PlanEditor({
  plan,
  existingKeys,
  pending,
  onSave,
  onDelete,
}: {
  plan: PlanRow;
  existingKeys: string[];
  pending: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<PlanDraft>(() => draftFromPlan(plan));
  const [errors, setErrors] = useState<PlanFormErrors & Record<string, string>>({});

  function update(patch: Partial<PlanDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function submit() {
    const moduleError = validatePlanModules(normalizePlanModules(draft.modules));
    const formErrors = {
      ...validatePlanForm(draft, existingKeys),
      ...limitErrors(draft.limits),
      ...(moduleError ? { modules: moduleError } : {}),
    };
    setErrors(formErrors);
    if (Object.keys(formErrors).length > 0) {
      toast.error("Corrija os campos destacados antes de salvar.");
      return;
    }
    onSave(payloadFromDraft(draft));
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{plan.name}</CardTitle>
        <div className="flex items-center gap-2">
          {plan.is_highlighted ? <Badge>Destaque</Badge> : null}
          <Badge variant="outline">#{plan.sort_order}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <PlanBasicFields draft={draft} errors={errors} update={update} showKey={false} />
        <PlanCapabilityFields draft={draft} errors={errors} update={update} />

        <PlanHighlightsField draft={draft} update={update} rows={3} />


        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? "Salvando…" : "Salvar plano"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(draftFromPlan(plan))}>
            Desfazer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (window.confirm(`Remover o plano ${plan.name}?`)) onDelete();
            }}
          >
            Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


/* ---------------- Conteúdo ---------------- */

function ContentTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ContentList
        table="platform_banners"
        title="Banners"
        fields={[
          { key: "title", label: "Título" },
          { key: "body", label: "Texto" },
          { key: "cta_label", label: "Botão" },
          { key: "cta_url", label: "Link" },
        ]}
        primary="title"
      />
      <ContentList
        table="platform_faqs"
        title="Perguntas frequentes"
        fields={[
          { key: "question", label: "Pergunta" },
          { key: "answer", label: "Resposta" },
          { key: "category", label: "Categoria" },
        ]}
        primary="question"
      />
      <ContentList
        table="platform_segments"
        title="Segmentos"
        fields={[
          { key: "key", label: "Chave" },
          { key: "label", label: "Nome" },
          { key: "description", label: "Descrição" },
        ]}
        primary="label"
      />
    </div>
  );
}

type ContentTable = "platform_banners" | "platform_faqs" | "platform_segments";

function ContentList({
  table,
  title,
  fields,
  primary,
}: {
  table: ContentTable;
  title: string;
  fields: { key: string; label: string }[];
  primary: string;
}) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(adminListContent);
  const mutateFn = useServerFn(adminMutateContent);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data = [] } = useQuery({
    queryKey: ["content", table],
    queryFn: () => listFn({ data: { table } }),
  });

  const create = useMutation({
    mutationFn: async () => {
      await mutateFn({ data: { table, action: "create", values: form } });
    },
    onSuccess: () => {
      toast.success("Item criado.");
      setForm({});
      void queryClient.invalidateQueries({ queryKey: ["content", table] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      await mutateFn({ data: { table, action: "toggle", id: input.id, isActive: input.isActive } });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["content", table] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await mutateFn({ data: { table, action: "delete", id } });
    },
    onSuccess: () => {
      toast.success("Item removido.");
      void queryClient.invalidateQueries({ queryKey: ["content", table] });
    },
  });

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <form
          className="space-y-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          {fields.map((field) => (
            <Input
              key={field.key}
              placeholder={field.label}
              value={form[field.key] ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          ))}
          <Button type="submit" size="sm" variant="outline" className="w-full">
            Adicionar
          </Button>
        </form>

        <ul className="divide-y divide-border">
          {data.map((item) => (
            <li key={String(item["id"])} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate text-foreground">{String(item[primary] ?? "—")}</span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={Boolean(item["is_active"])}
                  onCheckedChange={(checked) => toggle.mutate({ id: String(item["id"]), isActive: checked })}
                  aria-label="Ativo"
                />
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(String(item["id"]))}>
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ---------------- Suporte ---------------- */

function SupportTab() {
  const queryClient = useQueryClient();
  const endFn = useServerFn(endSupportAccess);
  const listTicketsFn = useServerFn(adminListSupportTickets);
  const updateTicketFn = useServerFn(adminUpdateSupportTicket);

  const tickets = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => listTicketsFn({}),
  });

  const sessions = useQuery({
    queryKey: ["support-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impersonation_sessions")
        .select("id, store_id, reason, consent_reference, started_at, expires_at, ended_at")
        .order("started_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const updateTicket = useMutation({
    mutationFn: async (input: { id: string; status: "open" | "pending" | "resolved" | "closed" }) => {
      await updateTicketFn({ data: input });
    },
    onSuccess: () => {
      toast.success("Ticket atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const endSession = useMutation({
    mutationFn: (id: string) => endFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Acesso encerrado.");
      void queryClient.invalidateQueries({ queryKey: ["support-sessions"] });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {(tickets.data ?? []).length === 0 ? (
            <EmptyState title="Nenhum ticket aberto" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(tickets.data ?? []).map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium text-foreground">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.store?.name ?? "Plataforma"} · {ticket.category} · {ticket.priority} · {formatDate(ticket.created_at)}
                    </p>
                    {Date.now() - new Date(ticket.created_at).getTime() > 24 * 60 * 60 * 1_000 && ticket.status !== "resolved" && ticket.status !== "closed" ? <Badge variant="destructive" className="mt-2">SLA acima de 24h</Badge> : null}
                  </div>
                  <Select value={ticket.status} onValueChange={(status) => updateTicket.mutate({ id: ticket.id, status: status as typeof ticket.status })}>
                    <SelectTrigger className="h-9 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aberto</SelectItem>
                      <SelectItem value="pending">Aguardando</SelectItem>
                      <SelectItem value="resolved">Resolvido</SelectItem>
                      <SelectItem value="closed">Fechado</SelectItem>
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Acessos de suporte (auditados)</CardTitle>
        </CardHeader>
        <CardContent>
          {(sessions.data ?? []).length === 0 ? (
            <EmptyState title="Nenhum acesso registrado" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(sessions.data ?? []).map((session) => {
                const activeNow = !session.ended_at && new Date(session.expires_at).getTime() > Date.now();
                return (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{session.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        Consentimento: {session.consent_reference} · início {formatDate(session.started_at)} · expira{" "}
                        {formatDate(session.expires_at)}
                      </p>
                    </div>
                    {activeNow ? (
                      <Button variant="outline" size="sm" onClick={() => endSession.mutate(session.id)}>
                        Encerrar
                      </Button>
                    ) : (
                      <Badge variant="secondary">Encerrado</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Logs e incidentes ---------------- */

function LogsTab() {
  const queryClient = useQueryClient();
  const logsFn = useServerFn(adminListAuditLogs);
  const listIncidentsFn = useServerFn(adminListIncidents);
  const saveIncidentFn = useServerFn(adminSaveIncident);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("low");
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);

  const logs = useQuery({ queryKey: ["admin-logs", logSearch, logPage], queryFn: () => logsFn({ data: { search: logSearch, page: logPage } }) });

  const incidents = useQuery({
    queryKey: ["admin-incidents"],
    queryFn: () => listIncidentsFn({}),
  });

  const createIncident = useMutation({
    mutationFn: async () => {
      await saveIncidentFn({ data: { title, description, severity: severity as "low" | "medium" | "high" | "critical" } });
    },
    onSuccess: () => {
      toast.success("Incidente registrado.");
      setTitle("");
      setDescription("");
      void queryClient.invalidateQueries({ queryKey: ["admin-incidents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolveIncident = useMutation({
    mutationFn: async (id: string) => {
      await saveIncidentFn({ data: { id, resolve: true } });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-incidents"] }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Auditoria</CardTitle>
            <Input value={logSearch} onChange={(event) => { setLogSearch(event.target.value); setLogPage(1); }} placeholder="Buscar ação ou entidade" className="w-full sm:w-56" />
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {(logs.data?.rows ?? []).map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-foreground">{log.action}</span>
                <span className="text-xs text-muted-foreground">
                  {log.entity} · {formatDate(log.created_at)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">{logs.data?.total ?? 0} registro(s) · página {logPage}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={logPage === 1} onClick={() => setLogPage((page) => Math.max(1, page - 1))}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={(logs.data?.rows.length ?? 0) < 50} onClick={() => setLogPage((page) => page + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Incidentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              createIncident.mutate();
            }}
          >
            <Input
              className="min-w-40 flex-1"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título do incidente"
              required
            />
            <Input
              className="min-w-40 flex-1"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descrição e impacto"
            />
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm">
              Registrar
            </Button>
          </form>

          <ul className="divide-y divide-border">
            {(incidents.data ?? []).map((incident) => (
              <li key={incident.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium text-foreground">{incident.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {incident.severity} · {formatDate(incident.started_at)}
                  </p>
                  {incident.description ? <p className="mt-1 text-xs text-muted-foreground">{incident.description}</p> : null}
                </div>
                {incident.status === "open" ? (
                  <Button variant="outline" size="sm" onClick={() => resolveIncident.mutate(incident.id)}>
                    Resolver
                  </Button>
                ) : (
                  <Badge variant="secondary">Resolvido</Badge>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Integrações globais ---------------- */

function IntegrationsTab() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPlatformIntegrations);
  const toggleFn = useServerFn(togglePlatformIntegration);
  const testFn = useServerFn(testPlatformIntegration);
  const [editing, setEditing] = useState<{ kind: string; provider: string; label: string } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["platform-integrations"],
    queryFn: () => listFn({}),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["platform-integrations"] });

  const toggle = useMutation({
    mutationFn: (input: { kind: string; provider: string; label: string; isEnabled: boolean }) =>
      toggleFn({ data: input }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: (input: { kind: string; provider: string }) => testFn({ data: input }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {INTEGRATIONS.map((integration) => (
          <Card key={integration.kind} className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{integration.label}</CardTitle>
              <p className="text-sm text-muted-foreground">{integration.description}</p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {integration.providers.map((provider) => {
                const label = `${integration.label} · ${PROVIDER_LABEL[provider] ?? provider}`;
                const row = data.find((item) => item.kind === integration.kind && item.provider === provider);
                const status = row?.status ?? "not_configured";
                const fields = providerFields(provider);
                return (
                  <div
                    key={provider}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2"
                  >
                    <div className="min-w-40">
                      <p className="font-medium text-foreground">{PROVIDER_LABEL[provider] ?? provider}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge className={INTEGRATION_STATUS_TONE[status]} variant="secondary">
                          {PLATFORM_STATUS_LABEL[status] ?? status}
                        </Badge>
                        {row && row.missing.length > 0 ? (
                          <span className="text-xs text-destructive">Falta: {row.missing.join(", ")}</span>
                        ) : null}
                        {row && row.storesUsing > 0 ? (
                          <span className="text-xs text-muted-foreground">{row.storesUsing} loja(s) usando</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {fields.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing({ kind: integration.kind, provider, label })}
                        >
                          Configurar
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={test.isPending}
                        onClick={() => test.mutate({ kind: integration.kind, provider })}
                      >
                        Testar
                      </Button>
                      <Switch
                        checked={Boolean(row?.isEnabled)}
                        onCheckedChange={(checked) =>
                          toggle.mutate({ kind: integration.kind, provider, label, isEnabled: checked })
                        }
                        aria-label={`Ativar ${label}`}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Fallback: {integration.fallback}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing ? (
        <IntegrationConfigDialog
          kind={editing.kind}
          provider={editing.provider}
          label={editing.label}
          current={data.find((item) => item.kind === editing.kind && item.provider === editing.provider) ?? null}
          onClose={() => setEditing(null)}
          onSaved={invalidate}
        />
      ) : null}
    </>
  );
}

interface IntegrationConfigDialogProps {
  kind: string;
  provider: string;
  label: string;
  current: PlatformIntegrationView | null;
  onClose: () => void;
  onSaved: () => void;
}

function IntegrationConfigDialog({ kind, provider, label, current, onClose, onSaved }: IntegrationConfigDialogProps) {
  const fields = providerFields(provider);
  const saveFn = useServerFn(savePlatformIntegration);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) initial[field.key] = field.secret ? "" : (current?.values[field.key] ?? "");
    return initial;
  });
  const [isEnabled, setIsEnabled] = useState(Boolean(current?.isEnabled));

  const save = useMutation({
    mutationFn: () => saveFn({ data: { kind, provider, label, isEnabled, values } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      onSaved();
      if (result.ok) onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`${provider}-${field.key}`}>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <Input
                id={`${provider}-${field.key}`}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={
                  field.secret && current?.values[field.key]
                    ? `Salvo (${current.values[field.key]}) — deixe vazio para manter`
                    : field.placeholder
                }
                value={values[field.key] ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
              />
              {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
            </div>
          ))}

          <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Ativar para a plataforma</p>
              <p className="text-xs text-muted-foreground">Só liga quando todos os campos obrigatórios estiverem preenchidos.</p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} aria-label="Ativar integração" />
          </div>

          <p className="text-xs text-muted-foreground">
            As chaves ficam guardadas somente no servidor. O painel exibe apenas os últimos dígitos.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}



/* ------------------------- Cadastro e edição de lojas --------------------- */

type CheckoutTypeValue = "agendamento" | "loja";

const CHECKOUT_TYPE_LABEL: Record<CheckoutTypeValue, string> = {
  loja: "Pedidos e produtos",
  agendamento: "Pedidos com agendamento",
};

/** Link de checkout da loja, pronto para copiar e enviar ao lojista. */
function StoreCheckoutLink({ slug }: { slug: string }) {
  const url = storeRuntimeUrl(slug, "/checkout");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-lg bg-muted px-2 py-1 text-xs text-foreground">{url}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(url);
          toast.success("Link de checkout copiado.");
        }}
      >
        Copiar link
      </Button>
    </div>
  );
}

function StoreCreateForm({
  onSubmit,
  pending,
}: {
  onSubmit: (values: { name: string; slug: string; segment: string; checkoutType?: CheckoutTypeValue }) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [segment, setSegment] = useState("delivery");
  const [checkoutType, setCheckoutType] = useState<CheckoutTypeValue>("loja");

  if (!open) {
    return (
      <Button type="button" size="sm" className="mb-4" onClick={() => setOpen(true)}>
        Cadastrar loja
      </Button>
    );
  }

  return (
    <form
      className="mb-4 grid gap-3 rounded-xl border border-dashed border-border p-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, slug, segment, checkoutType });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="nova-loja-nome">Nome</Label>
        <Input id="nova-loja-nome" value={name} onChange={(event) => setName(event.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nova-loja-slug">Endereço (link)</Label>
        <Input
          id="nova-loja-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
          placeholder="minha-loja"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nova-loja-segmento">Segmento</Label>
        <Input id="nova-loja-segmento" value={segment} onChange={(event) => setSegment(event.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label>Modelo de checkout</Label>
        <Select value={checkoutType} onValueChange={(value) => setCheckoutType(value as CheckoutTypeValue)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CHECKOUT_TYPE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          Criar loja
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function StoreEditForm({
  store,
  onSubmit,
  pending,
}: {
  store: { name: string; slug: string };
  onSubmit: (values: { name: string; slug: string; segment?: string; checkoutType?: CheckoutTypeValue }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(store.name);
  const [slug, setSlug] = useState(store.slug);
  const [checkoutType, setCheckoutType] = useState<CheckoutTypeValue>("loja");

  return (
    <form
      className="grid gap-3 rounded-xl border border-dashed border-border p-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, slug, checkoutType });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`edit-nome-${store.slug}`}>Nome</Label>
        <Input id={`edit-nome-${store.slug}`} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`edit-slug-${store.slug}`}>Endereço (link)</Label>
        <Input
          id={`edit-slug-${store.slug}`}
          value={slug}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Modelo de checkout</Label>
        <Select value={checkoutType} onValueChange={(value) => setCheckoutType(value as CheckoutTypeValue)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CHECKOUT_TYPE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          Salvar loja
        </Button>
      </div>
    </form>
  );
}

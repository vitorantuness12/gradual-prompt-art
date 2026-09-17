import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Clock3, History, LogOut, MapPin, ShoppingBag, Store, UserRound } from "lucide-react";
import { type FormEvent } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { CustomerAddressManager } from "@/components/cliente/CustomerAddressManager";
import {
  CustomerDashboardOrders,
  CustomerOrderSectionTitle,
  isActiveCustomerOrder,
} from "@/components/cliente/CustomerDashboardOrders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getCustomerDashboard, saveCustomerProfile } from "@/lib/contas.functions";
import { maskPhone, onlyDigits } from "@/lib/masks";

type CustomerTab = "inicio" | "pedidos" | "enderecos" | "dados";
const TABS: CustomerTab[] = ["inicio", "pedidos", "enderecos", "dados"];

export const Route = createFileRoute("/_authenticated/minha-conta")({
  validateSearch: (search: Record<string, unknown>): { aba?: CustomerTab; loja?: string } => {
    const aba = TABS.includes(search["aba"] as CustomerTab)
      ? (search["aba"] as CustomerTab)
      : undefined;
    const loja =
      typeof search["loja"] === "string" && /^[a-z0-9-]{1,80}$/.test(search["loja"])
        ? search["loja"]
        : undefined;
    return { ...(aba ? { aba } : {}), ...(loja ? { loja } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Painel do cliente — Pedi Um" },
      {
        name: "description",
        content: "Acompanhe seus pedidos, consulte o histórico e gerencie seus endereços salvos.",
      },
      { property: "og:title", content: "Painel do cliente — Pedi Um" },
      {
        property: "og:description",
        content: "Seus pedidos, histórico e endereços em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomerDashboardPage,
});

function CustomerDashboardPage() {
  const { aba: searchTab, loja } = Route.useSearch();
  const aba = searchTab ?? "inicio";
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const loadDashboard = useServerFn(getCustomerDashboard);
  const saveProfile = useServerFn(saveCustomerProfile);
  const dashboard = useQuery({
    queryKey: ["customer-dashboard"],
    queryFn: () => loadDashboard(),
    staleTime: 30_000,
  });
  const profileMutation = useMutation({
    mutationFn: saveProfile,
    onSuccess: () => {
      toast.success("Dados atualizados.");
      void queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = dashboard.data;
  const activeOrders = (data?.orders ?? []).filter((order) => isActiveCustomerOrder(order.status));
  const historyOrders = (data?.orders ?? []).filter(
    (order) => !isActiveCustomerOrder(order.status),
  );
  const firstName = data?.profile?.fullName.trim().split(/\s+/)[0] || "cliente";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", search: { modo: "entrar" }, replace: true });
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    profileMutation.mutate({
      data: {
        fullName: String(form.get("full_name") ?? "").trim(),
        phone: onlyDigits(String(form.get("phone") ?? "")),
        birthDate: String(form.get("birth_date") ?? "") || null,
        marketingOptIn: form.get("marketing") === "on",
      },
    });
  }

  return (
    <div className="min-h-screen bg-secondary/40 pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Página inicial do Pedi Um">
            <Logo className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              {loja ? (
                <Link to="/$slug" params={{ slug: loja }}>
                  <Store className="mr-1.5 size-4" aria-hidden="true" />
                  Voltar à loja
                </Link>
              ) : (
                <Link to="/">
                  <Store className="mr-1.5 size-4" aria-hidden="true" />
                  Ver lojas
                </Link>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleSignOut()}
              aria-label="Sair da conta"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-primary">Painel do cliente</p>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Olá, {firstName}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Acompanhe suas compras e mantenha seus endereços organizados.
          </p>
        </div>

        {dashboard.isPending ? (
          <DashboardSkeleton />
        ) : dashboard.isError ? (
          <Card className="mt-6 rounded-lg">
            <CardContent className="py-10 text-center">
              <p className="font-medium">Não foi possível carregar sua conta.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Confira sua conexão e tente novamente.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => void dashboard.refetch()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs
            value={aba}
            onValueChange={(value) =>
              void navigate({
                search: loja ? { aba: value as CustomerTab, loja } : { aba: value as CustomerTab },
                replace: true,
              })
            }
            className="mt-7"
          >
            <TabsList className="grid h-auto w-full grid-cols-4 rounded-lg border border-border bg-card p-1 shadow-sm">
              <TabsTrigger value="inicio" className="min-h-10 px-2">
                <ShoppingBag className="size-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">Início</span>
              </TabsTrigger>
              <TabsTrigger value="pedidos" className="min-h-10 px-2">
                <History className="size-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">Pedidos</span>
              </TabsTrigger>
              <TabsTrigger value="enderecos" className="min-h-10 px-2">
                <MapPin className="size-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">Endereços</span>
              </TabsTrigger>
              <TabsTrigger value="dados" className="min-h-10 px-2">
                <UserRound className="size-4 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">Meus dados</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inicio" className="mt-6 space-y-6">
              <section aria-label="Resumo da conta" className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                  icon={Clock3}
                  label="Em andamento"
                  value={String(activeOrders.length)}
                />
                <SummaryCard
                  icon={History}
                  label="Pedidos realizados"
                  value={String(data?.orders.length ?? 0)}
                />
                <SummaryCard
                  icon={MapPin}
                  label="Endereços salvos"
                  value={String(data?.addresses.length ?? 0)}
                />
              </section>
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  <CustomerOrderSectionTitle />
                </h2>
                <CustomerDashboardOrders orders={activeOrders.slice(0, 3)} mode="all" />
              </section>
              {historyOrders.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">
                      <CustomerOrderSectionTitle history />
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void navigate({
                          search: loja ? { aba: "pedidos", loja } : { aba: "pedidos" },
                        })
                      }
                    >
                      Ver todos
                    </Button>
                  </div>
                  <CustomerDashboardOrders orders={historyOrders.slice(0, 3)} mode="all" />
                </section>
              ) : null}
            </TabsContent>

            <TabsContent value="pedidos" className="mt-6 space-y-7">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  <CustomerOrderSectionTitle />
                </h2>
                <CustomerDashboardOrders orders={data?.orders ?? []} mode="active" />
              </section>
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  <CustomerOrderSectionTitle history />
                </h2>
                <CustomerDashboardOrders orders={data?.orders ?? []} mode="history" />
              </section>
            </TabsContent>

            <TabsContent value="enderecos" className="mt-6">
              <CustomerAddressManager addresses={data?.addresses ?? []} />
            </TabsContent>

            <TabsContent value="dados" className="mt-6">
              <Card className="max-w-2xl rounded-lg shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Meus dados</CardTitle>
                  <CardDescription>Atualize seus dados de contato e preferências.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    key={data?.profile?.fullName}
                    onSubmit={submitProfile}
                    className="grid gap-4 sm:grid-cols-2"
                  >
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="customer-name">Nome completo</Label>
                      <Input
                        id="customer-name"
                        name="full_name"
                        defaultValue={data?.profile?.fullName ?? ""}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer-email">E-mail</Label>
                      <Input id="customer-email" value={data?.profile?.email ?? ""} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer-phone">WhatsApp</Label>
                      <Input
                        id="customer-phone"
                        name="phone"
                        defaultValue={data?.profile?.phone ? maskPhone(data.profile.phone) : ""}
                        onChange={(event) => {
                          event.target.value = maskPhone(event.target.value);
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer-birth">Data de nascimento</Label>
                      <Input
                        id="customer-birth"
                        name="birth_date"
                        type="date"
                        defaultValue={data?.profile?.birthDate ?? ""}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                      <Checkbox
                        name="marketing"
                        defaultChecked={data?.profile?.marketingOptIn ?? false}
                      />
                      Quero receber novidades e promoções
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button type="submit" disabled={profileMutation.isPending}>
                        {profileMutation.isPending ? "Salvando..." : "Salvar alterações"}
                      </Button>
                      <Button asChild type="button" variant="outline">
                        <Link to="/privacidade">Privacidade dos meus dados</Link>
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardContent className="flex items-center gap-4 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-7 space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
    </div>
  );
}

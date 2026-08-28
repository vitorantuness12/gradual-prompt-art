import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Home, LogOut, MapPin, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { myCustomerOrders } from "@/lib/contas.functions";
import { ORDER_STATUS_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import { deliveryAccess, SUBSCRIPTION_STATUS_LABEL } from "@/lib/digitais";
import { maskPhone, maskZip, onlyDigits } from "@/lib/masks";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — O Seu Pedido" },
      {
        name: "description",
        content:
          "Gerencie seus dados, endereços, pedidos anteriores, consentimentos e privacidade na sua conta O Seu Pedido.",
      },
      { property: "og:title", content: "Minha conta — O Seu Pedido" },
      { property: "og:description", content: "Seus pedidos, endereços e preferências em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyAccountPage,
});

interface AddressForm {
  label: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  district: string;
  city: string;
  state: string;
  zip_code: string;
}

const EMPTY_ADDRESS: AddressForm = {
  label: "Casa",
  street: "",
  number: "",
  complement: "",
  reference: "",
  district: "",
  city: "",
  state: "",
  zip_code: "",
};

function MyAccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [showAddressForm, setShowAddressForm] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const profileQuery = useQuery({
    queryKey: ["customer-profile"],
    queryFn: async () => {
      const { data } = await supabase.from("customer_profiles").select("*").maybeSingle();
      return data;
    },
  });

  const addressesQuery = useQuery({
    queryKey: ["saved-addresses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("saved_addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at");
      return data ?? [];
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => myCustomerOrders(),
  });

  const saveProfile = useMutation({
    mutationFn: async (values: { full_name: string; phone: string; birth_date: string | null; marketing_opt_in: boolean }) => {
      if (!userId) throw new Error("Sessão expirada.");
      const { error } = await supabase.from("customer_profiles").upsert({ user_id: userId, ...values });
      if (error) throw new Error(error.message);
      await supabase.from("consent_records").insert({
        user_id: userId,
        kind: "marketing",
        granted: values.marketing_opt_in,
        source: "minha-conta",
      });
    },
    onSuccess: () => {
      toast.success("Dados atualizados.");
      void queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveAddress = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sessão expirada.");
      if (!address.street.trim() || !address.city.trim()) throw new Error("Informe rua e cidade.");
      const { error } = await supabase.from("saved_addresses").insert({
        user_id: userId,
        ...address,
        zip_code: onlyDigits(address.zip_code) || null,
        is_default: (addressesQuery.data ?? []).length === 0,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Endereço salvo.");
      setAddress(EMPTY_ADDRESS);
      setShowAddressForm(false);
      void queryClient.invalidateQueries({ queryKey: ["saved-addresses"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      if (!userId) return;
      await supabase.from("saved_addresses").update({ is_default: false }).eq("user_id", userId);
      const { error } = await supabase.from("saved_addresses").update({ is_default: true }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-addresses"] }),
  });

  const removeAddress = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_addresses").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-addresses"] }),
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", search: { etapa: "entrar" }, replace: true });
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveProfile.mutate({
      full_name: String(form.get("full_name") ?? "").trim(),
      phone: onlyDigits(String(form.get("phone") ?? "")),
      birth_date: String(form.get("birth_date") ?? "") || null,
      marketing_opt_in: form.get("marketing") === "on",
    });
  }

  const profile = profileQuery.data;

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sair
        </Button>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Minha conta</h1>
        <p className="mt-1 text-muted-foreground">
          Seus dados, endereços, pedidos e preferências de privacidade.
        </p>

        <Tabs defaultValue="pedidos" className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
            <TabsTrigger value="produtos">Meus produtos</TabsTrigger>
            <TabsTrigger value="enderecos">Endereços</TabsTrigger>
            <TabsTrigger value="dados">Meus dados</TabsTrigger>
          </TabsList>

          <TabsContent value="pedidos" className="space-y-3">
            {ordersQuery.isLoading ? (
              <Skeleton className="h-32" />
            ) : (ordersQuery.data ?? []).length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Você ainda não tem pedidos vinculados a este telefone. Faça um pedido em uma loja e
                  ele aparecerá aqui.
                </CardContent>
              </Card>
            ) : (
              (ordersQuery.data ?? []).map((order) => (
                <Card key={order.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium">
                        #{order.code} · {order.storeName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(order.createdAt)} · {formatCurrency(order.total)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {ORDER_STATUS_LABEL[order.status as keyof typeof ORDER_STATUS_LABEL] ?? order.status}
                      </Badge>
                      {order.storeSlug ? (
                        <>
                          <Button asChild variant="outline" size="sm">
                            <a href={`/${order.storeSlug}/acompanhar`}>Acompanhar</a>
                          </Button>
                          <Button asChild size="sm">
                            <Link to="/$slug" params={{ slug: order.storeSlug }}>
                              <RefreshCcw className="mr-2 h-4 w-4" aria-hidden /> Repetir
                            </Link>
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="enderecos" className="space-y-3">
            {addressesQuery.isLoading ? (
              <Skeleton className="h-24" />
            ) : (
              (addressesQuery.data ?? []).map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="flex items-center gap-2 font-medium">
                        <MapPin className="h-4 w-4 text-primary" aria-hidden /> {item.label}
                        {item.is_default ? <Badge variant="secondary">Principal</Badge> : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.street}
                        {item.number ? `, ${item.number}` : ""} {item.complement ?? ""} — {item.city}
                        {item.reference ? ` · Ref.: ${item.reference}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!item.is_default ? (
                        <Button variant="outline" size="sm" onClick={() => setDefault.mutate(item.id)}>
                          <Home className="mr-2 h-4 w-4" aria-hidden /> Tornar principal
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAddress.mutate(item.id)}
                        aria-label="Remover endereço"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            {showAddressForm ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Novo endereço</CardTitle>
                  <CardDescription>Inclua complemento e um ponto de referência.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Apelido (Casa, Trabalho)"
                    value={address.label}
                    onChange={(e) => setAddress({ ...address, label: e.target.value })}
                  />
                  <Input
                    placeholder="CEP"
                    value={address.zip_code}
                    onChange={(e) => setAddress({ ...address, zip_code: maskZip(e.target.value) })}
                  />
                  <Input
                    placeholder="Rua"
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  />
                  <Input
                    placeholder="Número"
                    value={address.number}
                    onChange={(e) => setAddress({ ...address, number: e.target.value })}
                  />
                  <Input
                    placeholder="Complemento"
                    value={address.complement}
                    onChange={(e) => setAddress({ ...address, complement: e.target.value })}
                  />
                  <Input
                    placeholder="Referência"
                    value={address.reference}
                    onChange={(e) => setAddress({ ...address, reference: e.target.value })}
                  />
                  <Input
                    placeholder="Bairro"
                    value={address.district}
                    onChange={(e) => setAddress({ ...address, district: e.target.value })}
                  />
                  <Input
                    placeholder="Cidade"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  />
                  <div className="sm:col-span-2 flex gap-2">
                    <Button onClick={() => saveAddress.mutate()} disabled={saveAddress.isPending}>
                      Salvar endereço
                    </Button>
                    <Button variant="ghost" onClick={() => setShowAddressForm(false)}>
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button variant="outline" onClick={() => setShowAddressForm(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden /> Adicionar endereço
              </Button>
            )}
          </TabsContent>

          <TabsContent value="dados">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Meus dados</CardTitle>
                <CardDescription>Você pode editar seus dados e consentimentos quando quiser.</CardDescription>
              </CardHeader>
              <CardContent>
                {profileQuery.isLoading ? (
                  <Skeleton className="h-40" />
                ) : (
                  <form onSubmit={handleProfileSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="mc-nome">Nome completo</Label>
                      <Input id="mc-nome" name="full_name" defaultValue={profile?.full_name ?? ""} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mc-tel">Telefone</Label>
                      <Input
                        id="mc-tel"
                        name="phone"
                        defaultValue={profile?.phone ? maskPhone(profile.phone) : ""}
                        onChange={(e) => {
                          e.target.value = maskPhone(e.target.value);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mc-nasc">Data de nascimento</Label>
                      <Input id="mc-nasc" name="birth_date" type="date" defaultValue={profile?.birth_date ?? ""} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox name="marketing" defaultChecked={profile?.marketing_opt_in ?? false} />
                      Aceito receber novidades e promoções
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={saveProfile.isPending}>
                        Salvar alterações
                      </Button>
                      <Button asChild variant="outline" type="button">
                        <Link to="/privacidade">Exportar ou excluir meus dados</Link>
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="produtos" className="space-y-3">
            <MyDigitalProducts />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/** Área do comprador: produtos digitais liberados e assinaturas ativas. */
function MyDigitalProducts() {
  const deliveries = useQuery({
    queryKey: ["my-digital-deliveries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("digital_deliveries")
        .select("id, access_token, expires_at, revoked_at, download_count, max_downloads, product:products(name), store:stores(name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const subscriptions = useQuery({
    queryKey: ["my-subscriptions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_subscriptions")
        .select("id, amount, period, status, next_charge_at, product:products(name), store:stores(name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (deliveries.isLoading) return <Skeleton className="h-32 rounded-2xl" />;

  const items = deliveries.data ?? [];
  const plans = subscriptions.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produtos digitais</CardTitle>
          <CardDescription>Baixe seus arquivos. Cada link tem validade e limite de downloads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {items.length === 0 ? <p className="text-muted-foreground">Você ainda não comprou produtos digitais.</p> : null}
          {items.map((item) => {
            const access = deliveryAccess(item);
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{item.product?.name ?? "Produto digital"}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.store?.name ?? ""} · {access.remaining} download(s) restantes
                    {item.expires_at ? ` · válido até ${formatDateTime(item.expires_at)}` : ""}
                  </p>
                </div>
                {access.allowed ? (
                  <Button asChild size="sm">
                    <a href={`/entrega/${item.access_token}`}>Abrir</a>
                  </Button>
                ) : (
                  <Badge variant="outline">Indisponível</Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assinaturas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {plans.length === 0 ? <p className="text-muted-foreground">Nenhuma assinatura ativa.</p> : null}
          {plans.map((plan) => (
            <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{plan.product?.name ?? "Assinatura"}</p>
                <p className="text-xs text-muted-foreground">
                  {plan.store?.name ?? ""} · {formatCurrency(Number(plan.amount))}
                  {plan.next_charge_at ? ` · próxima cobrança ${formatDateTime(plan.next_charge_at)}` : ""}
                </p>
              </div>
              <Badge variant={plan.status === "active" ? "secondary" : "outline"}>
                {SUBSCRIPTION_STATUS_LABEL[plan.status] ?? plan.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

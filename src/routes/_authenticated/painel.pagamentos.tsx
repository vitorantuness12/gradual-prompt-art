import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_STATUS_LABEL, formatCurrency, formatDateTime } from "@/lib/format";
import { refundPayment } from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/painel/pagamentos")({
  component: PaymentsPage,
});

const PROVIDERS = [
  { id: "manual", label: "Pix direto (sem gateway)" },
  { id: "mercadopago", label: "Mercado Pago" },
  { id: "stripe", label: "Stripe" },
];

const KEY_TYPES = [
  { id: "cpf", label: "CPF" },
  { id: "cnpj", label: "CNPJ" },
  { id: "email", label: "E-mail" },
  { id: "phone", label: "Telefone" },
  { id: "random", label: "Chave aleatória" },
];

interface SettingsForm {
  provider: string;
  is_sandbox: boolean;
  pix_enabled: boolean;
  pix_key: string;
  pix_key_type: string;
  pix_holder_name: string;
  pix_city: string;
  pix_expires_minutes: number;
  card_online_enabled: boolean;
  card_on_delivery_enabled: boolean;
  cash_enabled: boolean;
  public_key: string;
}

const EMPTY_FORM: SettingsForm = {
  provider: "manual",
  is_sandbox: true,
  pix_enabled: true,
  pix_key: "",
  pix_key_type: "cpf",
  pix_holder_name: "",
  pix_city: "",
  pix_expires_minutes: 30,
  card_online_enabled: false,
  card_on_delivery_enabled: true,
  cash_enabled: true,
  public_key: "",
};

function PaymentsPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM);
  const refund = useServerFn(refundPayment);

  const settingsQuery = useQuery({
    queryKey: ["payment-settings", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings").select("*").eq("store_id", storeId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setForm({
      provider: data.provider,
      is_sandbox: data.is_sandbox,
      pix_enabled: data.pix_enabled,
      pix_key: data.pix_key ?? "",
      pix_key_type: data.pix_key_type,
      pix_holder_name: data.pix_holder_name ?? "",
      pix_city: data.pix_city ?? "",
      pix_expires_minutes: data.pix_expires_minutes,
      card_online_enabled: data.card_online_enabled,
      card_on_delivery_enabled: data.card_on_delivery_enabled,
      cash_enabled: data.cash_enabled,
      public_key: data.public_key ?? "",
    });
  }, [settingsQuery.data]);

  const transactionsQuery = useQuery({
    queryKey: ["payments", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, order:orders(code, customer_name)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payment_settings").upsert({ store_id: storeId!, ...form });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Configuração de pagamento salva.");
      await queryClient.invalidateQueries({ queryKey: ["payment-settings", storeId] });
    },
    onError: () => toast.error("Não foi possível salvar a configuração."),
  });

  const doRefund = useMutation({
    mutationFn: async ({ paymentId, amount }: { paymentId: string; amount: number }) =>
      refund({ data: { paymentId, amount } }),
    onSuccess: async (result) => {
      if (result.ok) {
        toast.success(result.message);
        await queryClient.invalidateQueries({ queryKey: ["payments", storeId] });
      } else {
        toast.error(result.message);
      }
    },
    onError: () => toast.error("Não foi possível estornar."),
  });

  const transactions = transactionsQuery.data ?? [];
  const totals = transactions.reduce(
    (acc, item) => {
      const value = Number(item.amount);
      if (item.status === "paid") acc.paid += value;
      if (item.status === "pending") acc.pending += value;
      if (item.status === "refunded") acc.refunded += Number(item.refunded_amount ?? value);
      acc.fees += Number(item.fee_amount ?? 0);
      return acc;
    },
    { paid: 0, pending: 0, refunded: 0, fees: 0 },
  );

  const webhookUrl = `${typeof window === "undefined" ? "" : window.location.origin}/api/public/pagamentos/${form.provider}`;

  return (
    <div>
      <PageHeader
        title="Pagamentos"
        description="Configure o recebimento por Pix e cartão e acompanhe todas as transações."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/painel/cobrancas">Cobranças</Link>
          </Button>
        }
      />

      <Tabs defaultValue="transacoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transacoes">Transações</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="transacoes" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Aprovado", value: totals.paid },
              { label: "Pendente", value: totals.pending },
              { label: "Reembolsado", value: totals.refunded },
              { label: "Taxas", value: totals.fees },
            ].map((card) => (
              <Card key={card.label} className="border-border/70">
                <CardContent className="pt-6">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
                  <p className="text-lg font-semibold text-foreground">{formatCurrency(card.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {transactionsQuery.isLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="Nenhuma transação ainda"
              description="Assim que um cliente pagar pelo Pix ou cartão, o registro aparece aqui."
            />
          ) : (
            <div className="space-y-2">
              {transactions.map((payment) => {
                const order = payment.order as { code: string; customer_name: string } | null;
                const remaining = Number(payment.amount) - Number(payment.refunded_amount ?? 0);
                return (
                  <Card key={payment.id} className="border-border/70">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                      <div className="min-w-[220px]">
                        <p className="font-medium text-foreground">
                          {order ? `#${order.code} · ${order.customer_name}` : "Transação avulsa"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {payment.method} · {payment.provider} · {formatDateTime(payment.created_at)}
                        </p>
                        {payment.external_id ? (
                          <p className="text-xs text-muted-foreground">ID externo: {payment.external_id}</p>
                        ) : null}
                        {Number(payment.fee_amount) > 0 ? (
                          <p className="text-xs text-muted-foreground">Taxa: {formatCurrency(Number(payment.fee_amount))}</p>
                        ) : null}
                        {payment.last_error ? (
                          <p className="text-xs text-destructive">{payment.last_error}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={payment.status === "paid" ? "default" : "secondary"}>
                          {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                        </Badge>
                        <span className="font-semibold text-foreground">{formatCurrency(Number(payment.amount))}</span>
                        {payment.status === "paid" && remaining > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={doRefund.isPending}
                            onClick={() => doRefund.mutate({ paymentId: payment.id, amount: remaining })}
                          >
                            Estornar
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          {settingsQuery.isLoading ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : (
            <>
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Provedor</CardTitle>
                  <CardDescription>
                    A plataforma funciona com qualquer provedor compatível. Sem gateway, o Pix é gerado direto pela
                    chave da loja.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Gateway</Label>
                    <Select value={form.provider} onValueChange={(value) => setForm((old) => ({ ...old, provider: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="public-key">Chave pública do provedor</Label>
                    <Input
                      id="public-key"
                      value={form.public_key}
                      placeholder="pk_..."
                      onChange={(event) => setForm((old) => ({ ...old, public_key: event.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      A chave secreta é guardada em cofre no servidor — nunca no navegador.
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/70 p-3 sm:col-span-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Ambiente de testes</p>
                      <p className="text-xs text-muted-foreground">Use enquanto valida o fluxo, sem cobrar de verdade.</p>
                    </div>
                    <Switch
                      checked={form.is_sandbox}
                      onCheckedChange={(checked) => setForm((old) => ({ ...old, is_sandbox: checked }))}
                    />
                  </div>
                  <div className="sm:col-span-2 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
                    URL de webhook para cadastrar no provedor:
                    <code className="ml-1 break-all text-foreground">{webhookUrl}</code>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Pix</CardTitle>
                  <CardDescription>QR Code e código copia-e-cola gerados automaticamente no checkout.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-xl border border-border/70 p-3 sm:col-span-2">
                    <p className="text-sm font-medium text-foreground">Aceitar Pix</p>
                    <Switch
                      checked={form.pix_enabled}
                      onCheckedChange={(checked) => setForm((old) => ({ ...old, pix_enabled: checked }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo da chave</Label>
                    <Select
                      value={form.pix_key_type}
                      onValueChange={(value) => setForm((old) => ({ ...old, pix_key_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KEY_TYPES.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pix-key">Chave Pix</Label>
                    <Input
                      id="pix-key"
                      value={form.pix_key}
                      onChange={(event) => setForm((old) => ({ ...old, pix_key: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pix-holder">Nome do recebedor</Label>
                    <Input
                      id="pix-holder"
                      value={form.pix_holder_name}
                      maxLength={25}
                      onChange={(event) => setForm((old) => ({ ...old, pix_holder_name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pix-city">Cidade do recebedor</Label>
                    <Input
                      id="pix-city"
                      value={form.pix_city}
                      maxLength={15}
                      onChange={(event) => setForm((old) => ({ ...old, pix_city: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pix-exp">Validade da cobrança (minutos)</Label>
                    <Input
                      id="pix-exp"
                      type="number"
                      min={5}
                      max={1440}
                      value={form.pix_expires_minutes}
                      onChange={(event) =>
                        setForm((old) => ({ ...old, pix_expires_minutes: Number(event.target.value) || 30 }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Outras formas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    {
                      key: "card_online_enabled" as const,
                      label: "Cartão online",
                      hint: "Disponível apenas com gateway configurado.",
                    },
                    { key: "card_on_delivery_enabled" as const, label: "Cartão na entrega", hint: "Maquininha no local." },
                    { key: "cash_enabled" as const, label: "Dinheiro", hint: "Pagamento na entrega ou retirada." },
                  ].map((option) => (
                    <div key={option.key} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.hint}</p>
                      </div>
                      <Switch
                        checked={form[option.key]}
                        onCheckedChange={(checked) => setForm((old) => ({ ...old, [option.key]: checked }))}
                      />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Por segurança, a plataforma nunca armazena número, CVV ou validade de cartão: esses dados ficam
                    somente com o provedor de pagamento.
                  </p>
                </CardContent>
              </Card>

              <Button onClick={() => save.mutate()} disabled={save.isPending || !storeId}>
                {save.isPending ? "Salvando..." : "Salvar configuração"}
              </Button>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

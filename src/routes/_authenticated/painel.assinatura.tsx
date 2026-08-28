import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Check, CreditCard, FileText, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { canManage, useActiveStore } from "@/hooks/useMyStores";
import { usePlans, useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  SUBSCRIPTION_STATUS_LABEL,
  SUBSCRIPTION_STATUS_TONE,
  formatFeature,
  formatLimit,
  planFeature,
  planLimit,
  planPrice,
  type PlanRow,
} from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/painel/assinatura")({
  component: SubscriptionPage,
  head: () => ({
    meta: [
      { title: "Assinatura da loja | O Seu Pedido" },
      { name: "description", content: "Acompanhe o plano, os limites de uso, as faturas e faça upgrade quando precisar." },
    ],
  }),
});

function SubscriptionPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const manager = canManage(active?.role);
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<"month" | "year">("month");

  const subscriptionQuery = useSubscription(storeId);
  const plansQuery = usePlans();

  const invoicesQuery = useQuery({
    queryKey: ["subscription-invoices", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_invoices")
        .select("id, number, amount, status, due_at, paid_at, hosted_url, period_start, period_end")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const changePlan = useMutation({
    mutationFn: async (plan: PlanRow) => {
      if (!storeId) throw new Error("Selecione uma loja.");
      const trialing = plan.trial_days > 0 && Number(plan.price_month) > 0;
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + (period === "year" ? 12 : 1));

      const { error } = await supabase
        .from("store_subscriptions")
        .update({
          plan_id: plan.id,
          period,
          status: trialing ? "trialing" : "active",
          trial_ends_at: trialing ? new Date(now.getTime() + plan.trial_days * 86_400_000).toISOString() : null,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
        })
        .eq("store_id", storeId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Plano atualizado. O checkout recorrente será cobrado no próximo ciclo.");
      void queryClient.invalidateQueries({ queryKey: ["subscription", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelPlan = useMutation({
    mutationFn: async (immediately: boolean) => {
      if (!storeId) throw new Error("Selecione uma loja.");
      const { error } = await supabase
        .from("store_subscriptions")
        .update(
          immediately
            ? { status: "canceled", canceled_at: new Date().toISOString(), cancel_at_period_end: false }
            : { cancel_at_period_end: true },
        )
        .eq("store_id", storeId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Assinatura atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["subscription", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (subscriptionQuery.isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  const subscription = subscriptionQuery.data?.subscription ?? null;
  const currentPlan = subscriptionQuery.data?.plan ?? null;
  const usage = subscriptionQuery.data?.usage;
  const plans = plansQuery.data ?? [];

  if (!subscription || !currentPlan) {
    return <EmptyState title="Assinatura não encontrada" description="Selecione uma loja para ver o plano." />;
  }

  return (
    <div>
      <PageHeader
        title="Assinatura"
        description="Plano atual, uso dos limites, faturas e portal de cobrança."
        actions={
          <div className="flex rounded-xl border border-border p-1 text-xs">
            {(["month", "year"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPeriod(option)}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  period === option ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {option === "month" ? "Mensal" : "Anual"}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Plano atual" value={currentPlan.name} hint={currentPlan.tagline ?? ""} />
        <StatCard
          label="Situação"
          value={SUBSCRIPTION_STATUS_LABEL[subscription.status]}
          hint={
            subscription.status === "trialing" && subscription.trial_ends_at
              ? `Teste até ${formatDate(subscription.trial_ends_at)}`
              : subscription.current_period_end
                ? `Renova em ${formatDate(subscription.current_period_end)}`
                : ""
          }
        />
        <StatCard
          label="Valor"
          value={formatCurrency(planPrice(currentPlan, subscription.period === "year" ? "year" : "month"))}
          hint={subscription.period === "year" ? "por ano" : "por mês"}
        />
      </div>

      <Card className="mt-6 border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Uso dos limites</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {LIMIT_KEYS.map((item) => {
            const limit = planLimit(currentPlan, item.key);
            const current = usage?.[item.key] ?? 0;
            const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : limit < 0 ? 0 : 100;
            return (
              <div key={item.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{item.label}</span>
                  <span className="text-muted-foreground">
                    {current} / {formatLimit(limit)}
                  </span>
                </div>
                <Progress value={pct} className="mt-1.5 h-1.5" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">Comparar planos</h2>
      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan.id;
          const price = planPrice(plan, period);
          return (
            <Card
              key={plan.id}
              className={`flex flex-col border-border/70 shadow-sm ${plan.is_highlighted ? "ring-2 ring-primary" : ""}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent ? <Badge className={SUBSCRIPTION_STATUS_TONE[subscription.status]}>Atual</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {price === 0 ? "Grátis" : formatCurrency(price)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {price === 0 ? "" : period === "year" ? " /ano" : " /mês"}
                  </span>
                </p>
                {plan.trial_days > 0 ? (
                  <p className="text-xs text-accent-foreground">{plan.trial_days} dias de teste</p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {LIMIT_KEYS.map((item) => (
                    <li key={item.key} className="flex items-center justify-between gap-2">
                      <span>{item.label}</span>
                      <span className="font-medium text-foreground">{formatLimit(planLimit(plan, item.key))}</span>
                    </li>
                  ))}
                  {FEATURE_KEYS.map((item) => (
                    <li key={item.key} className="flex items-center justify-between gap-2">
                      <span>{item.label}</span>
                      <span className="font-medium text-foreground">{formatFeature(planFeature(plan, item.key))}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.is_highlighted ? "default" : "outline"}
                  disabled={isCurrent || !manager || changePlan.isPending}
                  onClick={() => changePlan.mutate(plan)}
                >
                  {isCurrent ? (
                    <>
                      <Check className="mr-2 size-4" aria-hidden="true" /> Plano atual
                    </>
                  ) : Number(plan.price_month) > Number(currentPlan.price_month) ? (
                    <>
                      <Sparkles className="mr-2 size-4" aria-hidden="true" /> Fazer upgrade
                    </>
                  ) : (
                    "Mudar para este plano"
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 text-primary" aria-hidden="true" />
              Faturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(invoicesQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma fatura emitida. As faturas aparecem aqui após a primeira cobrança recorrente.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {(invoicesQuery.data ?? []).map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="font-medium text-foreground">{invoice.number ?? "Fatura"}</p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.paid_at
                          ? `Paga em ${formatDate(invoice.paid_at)}`
                          : invoice.due_at
                            ? `Vence em ${formatDate(invoice.due_at)}`
                            : invoice.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-foreground">{formatCurrency(Number(invoice.amount))}</span>
                      {invoice.hosted_url ? (
                        <a
                          href={invoice.hosted_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Abrir
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4 text-primary" aria-hidden="true" />
              Portal de cobrança
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Forma de pagamento, histórico e recibos ficam no portal do provedor ({subscription.provider}). Enquanto
              nenhum provedor estiver conectado, as mudanças de plano são aplicadas direto aqui.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!manager} onClick={() => cancelPlan.mutate(false)}>
                Cancelar ao fim do período
              </Button>
              <Button variant="ghost" disabled={!manager} onClick={() => cancelPlan.mutate(true)}>
                Cancelar agora
              </Button>
              <Button variant="outline" asChild>
                <a href="/planos" target="_blank" rel="noreferrer">
                  <ArrowUpRight className="mr-2 size-4" aria-hidden="true" />
                  Página pública de planos
                </a>
              </Button>
            </div>
            {subscription.cancel_at_period_end ? (
              <p className="text-destructive">
                Cancelamento agendado para {subscription.current_period_end ? formatDate(subscription.current_period_end) : "o fim do período"}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

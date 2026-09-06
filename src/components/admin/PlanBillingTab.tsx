import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { PlanInvoiceRowCard } from "@/components/admin/PlanInvoiceRowCard";
import { StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { PLAN_PERIODS, planBillingKey, planBillingTotals, type PlanPeriod } from "@/lib/planos-cobranca";
import { createPlanInvoice, listPlanInvoices } from "@/lib/planos-cobranca.functions";

interface StoreOption {
  id: string;
  name: string;
}

interface PlanOption {
  id: string;
  name: string;
  price_month: number;
  price_year: number;
}

/** Ciclo de cobrança dos planos: criar, pagar, reembolsar e trocar de plano. */
export function PlanBillingTab() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPlanInvoices);
  const createFn = useServerFn(createPlanInvoice);

  const [storeId, setStoreId] = useState("");
  const [planId, setPlanId] = useState("");
  const [period, setPeriod] = useState<PlanPeriod>("month");
  const [amount, setAmount] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const storesQuery = useQuery({
    queryKey: ["admin-stores-simple"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, name").order("name").limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as StoreOption[];
    },
  });

  const plansQuery = useQuery({
    queryKey: ["admin-plans-billing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, price_month, price_year")
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as PlanOption[];
    },
  });

  const invoicesQuery = useQuery({
    queryKey: [...planBillingKey(null), statusFilter],
    queryFn: () => listFn({ data: { storeId: null, status: statusFilter } }),
  });

  const invoices = invoicesQuery.data ?? [];
  const totals = planBillingTotals(invoices);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: planBillingKey(null) });
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!storeId || !planId) throw new Error("Escolha a loja e o plano.");
      const parsed = Number(amount.replace(",", "."));
      const result = await createFn({
        data: {
          storeId,
          planId,
          period,
          ...(amount && parsed > 0 ? { amount: parsed } : {}),
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      setAmount("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedPlan = plansQuery.data?.find((plan) => plan.id === planId);
  const suggested = selectedPlan ? (period === "year" ? selectedPlan.price_year : selectedPlan.price_month) : 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="A receber" value={formatCurrency(totals.open)} />
        <StatCard label="Recebido" value={formatCurrency(totals.paid)} />
        <StatCard label="Reembolsado" value={formatCurrency(totals.refunded)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova cobrança de plano</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="grid gap-2">
            <Label>Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder="Escolher loja" /></SelectTrigger>
              <SelectContent>
                {(storesQuery.data ?? []).map((store) => (
                  <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Plano</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Escolher plano" /></SelectTrigger>
              <SelectContent>
                {(plansQuery.data ?? []).map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Período</Label>
            <Select value={period} onValueChange={(value) => setPeriod(value as PlanPeriod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAN_PERIODS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Valor</Label>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder={suggested ? formatCurrency(suggested) : "valor do plano"}
            />
          </div>
          <div className="md:col-span-4">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Criando..." : "Criar cobrança"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Cobranças</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="open">Aguardando pagamento</SelectItem>
              <SelectItem value="paid">Pagas</SelectItem>
              <SelectItem value="refunded">Reembolsadas</SelectItem>
              <SelectItem value="void">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="grid gap-3">
          {invoicesQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobrança nesse filtro.</p>
          ) : (
            invoices.map((invoice) => (
              <PlanInvoiceRowCard key={invoice.id} invoice={invoice} onChanged={refresh} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

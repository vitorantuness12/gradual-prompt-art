import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, RotateCcw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { CHARGE_STATUS_TONE, chargeStatusLabel, chargeTotals } from "@/lib/cobrancas";
import { listStoreCharges, settleStoreCharge } from "@/lib/cobrancas.functions";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel/cobrancas")({
  component: CobrancasPage,
  head: () => ({
    meta: [
      { title: "Cobranças | O Seu Pedido" },
      {
        name: "description",
        content: "Acompanhe as transações dos pedidos digitais, confirme pagamentos e libere o acesso do cliente.",
      },
      { property: "og:title", content: "Cobranças da sua loja" },
      { property: "og:description", content: "Transações, confirmação de pagamento e liberação automática de acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PERIODS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "all", label: "Tudo" },
];

function CobrancasPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;

  const [period, setPeriod] = useState("30");
  const [status, setStatus] = useState("all");

  const queryClient = useQueryClient();
  const fetchCharges = useServerFn(listStoreCharges);
  const settle = useServerFn(settleStoreCharge);

  const from = useMemo(() => {
    if (period === "all") return null;
    const days = Number(period);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }, [period]);

  const chargesQuery = useQuery({
    queryKey: ["cobrancas", storeId, period, status],
    enabled: Boolean(storeId),
    queryFn: () => fetchCharges({ data: { storeId: storeId!, from, status } }),
  });

  const settleMutation = useMutation({
    mutationFn: (input: { paymentId: string; status: "paid" | "failed" | "refunded" }) =>
      settle({ data: { storeId: storeId!, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["cobrancas", storeId] });
    },
    onError: () => toast.error("Não foi possível atualizar a cobrança."),
  });

  if (!storeId) return <Skeleton className="h-64 rounded-2xl" />;

  const charges = chargesQuery.data ?? [];
  const totals = chargeTotals(charges);

  return (
    <div>
      <PageHeader
        title="Cobranças"
        description="Cada pedido digital gera uma transação aqui. Ao confirmar o pagamento, o acesso do cliente é liberado automaticamente."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Transações" value={String(totals.count)} />
        <StatCard label="Recebido" value={formatCurrency(totals.paid)} />
        <StatCard label="A receber" value={formatCurrency(totals.pending)} />
        <StatCard label="Reembolsado" value={formatCurrency(totals.refunded)} />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle className="text-base">Transações</CardTitle>
            <CardDescription>Confirme, recuse ou reembolse cada cobrança.</CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-lg">
            <div className="grid gap-1.5">
              <Label>Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Situação</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pending">Aguardando pagamento</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                  <SelectItem value="failed">Não aprovadas</SelectItem>
                  <SelectItem value="refunded">Reembolsadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chargesQuery.isLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : charges.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobrança neste período.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {charges.map((charge) => (
                <li key={charge.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {charge.orderCode ? `#${charge.orderCode}` : "Sem pedido"}
                      </span>
                      <Badge variant={CHARGE_STATUS_TONE[charge.status] ?? "secondary"}>
                        {chargeStatusLabel(charge.status)}
                      </Badge>
                      {charge.isDemo ? <Badge variant="outline">Teste</Badge> : null}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {charge.customerName ?? "Cliente"}
                      {charge.customerEmail ? ` · ${charge.customerEmail}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(charge.createdAt)}
                      {charge.paidAt ? ` · pago em ${formatDateTime(charge.paidAt)}` : ""}
                      {charge.method ? ` · ${charge.method}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(charge.amount)}</span>
                    {charge.status !== "paid" ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => settleMutation.mutate({ paymentId: charge.id, status: "paid" })}
                        disabled={settleMutation.isPending}
                      >
                        <BadgeCheck className="mr-2 h-4 w-4" />
                        Confirmar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => settleMutation.mutate({ paymentId: charge.id, status: "refunded" })}
                        disabled={settleMutation.isPending}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reembolsar
                      </Button>
                    )}
                    {charge.status === "pending" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => settleMutation.mutate({ paymentId: charge.id, status: "failed" })}
                        disabled={settleMutation.isPending}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Recusar
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

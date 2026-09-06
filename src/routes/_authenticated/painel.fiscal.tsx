import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { FiscalInvoicesTable } from "@/components/fiscal/FiscalInvoicesTable";
import { FiscalIssueCard } from "@/components/fiscal/FiscalIssueCard";
import { FiscalSettingsCard } from "@/components/fiscal/FiscalSettingsCard";
import { PageHeader } from "@/components/painel/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveStore } from "@/hooks/useMyStores";
import { fiscalConfigKey, fiscalInvoicesKey, fiscalOrdersKey } from "@/lib/fiscal";
import { getFiscalConfig, listFiscalInvoices, listFiscalOrders } from "@/lib/fiscal.functions";

export const Route = createFileRoute("/_authenticated/painel/fiscal")({
  component: FiscalPage,
});

function FiscalPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;

  const config = useQuery({
    queryKey: fiscalConfigKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => getFiscalConfig({ data: { storeId: storeId! } }),
  });

  const invoices = useQuery({
    queryKey: fiscalInvoicesKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => listFiscalInvoices({ data: { storeId: storeId! } }),
  });

  const orders = useQuery({
    queryKey: fiscalOrdersKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => listFiscalOrders({ data: { storeId: storeId! } }),
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Nota fiscal"
        description="Conecte um emissor e transforme pedidos pagos em nota de serviço."
      />

      {!storeId ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Selecione uma loja para continuar.</CardContent></Card>
      ) : config.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : config.error ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            {config.error instanceof Error ? config.error.message : "Não foi possível carregar a configuração."}
          </CardContent>
        </Card>
      ) : config.data ? (
        <>
          <FiscalSettingsCard storeId={storeId} config={config.data} />
          <FiscalIssueCard storeId={storeId} orders={orders.data ?? []} />
          <FiscalInvoicesTable storeId={storeId} invoices={invoices.data ?? []} />
        </>
      ) : null}
    </div>
  );
}

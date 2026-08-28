import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo } from "react";

import { EmptyState, StatCard } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import {
  BATCH_STATUS_LABEL,
  EXPIRY_WARNING_DAYS,
  batchLossesKey,
  batchStatus,
  batchesAtRisk,
  batchesKey,
  daysUntilExpiry,
  fetchBatchLosses,
  fetchBatches,
  summarizeBatches,
} from "@/lib/lotes";
import { downloadCsv, printReport, type CsvRow } from "@/lib/relatorios";

/**
 * Relatório de lotes em risco (vencidos e vencendo) com o valor parado
 * e o histórico de perdas por descarte, exportável em CSV ou PDF.
 */
export function BatchRiskReport({ storeId }: { storeId: string | undefined }) {
  const batchesQuery = useQuery({
    queryKey: batchesKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchBatches(storeId!),
  });

  const lossesQuery = useQuery({
    queryKey: batchLossesKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchBatchLosses(storeId!),
  });

  const productsQuery = useQuery({
    queryKey: ["relatorio-lotes-produtos", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name").eq("store_id", storeId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const batches = batchesQuery.data ?? [];
  const losses = lossesQuery.data ?? [];
  const productName = (id: string) =>
    productsQuery.data?.find((product) => product.id === id)?.name ?? "Item removido";

  const risky = useMemo(() => batchesAtRisk(batches), [batches]);
  const summary = useMemo(() => summarizeBatches(batches), [batches]);
  const lossValue = useMemo(
    () =>
      losses.reduce((total, loss) => {
        const batch = batches.find((item) => item.id === loss.batch_id);
        return total + loss.quantity * Number(batch?.unit_cost ?? 0);
      }, 0),
    [losses, batches],
  );

  const exportRisk = () => {
    const rows: CsvRow[] = risky.map((batch) => ({
      item: productName(batch.product_id),
      lote: batch.batch_code || "sem código",
      validade: batch.expires_at ?? "",
      dias: daysUntilExpiry(batch.expires_at) ?? "",
      situacao: BATCH_STATUS_LABEL[batchStatus(batch)],
      quantidade: Number(batch.quantity ?? 0),
      custo_unitario: Number(batch.unit_cost ?? 0),
      valor_em_risco: Number(batch.quantity ?? 0) * Number(batch.unit_cost ?? 0),
    }));
    downloadCsv("lotes-em-risco", rows);
  };

  const exportLosses = () => {
    const rows: CsvRow[] = losses.map((loss) => {
      const batch = batches.find((item) => item.id === loss.batch_id);
      return {
        data: new Date(loss.created_at).toLocaleString("pt-BR"),
        item: productName(loss.product_id),
        lote: batch?.batch_code || "sem código",
        quantidade: loss.quantity,
        valor: loss.quantity * Number(batch?.unit_cost ?? 0),
        motivo: loss.reason ?? "",
      };
    });
    downloadCsv("perdas-por-descarte", rows);
  };

  return (
    <div id="relatorio-lotes" className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={exportRisk} disabled={risky.length === 0}>
          <Download className="mr-2 size-4" aria-hidden="true" /> Lotes em risco (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={exportLosses} disabled={losses.length === 0}>
          <Download className="mr-2 size-4" aria-hidden="true" /> Perdas (CSV)
        </Button>
        <Button variant="outline" size="sm" onClick={() => printReport()}>
          Exportar PDF
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lotes vencidos" value={String(summary.expired)} />
        <StatCard label="Vencendo" value={String(summary.expiring)} hint={`Próximos ${EXPIRY_WARNING_DAYS} dias`} />
        <StatCard label="Valor em risco" value={formatCurrency(summary.valueAtRisk)} />
        <StatCard label="Perdas por descarte" value={formatCurrency(lossValue)} hint="Últimos 90 dias" />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Lotes em risco</CardTitle>
          <CardDescription>Vencidos e com vencimento nos próximos {EXPIRY_WARNING_DAYS} dias.</CardDescription>
        </CardHeader>
        <CardContent>
          {risky.length === 0 ? (
            <EmptyState title="Nenhum lote em risco" description="Todos os lotes estão dentro da validade." />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Lotes vencidos ou perto do vencimento</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">Item</th>
                  <th scope="col" className="py-2 font-medium">Lote</th>
                  <th scope="col" className="py-2 font-medium">Situação</th>
                  <th scope="col" className="py-2 text-right font-medium">Qtd.</th>
                  <th scope="col" className="py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {risky.map((batch) => {
                  const status = batchStatus(batch);
                  const days = daysUntilExpiry(batch.expires_at);
                  return (
                    <tr key={batch.id} className="border-t border-border">
                      <td className="py-2">{productName(batch.product_id)}</td>
                      <td className="py-2 text-muted-foreground">{batch.batch_code || "sem código"}</td>
                      <td className="py-2">
                        <Badge variant={status === "vencido" ? "destructive" : "secondary"}>
                          {BATCH_STATUS_LABEL[status]}
                          {days !== null ? ` · ${days < 0 ? `${Math.abs(days)}d atrás` : `${days}d`}` : ""}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">{Number(batch.quantity ?? 0)}</td>
                      <td className="py-2 text-right">
                        {formatCurrency(Number(batch.quantity ?? 0) * Number(batch.unit_cost ?? 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Histórico de perdas por descarte</CardTitle>
          <CardDescription>Baixas registradas como perda no estoque nos últimos 90 dias.</CardDescription>
        </CardHeader>
        <CardContent>
          {losses.length === 0 ? (
            <EmptyState title="Nenhuma perda registrada" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {losses.map((loss) => {
                const batch = batches.find((item) => item.id === loss.batch_id);
                return (
                  <li key={loss.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium text-foreground">{productName(loss.product_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(loss.created_at).toLocaleString("pt-BR")} · {loss.reason ?? "Perda"}
                      </p>
                    </div>
                    <span className="text-muted-foreground">
                      {loss.quantity} un. · {formatCurrency(loss.quantity * Number(batch?.unit_cost ?? 0))}
                    </span>
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

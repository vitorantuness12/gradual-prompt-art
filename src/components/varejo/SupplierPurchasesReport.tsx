import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";

import { EmptyState } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { RetailData } from "@/lib/varejo";

interface SupplierPurchasesReportProps {
  storeId: string;
  data: RetailData;
}

interface SupplierSummary {
  supplierId: string;
  name: string;
  entries: number;
  items: number;
  quantity: number;
  total: number;
  lastPurchase: string | null;
}

const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

/**
 * Relatório de compras agrupado por fornecedor, considerando apenas notas já
 * lançadas no estoque (status `applied`) dentro do período escolhido.
 */
export function SupplierPurchasesReport({ storeId, data }: SupplierPurchasesReportProps) {
  const [from, setFrom] = useState(() => isoDaysAgo(90));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const supplierNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const supplier of data.suppliers) map.set(supplier.id, supplier.name);
    return map;
  }, [data.suppliers]);

  const report = useQuery({
    queryKey: ["compras-fornecedor", storeId, from, to],
    queryFn: async (): Promise<SupplierSummary[]> => {
      const { data: entries, error } = await supabase
        .from("stock_entries")
        .select("id, supplier_id, total, issued_at, status")
        .eq("store_id", storeId)
        .eq("status", "applied")
        .gte("issued_at", from)
        .lte("issued_at", to);
      if (error) throw error;

      const rows = entries ?? [];
      if (rows.length === 0) return [];

      const { data: items, error: itemsError } = await supabase
        .from("stock_entry_items")
        .select("entry_id, quantity")
        .in(
          "entry_id",
          rows.map((row) => row.id),
        );
      if (itemsError) throw itemsError;

      const byEntry = new Map<string, { items: number; quantity: number }>();
      for (const item of items ?? []) {
        const current = byEntry.get(item.entry_id) ?? { items: 0, quantity: 0 };
        byEntry.set(item.entry_id, {
          items: current.items + 1,
          quantity: current.quantity + Number(item.quantity ?? 0),
        });
      }

      const summaries = new Map<string, SupplierSummary>();
      for (const row of rows) {
        const key = row.supplier_id ?? "sem-fornecedor";
        const current =
          summaries.get(key) ??
          ({
            supplierId: key,
            name: row.supplier_id
              ? (supplierNames.get(row.supplier_id) ?? "Fornecedor removido")
              : "Sem fornecedor informado",
            entries: 0,
            items: 0,
            quantity: 0,
            total: 0,
            lastPurchase: null,
          } satisfies SupplierSummary);
        const detail = byEntry.get(row.id) ?? { items: 0, quantity: 0 };
        summaries.set(key, {
          ...current,
          entries: current.entries + 1,
          items: current.items + detail.items,
          quantity: current.quantity + detail.quantity,
          total: current.total + Number(row.total ?? 0),
          lastPurchase:
            !current.lastPurchase || String(row.issued_at) > current.lastPurchase
              ? String(row.issued_at)
              : current.lastPurchase,
        });
      }

      return [...summaries.values()].sort((a, b) => b.total - a.total);
    },
  });

  const grandTotal = useMemo(
    () => (report.data ?? []).reduce((sum, row) => sum + row.total, 0),
    [report.data],
  );

  const exportCsv = () => {
    const rows = report.data ?? [];
    if (rows.length === 0) return;
    const header = ["Fornecedor", "Notas", "Itens", "Quantidade", "Total", "Última compra"];
    const body = rows.map((row) => [
      row.name.replace(/;/g, ","),
      String(row.entries),
      String(row.items),
      String(row.quantity),
      row.total.toFixed(2).replace(".", ","),
      row.lastPurchase ? formatDate(row.lastPurchase) : "-",
    ]);
    const csv = [header, ...body].map((line) => line.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `compras-por-fornecedor-${from}-a-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="size-4 text-primary" /> Compras por fornecedor
        </CardTitle>
        <CardDescription>
          Quanto você comprou de cada fornecedor no período, com quantidade de notas, itens e a
          data da última compra. Só entram notas já lançadas no estoque.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="compras-de">De</Label>
            <Input
              id="compras-de"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compras-ate">Até</Label>
            <Input
              id="compras-ate"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={exportCsv}
              disabled={!report.data?.length}
            >
              Baixar planilha
            </Button>
          </div>
        </div>

        {report.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !report.data?.length ? (
          <EmptyState
            title="Nenhuma compra no período"
            description="Lance uma nota de entrada e confirme para ela aparecer aqui."
          />
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fornecedor</th>
                    <th className="px-3 py-2 text-right font-medium">Notas</th>
                    <th className="px-3 py-2 text-right font-medium">Itens</th>
                    <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.map((row) => (
                    <tr key={row.supplierId} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
                      <td className="px-3 py-2 text-right">{row.entries}</td>
                      <td className="px-3 py-2 text-right">{row.items}</td>
                      <td className="px-3 py-2 text-right">
                        {row.quantity.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCurrency(row.total)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {row.lastPurchase ? formatDate(row.lastPurchase) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              Total comprado no período: <strong>{formatCurrency(grandTotal)}</strong>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

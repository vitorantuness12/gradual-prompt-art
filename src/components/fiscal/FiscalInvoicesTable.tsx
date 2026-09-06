import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FISCAL_PROVIDER_LABEL,
  FISCAL_STATUS_LABEL,
  FISCAL_STATUS_TONE,
  fiscalInvoicesKey,
  type FiscalInvoiceRow,
} from "@/lib/fiscal";
import { refreshFiscalInvoice } from "@/lib/fiscal.functions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FiscalInvoicesTableProps {
  storeId: string;
  invoices: FiscalInvoiceRow[];
}

/** Histórico de notas com situação, link do documento e nova consulta. */
export function FiscalInvoicesTable({ storeId, invoices }: FiscalInvoicesTableProps) {
  const queryClient = useQueryClient();

  const refresh = useMutation({
    mutationFn: async (invoiceId: string) => {
      const result = await refreshFiscalInvoice({ data: { storeId, invoiceId } });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: async (message) => {
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: fiscalInvoicesKey(storeId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notas emitidas</CardTitle>
        <CardDescription>Últimas 200 notas desta loja.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma nota registrada ainda.</p>
        ) : (
          invoices.map((invoice) => (
            <div key={invoice.id} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {invoice.number ? `Nota ${invoice.number}` : "Nota sem número"}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", FISCAL_STATUS_TONE[invoice.status] ?? "bg-muted")}>
                    {FISCAL_STATUS_LABEL[invoice.status] ?? invoice.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {FISCAL_PROVIDER_LABEL[invoice.provider ?? "manual"] ?? invoice.provider}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(invoice.created_at).toLocaleString("pt-BR")} · {formatCurrency(Number(invoice.amount ?? 0))}
                  {invoice.customer_name ? ` · ${invoice.customer_name}` : ""}
                </p>
                {invoice.error_message && <p className="text-xs text-destructive">{invoice.error_message}</p>}
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {invoice.pdf_url && (
                  <Button asChild variant="outline" size="sm">
                    <a href={invoice.pdf_url} target="_blank" rel="noreferrer">PDF</a>
                  </Button>
                )}
                {invoice.xml_url && (
                  <Button asChild variant="ghost" size="sm">
                    <a href={invoice.xml_url} target="_blank" rel="noreferrer">XML</a>
                  </Button>
                )}
                {invoice.external_id && invoice.status !== "issued" && (
                  <Button variant="outline" size="sm" onClick={() => refresh.mutate(invoice.id)} disabled={refresh.isPending}>
                    Consultar
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

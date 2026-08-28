import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerFinance, type Appointment } from "@/lib/agenda";
import { formatCurrency } from "@/lib/format";
import { downloadCsv, printReport, type CsvRow } from "@/lib/relatorios";

const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Histórico financeiro por cliente: sinal, cancelamentos, estornos e repasses. */
export function FinanceTab({ appointments }: { appointments: Appointment[] }) {
  const [from, setFrom] = useState(iso(firstDay));
  const [to, setTo] = useState(iso(today));

  const rows = useMemo(
    () => customerFinance(appointments, new Date(`${from}T00:00:00`), new Date(`${to}T23:59:59`)),
    [appointments, from, to],
  );

  const totals = rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      deposits: acc.deposits + row.depositsPaid,
      charged: acc.charged + row.charged,
      refunded: acc.refunded + row.refunded,
      pending: acc.pending + row.pendingPayout,
    }),
    { revenue: 0, deposits: 0, charged: 0, refunded: 0, pending: 0 },
  );

  const exportCsv = () => {
    const csv: CsvRow[] = rows.map((row) => ({
      cliente: row.customer,
      telefone: row.phone,
      atendimentos: row.services,
      cancelamentos: row.cancellations,
      faltas: row.noShows,
      faturamento: row.revenue,
      sinal_pago: row.depositsPaid,
      cobrado: row.charged,
      estornado: row.refunded,
      repasse_pendente: row.pendingPayout,
      ultima_visita: row.lastVisit ? new Date(row.lastVisit).toLocaleDateString("pt-BR") : "",
    }));
    downloadCsv(`financeiro-clientes-${from}-a-${to}`, csv);
  };

  return (
    <div id="relatorio-financeiro-clientes" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="fin-from">De</Label>
          <Input id="fin-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="fin-to">Até</Label>
          <Input id="fin-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 size-4" aria-hidden="true" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => printReport()}>
          Exportar PDF
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Faturamento" value={formatCurrency(totals.revenue)} />
        <StatCard label="Sinais pagos" value={formatCurrency(totals.deposits)} />
        <StatCard label="Cobrado em cancelamento" value={formatCurrency(totals.charged)} />
        <StatCard label="Estornado" value={formatCurrency(totals.refunded)} />
        <StatCard label="Repasse pendente" value={formatCurrency(totals.pending)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico por cliente</CardTitle>
          <CardDescription>Pagamentos de sinal, cancelamentos, estornos e repasses do período.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <EmptyState title="Sem movimentação" description="Nenhum horário no período selecionado." />
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Histórico financeiro por cliente</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">Cliente</th>
                  <th scope="col" className="py-2 text-right font-medium">Atend.</th>
                  <th scope="col" className="py-2 text-right font-medium">Cancel.</th>
                  <th scope="col" className="py-2 text-right font-medium">Faltas</th>
                  <th scope="col" className="py-2 text-right font-medium">Faturamento</th>
                  <th scope="col" className="py-2 text-right font-medium">Sinal pago</th>
                  <th scope="col" className="py-2 text-right font-medium">Cobrado</th>
                  <th scope="col" className="py-2 text-right font-medium">Estornado</th>
                  <th scope="col" className="py-2 text-right font-medium">Repasse pend.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="py-2">
                      <span className="font-medium text-foreground">{row.customer}</span>
                      {row.phone ? <span className="block text-xs text-muted-foreground">{row.phone}</span> : null}
                    </td>
                    <td className="py-2 text-right">{row.services}</td>
                    <td className="py-2 text-right">{row.cancellations}</td>
                    <td className="py-2 text-right">{row.noShows}</td>
                    <td className="py-2 text-right">{formatCurrency(row.revenue)}</td>
                    <td className="py-2 text-right">{formatCurrency(row.depositsPaid)}</td>
                    <td className="py-2 text-right">{formatCurrency(row.charged)}</td>
                    <td className="py-2 text-right">{formatCurrency(row.refunded)}</td>
                    <td className="py-2 text-right">{formatCurrency(row.pendingPayout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

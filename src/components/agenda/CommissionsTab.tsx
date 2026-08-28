import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  closePayout,
  commissionDetails,
  commissionReport,
  fetchProfessionals,
  professionalsKey,
  updateCommissionRate,
  type Appointment,
} from "@/lib/agenda";
import { formatCurrency } from "@/lib/format";
import { downloadCsv, printReport, type CsvRow } from "@/lib/relatorios";


const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Comissão por profissional e fechamento de repasse do período. */
export function CommissionsTab({ storeId, appointments }: { storeId: string; appointments: Appointment[] }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(iso(firstDay));
  const [to, setTo] = useState(iso(today));

  const professionals = useQuery({
    queryKey: professionalsKey(storeId),
    queryFn: () => fetchProfessionals(storeId),
  });

  const saveRate = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) => updateCommissionRate(id, rate),
    onSuccess: async () => {
      toast.success("Comissão atualizada.");
      await queryClient.invalidateQueries({ queryKey: professionalsKey(storeId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(
    () =>
      commissionReport(
        appointments,
        professionals.data ?? [],
        new Date(`${from}T00:00:00`),
        new Date(`${to}T23:59:59`),
      ),
    [appointments, professionals.data, from, to],
  );

  const details = useMemo(
    () =>
      commissionDetails(
        appointments,
        professionals.data ?? [],
        new Date(`${from}T00:00:00`),
        new Date(`${to}T23:59:59`),
      ),
    [appointments, professionals.data, from, to],
  );

  const totals = rows.reduce(
    (acc, row) => ({ revenue: acc.revenue + row.revenue, commission: acc.commission + row.commission }),
    { revenue: 0, commission: 0 },
  );

  const exportCsv = () => {
    const csv: CsvRow[] = rows.map((row) => ({
      profissional: row.name,
      atendimentos: row.services,
      faturamento: row.revenue,
      percentual: row.rate,
      comissao: row.commission,
    }));
    downloadCsv(`comissoes-${from}-a-${to}`, csv);
  };

  const exportDetailCsv = () => {
    const csv: CsvRow[] = details.map((row) => ({
      data: new Date(row.date).toLocaleString("pt-BR"),
      cliente: row.customer,
      profissional: row.professionalName,
      situacao: row.status,
      valor: row.price,
      taxa_percentual: row.rate,
      comissao: row.commission,
      sinal: row.deposit,
      sinal_situacao: row.depositStatus,
      cobrado: row.charged,
      estornado: row.refunded,
      motivo_perda: row.lossReason,
      repasse: row.payoutStatus,
    }));
    downloadCsv(`comissoes-detalhado-${from}-a-${to}`, csv);
  };

  const closePeriod = useMutation({
    mutationFn: async () => {
      await closePayout(storeId, from, to);
      const { error } = await supabase.from("notifications").insert({
        store_id: storeId,
        event: "commission_closed",
        title: "Fechamento de repasse",
        body: `Período ${from} a ${to}: ${formatCurrency(totals.commission)} em comissões para ${rows.length} profissional(is).`,
        payload: { from, to, total: totals.commission } as never,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Repasse fechado e registrado na central de notificações.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", storeId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (professionals.isLoading) return <Skeleton className="h-48 rounded-2xl" />;

  return (
    <div id="relatorio-comissoes" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="from">De</Label>
          <Input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="to">Até</Label>
          <Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 size-4" aria-hidden="true" /> CSV resumo
        </Button>
        <Button variant="outline" size="sm" onClick={exportDetailCsv} disabled={details.length === 0}>
          <Download className="mr-2 size-4" aria-hidden="true" /> CSV detalhado
        </Button>
        <Button variant="outline" size="sm" onClick={() => printReport()}>
          Exportar PDF
        </Button>
        <Button size="sm" onClick={() => closePeriod.mutate()} disabled={rows.length === 0 || closePeriod.isPending}>
          Fechar repasse
        </Button>
      </div>



      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Atendimentos" value={String(rows.reduce((total, row) => total + row.services, 0))} />
        <StatCard label="Faturamento em serviços" value={formatCurrency(totals.revenue)} />
        <StatCard label="Total de comissões" value={formatCurrency(totals.commission)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Repasse por profissional</CardTitle>
          <CardDescription>Considera apenas atendimentos concluídos no período.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="Sem atendimentos concluídos" description="Marque os horários como concluídos para gerar o repasse." />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Comissões por profissional no período</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">Profissional</th>
                  <th scope="col" className="py-2 text-right font-medium">Atend.</th>
                  <th scope="col" className="py-2 text-right font-medium">Faturamento</th>
                  <th scope="col" className="py-2 text-right font-medium">%</th>
                  <th scope="col" className="py-2 text-right font-medium">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.professionalId} className="border-t border-border">
                    <td className="py-2">{row.name}</td>
                    <td className="py-2 text-right">{row.services}</td>
                    <td className="py-2 text-right">{formatCurrency(row.revenue)}</td>
                    <td className="py-2 text-right">{row.rate}%</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(row.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhe por agendamento</CardTitle>
          <CardDescription>
            Taxa aplicada, sinal pago, valores cobrados/estornados e motivo de perda em cancelamentos e faltas.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {details.length === 0 ? (
            <EmptyState title="Sem movimentos no período" description="Ajuste as datas para ver os atendimentos." />
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">Comissão detalhada por agendamento</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">Data</th>
                  <th scope="col" className="py-2 font-medium">Cliente</th>
                  <th scope="col" className="py-2 font-medium">Profissional</th>
                  <th scope="col" className="py-2 font-medium">Situação</th>
                  <th scope="col" className="py-2 text-right font-medium">Valor</th>
                  <th scope="col" className="py-2 text-right font-medium">Taxa</th>
                  <th scope="col" className="py-2 text-right font-medium">Comissão</th>
                  <th scope="col" className="py-2 text-right font-medium">Sinal</th>
                  <th scope="col" className="py-2 text-right font-medium">Cobrado</th>
                  <th scope="col" className="py-2 text-right font-medium">Estornado</th>
                  <th scope="col" className="py-2 font-medium">Motivo</th>
                  <th scope="col" className="py-2 font-medium">Repasse</th>
                </tr>
              </thead>
              <tbody>
                {details.map((row) => (
                  <tr key={row.appointmentId} className="border-t border-border">
                    <td className="py-2 whitespace-nowrap">{new Date(row.date).toLocaleString("pt-BR")}</td>
                    <td className="py-2">{row.customer}</td>
                    <td className="py-2">{row.professionalName}</td>
                    <td className="py-2">{row.status}</td>
                    <td className="py-2 text-right">{formatCurrency(row.price)}</td>
                    <td className="py-2 text-right">{row.rate}%</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(row.commission)}</td>
                    <td className="py-2 text-right">{formatCurrency(row.deposit)}</td>
                    <td className="py-2 text-right">{formatCurrency(row.charged)}</td>
                    <td className="py-2 text-right">{formatCurrency(row.refunded)}</td>
                    <td className="py-2 text-muted-foreground">{row.lossReason || "—"}</td>
                    <td className="py-2">{row.payoutStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>



      <Card>
        <CardHeader>
          <CardTitle className="text-base">Percentual de comissão</CardTitle>
          <CardDescription>Valor padrão aplicado aos atendimentos de cada profissional.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(professionals.data ?? []).map((professional) => (
            <div key={professional.id}>
              <Label htmlFor={`rate-${professional.id}`}>{professional.name}</Label>
              <div className="flex gap-2">
                <Input
                  id={`rate-${professional.id}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  defaultValue={Number(professional.commission_rate ?? 0)}
                  onBlur={(event) =>
                    saveRate.mutate({ id: professional.id, rate: Number(event.target.value) || 0 })
                  }
                />
                <span className="self-center text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

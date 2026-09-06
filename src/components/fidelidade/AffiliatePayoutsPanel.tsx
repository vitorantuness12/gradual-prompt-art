import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatCurrency, formatDate } from "@/lib/format";

type AffiliateRow = Database["public"]["Tables"]["store_affiliates"]["Row"];
type PayoutRow = Database["public"]["Tables"]["affiliate_payouts"]["Row"];

export const PAYOUT_METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  money: "Dinheiro",
  transfer: "Transferência",
  credit: "Crédito na loja",
  other: "Outro",
};

interface Props {
  storeId: string;
  affiliates: AffiliateRow[];
  /** Comissão acumulada por código de indicação (já calculada sobre as vendas). */
  earnedByCode: Map<string, number>;
}

/** Controle de pagamento de comissões: quanto cada indicador já recebeu e o saldo em aberto. */
export function AffiliatePayoutsPanel({ storeId, affiliates, earnedByCode }: Props) {
  const queryClient = useQueryClient();
  const [affiliateId, setAffiliateId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("pix");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));

  const payouts = useQuery({
    queryKey: ["afiliados-pagamentos", storeId],
    queryFn: async (): Promise<PayoutRow[]> => {
      const { data, error } = await supabase
        .from("affiliate_payouts")
        .select("*")
        .eq("store_id", storeId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const paidByAffiliate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of payouts.data ?? []) {
      map.set(row.affiliate_id, (map.get(row.affiliate_id) ?? 0) + Number(row.amount ?? 0));
    }
    return map;
  }, [payouts.data]);

  const rows = useMemo(
    () =>
      affiliates.map((affiliate) => {
        const earned = earnedByCode.get(affiliate.code.toUpperCase()) ?? 0;
        const paid = paidByAffiliate.get(affiliate.id) ?? 0;
        return { affiliate, earned, paid, balance: Math.max(earned - paid, 0) };
      }),
    [affiliates, earnedByCode, paidByAffiliate],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          earned: acc.earned + row.earned,
          paid: acc.paid + row.paid,
          balance: acc.balance + row.balance,
        }),
        { earned: 0, paid: 0, balance: 0 },
      ),
    [rows],
  );

  const affiliateName = (id: string) =>
    affiliates.find((affiliate) => affiliate.id === id)?.name ?? "Indicador removido";

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["afiliados-pagamentos", storeId] });

  const register = useMutation({
    mutationFn: async () => {
      const value = Number(amount.replace(",", "."));
      if (!affiliateId) throw new Error("Escolha o indicador que recebeu o pagamento.");
      if (!Number.isFinite(value) || value <= 0) throw new Error("Informe um valor maior que zero.");
      const { error } = await supabase.from("affiliate_payouts").insert({
        store_id: storeId,
        affiliate_id: affiliateId,
        amount: value,
        method,
        reference: reference.trim() || null,
        paid_at: new Date(`${paidAt}T12:00:00`).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Pagamento registrado.");
      setAmount("");
      setReference("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("affiliate_payouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Pagamento removido.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    register.mutate();
  };

  if (affiliates.length === 0) return null;

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HandCoins className="size-4 text-primary" /> Pagamento de comissões
        </CardTitle>
        <CardDescription>
          Veja quanto cada indicador já ganhou, quanto você já pagou e o que ainda está em aberto.
          Registre cada pagamento para manter o histórico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Indicador</th>
                <th className="px-3 py-2 text-right font-medium">Comissão gerada</th>
                <th className="px-3 py-2 text-right font-medium">Já pago</th>
                <th className="px-3 py-2 text-right font-medium">Em aberto</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.affiliate.id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {row.affiliate.name}
                    <span className="ml-2 text-xs text-muted-foreground">{row.affiliate.code}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.earned)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.paid)}</td>
                  <td className="px-3 py-2 text-right">
                    {row.balance > 0 ? (
                      <Badge variant="secondary">{formatCurrency(row.balance)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Em dia</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAffiliateId(row.affiliate.id);
                        setAmount(row.balance.toFixed(2));
                      }}
                    >
                      Pagar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm text-muted-foreground">
          Total gerado {formatCurrency(totals.earned)} · pago {formatCurrency(totals.paid)} · em
          aberto <strong>{formatCurrency(totals.balance)}</strong>
        </p>

        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="pagamento-indicador">Indicador</Label>
            <Select value={affiliateId} onValueChange={setAffiliateId}>
              <SelectTrigger id="pagamento-indicador">
                <SelectValue placeholder="Escolha quem recebeu" />
              </SelectTrigger>
              <SelectContent>
                {affiliates.map((affiliate) => (
                  <SelectItem key={affiliate.id} value={affiliate.id}>
                    {affiliate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pagamento-valor">Valor pago</Label>
            <Input
              id="pagamento-valor"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pagamento-forma">Forma</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pagamento-forma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYOUT_METHOD_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pagamento-data">Data</Label>
            <Input
              id="pagamento-data"
              type="date"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pagamento-referencia">Comprovante ou observação (opcional)</Label>
            <Input
              id="pagamento-referencia"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Ex.: Pix enviado às 14h"
            />
          </div>
          <Button type="submit" className="sm:col-span-2" disabled={register.isPending}>
            {register.isPending ? "Registrando..." : "Registrar pagamento"}
          </Button>
        </form>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Últimos pagamentos</p>
          {payouts.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !payouts.data?.length ? (
            <EmptyState
              title="Nenhum pagamento registrado"
              description="Assim que você pagar a comissão de alguém, registre aqui para acompanhar o histórico."
            />
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
              {payouts.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="text-sm">
                    <p className="font-medium text-foreground">
                      {affiliateName(row.affiliate_id)} · {formatCurrency(Number(row.amount ?? 0))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.paid_at)} ·{" "}
                      {PAYOUT_METHOD_LABEL[row.method] ?? row.method}
                      {row.reference ? ` · ${row.reference}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    aria-label="Remover pagamento"
                    onClick={() => remove.mutate(row.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

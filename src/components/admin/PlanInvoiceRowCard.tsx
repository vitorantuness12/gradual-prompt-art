import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import {
  PLAN_INVOICE_STATUS_LABEL,
  PLAN_INVOICE_STATUS_TONE,
  PLAN_PAYMENT_METHODS,
  validatePlanRefund,
  type PlanInvoiceView,
} from "@/lib/planos-cobranca";
import { payPlanInvoice, refundPlanInvoice, voidPlanInvoice } from "@/lib/planos-cobranca.functions";

export interface PlanInvoiceRowCardProps {
  invoice: PlanInvoiceView;
  onChanged: () => void;
}

/** Uma cobrança de plano com as ações de pagar, cancelar e reembolsar. */
export function PlanInvoiceRowCard({ invoice, onChanged }: PlanInvoiceRowCardProps) {
  const payFn = useServerFn(payPlanInvoice);
  const voidFn = useServerFn(voidPlanInvoice);
  const refundFn = useServerFn(refundPlanInvoice);

  const [method, setMethod] = useState("pix");
  const [refundValue, setRefundValue] = useState("");
  const available = Math.max(0, invoice.amount - invoice.refundedAmount);

  const pay = useMutation({
    mutationFn: async () => {
      const result = await payFn({ data: { invoiceId: invoice.id, method } });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const result = await voidFn({ data: { invoiceId: invoice.id, reason: "Cancelada pela administração" } });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const refund = useMutation({
    mutationFn: async () => {
      const raw = Number((refundValue || String(available)).replace(",", "."));
      const check = validatePlanRefund(invoice, raw);
      if (!check.ok) throw new Error(check.message);
      const result = await refundFn({
        data: { invoiceId: invoice.id, amount: check.amount, cancelSubscription: check.amount >= available },
      });
      if (!result.ok) throw new Error(result.message);
      return result.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      setRefundValue("");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{invoice.storeName ?? "Loja removida"}</span>
        <Badge variant={PLAN_INVOICE_STATUS_TONE[invoice.status] ?? "secondary"}>
          {PLAN_INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
        </Badge>
        <span className="text-sm text-foreground">{formatCurrency(invoice.amount)}</span>
        {invoice.refundedAmount > 0 && (
          <span className="text-xs text-muted-foreground">
            reembolsado {formatCurrency(invoice.refundedAmount)}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {invoice.planName ?? "Sem plano"} · nº {invoice.number ?? "—"} ·{" "}
        {new Date(invoice.createdAt).toLocaleDateString("pt-BR")}
        {invoice.paidAt ? ` · pago em ${new Date(invoice.paidAt).toLocaleDateString("pt-BR")}` : ""}
      </p>

      {invoice.status === "open" && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLAN_PAYMENT_METHODS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => pay.mutate()} disabled={pay.isPending}>
            Confirmar pagamento
          </Button>
          <Button size="sm" variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancelar
          </Button>
        </div>
      )}

      {invoice.status === "paid" && available > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-32"
            value={refundValue}
            onChange={(event) => setRefundValue(event.target.value)}
            inputMode="decimal"
            placeholder={formatCurrency(available)}
          />
          <Button size="sm" variant="destructive" onClick={() => refund.mutate()} disabled={refund.isPending}>
            {refund.isPending ? "Reembolsando..." : "Reembolsar"}
          </Button>
          <span className="text-xs text-muted-foreground">Em branco reembolsa tudo e cancela o plano.</span>
        </div>
      )}
    </div>
  );
}

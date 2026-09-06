import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  REFUND_KIND_LABEL,
  REFUND_METHODS,
  REFUND_METHOD_LABEL,
  REFUND_REASONS,
  refundsKey,
  validateRefundAmount,
  type RefundMethod,
} from "@/lib/estornos";
import { createOrderRefund, listOrderRefunds } from "@/lib/estornos.functions";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface Props {
  storeId: string;
  orderId: string;
}

/** Estorno total ou parcial do pedido, com devolução em dinheiro, crédito ou cashback. */
export function RefundSection({ storeId, orderId }: Props) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listOrderRefunds);
  const createFn = useServerFn(createOrderRefund);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<RefundMethod>("money");
  const [reason, setReason] = useState("");

  const summary = useQuery({
    queryKey: refundsKey(orderId),
    queryFn: () => listFn({ data: { storeId, orderId } }),
    enabled: Boolean(storeId && orderId),
  });

  const remaining = summary.data?.remaining ?? 0;

  const mutation = useMutation({
    mutationFn: (value: number) =>
      createFn({
        data: {
          storeId,
          orderId,
          amount: value,
          method,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setAmount("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: refundsKey(orderId) });
      await queryClient.invalidateQueries({ queryKey: ["painel-pedidos", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => {
    const value = Number(amount.replace(",", "."));
    const problem = validateRefundAmount(value, remaining);
    if (problem) {
      toast.error(problem);
      return;
    }
    mutation.mutate(value);
  };

  return (
    <section className="space-y-3 rounded-lg border border-border/70 p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <RotateCcw className="size-4 text-primary" aria-hidden="true" /> Estorno
        </h3>
        <span className="text-xs text-muted-foreground">
          Disponível: {formatCurrency(remaining)}
        </span>
      </header>

      {remaining <= 0 ? (
        <p className="text-sm text-muted-foreground">
          Este pedido já foi estornado por completo.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="valor-estorno">Valor a estornar</Label>
            <Input
              id="valor-estorno"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={remaining.toFixed(2)}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setAmount(remaining.toFixed(2))}
            >
              Usar o valor total
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forma-estorno">Como devolver</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as RefundMethod)}>
              <SelectTrigger id="forma-estorno">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFUND_METHODS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {REFUND_METHODS.find((item) => item.value === method)?.help}
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="motivo-estorno">Motivo</Label>
            <Textarea
              id="motivo-estorno"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explique o motivo do estorno"
            />
            <div className="flex flex-wrap gap-1">
              {REFUND_REASONS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setReason(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            className="sm:col-span-2"
            disabled={mutation.isPending}
            onClick={submit}
          >
            {mutation.isPending ? "Registrando..." : "Registrar estorno"}
          </Button>
        </div>
      )}

      {(summary.data?.refunds.length ?? 0) > 0 ? (
        <ul className="space-y-2 border-t border-border/70 pt-2">
          {summary.data?.refunds.map((refund) => (
            <li key={refund.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">{formatCurrency(Number(refund.amount))}</span>
              <span className="text-xs text-muted-foreground">
                {REFUND_METHOD_LABEL[refund.method] ?? refund.method} ·{" "}
                {formatDateTime(refund.created_at)}
                {refund.reason ? ` · ${refund.reason}` : ""}
              </span>
              <Badge variant="secondary">
                {REFUND_KIND_LABEL[refund.kind] ?? refund.kind}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

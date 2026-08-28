import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { CASH_MOVEMENT_LABEL, POS_METHOD_LABEL } from "@/lib/pdv";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/* ---------------- Abertura de caixa ---------------- */

export function OpenCashDialog({
  open,
  onOpenChange,
  terminal,
  operatorName,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terminal: string;
  operatorName: string;
  isPending: boolean;
  onConfirm: (input: { openingBalance: number; terminal: string; notes: string }) => void;
}) {
  const [balance, setBalance] = useState("");
  const [terminalValue, setTerminalValue] = useState(terminal);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setBalance("");
    setNotes("");
    setTerminalValue(terminal);
  }, [open, terminal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir caixa</DialogTitle>
          <DialogDescription>
            O turno registra operador, data, horário, terminal e loja. Operador: <strong>{operatorName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm({
              openingBalance: Number(balance.replace(",", ".")) || 0,
              terminal: terminalValue.trim() || "Caixa 1",
              notes: notes.trim(),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="caixa-terminal">Terminal</Label>
            <Input
              id="caixa-terminal"
              className="h-11"
              value={terminalValue}
              onChange={(event) => setTerminalValue(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caixa-saldo">Saldo inicial em dinheiro (R$)</Label>
            <Input
              id="caixa-saldo"
              className="h-12 text-lg font-semibold"
              inputMode="decimal"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caixa-obs">Observação (opcional)</Label>
            <Textarea id="caixa-obs" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Abrindo..." : "Abrir caixa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Fechamento de caixa ---------------- */

export function CloseCashDialog({
  open,
  onOpenChange,
  expected,
  openingBalance,
  isPending,
  onConfirm,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expected: number;
  openingBalance: number;
  isPending: boolean;
  onConfirm: (input: { countedBalance: number; justification: string }) => void;
  onExport: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [justification, setJustification] = useState("");

  useEffect(() => {
    if (!open) return;
    setCounted("");
    setJustification("");
  }, [open]);

  const countedValue = Number(counted.replace(",", ".")) || 0;
  const difference = Math.round((countedValue - expected) * 100) / 100;
  const needsJustification = counted !== "" && Math.abs(difference) > 0.009;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar caixa</DialogTitle>
          <DialogDescription>Conte o dinheiro da gaveta e informe o valor encontrado.</DialogDescription>
        </DialogHeader>

        <dl className="space-y-1 rounded-xl bg-secondary p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Saldo inicial</dt>
            <dd className="font-semibold tabular-nums">{formatCurrency(openingBalance)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Esperado em dinheiro</dt>
            <dd className="font-semibold tabular-nums">{formatCurrency(expected)}</dd>
          </div>
        </dl>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm({ countedBalance: countedValue, justification: justification.trim() });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="fechar-contado">Saldo contado (R$)</Label>
            <Input
              id="fechar-contado"
              className="h-12 text-lg font-semibold"
              inputMode="decimal"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              placeholder="0,00"
              autoFocus
              required
            />
          </div>

          {counted !== "" ? (
            <p
              className={cn(
                "rounded-xl p-3 text-sm font-semibold",
                Math.abs(difference) <= 0.009
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-destructive/15 text-destructive",
              )}
            >
              {Math.abs(difference) <= 0.009
                ? "Caixa conferido sem diferença."
                : `${difference > 0 ? "Sobra" : "Falta"} de ${formatCurrency(Math.abs(difference))}.`}
            </p>
          ) : null}

          {needsJustification ? (
            <div className="space-y-1.5">
              <Label htmlFor="fechar-justificativa">Justificativa da diferença</Label>
              <Textarea
                id="fechar-justificativa"
                rows={2}
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
                required
              />
            </div>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={onExport}>
              Imprimir relatório do turno
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || counted === "" || (needsJustification && !justification.trim())}>
              {isPending ? "Fechando..." : "Fechar caixa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Movimentações ---------------- */

const MOVEMENT_KINDS = [
  { value: "supply", label: "Suprimento (entra dinheiro)" },
  { value: "withdrawal", label: "Sangria (sai dinheiro)" },
  { value: "cash_in", label: "Entrada manual" },
  { value: "cash_out", label: "Saída manual" },
] as const;

export function CashMovementDialog({
  open,
  onOpenChange,
  canWithdraw,
  isPending,
  onConfirm,
  onRequestApproval,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWithdraw: boolean;
  isPending: boolean;
  onConfirm: (input: { kind: "cash_in" | "cash_out" | "withdrawal" | "supply"; amount: number; reason: string }) => void;
  onRequestApproval: () => void;
}) {
  const [kind, setKind] = useState<(typeof MOVEMENT_KINDS)[number]["value"]>("supply");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setReason("");
  }, [open]);

  const sensitive = kind === "withdrawal" || kind === "cash_out";
  const blocked = sensitive && !canWithdraw;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentação de caixa</DialogTitle>
          <DialogDescription>Registre suprimento, sangria ou ajuste manual do turno.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (blocked) {
              onRequestApproval();
              return;
            }
            onConfirm({ kind, amount: Number(amount.replace(",", ".")) || 0, reason: reason.trim() });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="mov-tipo">Tipo</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
              <SelectTrigger id="mov-tipo" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_KINDS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-valor">Valor (R$)</Label>
            <Input
              id="mov-valor"
              className="h-12 text-lg font-semibold"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-motivo">Motivo</Label>
            <Input
              id="mov-motivo"
              className="h-11"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Troco inicial, depósito, pagamento de fornecedor..."
              minLength={3}
              required
            />
          </div>
          {blocked ? (
            <p className="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-700 dark:text-amber-300">
              Sangria e saída exigem permissão. Peça autorização da gerência para continuar.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {blocked ? "Pedir autorização" : isPending ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Consulta de movimentações ---------------- */

export interface CashMovementRow {
  id: string;
  kind: string;
  method: string;
  amount: number | string;
  reason: string | null;
  created_at: string;
}

export function CashMovementsListDialog({
  open,
  onOpenChange,
  movements,
  expected,
  openingBalance,
  terminal,
  openedAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movements: CashMovementRow[];
  expected: number;
  openingBalance: number;
  terminal: string;
  openedAt: string;
}) {
  const negative = ["refund", "cash_out", "withdrawal"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Movimentações do turno</DialogTitle>
          <DialogDescription>
            {terminal} · aberto em {formatDateTime(openedAt)}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-secondary p-3">
            <dt className="text-xs text-muted-foreground">Saldo inicial</dt>
            <dd className="text-lg font-bold tabular-nums">{formatCurrency(openingBalance)}</dd>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <dt className="text-xs text-muted-foreground">Esperado em dinheiro</dt>
            <dd className="text-lg font-bold tabular-nums">{formatCurrency(expected)}</dd>
          </div>
        </dl>

        <ScrollArea className="max-h-72">
          {movements.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {movements.map((movement) => (
                <li key={movement.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {CASH_MOVEMENT_LABEL[movement.kind] ?? movement.kind}
                      <Badge variant="secondary" className="ml-2">
                        {POS_METHOD_LABEL[movement.method] ?? movement.method}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {movement.reason} · {formatDateTime(movement.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      negative.includes(movement.kind) ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {negative.includes(movement.kind) ? "−" : "+"}
                    {formatCurrency(Number(movement.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

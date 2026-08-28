import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";
import { POS_METHOD_LABEL, POS_PAYMENT_METHODS, validateSplitPayments, type PosPaymentMethod } from "@/lib/pdv";
import { changeFor, newPaymentEntry, remainingToPay, type PosPaymentEntry } from "@/lib/pos-sale";
import { cn } from "@/lib/utils";
import type { PosSaleResult } from "@/lib/pdv.functions";
import { Banknote, Check, CreditCard, Loader2, Plus, Printer, QrCode, Send, Ticket, Trash2, Truck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const METHOD_ICON: Record<string, typeof Banknote> = {
  cash: Banknote,
  pix: QrCode,
  debit: CreditCard,
  credit: CreditCard,
  voucher: Ticket,
};

export interface PixChargeState {
  payload?: string;
  demo?: boolean;
  message: string;
}

interface PosPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  entries: PosPaymentEntry[];
  onEntriesChange: (entries: PosPaymentEntry[]) => void;
  cashReceived: number;
  onCashReceivedChange: (value: number) => void;
  /** Marca o pedido para seguir ao monitor de preparo em vez de concluir. */
  sendToKds: boolean;
  onSendToKdsChange: (value: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
  result: PosSaleResult | null;
  pix: PixChargeState | null;
  onRequestPix: (amount: number) => void;
  pixPending: boolean;
  onPrintReceipt: () => void;
  onSendWhatsApp: () => void;
  onNewSale: () => void;
  onExit: () => void;
}

/**
 * Tela de pagamento dentro do modo exclusivo: pagamento único ou dividido,
 * troco automático no dinheiro, Pix com QR Code e confirmação da venda.
 */
export function PosPaymentDialog({
  open,
  onOpenChange,
  total,
  entries,
  onEntriesChange,
  cashReceived,
  onCashReceivedChange,
  sendToKds,
  onSendToKdsChange,
  isPending,
  onConfirm,
  result,
  pix,
  onRequestPix,
  pixPending,
  onPrintReceipt,
  onSendWhatsApp,
  onNewSale,
  onExit,
}: PosPaymentDialogProps) {
  const [qrImage, setQrImage] = useState<string | null>(null);

  useEffect(() => {
    if (!pix?.payload) {
      setQrImage(null);
      return;
    }
    void QRCode.toDataURL(pix.payload, { width: 240, margin: 1 })
      .then(setQrImage)
      .catch(() => setQrImage(null));
  }, [pix?.payload]);

  const [splitMode, setSplitMode] = useState(false);

  const remaining = remainingToPay(entries, total);
  const split = useMemo(
    () => validateSplitPayments(entries.map((entry) => ({ id: entry.id, method: entry.method, amount: entry.amount })), total),
    [entries, total],
  );
  const change = changeFor(cashReceived, total);
  const cashEntry = entries.find((entry) => entry.method === "cash");

  function addMethod(method: PosPaymentMethod) {
    // Forma única: o valor cheio da venda vai direto para a forma escolhida.
    if (!splitMode) {
      onEntriesChange([newPaymentEntry(method, total)]);
      if (method === "pix" && total > 0) onRequestPix(total);
      return;
    }
    const amount = remaining > 0 ? remaining : 0;
    onEntriesChange([...entries, newPaymentEntry(method, amount)]);
    if (method === "pix" && amount > 0) onRequestPix(amount);
  }

  function updateAmount(id: string, amount: number) {
    onEntriesChange(entries.map((entry) => (entry.id === id ? { ...entry, amount } : entry)));
  }


  /* ---------- Confirmação após aprovação ---------- */
  if (result?.ok) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Check className="size-6" aria-hidden="true" />
              </span>
              Venda {result.code} concluída
            </DialogTitle>
            <DialogDescription>
              {formatCurrency(result.total ?? total)} recebido.
              {result.change && result.change > 0 ? ` Troco de ${formatCurrency(result.change)}.` : ""}
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-1.5 rounded-xl bg-secondary p-3 text-sm">
            <li>Estoque e caixa atualizados.</li>
            {result.printJobs ? <li>{result.printJobs} via(s) enviada(s) para a fila de impressão por setor.</li> : null}
            {result.sentToKds ? <li>Pedido enviado ao monitor de preparo (KDS).</li> : null}
            {result.loyaltyPoints ? <li>{result.loyaltyPoints} ponto(s) de fidelidade creditado(s).</li> : null}
            {result.cashbackEarned ? <li>{formatCurrency(result.cashbackEarned)} de cashback creditado.</li> : null}
          </ul>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="lg" className="h-12" onClick={onPrintReceipt}>
              <Printer className="mr-2 size-4" aria-hidden="true" />
              Imprimir cupom
            </Button>
            <Button variant="outline" size="lg" className="h-12" onClick={onSendWhatsApp}>
              <Send className="mr-2 size-4" aria-hidden="true" />
              Enviar por WhatsApp
            </Button>
            <Button size="lg" className="h-12 font-semibold" onClick={onNewSale}>
              Nova venda
            </Button>
            <Button variant="ghost" size="lg" className="h-12" onClick={onExit}>
              Sair do PDV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* ---------- Pagamento ---------- */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pagamento</DialogTitle>
          <DialogDescription>
            Escolha uma forma ou divida entre várias. A venda só conclui quando o total estiver coberto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-secondary p-4">
          <span className="text-sm font-medium text-muted-foreground">Total da venda</span>
          <span className="text-3xl font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={splitMode}
            onChange={(event) => {
              const enabled = event.target.checked;
              setSplitMode(enabled);
              // Ao voltar para forma única, o valor cheio fica na forma já escolhida.
              if (!enabled && entries.length > 0) {
                onEntriesChange([{ ...entries[0]!, amount: total }]);
              }
            }}
          />
          <span>
            <span className="font-semibold">Dividir em duas ou mais formas de pagamento</span>
            <span className="block text-xs text-muted-foreground">
              Sem marcar, a forma escolhida recebe o valor cheio da venda.
            </span>
          </span>
        </label>

        <div>
          <Label className="mb-2 block text-sm">
            {splitMode ? "Adicionar forma de pagamento" : "Forma de pagamento"}
          </Label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {POS_PAYMENT_METHODS.map((method) => {
              const Icon = METHOD_ICON[method.value] ?? CreditCard;
              return (
                <Button
                  key={method.value}
                  variant={!splitMode && entries[0]?.method === method.value ? "default" : "outline"}

                  size="lg"
                  className="h-14 justify-start gap-2 text-base"
                  onClick={() => addMethod(method.value)}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {method.short}
                </Button>
              );
            })}
          </div>
        </div>


        <Separator />

        <div className="space-y-2">
          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhuma forma escolhida ainda.
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
                <div className="min-w-32 flex-1">
                  <Label htmlFor={`pg-${entry.id}`} className="text-xs">
                    {POS_METHOD_LABEL[entry.method] ?? entry.method}
                  </Label>
                  <MoneyInput
                    id={`pg-${entry.id}`}
                    className="mt-1 h-12 text-lg font-semibold"
                    value={entry.amount}
                    onValueChange={(amount) => updateAmount(entry.id, amount)}
                    disabled={!splitMode}
                  />

                </div>
                {entry.method === "pix" ? (
                  <Button
                    variant="outline"
                    className="h-12"
                    disabled={pixPending || entry.amount <= 0}
                    onClick={() => onRequestPix(entry.amount)}
                  >
                    {pixPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <QrCode className="size-4" aria-hidden="true" />}
                    <span className="ml-1.5">QR Code</span>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-12 text-destructive"
                  aria-label="Remover forma de pagamento"
                  onClick={() => onEntriesChange(entries.filter((item) => item.id !== entry.id))}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))
          )}

          {splitMode && remaining > 0 && entries.length > 0 ? (
            <Button
              variant="ghost"
              className="h-11 w-full"
              onClick={() => addMethod(entries[0]?.method ?? "cash")}
            >
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              Cobrir os {formatCurrency(remaining)} restantes
            </Button>
          ) : null}
        </div>

        {cashEntry ? (
          <div className="space-y-1.5 rounded-xl border border-border p-3">
            <Label htmlFor="pg-recebido">Valor recebido em dinheiro</Label>
            <MoneyInput
              id="pg-recebido"
              className="h-12 text-lg font-semibold"
              value={cashReceived}
              onValueChange={onCashReceivedChange}
            />

            <p className="text-sm font-semibold">
              Troco: <span className="tabular-nums">{formatCurrency(change)}</span>
            </p>
          </div>
        ) : null}

        {pix ? (
          <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Cobrança Pix</p>
              {pix.demo ? <Badge variant="outline">Transação simulada</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">{pix.message}</p>
            {qrImage ? (
              <img src={qrImage} alt="QR Code Pix da venda" className="size-52 rounded-xl bg-white p-2" />
            ) : null}
            {pix.payload ? (
              <>
                <p className="rounded-lg border border-border bg-background p-2 text-xs break-all text-muted-foreground">
                  {pix.payload}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(pix.payload!);
                    toast.success("Código Pix copiado.");
                  }}
                >
                  Copiar código copia-e-cola
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={sendToKds}
            onChange={(event) => onSendToKdsChange(event.target.checked)}
          />
          <span>
            <span className="font-semibold">Enviar para o monitor de preparo (KDS)</span>
            <span className="block text-xs text-muted-foreground">
              Marque quando o item precisa ser produzido. Sem marcar, a venda é concluída na hora.
            </span>
          </span>
        </label>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Já pago</span>
            <span className="font-semibold tabular-nums">{formatCurrency(split.paid)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Falta pagar</span>
            <span className={cn("font-semibold tabular-nums", remaining > 0 && "text-destructive")}>
              {formatCurrency(remaining)}
            </span>
          </div>
          <p className={cn("text-sm", split.ok ? "text-muted-foreground" : "font-medium text-destructive")}>
            {split.message}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-14 flex-1" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button
              size="lg"
              className="h-14 flex-[2] bg-accent text-base font-bold text-accent-foreground hover:bg-accent/90"
              disabled={!split.ok || isPending}
              onClick={onConfirm}
            >
              {isPending ? <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" /> : null}
              Concluir pagamento
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Converte o texto digitado (padrão brasileiro) em número. */
function parseMoney(text: string): number {
  const cleaned = text.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Campo de dinheiro que aceita vírgula para os centavos.
 * O texto digitado fica preservado enquanto o usuário escreve ("89," continua "89,").
 */
function MoneyInput({
  value,
  onValueChange,
  id,
  className,
  disabled,
}: {
  value: number;
  onValueChange: (value: number) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => (value ? value.toFixed(2).replace(".", ",") : ""));

  useEffect(() => {
    // Só sobrescreve o texto quando o valor externo diverge do que está escrito.
    if (parseMoney(text) !== value) setText(value ? value.toFixed(2).replace(".", ",") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      id={id}
      className={className}
      inputMode="decimal"
      placeholder="0,00"
      disabled={disabled}
      value={text}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^\d.,]/g, "");
        setText(raw);
        onValueChange(parseMoney(raw));
      }}
      onBlur={() => setText(value ? value.toFixed(2).replace(".", ",") : "")}
    />
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { formatWeight } from "@/lib/peso";
import { POS_FULFILLMENTS, type PosFulfillment } from "@/lib/pdv";
import { lineTotal, lineUnitPrice, type PosSaleDraft, type PosSaleTotals } from "@/lib/pos-sale";
import { productInitials } from "@/lib/pos-kds";
import { cn } from "@/lib/utils";
import { Armchair, Minus, Pencil, Plus, ShoppingCart, Trash2, User } from "lucide-react";

interface PosCartPanelProps {
  draft: PosSaleDraft;
  totals: PosSaleTotals;
  showImages: boolean;
  received: number;
  change: number;
  onFulfillment: (value: PosFulfillment) => void;
  onQuantity: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onEditLine: (lineId: string) => void;
  onPickCustomer: () => void;
  onPickTable: () => void;
  onClear: () => void;
  onCheckout: () => void;
  disabled?: boolean;
}

/**
 * Comanda atual do PDV: itens com adicionais, observação e desconto por linha,
 * além do resumo financeiro completo.
 */
export function PosCartPanel({
  draft,
  totals,
  showImages,
  received,
  change,
  onFulfillment,
  onQuantity,
  onRemove,
  onEditLine,
  onPickCustomer,
  onPickTable,
  onClear,
  onCheckout,
  disabled,
}: PosCartPanelProps) {
  return (
    <section aria-label="Venda atual" className="flex h-full min-h-0 flex-col bg-card">
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
            <ShoppingCart className="size-4" aria-hidden="true" />
            Venda atual
          </h2>
          <Badge variant="secondary" className="tabular-nums">
            {totals.itemCount} {totals.itemCount === 1 ? "item" : "itens"}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pos-atendimento" className="text-xs">
            Tipo de atendimento
          </Label>
          <Select value={draft.fulfillment} onValueChange={(value) => onFulfillment(value as PosFulfillment)}>
            <SelectTrigger id="pos-atendimento" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POS_FULFILLMENTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" className="h-11 justify-start gap-2 truncate" onClick={onPickCustomer}>
            <User className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{draft.customerName || "Cliente"}</span>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-11 justify-start gap-2 truncate"
            onClick={onPickTable}
            disabled={draft.fulfillment !== "dine_in"}
          >
            <Armchair className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{draft.tableNumber ? `Mesa ${draft.tableNumber}` : "Mesa"}</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {draft.lines.length === 0 ? (
          <p className="m-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum item na venda. Toque em um produto, busque pelo nome ou passe o leitor de código de barras.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {draft.lines.map((line) => (
              <li key={line.lineId} className="p-3">
                <div className="flex gap-2">
                  {showImages ? (
                    <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-secondary">
                      {line.imageUrl ? (
                        <img src={line.imageUrl} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-xs font-bold text-muted-foreground">
                          {productInitials(line.name)}
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug font-semibold">{line.name}</p>
                    {line.options.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {line.options.map((option) => option.name).join(", ")}
                      </p>
                    ) : null}
                    {line.notes ? <p className="text-xs text-primary italic">Obs.: {line.notes}</p> : null}
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(lineUnitPrice(line))} un.
                      {line.discount > 0 ? ` · desconto ${formatCurrency(line.discount)}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums">{formatCurrency(lineTotal(line))}</p>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10"
                    aria-label={`Diminuir ${line.name}`}
                    onClick={() => onQuantity(line.lineId, -1)}
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </Button>
                  <span className="w-14 text-center text-base font-bold tabular-nums">
                    {line.soldByWeight ? formatWeight(line.quantity, line.unitLabel ?? "kg") : line.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10"
                    aria-label={`Aumentar ${line.name}`}
                    onClick={() => onQuantity(line.lineId, 1)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-10 gap-1.5"
                    onClick={() => onEditLine(line.lineId)}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 text-destructive"
                    aria-label={`Remover ${line.name}`}
                    onClick={() => onRemove(line.lineId)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <div className="shrink-0 space-y-3 border-t border-border p-3">
        <dl className="space-y-1 text-sm">
          <SummaryRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
          {totals.itemDiscount > 0 ? (
            <SummaryRow label="Descontos nos itens" value={`− ${formatCurrency(totals.itemDiscount)}`} tone="negative" />
          ) : null}
          {totals.saleDiscount > 0 ? (
            <SummaryRow label="Desconto na venda" value={`− ${formatCurrency(totals.saleDiscount)}`} tone="negative" />
          ) : null}
          {totals.cashbackUsed > 0 ? (
            <SummaryRow label="Cashback utilizado" value={`− ${formatCurrency(totals.cashbackUsed)}`} tone="negative" />
          ) : null}
          {totals.fee > 0 ? (
            <SummaryRow label={draft.fulfillment === "delivery" ? "Taxa de entrega" : "Acréscimos"} value={formatCurrency(totals.fee)} />
          ) : null}
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <dt className="text-base font-bold">Total</dt>
            <dd className="text-2xl font-bold tabular-nums">{formatCurrency(totals.total)}</dd>
          </div>
          {received > 0 ? (
            <>
              <SummaryRow label="Valor recebido" value={formatCurrency(received)} />
              <SummaryRow label="Troco" value={formatCurrency(change)} tone="positive" />
            </>
          ) : null}
        </dl>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="h-14 flex-1 text-base"
            onClick={onClear}
            disabled={draft.lines.length === 0}
          >
            Limpar
          </Button>
          <Button
            size="lg"
            className="h-14 flex-[2] bg-accent text-base font-bold text-accent-foreground hover:bg-accent/90"
            disabled={draft.lines.length === 0 || disabled}
            onClick={onCheckout}
          >
            Finalizar venda
          </Button>
        </div>
      </div>
    </section>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-semibold tabular-nums",
          tone === "negative" && "text-destructive",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

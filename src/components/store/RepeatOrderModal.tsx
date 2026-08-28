import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, History, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { buildLineId, type CartOption } from "@/hooks/useCart";
import type { OptionGroupRow, OptionRow, ProductRow } from "@/lib/catalog";
import type { RepeatPopupContent } from "@/lib/entry-popups";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { maskPhone } from "@/lib/masks";
import { themeCssVars, type StoreThemeConfig } from "@/lib/store-theme";
import { listPreviousOrders, type PreviousOrderSummary } from "@/lib/repetir-pedido.functions";
import { buildRepeatOrder, canRepeatOrder, normalizePhone, type RepeatLine } from "@/lib/repetir-pedido";

/**
 * Janela "Repetir seu último pedido?".
 *
 * Textos e ícone são configurados pelo lojista. Nada aparece antes da
 * validação do telefone e a busca fica presa à loja atual. O pedido nunca
 * é finalizado aqui — os itens vão para a sacola com os preços de hoje e o
 * cliente revisa tudo no checkout.
 */
interface Props {
  slug: string;
  products: ProductRow[];
  groups: OptionGroupRow[];
  options: OptionRow[];
  content: RepeatPopupContent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddLines: (lines: Array<{ line: RepeatLine; lineId: string; options: CartOption[] }>) => void;
  /** Cliente marcou "Não mostrar novamente". */
  onDismissForever: () => void;
  onEvent?: (event: "close" | "click" | "repeat" | "dismiss_forever") => void;
  /** Modo de pré-visualização do painel: não busca pedidos de verdade. */
  preview?: boolean;
  /** Tema da loja: o modal vive em portal, então recebe as cores aqui. */
  theme?: StoreThemeConfig;
}

type Step = "phone" | "orders" | "confirm";

export function RepeatOrderModal({
  slug,
  products,
  groups,
  options,
  content,
  open,
  onOpenChange,
  onAddLines,
  onDismissForever,
  onEvent,
  preview = false,
  theme,
}: Props) {
  const fetchOrders = useServerFn(listPreviousOrders);
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [orders, setOrders] = useState<PreviousOrderSummary[] | null>(null);
  const [selected, setSelected] = useState<PreviousOrderSummary | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Reabrir sempre começa do início, sem vazar histórico de outra sessão.
  useEffect(() => {
    if (open) {
      setStep("phone");
      setOrders(null);
      setSelected(null);
      setDontShowAgain(false);
    }
  }, [open]);

  const search = useMutation({
    mutationFn: async () => fetchOrders({ data: { slug, phone } }),
    onSuccess: (result) => {
      if (result.limited) {
        toast.error("Muitas consultas seguidas. Tente novamente em alguns minutos.");
        return;
      }
      const eligible = result.orders.filter((order) => canRepeatOrder(order.status));
      setOrders(eligible);
      const first = eligible[0];
      if (first) {
        setSelected(first);
        setStep("confirm");
        onEvent?.("click");
      } else {
        setStep("orders");
      }
    },
    onError: () => toast.error("Não foi possível carregar seus pedidos agora."),
  });

  const repeat = selected ? buildRepeatOrder(selected.items, products, groups, options) : null;

  function close() {
    if (dontShowAgain) {
      onEvent?.("dismiss_forever");
      // Encerra a sequência: nenhuma outra janela abre depois deste pedido.
      onDismissForever();
      return;
    }
    onEvent?.("close");
    onOpenChange(false);
  }

  function confirmRepeat() {
    if (!repeat) return;
    const lines = repeat.available.map((line) => ({
      line,
      lineId: buildLineId({ productId: line.productId, options: line.options, notes: line.notes }),
      options: line.options,
    }));
    if (lines.length === 0) {
      toast.error("Nenhum item deste pedido está disponível agora.");
      return;
    }
    onAddLines(lines);
    onEvent?.("repeat");
    toast.success("Itens adicionados à sacola. Revise endereço e pagamento no checkout.");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        className="max-h-[85dvh] w-[calc(100vw-2rem)] overflow-y-auto bg-card text-foreground sm:max-w-lg"
        style={theme ? { ...themeCssVars(theme), fontFamily: "var(--store-font)" } : undefined}
        aria-label={content.title}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {content.showIcon ? <ShoppingBag className="size-5 text-accent" aria-hidden="true" /> : null}
            {content.title}
            {preview ? <Badge variant="secondary">Pré-visualização</Badge> : null}
          </DialogTitle>
          <DialogDescription>{content.description}</DialogDescription>
        </DialogHeader>

        {step === "phone" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (preview) return;
              if (normalizePhone(phone).length < 10) {
                toast.error("Informe um telefone válido com DDD.");
                return;
              }
              search.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="repeat-modal-phone">Telefone usado no pedido</Label>
              <Input
                id="repeat-modal-phone"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(maskPhone(event.target.value))}
                placeholder={content.phonePlaceholder}
                disabled={preview}
              />
            </div>
            <Button type="submit" className="w-full" disabled={search.isPending || preview}>
              {search.isPending ? "Buscando..." : content.primaryButton}
            </Button>
          </form>
        ) : null}

        {search.isPending ? <Skeleton className="h-20 w-full rounded-[var(--radius)]" /> : null}

        {step === "orders" && orders !== null && orders.length === 0 ? (
          <div className="space-y-4 text-center">
            <p className="rounded-[var(--radius)] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              {content.emptyMessage}
            </p>
            <Button variant="outline" className="w-full" onClick={close}>
              {content.emptyButton}
            </Button>
          </div>
        ) : null}

        {step === "confirm" && selected && repeat ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-muted-foreground">
                Pedido #{selected.code} · {formatDateTime(selected.createdAt)}
              </p>
              <p className="font-medium text-foreground">{formatCurrency(selected.total)}</p>
            </div>

            {repeat.hasChanges ? (
              <Alert>
                <AlertTriangle className="size-4" aria-hidden="true" />
                <AlertDescription>
                  Alguns itens mudaram desde o último pedido. Confira os avisos antes de confirmar.
                </AlertDescription>
              </Alert>
            ) : null}

            <ul className="space-y-2">
              {repeat.lines.map((line, index) => {
                const blocked = line.issue === "unavailable" || line.issue === "removed";
                return (
                  <li key={`${line.productId}-${index}`} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className={blocked ? "text-muted-foreground line-through" : "text-foreground"}>
                        {line.quantity}× {line.name}
                      </span>
                      {blocked ? (
                        <Badge variant="secondary">Indisponível</Badge>
                      ) : (
                        <span className="shrink-0 text-foreground">
                          {formatCurrency(line.currentPrice)}
                          {line.issue === "price_changed" ? (
                            <span className="ml-2 text-xs text-muted-foreground line-through">
                              {formatCurrency(line.previousPrice)}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </div>
                    {line.message ? <p className="text-xs text-muted-foreground">{line.message}</p> : null}
                  </li>
                );
              })}
            </ul>

            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Total com os preços de hoje:{" "}
                <strong className="text-foreground">{formatCurrency(repeat.total)}</strong>
              </p>
            </div>
            <Button className="w-full" onClick={confirmRepeat} disabled={repeat.available.length === 0 || preview}>
              Adicionar à sacola
            </Button>
            <p className="text-xs text-muted-foreground">
              Você ainda revisa endereço, entrega, horário e pagamento antes de finalizar.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          {content.offerDontShowAgain && !preview ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={dontShowAgain}
                onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              />
              Não mostrar novamente
            </label>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={close}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {content.secondaryLink}
          </button>
        </div>

        {orders !== null && orders.length > 1 && step === "confirm" ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <History className="size-3" aria-hidden="true" /> Outros pedidos seus nesta loja
            </p>
            <ul className="space-y-1">
              {orders
                .filter((order) => order.id !== selected?.id)
                .slice(0, 3)
                .map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      className="w-full rounded-[var(--radius)] px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => setSelected(order)}
                    >
                      #{order.code} · {formatDateTime(order.createdAt)} · {formatCurrency(order.total)}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

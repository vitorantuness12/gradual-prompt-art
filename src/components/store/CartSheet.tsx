import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useState } from "react";

import { CouponFeedbackMessage } from "@/components/catalogo/CouponFeedbackMessage";
import { UpsellSuggestions } from "@/components/store/UpsellSuggestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CartItem } from "@/hooks/useCart";
import type { CouponFeedback } from "@/hooks/useCartCoupon";
import { formatCurrency } from "@/lib/format";
import type { UpsellSuggestion } from "@/lib/upsell";

/**
 * Segmentos em que o cliente monta o pedido item por item e precisa conferir a
 * sacola sem perder o catálogo de vista (delivery, restaurantes, saúde e
 * conveniência).
 */
export function quickCartEnabled(segment: string | null | undefined): boolean {
  const normalized = (segment ?? "").toLowerCase();
  return /(deliver|aliment|restaur|lanch|pizz|food|padaria|hamburg|açai|acai|doceria|bar|café|cafe|marmit|sushi|conveni|mercad|mercear|adega|farm[aá]|drogar|sa[uú]de|clinic|clínic|petshop)/.test(
    normalized,
  );
}

/** Estado do cupom vindo do hook compartilhado (`useCartCoupon`). */
export interface CartSheetCoupon {
  code: string | null;
  discount: number;
  checking: boolean;
  feedback: CouponFeedback | null;
  apply: (code: string) => Promise<CouponFeedback>;
  clear: () => void;
}

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  items: CartItem[];
  subtotal: number;
  accepting: boolean;
  onSetQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
  /** Sugestões "leve também" do lojista para os itens já escolhidos. */
  suggestions?: UpsellSuggestion[];
  onAddSuggestion?: (suggestion: UpsellSuggestion) => void;
  coupon?: CartSheetCoupon;
}

/** Sacola em painel lateral: confere, ajusta quantidades e segue para o checkout. */
export function CartSheet({
  open,
  onOpenChange,
  slug,
  items,
  subtotal,
  accepting,
  onSetQuantity,
  onRemove,
  suggestions = [],
  onAddSuggestion,
  coupon,
}: CartSheetProps) {
  const [couponInput, setCouponInput] = useState("");
  const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
  const total = Math.max(0, subtotal - discount);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="size-4" aria-hidden="true" /> Sua sacola
          </SheetTitle>
          <SheetDescription>Confira os itens e continue navegando pelo catálogo.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sua sacola está vazia.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.lineId} className="rounded-lg border border-border p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                      {item.variantName ? (
                        <p className="text-xs text-muted-foreground">{item.variantName}</p>
                      ) : null}
                      {item.options && item.options.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {item.options.map((option) => option.optionName).join(", ")}
                        </p>
                      ) : null}
                      {item.notes ? (
                        <p className="text-xs italic text-muted-foreground">{item.notes}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        aria-label={`Diminuir ${item.name}`}
                        onClick={() => onSetQuantity(item.lineId, item.quantity - 1)}
                      >
                        <Minus className="size-3.5" aria-hidden="true" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        aria-label={`Aumentar ${item.name}`}
                        disabled={Boolean(item.maxQuantity && item.quantity >= item.maxQuantity)}
                        onClick={() => onSetQuantity(item.lineId, item.quantity + 1)}
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => onRemove(item.lineId)}
                    >
                      <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" /> Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {onAddSuggestion && items.length > 0 ? (
            <UpsellSuggestions className="mt-4" suggestions={suggestions} onAdd={onAddSuggestion} />
          ) : null}

          {coupon && items.length > 0 ? (
            <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-muted/40 p-3">
              <Label htmlFor="cupom-sacola" className="text-xs font-bold uppercase tracking-wide">
                Cupom de desconto
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cupom-sacola"
                  value={coupon.code ?? couponInput}
                  onChange={(event) => setCouponInput(event.target.value.toUpperCase().slice(0, 40))}
                  placeholder="SEUCUPOM"
                  maxLength={40}
                  disabled={Boolean(coupon.code) || coupon.checking}
                  className="min-w-0 flex-1 bg-card uppercase"
                />
                {coupon.code ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      coupon.clear();
                      setCouponInput("");
                    }}
                  >
                    Remover
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={coupon.checking}
                    onClick={() => void coupon.apply(couponInput)}
                  >
                    {coupon.checking ? "Validando..." : "Aplicar"}
                  </Button>
                )}
              </div>
              {coupon.feedback ? <CouponFeedbackMessage feedback={coupon.feedback} /> : null}
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border p-4">
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Desconto</span>
                <span className="font-medium text-success">−{formatCurrency(discount)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-base font-semibold text-foreground">{formatCurrency(total)}</span>
            </div>
            <Button
              asChild={accepting && items.length > 0}
              disabled={!accepting || items.length === 0}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {accepting && items.length > 0 ? (
                <Link to="/$slug/carrinho" params={{ slug }} onClick={() => onOpenChange(false)}>
                  Finalizar pedido
                </Link>
              ) : (
                <span>{accepting ? "Sacola vazia" : "Loja indisponível"}</span>
              )}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Continuar comprando
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

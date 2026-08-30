import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, ShieldCheck, Ticket } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CouponFeedbackMessage } from "@/components/catalogo/CouponFeedbackMessage";
import {
  CheckoutShell,
  CustomerFields,
  PaymentChoice,
  emptyCustomer,
  type CustomerFormValue,
} from "@/components/store/CheckoutEspecializadoShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/hooks/useCart";
import { useCartCoupon } from "@/hooks/useCartCoupon";
import { submitDigitalCheckout } from "@/lib/checkout-especializado.functions";
import { installmentOptions } from "@/lib/checkout-especializado";
import { formatCurrency } from "@/lib/format";
import { normalizePhoneBR } from "@/lib/phone";
import { parsePaymentMethods } from "@/lib/store-config";
import { publicStoreQuery } from "@/lib/store-queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$slug/checkout_/digital")({
  head: () => ({
    meta: [
      { title: "Comprar acesso digital — O Seu Pedido" },
      {
        name: "description",
        content:
          "Finalize a compra do seu produto digital com Pix ou cartão e receba o acesso por e-mail assim que o pagamento for confirmado.",
      },
      { property: "og:title", content: "Comprar acesso digital" },
      { property: "og:description", content: "Pagamento rápido e liberação automática do acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DigitalCheckout,
});

/** Formas de pagamento aceitas em produto digital: nada presencial. */
const DIGITAL_METHODS = ["pix", "card_online"] as const;

function DigitalCheckout() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const store = useQuery(publicStoreQuery(slug));
  const storeId = store.data?.store.id ?? null;

  const cart = useCart(slug, storeId);
  const coupon = useCartCoupon(slug, storeId, cart.subtotal, cart.hydrated);
  const send = useServerFn(submitDigitalCheckout);

  const [customer, setCustomer] = useState<CustomerFormValue>(emptyCustomer);
  const [payment, setPayment] = useState<string>("pix");
  const [couponInput, setCouponInput] = useState("");
  const [installments, setInstallments] = useState(1);
  const [saving, setSaving] = useState(false);

  const total = Math.max(0, cart.subtotal - coupon.discount);
  const methods = parsePaymentMethods(store.data?.store.payment_methods);
  const plans = useMemo(() => installmentOptions(total), [total]);

  async function confirm() {
    if (cart.items.length === 0) {
      toast.error("Seu carrinho está vazio.");
      return;
    }
    if (customer.name.trim().length < 3) {
      toast.error("Informe seu nome completo.");
      return;
    }
    const phone = normalizePhoneBR(customer.phone);
    if (!phone.ok) {
      toast.error(phone.message);
      return;
    }
    if (!customer.email.trim()) {
      toast.error("Informe o e-mail que vai receber o acesso.");
      return;
    }

    setSaving(true);
    try {
      const result = await send({
        data: {
          slug,
          lines: cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
            notes: item.notes ?? null,
          })),
          couponCode: coupon.coupon?.code ?? null,
          paymentMethod: payment,
          installments: payment === "card_online" ? installments : null,
          name: customer.name.trim(),
          phone: phone.e164,
          email: customer.email.trim(),
          notes: customer.notes.trim() || null,
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        (result.problems ?? []).slice(1).forEach((problem) => toast.error(problem));
        return;
      }
      toast.success(result.message);
      cart.clear();
      coupon.clear();
      void navigate({ to: "/$slug/acompanhar", params: { slug }, search: { codigo: result.code } });
    } catch {
      toast.error("Não foi possível concluir a compra agora.");
    } finally {
      setSaving(false);
    }
  }

  if (store.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!store.data) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">
        Não encontramos esta loja.
      </div>
    );
  }

  if (cart.hydrated && cart.items.length === 0) {
    return (
      <CheckoutShell
        storeName={store.data.store.name}
        slug={slug}
        title="Comprar acesso digital"
        description="Seu carrinho está vazio."
      >
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">Escolha um produto para continuar.</p>
            <Button asChild>
              <Link to="/$slug" params={{ slug }}>
                Ver produtos
              </Link>
            </Button>
          </CardContent>
        </Card>
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell
      storeName={store.data.store.name}
      slug={slug}
      title="Comprar acesso digital"
      description="Entrega automática por e-mail após a confirmação do pagamento."
      aside={
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {cart.items.map((item) => (
              <div key={item.lineId} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {item.quantity}× {item.name}
                </span>
                <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
            {coupon.discount > 0 ? (
              <div className="flex justify-between text-success">
                <span>Cupom {coupon.coupon?.code}</span>
                <span>-{formatCurrency(coupon.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              O acesso é liberado somente após a confirmação do pagamento.
            </p>
            <Button className="w-full" onClick={confirm} disabled={saving}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Finalizar compra
            </Button>
          </CardContent>
        </Card>
      }
    >
      <CustomerFields value={customer} onChange={setCustomer} requireEmail notesLabel="Observações (opcional)" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" /> Cupom de desconto
          </CardTitle>
          <CardDescription>Se você tem um cupom, aplique antes de pagar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {coupon.coupon ? (
            <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
              <span className="font-medium text-success">{coupon.coupon.code}</span>
              <Button variant="ghost" size="sm" onClick={coupon.clear}>
                Remover
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={couponInput}
                onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                placeholder="SEUCUPOM"
                aria-label="Código do cupom"
              />
              <Button
                variant="outline"
                disabled={coupon.checking}
                onClick={() => void coupon.apply(couponInput)}
              >
                {coupon.checking ? <Loader2 className="size-4 animate-spin" /> : "Aplicar"}
              </Button>
            </div>
          )}
          <CouponFeedbackMessage feedback={coupon.feedback} />
        </CardContent>
      </Card>

      <PaymentChoice methods={methods} value={payment} onChange={setPayment} allow={DIGITAL_METHODS} />

      {payment === "card_online" && plans.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parcelamento</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {plans.map((plan) => (
              <button
                key={plan.count}
                type="button"
                aria-pressed={installments === plan.count}
                onClick={() => setInstallments(plan.count)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition",
                  installments === plan.count
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border bg-card hover:border-primary/50",
                )}
              >
                {plan.label}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </CheckoutShell>
  );
}

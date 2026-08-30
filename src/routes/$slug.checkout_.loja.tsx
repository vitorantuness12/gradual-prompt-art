import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PackageCheck, Store, Ticket, Truck } from "lucide-react";
import { useCallback, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/hooks/useCart";
import { useCartCoupon } from "@/hooks/useCartCoupon";
import { getShippingQuote, submitStoreCheckout } from "@/lib/checkout-especializado.functions";
import { formatCurrency } from "@/lib/format";
import { normalizePhoneBR } from "@/lib/phone";
import { parsePaymentMethods } from "@/lib/store-config";
import { publicStoreQuery } from "@/lib/store-queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$slug/checkout_/loja")({
  head: () => ({
    meta: [
      { title: "Finalizar compra — O Seu Pedido" },
      {
        name: "description",
        content:
          "Confirme os produtos, calcule o frete pelo CEP e finalize sua compra com estoque e preço verificados.",
      },
      { property: "og:title", content: "Finalizar compra" },
      { property: "og:description", content: "Frete calculado pelo CEP e estoque conferido antes de fechar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LojaCheckout,
});

interface AddressForm {
  zip: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  complement: string;
}

const emptyAddress: AddressForm = {
  zip: "",
  street: "",
  number: "",
  district: "",
  city: "",
  state: "",
  complement: "",
};

function LojaCheckout() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const store = useQuery(publicStoreQuery(slug));
  const storeId = store.data?.store.id ?? null;

  const cart = useCart(slug, storeId);
  const coupon = useCartCoupon(slug, storeId, cart.subtotal, cart.hydrated);
  const quote = useServerFn(getShippingQuote);
  const send = useServerFn(submitStoreCheckout);

  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [address, setAddress] = useState<AddressForm>(emptyAddress);
  const [customer, setCustomer] = useState<CustomerFormValue>(emptyCustomer);
  const [payment, setPayment] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [shipping, setShipping] = useState<{ fee: number; label: string; message: string; ok: boolean } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);

  const cartLines = cart.items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId ?? null,
    quantity: item.quantity,
    notes: item.notes ?? null,
  }));

  /** Busca o endereço pelo CEP e pede o frete ao servidor. */
  const lookupZip = useCallback(
    async (zip: string) => {
      const digits = zip.replace(/\D/g, "");
      if (digits.length !== 8) return;
      setQuoting(true);
      try {
        try {
          const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
          const found = (await response.json()) as {
            erro?: boolean;
            logradouro?: string;
            bairro?: string;
            localidade?: string;
            uf?: string;
          };
          if (!found.erro) {
            setAddress((current) => ({
              ...current,
              street: found.logradouro || current.street,
              district: found.bairro || current.district,
              city: found.localidade || current.city,
              state: found.uf || current.state,
            }));
          }
        } catch {
          // CEP indisponível: o cliente completa o endereço manualmente.
        }

        const result = await quote({
          data: { slug, lines: cartLines, zip: digits, district: address.district || null },
        });
        setShipping({ fee: result.fee, label: result.label, message: result.message, ok: result.ok });
        result.problems.forEach((problem) => toast.warning(problem));
      } finally {
        setQuoting(false);
      }
    },
    [address.district, cartLines, quote, slug],
  );

  const total = Math.max(0, cart.subtotal - coupon.discount) + (fulfillment === "delivery" ? shipping?.fee ?? 0 : 0);
  const methods = parsePaymentMethods(store.data?.store.payment_methods);

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
    if (fulfillment === "delivery" && (!address.zip || !address.street || !address.number)) {
      toast.error("Complete o endereço de entrega.");
      return;
    }
    if (!payment) {
      toast.error("Escolha a forma de pagamento.");
      return;
    }

    setSaving(true);
    try {
      const result = await send({
        data: {
          slug,
          lines: cartLines,
          couponCode: coupon.coupon?.code ?? null,
          paymentMethod: payment,
          fulfillment,
          address: fulfillment === "delivery" ? address : null,
          name: customer.name.trim(),
          phone: phone.e164,
          email: customer.email.trim() || null,
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
      toast.error("Não foi possível concluir o pedido agora.");
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
        title="Finalizar compra"
        description="Seu carrinho está vazio."
      >
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">Adicione produtos para continuar.</p>
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
      title="Finalizar compra"
      description="Preço e estoque conferidos no servidor antes de fechar o pedido."
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
                  {item.variantName ? ` (${item.variantName})` : ""}
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
            {fulfillment === "delivery" ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frete</span>
                <span>{shipping?.ok ? formatCurrency(shipping.fee) : "a calcular"}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
            <Button className="w-full" onClick={confirm} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <PackageCheck className="mr-2 size-4" />
              )}
              Concluir pedido
            </Button>
          </CardContent>
        </Card>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como você quer receber?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: "delivery" as const, label: "Entrega", icon: Truck },
              { value: "pickup" as const, label: "Retirar na loja", icon: Store },
            ] satisfies { value: "delivery" | "pickup"; label: string; icon: typeof Truck }[]
          ).map((option) => {
            const active = fulfillment === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFulfillment(option.value)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition",
                  active ? "border-primary bg-primary/10 font-medium" : "border-border bg-card",
                )}
              >
                <Icon className="size-4" />
                {option.label}
              </button>
            );
          })}
        </CardContent>
      </Card>

      {fulfillment === "delivery" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereço de entrega</CardTitle>
            <CardDescription>Digite o CEP para buscarmos o endereço e o frete.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="loja-zip">CEP</Label>
              <div className="flex gap-2">
                <Input
                  id="loja-zip"
                  value={address.zip}
                  inputMode="numeric"
                  onChange={(event) => {
                    const value = event.target.value;
                    setAddress((current) => ({ ...current, zip: value }));
                    if (value.replace(/\D/g, "").length === 8) void lookupZip(value);
                  }}
                />
                <Button variant="outline" onClick={() => void lookupZip(address.zip)} disabled={quoting}>
                  {quoting ? <Loader2 className="size-4 animate-spin" /> : "Calcular"}
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="loja-street">Rua</Label>
              <Input
                id="loja-street"
                value={address.street}
                onChange={(event) => setAddress((current) => ({ ...current, street: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="loja-number">Número</Label>
              <Input
                id="loja-number"
                value={address.number}
                onChange={(event) => setAddress((current) => ({ ...current, number: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="loja-district">Bairro</Label>
              <Input
                id="loja-district"
                value={address.district}
                onChange={(event) => setAddress((current) => ({ ...current, district: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="loja-city">Cidade</Label>
              <Input
                id="loja-city"
                value={address.city}
                onChange={(event) => setAddress((current) => ({ ...current, city: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="loja-state">Estado</Label>
              <Input
                id="loja-state"
                value={address.state}
                maxLength={2}
                onChange={(event) =>
                  setAddress((current) => ({ ...current, state: event.target.value.toUpperCase() }))
                }
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="loja-complement">Complemento</Label>
              <Input
                id="loja-complement"
                value={address.complement}
                onChange={(event) => setAddress((current) => ({ ...current, complement: event.target.value }))}
              />
            </div>
            {shipping ? (
              <p
                className={cn(
                  "sm:col-span-2 rounded-lg px-3 py-2 text-sm",
                  shipping.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                )}
              >
                {shipping.message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <CustomerFields value={customer} onChange={setCustomer} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" /> Cupom de desconto
          </CardTitle>
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
          {coupon.feedback ? <CouponFeedbackMessage feedback={coupon.feedback} /> : null}
        </CardContent>
      </Card>

      <PaymentChoice methods={methods} value={payment} onChange={setPayment} />
    </CheckoutShell>
  );
}

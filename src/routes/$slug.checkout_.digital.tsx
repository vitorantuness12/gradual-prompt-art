import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, Lock, QrCode, Repeat, ShieldCheck, Ticket } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { CouponFeedbackMessage } from "@/components/catalogo/CouponFeedbackMessage";
import { CheckoutThemeProvider } from "@/components/store/CheckoutThemeProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/hooks/useCart";
import { useCartCoupon } from "@/hooks/useCartCoupon";
import { submitDigitalCheckout, submitSubscriptionCheckout } from "@/lib/checkout-especializado.functions";
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

/** Periodicidades aceitas pela assinatura recorrente (espelham o servidor). */
type SubscriptionPeriod = "weekly" | "biweekly" | "monthly" | "quarterly";

const PERIOD_LABEL: Record<SubscriptionPeriod, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
};

/** Formas de pagamento aceitas em produto digital: nada presencial. */
const DIGITAL_METHODS = ["pix", "card_online"] as const;

/** Rótulo, ícone e descrição de cada forma de pagamento aceita no digital. */
const METHOD_META: Record<string, { label: string; icon: ReactNode; hint: string }> = {
  pix: { label: "PIX", icon: <QrCode className="size-5" aria-hidden="true" />, hint: "Aprovação em segundos" },
  card_online: {
    label: "Cartão de Crédito",
    icon: <CreditCard className="size-5" aria-hidden="true" />,
    hint: "Em até 12x",
  },
  pix_recorrente: {
    label: "Pix Automático",
    icon: <Repeat className="size-5" aria-hidden="true" />,
    hint: "Renovação automática",
  },
};

/** Rótulo de campo no estilo do checkout de referência: pequeno, em destaque. */
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-semibold text-primary">
      {children}
    </Label>
  );
}

/** Título de bloco (Oferta, Forma de Pagamento, Resumo do pedido). */
function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-bold text-foreground">{children}</h2>;
}

function DigitalCheckout() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const store = useQuery(publicStoreQuery(slug));
  const storeId = store.data?.store.id ?? null;

  const cart = useCart(slug, storeId);
  const coupon = useCartCoupon(slug, storeId, cart.subtotal, cart.hydrated);
  const send = useServerFn(submitDigitalCheckout);
  const sendSubscription = useServerFn(submitSubscriptionCheckout);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [payment, setPayment] = useState<string>("pix");
  const [couponInput, setCouponInput] = useState("");
  const [installments, setInstallments] = useState(1);
  const [couponOpen, setCouponOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState<SubscriptionPeriod>("monthly");

  /**
   * Assinatura recorrente: só quando TODOS os itens do carrinho são planos.
   * Misturar plano com compra única geraria cobrança recorrente indevida.
   */
  const isSubscription = useMemo(() => {
    const catalog = store.data?.products ?? [];
    if (cart.items.length === 0) return false;
    return cart.items.every(
      (item) => catalog.find((product) => product.id === item.productId)?.kind === "subscription",
    );
  }, [cart.items, store.data]);

  const total = Math.max(0, cart.subtotal - coupon.discount);
  const methods = parsePaymentMethods(store.data?.store.payment_methods);
  const options = useMemo(
    () => DIGITAL_METHODS.filter((key) => methods[key]),
    [methods],
  );
  const plans = useMemo(() => installmentOptions(total), [total]);

  /** Se a loja não aceita a forma escolhida, cai na primeira disponível. */
  useEffect(() => {
    if (options.length > 0 && !options.includes(payment as (typeof DIGITAL_METHODS)[number])) {
      setPayment(options[0]!);
    }
  }, [options, payment]);

  async function confirm() {
    if (cart.items.length === 0) {
      toast.error("Seu carrinho está vazio.");
      return;
    }
    if (name.trim().length < 3) {
      toast.error("Preencha seu nome completo.");
      return;
    }
    if (!email.trim()) {
      toast.error("Informe o e-mail que vai receber o acesso.");
      return;
    }
    if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
      toast.error("Os e-mails não conferem.");
      return;
    }
    const parsedPhone = normalizePhoneBR(phone);
    if (!parsedPhone.ok) {
      toast.error(parsedPhone.message);
      return;
    }

    setSaving(true);
    try {
      const lines = cart.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
        notes: item.notes ?? null,
      }));
      const customer = {
        name: name.trim(),
        phone: parsedPhone.e164,
        email: email.trim(),
        notes: document.trim() ? `CPF/CNPJ: ${document.trim()}` : null,
      };

      // O servidor revalida preço, cupom e frete nos dois fluxos: o que o
      // visitante vê é conferência, nunca a fonte do valor cobrado.
      const result = isSubscription
        ? await sendSubscription({
            data: {
              slug,
              lines,
              couponCode: coupon.coupon?.code ?? null,
              paymentMethod: payment,
              period,
              fulfillment: "pickup" as const,
              ...customer,
            },
          })
        : await send({
            data: {
              slug,
              lines,
              couponCode: coupon.coupon?.code ?? null,
              paymentMethod: payment,
              installments: payment === "card_online" ? installments : null,
              ...customer,
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
      <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-xl space-y-4 p-6">
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-72 w-full" />
        </div>
      </CheckoutThemeProvider>
    );
  }

  if (!store.data) {
    return (
      <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">
          Não encontramos esta loja.
        </div>
      </CheckoutThemeProvider>
    );
  }

  const storeName = store.data.store.name;
  const logo = store.data.store.logo_url;
  const installmentLabel =
    plans.find((plan) => plan.count === installments)?.label ?? `1x de ${formatCurrency(total)}`;

  if (cart.hydrated && cart.items.length === 0) {
    return (
      <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-xl px-4 py-10">
          <Card>
            <CardContent className="space-y-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">Seu carrinho está vazio.</p>
              <Button asChild>
                <Link to="/$slug" params={{ slug }}>
                  Ver produtos
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </CheckoutThemeProvider>
    );
  }

  return (
    <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
        <Card className="overflow-hidden">
          <CardContent className="space-y-7 p-5 sm:p-7">
            {/* Identidade da loja */}
            <header className="flex items-center gap-3">
              {logo ? (
                <img
                  src={logo}
                  alt={`Logo de ${storeName}`}
                  className="size-14 rounded-2xl object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-lg font-bold text-foreground">
                  {storeName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <p className="text-base font-semibold">{storeName}</p>
            </header>

            {/* Dados do comprador */}
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <FieldLabel htmlFor="dc-name">Nome completo</FieldLabel>
                <Input
                  id="dc-name"
                  value={name}
                  autoComplete="name"
                  placeholder="Preencha seu nome"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <FieldLabel htmlFor="dc-email">Email</FieldLabel>
                <Input
                  id="dc-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  placeholder="Preencha seu email"
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <FieldLabel htmlFor="dc-email-2">Confirme seu email</FieldLabel>
                <Input
                  id="dc-email-2"
                  type="email"
                  value={emailConfirm}
                  placeholder="Confirme seu email"
                  onChange={(event) => setEmailConfirm(event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <FieldLabel htmlFor="dc-phone">Celular</FieldLabel>
                  <Input
                    id="dc-phone"
                    value={phone}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Preencha seu celular"
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <FieldLabel htmlFor="dc-doc">CPF/CNPJ</FieldLabel>
                  <Input
                    id="dc-doc"
                    value={document}
                    inputMode="numeric"
                    placeholder="Preencha seu CPF/CNPJ"
                    onChange={(event) => setDocument(event.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Periodicidade: só aparece quando o carrinho é 100% assinatura */}
            {isSubscription ? (
              <div className="space-y-2 border-t border-border pt-5">
                <SectionTitle>Periodicidade da assinatura</SectionTitle>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(PERIOD_LABEL) as SubscriptionPeriod[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={period === key}
                      onClick={() => setPeriod(key)}
                      className={
                        period === key
                          ? "rounded-xl border-2 border-primary bg-primary/5 px-3 py-2 text-sm font-semibold text-foreground"
                          : "rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40"
                      }
                    >
                      {PERIOD_LABEL[key]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  A cobrança se repete nesse intervalo e você pode cancelar quando quiser.
                </p>
              </div>
            ) : null}

            {/* Oferta */}
            <div className="space-y-2 border-t border-border pt-5">
              <div className="flex items-start justify-between gap-3">
                <SectionTitle>Oferta</SectionTitle>
                <div className="text-right">
                  {coupon.discount > 0 ? (
                    <p className="text-xs text-muted-foreground line-through">{formatCurrency(cart.subtotal)}</p>
                  ) : null}
                  <p className="text-sm font-bold text-success">{formatCurrency(total)}</p>
                </div>
              </div>
              {couponOpen || coupon.coupon ? (
                <div className="space-y-2">
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
                      <Button variant="outline" disabled={coupon.checking} onClick={() => void coupon.apply(couponInput)}>
                        {coupon.checking ? <Loader2 className="size-4 animate-spin" /> : "Aplicar"}
                      </Button>
                    </div>
                  )}
                  {coupon.feedback ? <CouponFeedbackMessage feedback={coupon.feedback} /> : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCouponOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  <Ticket className="size-3.5" aria-hidden="true" /> Tenho um cupom de desconto
                </button>
              )}
            </div>

            {/* Forma de pagamento */}
            <div className="space-y-3">
              <SectionTitle>Forma de Pagamento</SectionTitle>
              {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  A loja ainda não configurou formas de pagamento online.
                </p>
              ) : (
                <div
                  className={cn(
                    "grid gap-3",
                    options.length > 1 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1",
                  )}
                >
                  {options.map((key) => {
                    const meta = METHOD_META[key]!;
                    const active = payment === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPayment(key)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-card text-foreground hover:border-primary/50",
                        )}
                      >
                        {meta.icon}
                        <span className="text-xs font-semibold">{meta.label}</span>
                        <span
                          className={cn(
                            "text-[11px]",
                            active ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {meta.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {payment === "card_online" ? (
                <div className="grid gap-1.5">
                  <FieldLabel htmlFor="dc-installments">Parcelamento</FieldLabel>
                  <Select value={String(installments)} onValueChange={(value) => setInstallments(Number(value))}>
                    <SelectTrigger id="dc-installments">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.count} value={String(plan.count)}>
                          {plan.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock className="size-3" aria-hidden="true" />
                    Os dados do cartão são preenchidos na página segura do pagamento.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Resumo do pedido */}
            <div className="space-y-3">
              <SectionTitle>Resumo do pedido</SectionTitle>
              <div className="space-y-2 rounded-xl border border-border bg-secondary/60 p-4 text-sm">
                {cart.items.map((item) => (
                  <div key={item.lineId} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground">Acesso digital · {item.quantity}x</p>
                    </div>
                    <span className="shrink-0 text-success">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
                {coupon.discount > 0 ? (
                  <div className="flex justify-between text-success">
                    <span>Cupom {coupon.coupon?.code}</span>
                    <span>-{formatCurrency(coupon.discount)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-border pt-3 font-bold text-primary">
                  <span>Total</span>
                  <span>{payment === "card_online" ? installmentLabel : formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            <Button className="h-12 w-full text-sm font-semibold" onClick={confirm} disabled={saving}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              {payment === "card_online" ? "Pagar com Cartão de Crédito" : "Pagar com PIX"}
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Compra segura · acesso liberado após a confirmação do pagamento
            </p>
          </CardContent>
        </Card>
      </div>
    </CheckoutThemeProvider>
  );
}

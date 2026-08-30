import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { CouponFeedbackMessage } from "@/components/catalogo/CouponFeedbackMessage";
import { useStoreDocumentTitle } from "@/hooks/useStoreDocumentTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { rememberOrder, useCart } from "@/hooks/useCart";
import { useCartCoupon } from "@/hooks/useCartCoupon";
import { useUpsellSuggestions } from "@/hooks/useUpsellSuggestions";
import { UpsellSuggestions } from "@/components/store/UpsellSuggestions";
import {
  marcarCarrinhoRecuperado,
  salvarCarrinhoAbandonado,
} from "@/lib/carrinho-abandonado.functions";

import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { EMPTY_TRACKING, bumpPrice, parseTracking, type Tracking } from "@/lib/digitais";
import { PaymentMethodPicker } from "@/components/store/PaymentMethodPicker";
import { LoyaltyCard } from "@/components/store/LoyaltyCard";
import {
  checkProductionCapacity,
  joinProductionQueue,
  type CapacityResponse,
} from "@/lib/producao.functions";
import { maxRedeemable } from "@/lib/cashback";
import { applyReferralCode, publicCashbackStatus } from "@/lib/cashback.functions";
import { awardOrderLoyalty } from "@/lib/fidelidade.functions";
import { estimateDelivery, type DeliveryEstimate } from "@/lib/geo.functions";
import { formatKm } from "@/lib/geo";
import { RouteMap } from "@/components/mapa/RouteMap";
import {
  checkoutGuard,
  customerAccount,
  validateCoupon,
  type CustomerAccount,
} from "@/lib/orders.functions";
import {
  DEFAULT_CHECKOUT_SETTINGS,
  getCheckoutSettings,
  saveCheckoutIdentity,
} from "@/lib/identificacao.functions";
import { PhoneIdentifyCard, type IdentityConsent } from "@/components/store/PhoneIdentifyCard";
import { normalizePhoneBR } from "@/lib/phone";
import { maskPhone } from "@/lib/masks";



import { fulfillmentOptions, timeSlots } from "@/lib/orders";
import {
  PAYMENT_METHOD_LABEL,
  parseOpeningHours,
  parsePaymentMethods,
  storeAvailability,
} from "@/lib/store-config";
import { computeDynamicEta } from "@/lib/operacao";
import { getStoreLoad } from "@/lib/operacao.functions";
import { publicStoreQuery } from "@/lib/store-queries";
import { CheckoutThemeProvider } from "@/components/store/CheckoutThemeProvider";

export const Route = createFileRoute("/$slug/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar pedido — O Seu Pedido" },
      {
        name: "description",
        content:
          "Confirme os itens, escolha entrega, retirada ou agendamento e finalize seu pedido.",
      },
      { property: "og:title", content: "Finalizar pedido" },
      {
        property: "og:description",
        content: "Revise o carrinho e envie seu pedido direto para a loja.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CheckoutPage,
});

const checkoutSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo."),
  phone: z.string().trim().min(8, "Informe um telefone válido para contato."),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  zip: z.string().trim().optional(),
  street: z.string().trim().optional(),
  number: z.string().trim().optional(),
  district: z.string().trim().optional(),
  complement: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional(),
});

type Fulfillment = ReturnType<typeof fulfillmentOptions>[number]["value"];

function CheckoutPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(publicStoreQuery(slug));
  const load = useQuery({
    queryKey: ["store-load", data?.store.id],
    enabled: Boolean(data?.store.id),
    refetchInterval: 120_000,
    queryFn: () => getStoreLoad({ data: { storeId: data!.store.id } }),
  });
  const cart = useCart(slug, data?.store.id ?? null);
  const couponState = useCartCoupon(slug, data?.store.id ?? null, cart.subtotal, cart.hydrated);
  const coupon = couponState.coupon;
  const checkingCoupon = couponState.checking;


  // Origem da venda: afiliado e UTMs vindos do link, guardados durante a sessão.
  useEffect(() => {
    const key = `origem:${slug}`;
    const fromUrl = parseTracking(window.location.search);
    const hasUrl = Object.values(fromUrl).some(Boolean);
    if (hasUrl) {
      sessionStorage.setItem(key, JSON.stringify(fromUrl));
      setTracking(fromUrl);
      return;
    }
    const stored = sessionStorage.getItem(key);
    if (stored) {
      try {
        setTracking({ ...EMPTY_TRACKING, ...(JSON.parse(stored) as Tracking) });
      } catch {
        /* origem inválida é ignorada */
      }
    }
  }, [slug]);

  const offersQuery = useQuery({
    queryKey: ["checkout-offers", data?.store.id],
    enabled: Boolean(data?.store.id),
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("checkout_offers")
        .select("id, title, description, discount_percent, kind, impressions, conversions, product:products!checkout_offers_product_id_fkey(id, name, price)")
        .eq("store_id", data!.store.id)
        .eq("is_active", true)
        .order("sort_order");
      return rows ?? [];
    },
  });
  const offersSeen = useRef(false);
  const checkCoupon = useServerFn(validateCoupon);
  const quoteDeliveryFee = useServerFn(estimateDelivery);
  const loadAccount = useServerFn(customerAccount);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    zip: "",
    street: "",
    number: "",
    district: "",
    complement: "",
    reference: "",
    notes: "",
    table: "",
  });
  const [fulfillment, setFulfillment] = useState<Fulfillment | "">("");
  const [payment, setPayment] = useState("");
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [timing, setTiming] = useState<"now" | "scheduled">("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [capacityBlock, setCapacityBlock] = useState<CapacityResponse | null>(null);
  const [useCashback, setUseCashback] = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralApplied, setReferralApplied] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [acceptedOffers, setAcceptedOffers] = useState<string[]>([]);
  const [tracking, setTracking] = useState<Tracking>(EMPTY_TRACKING);
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState<IdentityConsent>({
    acceptedTerms: false,
    marketingOptIn: false,
    createProfile: true,
  });

  // Preferências de checkout definidas pelo lojista (visitante, verificação, etc.).
  const checkoutSettingsQuery = useQuery({
    queryKey: ["checkout-settings", slug],
    queryFn: () => getCheckoutSettings({ data: { storeSlug: slug } }),
    staleTime: 300_000,
  });
  const settings = checkoutSettingsQuery.data ?? DEFAULT_CHECKOUT_SETTINGS;
  const upsellSuggestions = useUpsellSuggestions(data, cart.items, {
    enabled: settings.upsellEnabled,
    max: settings.upsellMaxItems,
  });
  const persistIdentity = useServerFn(saveCheckoutIdentity);


  // Funil: registra os eventos do checkout com a origem da visita.
  const logCheckout = useCallback(
    (
      kind: string,
      extra: { amount?: number; couponCode?: string | null; offerId?: string | null; orderId?: string | null } = {},
    ) => {
      const storeId = data?.store.id;
      if (!storeId) return;
      void supabase.from("checkout_events").insert({
        store_id: storeId,
        kind,
        amount: extra.amount ?? 0,
        coupon_code: extra.couponCode ?? null,
        offer_id: extra.offerId ?? null,
        order_id: extra.orderId ?? null,
        affiliate_code: tracking.affiliate_code,
        utm_source: tracking.utm_source,
        utm_medium: tracking.utm_medium,
        utm_campaign: tracking.utm_campaign,
        utm_content: tracking.utm_content,
      });
    },
    [data?.store.id, tracking],
  );

  const viewLogged = useRef(false);
  useEffect(() => {
    if (viewLogged.current || !data?.store.id) return;
    viewLogged.current = true;
    logCheckout("view");
  }, [data?.store.id, logCheckout]);

  // Conta uma exibição por visita para medir a conversão do order bump.
  useEffect(() => {
    const rows = offersQuery.data ?? [];
    if (offersSeen.current || rows.length === 0) return;
    offersSeen.current = true;
    rows.forEach((offer) => logCheckout("bump_view", { offerId: offer.id }));
    void Promise.all(
      rows.map((offer) =>
        supabase
          .from("checkout_offers")
          .update({ impressions: (offer.impressions ?? 0) + 1 })
          .eq("id", offer.id),
      ),
    );
  }, [offersQuery.data, logCheckout]);

  const store = data?.store ?? null;
  useStoreDocumentTitle(store?.name, "Finalizar pedido");


  const options = useMemo(() => (store ? fulfillmentOptions(store) : []), [store]);
  const payments = useMemo(
    () => (store ? parsePaymentMethods(store.payment_methods) : null),
    [store],
  );
  const openingHours = useMemo(
    () => (store ? parseOpeningHours(store.opening_hours) : []),
    [store],
  );
  const slots = useMemo(() => timeSlots(openingHours, date), [openingHours, date]);
  const isDeliverySelected = fulfillment === "delivery";

  useEffect(() => {
    if (!fulfillment && options.length > 0) setFulfillment(options[0]!.value);
  }, [options, fulfillment]);

  useEffect(() => {
    if (payment || !payments) return;
    const first = (Object.keys(payments) as (keyof typeof payments)[]).find((key) => payments[key]);
    if (first) setPayment(first);
  }, [payments, payment]);

  useEffect(() => {
    if (fulfillment === "scheduled") setTiming("scheduled");
  }, [fulfillment]);

  // Reconhece o cliente pelo telefone/e-mail e traz histórico e saldo de fidelidade.
  useEffect(() => {
    const digits = form.phone.replace(/\D/g, "");
    if (digits.length < 10 && form.email.length < 6) {
      setAccount(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void loadAccount({ data: { storeSlug: slug, phone: form.phone, email: form.email } })
        .then((result) => {
          if (active) setAccount(result);
        })
        .catch(() => undefined);
    }, 600);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.phone, form.email, slug, loadAccount]);

  // Cashback em R$: o saldo utilizável já respeita validade e teto da loja,
  // por isso vem do servidor em vez de ser calculado no cliente.
  const cashbackQuery = useQuery({
    queryKey: ["cashback", slug, form.phone.replace(/\D/g, "")],
    enabled: form.phone.replace(/\D/g, "").length >= 10,
    queryFn: () => publicCashbackStatus({ data: { storeSlug: slug, phone: form.phone } }),
    staleTime: 30_000,
  });
  const cashback = cashbackQuery.data ?? null;



  // Recuperação de carrinho abandonado: com o telefone já informado, guardamos
  // o carrinho no servidor para poder enviar um único lembrete depois. Sem
  // telefone válido não há nada a guardar — e nada é enviado.
  const cartSignature = JSON.stringify(
    cart.items.map((item) => [item.productId, item.variantId ?? "", item.quantity, item.unitPrice, item.notes ?? ""]),
  );
  useEffect(() => {
    if (!cart.hydrated) return;
    const digits = form.phone.replace(/\D/g, "");
    if (digits.length < 10) return;

    const timer = window.setTimeout(() => {
      void salvarCarrinhoAbandonado({
        data: {
          storeSlug: slug,
          phone: form.phone,
          name: form.name.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          couponCode: couponState.coupon?.code ?? undefined,
          items: cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            variantName: item.variantName ?? null,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            notes: item.notes ?? null,
            options: item.options ?? [],
          })),
          address: {
            zipCode: form.zip || undefined,
            street: form.street || undefined,
            number: form.number || undefined,
            complement: form.complement || undefined,
            district: form.district || undefined,
            reference: form.reference || undefined,
          },
        },
      }).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
    // cartSignature resume o conteúdo do carrinho sem disparar a cada render.
  }, [cartSignature, cart.hydrated, form.phone, slug]);



  // Calcula distância, prazo e frete assim que o endereço estiver utilizável.
  const zipDigits = form.zip.replace(/\D/g, "");
  const addressReady = isDeliverySelected && (zipDigits.length === 8 || (form.street.trim().length > 3 && form.district.trim().length > 2));
  useEffect(() => {
    if (!addressReady) {
      setEstimate(null);
      return;
    }
    let active = true;
    setEstimating(true);
    const timer = window.setTimeout(() => {
      void quoteDeliveryFee({
        data: {
          storeSlug: slug,
          zip: form.zip,
          street: form.street,
          number: form.number,
          district: form.district,
          subtotal: cart.subtotal,
        },
      })
        .then((result) => {
          if (active) setEstimate(result);
        })
        .catch(() => {
          if (active) setEstimate(null);
        })
        .finally(() => {
          if (active) setEstimating(false);
        });
    }, 700);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [addressReady, form.zip, form.street, form.number, form.district, cart.subtotal, slug, quoteDeliveryFee]);

  // Busca automática de endereço pelo CEP (ViaCEP).
  useEffect(() => {
    const digits = form.zip.replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepError(null);
      return;
    }
    let active = true;
    setIsSearchingCep(true);
    setCepError(null);
    const timer = window.setTimeout(() => {
      fetch(`https://viacep.com.br/ws/${digits}/json/`)
        .then((res) => res.json())
        .then((data: { erro?: boolean; logradouro?: string; bairro?: string; complemento?: string }) => {
          if (!active) return;
          if (data.erro) {
            setCepError("Não encontramos este CEP. Você pode preencher o endereço manualmente.");
            return;
          }
          setForm((current) => ({
            ...current,
            street: current.street.trim() || (data.logradouro ?? current.street),
            district: current.district.trim() || (data.bairro ?? current.district),
            complement: current.complement.trim() || (data.complemento ?? current.complement),
          }));
        })
        .catch(() => {
          if (!active) return;
          setCepError("Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente.");
        })
        .finally(() => {
          if (active) setIsSearchingCep(false);
        });
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
      setIsSearchingCep(false);
    };
  }, [form.zip]);

  // Repetir pedido: reaproveita o endereço completo do pedido anterior.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(`repetir-endereco:${slug}`);
    } catch {
      stored = null;
    }
    if (!stored) return;
    try {
      const address = JSON.parse(stored) as Partial<Record<
        "zip" | "street" | "number" | "district" | "complement" | "reference",
        string
      >>;
      setForm((current) => ({
        ...current,
        zip: current.zip.trim() || (address.zip ?? ""),
        street: current.street.trim() || (address.street ?? ""),
        number: current.number.trim() || (address.number ?? ""),
        district: current.district.trim() || (address.district ?? ""),
        complement: current.complement.trim() || (address.complement ?? ""),
        reference: current.reference.trim() || (address.reference ?? ""),
      }));
    } catch {
      /* endereço inválido é ignorado */
    } finally {
      try {
        sessionStorage.removeItem(`repetir-endereco:${slug}`);
      } catch {
        /* nada a limpar */
      }
    }
  }, [slug]);

  if (isLoading) {
    return (
      <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </CheckoutThemeProvider>
    );
  }

  if (!data || !store || !payments) {
    return (
      <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
          <h1 className="text-2xl font-semibold text-foreground">Loja não encontrada</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </CheckoutThemeProvider>
    );
  }

  const availability = storeAvailability(store);
  const selected = options.find((option) => option.value === fulfillment) ?? null;
  const isDelivery = isDeliverySelected;
  const deliveryFee = isDelivery ? (estimate?.ok ? estimate.fee : Number(store.delivery_fee)) : 0;
  const cashbackAvailable = cashback?.enabled ? cashback.balance : (account?.cashback ?? 0);
  const discountFromCoupon = couponState.discount;
  const afterCoupon = Math.max(0, cart.subtotal - discountFromCoupon);
  // Teto de uso por pedido definido pelo lojista (ex.: no máximo 50% do valor).
  const cashbackLimit = maxRedeemable(cashbackAvailable, afterCoupon, cashback?.maxPercentUse ?? 100);
  const cashbackApplied = useCashback ? cashbackLimit : 0;
  const offers = (offersQuery.data ?? []).filter((offer) => offer.product);
  const bumpLines = offers
    .filter((offer) => acceptedOffers.includes(offer.id))
    .map((offer) => ({
      offerId: offer.id,
      productId: offer.product!.id,
      name: offer.product!.name,
      price: bumpPrice(Number(offer.product!.price), Number(offer.discount_percent)),
    }));
  const bumpTotal = bumpLines.reduce((sum, line) => sum + line.price, 0);
  const total = Math.max(0, afterCoupon - cashbackApplied + deliveryFee + bumpTotal);
  const belowMinimum = cart.subtotal < Number(store.min_order_value);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function applyCoupon() {
    const result = await couponState.apply(couponCode);
    if (result.kind === "success") {
      logCheckout("coupon", { couponCode: couponState.coupon?.code ?? null, amount: couponState.discount });
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  }

  /** Valida tudo antes de abrir a revisão final. */
  function openReview() {
    if (cart.items.length === 0) {
      toast.error("Seu carrinho está vazio.");
      return;
    }
    if (belowMinimum) {
      toast.error(
        `O pedido mínimo desta loja é ${formatCurrency(Number(store!.min_order_value))}.`,
      );
      return;
    }
    if (!selected) {
      toast.error("Escolha a forma de atendimento.");
      return;
    }
    const parsed = checkoutSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados informados.");
      return;
    }
    const normalizedPhone = normalizePhoneBR(form.phone);
    if (!normalizedPhone.ok) {
      toast.error(normalizedPhone.message);
      return;
    }
    if (!consent.acceptedTerms) {
      toast.error("Aceite os Termos de Uso e a Política de Privacidade para continuar.");
      return;
    }
    if (settings.requireEmail && !form.email.trim()) {
      toast.error("Esta loja pede um e-mail válido para o pedido.");
      return;
    }
    if (!settings.allowGuest && !consent.createProfile) {
      toast.error("Esta loja exige cadastro para finalizar o pedido.");
      return;
    }

    if (isDelivery && (!form.street.trim() || !form.number.trim())) {
      toast.error("Informe rua e número para a entrega.");
      return;
    }
    if (isDelivery && estimate?.blockedReason) {
      toast.error(estimate.blockedReason);
      return;
    }
    if (fulfillment === "table" && !form.table.trim()) {
      toast.error("Informe o número da mesa.");
      return;
    }
    if (timing === "scheduled" && (!date || !time)) {
      toast.error("Escolha data e horário para o agendamento.");
      return;
    }
    if (!payment) {
      toast.error("Escolha a forma de pagamento.");
      return;
    }
    setReview(true);
  }

  async function submitOrder() {
    if (!store || !selected) return;
    setSubmitting(true);
    try {
      const guard = await checkoutGuard({ data: { storeSlug: store.slug, phone: form.phone } });
      if (!guard.ok) {
        toast.error(guard.message);
        setSubmitting(false);
        return;
      }

      // Identificação do cliente: cria/atualiza cadastro por telefone e grava aceites.
      const identity = await persistIdentity({
        data: {
          storeSlug: store.slug,
          phone: form.phone,
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          fulfillment: String(fulfillment),
          acceptedTerms: consent.acceptedTerms,
          marketingOptIn: consent.marketingOptIn,
          createProfile: consent.createProfile,
          address: isDelivery
            ? {
                street: form.street.trim(),
                number: form.number.trim(),
                complement: form.complement.trim(),
                reference: form.reference.trim(),
                district: form.district.trim(),
                zipCode: form.zip.trim(),
              }
            : undefined,
        },
      });
      if (!identity.ok) {
        toast.error(identity.message);
        setSubmitting(false);
        return;
      }



      const scheduledFor =
        timing === "scheduled" && date && time
          ? new Date(`${date}T${time}:00`).toISOString()
          : null;

      // Capacidade de produção: a cozinha não pode receber mais do que aguenta.
      if (scheduledFor) {
        const capacity = await checkProductionCapacity({
          data: {
            storeSlug: store.slug,
            desiredAt: scheduledFor,
            itemsCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
          },
        });
        if (!capacity.allowed) {
          setCapacityBlock(capacity);
          toast.error(capacity.reason);
          setSubmitting(false);
          return;
        }
        setCapacityBlock(null);
      }

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          store_id: store.id,
          customer_name: form.name.trim(),
          customer_phone: form.phone.trim(),
          customer_email: form.email.trim() || null,
          type: scheduledFor ? "scheduled" : selected.orderType,
          table_number: fulfillment === "table" ? form.table.trim() : null,
          distance_km: isDelivery ? estimate?.distanceKm ?? null : null,
          delivery_lat: isDelivery ? estimate?.destination?.lat ?? null : null,
          delivery_lng: isDelivery ? estimate?.destination?.lng ?? null : null,
          address: isDelivery
            ? {
                zip: form.zip.trim(),
                street: form.street.trim(),
                number: form.number.trim(),
                district: form.district.trim(),
                complement: form.complement.trim(),
                reference: form.reference.trim(),
              }
            : null,
          notes:
            [
              form.notes.trim(),
              payment === "cash" && needsChange && changeFor.trim()
                ? `Troco para R$ ${changeFor.trim()}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ") || null,
          subtotal: cart.subtotal + bumpTotal,
          delivery_fee: deliveryFee,
          affiliate_code: tracking.affiliate_code,
          utm_source: tracking.utm_source,
          utm_medium: tracking.utm_medium,
          utm_campaign: tracking.utm_campaign,
          utm_content: tracking.utm_content,
          discount: discountFromCoupon,
          coupon_code: coupon?.code ?? null,
          cashback_used: cashbackApplied,
          total,
          payment_method: payment,
          scheduled_for: scheduledFor,
          channel: "loja",
        })
        .select("id, code")
        .single();

      if (error || !order) throw new Error(error?.message ?? "Falha ao criar pedido.");

      const { error: itemsError } = await supabase.from("order_items").insert(
        cart.items.map((item) => ({
          order_id: order.id,
          store_id: store.id,
          product_id: item.productId,
          variant_id: item.variantId ?? null,
          variant_name: item.variantName ?? null,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total: item.unitPrice * item.quantity,
          notes:
            [
              (item.options ?? [])
                .map((option) => `${option.groupName}: ${option.optionName}`)
                .join(" · "),
              item.notes?.trim() ?? "",
            ]
              .filter(Boolean)
              .join(" | ") || null,
        })),
      );
      if (itemsError) throw new Error(itemsError.message);

      // Order bump: adiciona as ofertas aceitas e registra a conversão.
      if (bumpLines.length > 0) {
        await supabase.from("order_items").insert(
          bumpLines.map((line) => ({
            order_id: order.id,
            store_id: store.id,
            product_id: line.productId,
            product_name: line.name,
            quantity: 1,
            unit_price: line.price,
            total: line.price,
            notes: "Oferta do checkout",
          })),
        );
        for (const line of bumpLines) {
          const offer = offers.find((item) => item.id === line.offerId);
          if (offer) {
            await supabase
              .from("checkout_offers")
              .update({ conversions: (offer.conversions ?? 0) + 1 })
              .eq("id", line.offerId);
          }
        }
      }

      logCheckout("purchase", { amount: total, orderId: order.id, couponCode: coupon?.code ?? null });

      // Fidelidade: credita pontos e cashback do pedido (silencioso em caso de falha).
      try {
        const loyalty = await awardOrderLoyalty({
          data: { storeSlug: store.slug, orderCode: order.code, phone: form.phone.trim() },
        });
        if (loyalty.ok && loyalty.points > 0) toast.success(loyalty.message);
      } catch {
        /* o programa de fidelidade nunca bloqueia a conclusão do pedido */
      }

      // Pedido enviado: encerra o ciclo de recuperação (nada de lembrete).
      void marcarCarrinhoRecuperado({
        data: { storeSlug: store.slug, phone: form.phone, orderId: order.id },
      }).catch(() => undefined);

      rememberOrder(slug, {
        code: order.code,
        storeId: store.id,
        storeName: store.name,
        total,
        createdAt: new Date().toISOString(),
        phone: form.phone.trim(),
      });
      cart.clear();

      couponState.clear();
      setReview(false);
      toast.success(`Pedido ${order.code} enviado para a loja!`);
      if (identity.created) toast.success(identity.message);

      void navigate({ to: "/$slug/acompanhar", params: { slug }, search: { codigo: order.code } });
    } catch {
      toast.error("Não foi possível enviar o pedido. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  const enabledPayments = (Object.keys(payments) as (keyof typeof payments)[]).filter(
    (key) => payments[key],
  );

  return (
    <CheckoutThemeProvider className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
          <span className="text-base font-semibold tracking-tight text-foreground">{store.name}</span>

          <Link
            to="/$slug"
            params={{ slug }}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Voltar ao catálogo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-32 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Finalizar pedido
          </h1>
          {store.is_demo ? <DemoBadge /> : null}
        </div>
        {availability.accepting && load.data ? (
          <p className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Preparo estimado agora:{" "}
            <strong className="text-foreground">
              {
                computeDynamicEta({
                  baseMinutes: load.data.baseMinutes,
                  activeOrders: load.data.activeOrders,
                  capacity: load.data.capacity,
                }).label
              }
            </strong>
            {load.data.activeOrders > 0 ? ` · ${load.data.activeOrders} pedido(s) na fila` : ""}
          </p>
        ) : null}
        {!availability.accepting ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            {availability.message} Você pode enviar o pedido como agendado, se a loja aceitar.
          </p>
        ) : null}

        {/* 0. Identificação por telefone */}
        <PhoneIdentifyCard
          slug={slug}
          phone={form.phone}
          settings={settings}
          consent={consent}
          onPhoneChange={(value) => update("phone", value)}
          onConsentChange={setConsent}
          onApplyCustomer={({ name, email, address }) => {
            setForm((current) => ({
              ...current,
              name: name ?? current.name,
              email: email ?? current.email,
              zip: address?.zipCode ?? current.zip,
              street: address?.street ?? current.street,
              number: address?.number ?? current.number,
              district: address?.district ?? current.district,
              complement: address?.complement ?? current.complement,
              reference: address?.reference ?? current.reference,
            }));
            toast.success("Dados preenchidos. Confira antes de finalizar.");
          }}
        />

        {/* 1. Itens */}

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">1. Seus itens</CardTitle>
            <CardDescription>Ajuste as quantidades antes de continuar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Seu carrinho está vazio.</p>
            ) : (
              cart.items.map((item) => (
                <div key={item.lineId} className="flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{item.name}</p>
                    {item.options && item.options.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {item.options.map((option) => option.optionName).join(" · ")}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="text-xs text-muted-foreground">Obs.: {item.notes}</p>
                    ) : null}
                    <p className="text-muted-foreground">{formatCurrency(item.unitPrice)} cada</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Remover uma unidade de ${item.name}`}
                      onClick={() => cart.setQuantity(item.lineId, item.quantity - 1)}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center">{item.quantity}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Adicionar uma unidade de ${item.name}`}
                      onClick={() => cart.setQuantity(item.lineId, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 2. Atendimento */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">2. Como você quer receber</CardTitle>
            <CardDescription>Opções liberadas por esta loja.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={fulfillment}
              onValueChange={(value) => setFulfillment(value as Fulfillment)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {options.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`atendimento-${option.value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-card p-3 has-[:checked]:border-primary"
                >
                  <RadioGroupItem
                    id={`atendimento-${option.value}`}
                    value={option.value}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>

            {fulfillment === "table" ? (
              <div className="space-y-2">
                <Label htmlFor="mesa">Número da mesa</Label>
                <Input
                  id="mesa"
                  inputMode="numeric"
                  value={form.table}
                  onChange={(event) => update("table", event.target.value)}
                  placeholder="Ex.: 12"
                />
              </div>
            ) : null}

            <div className="space-y-3 rounded-xl border border-border/70 p-3">
              <RadioGroup
                value={timing}
                onValueChange={(value) => setTiming(value as "now" | "scheduled")}
                className="flex flex-wrap gap-4"
              >
                <Label htmlFor="agora" className="flex cursor-pointer items-center gap-2 text-sm">
                  <RadioGroupItem id="agora" value="now" disabled={fulfillment === "scheduled"} />
                  O mais breve possível
                </Label>
                <Label
                  htmlFor="agendado"
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <RadioGroupItem id="agendado" value="scheduled" />
                  Agendar data e horário
                </Label>
              </RadioGroup>

              {timing === "scheduled" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="data">Data</Label>
                    <Input
                      id="data"
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={date}
                      onChange={(event) => {
                        setDate(event.target.value);
                        setTime("");
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hora">Horário</Label>
                    <Select value={time} onValueChange={setTime}>
                      <SelectTrigger id="hora">
                        <SelectValue
                          placeholder={
                            slots.length ? "Escolha um horário" : "Sem horários nesta data"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {slots.map((slot) => (
                          <SelectItem key={slot} value={slot}>
                            {slot}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* 3. Dados */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">3. Seus dados</CardTitle>
            <CardDescription>Não é preciso criar conta para pedir.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                autoComplete="name"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
              <Input
                id="telefone"
                inputMode="tel"
                autoComplete="tel"
                value={maskPhone(form.phone)}
                onChange={(event) => update("phone", maskPhone(event.target.value))}

              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
              />
            </div>

            {isDelivery ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <div className="relative">
                    <Input
                      id="cep"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      value={form.zip}
                      onChange={(event) => update("zip", event.target.value)}
                      placeholder="00000-000"
                      disabled={isSearchingCep}
                      className={isSearchingCep ? "pr-10" : undefined}
                    />
                    {isSearchingCep ? (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </span>
                    ) : null}
                  </div>
                  {cepError ? (
                    <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-sm text-amber-700 dark:text-amber-400">{cepError}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCepError(null);
                          document.getElementById("rua")?.focus();
                        }}
                      >
                        Usar este endereço
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rua">Rua</Label>
                  <Input
                    id="rua"
                    value={form.street}
                    onChange={(event) => update("street", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    value={form.number}
                    onChange={(event) => update("number", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input
                    id="bairro"
                    value={form.district}
                    onChange={(event) => update("district", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input
                    id="complemento"
                    value={form.complement}
                    onChange={(event) => update("complement", event.target.value)}
                    placeholder="Apto, bloco, sala"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="referencia">Ponto de referência</Label>
                  <Input
                    id="referencia"
                    value={form.reference}
                    onChange={(event) => update("reference", event.target.value)}
                    placeholder="Ex.: portão azul, ao lado da praça"
                  />
                </div>

                <div className="sm:col-span-2 space-y-2 rounded-xl border border-border/70 bg-muted/40 p-3">
                  {estimating ? (
                    <p className="text-sm text-muted-foreground">Calculando distância e frete…</p>
                  ) : estimate?.ok ? (
                    <>
                      <p className="text-sm text-foreground">
                        Distância estimada: <strong>{formatKm(estimate.distanceKm)}</strong> · Entrega em
                        aproximadamente <strong>{estimate.etaMinutes} min</strong> (chegada por volta das{" "}
                        <strong>
                          {new Date(Date.now() + estimate.etaMinutes * 60_000).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </strong>
                        ) · Frete{" "}
                        <strong>{estimate.fee === 0 ? "grátis" : formatCurrency(estimate.fee)}</strong>
                        {estimate.zoneLabel ? ` · Área: ${estimate.zoneLabel}` : ""}
                      </p>
                      {estimate.message ? (
                        <p className="text-xs text-muted-foreground">{estimate.message}</p>
                      ) : null}
                      {estimate.blockedReason ? (
                        <p className="text-xs text-destructive">{estimate.blockedReason}</p>
                      ) : null}
                      {estimate.destination ? (
                        <RouteMap
                          origin={estimate.origin}
                          destination={estimate.destination}
                          geometry={estimate.geometry}
                          className="h-44"
                        />
                      ) : null}

                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Informe o CEP ou rua e bairro para calcularmos a distância e o frete.
                    </p>
                  )}
                </div>
              </>
            ) : null}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="observacoes">Observações do pedido</Label>
              <Textarea
                id="observacoes"
                rows={3}
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Sem cebola, troco para R$ 50, etc."
              />
            </div>
          </CardContent>
        </Card>

        {/* 4. Cupom, saldo e pagamento */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">4. Descontos e pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/40 p-3">
              <Label htmlFor="cupom" className="text-xs font-bold uppercase tracking-wide">
                Cupom de desconto
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="cupom"
                  value={coupon?.code ?? couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  placeholder="SEUCUPOM"
                  disabled={Boolean(coupon) || checkingCoupon}
                  className="min-w-[160px] flex-1 bg-card uppercase"
                />
                {coupon ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      couponState.clear();
                      setCouponCode("");
                    }}
                  >
                    Remover
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void applyCoupon()} disabled={checkingCoupon}>
                    {checkingCoupon ? "Validando..." : "Aplicar"}
                  </Button>
                )}
              </div>
              {coupon ? (
                <p className="text-sm font-medium text-success">
                  Cupom {coupon.code} aplicado: −{formatCurrency(discountFromCoupon)}
                </p>
              ) : couponState.feedback?.kind === "error" ? (
                <CouponFeedbackMessage feedback={couponState.feedback} />
              ) : null}
            </div>

            {offers.filter((offer) => offer.kind === "bump").length > 0 ? (
              <div className="space-y-2">
                {offers
                  .filter((offer) => offer.kind === "bump")
                  .map((offer) => {
                    const price = bumpPrice(Number(offer.product!.price), Number(offer.discount_percent));
                    const checked = acceptedOffers.includes(offer.id);
                    return (
                      <label
                        key={offer.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-primary/60 bg-primary/5 p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            {
                              if (event.target.checked) logCheckout("bump_accept", { offerId: offer.id });
                              setAcceptedOffers((current) =>
                                event.target.checked
                                  ? [...current, offer.id]
                                  : current.filter((id) => id !== offer.id),
                              );
                            }
                          }
                          className="mt-1 size-4 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{offer.title}</span>
                          {offer.description ? (
                            <span className="block text-xs text-muted-foreground">{offer.description}</span>
                          ) : null}
                          <span className="block text-xs text-muted-foreground">
                            {offer.product!.name} por {formatCurrency(price)}
                            {Number(offer.discount_percent) > 0
                              ? ` (de ${formatCurrency(Number(offer.product!.price))})`
                              : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
              </div>
            ) : null}

            {cashbackAvailable > 0 ? (
              <label className="flex items-start gap-3 rounded-xl border border-border/70 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={useCashback}
                  onChange={(event) => setUseCashback(event.target.checked)}
                  disabled={cashbackLimit <= 0}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  Usar meu cashback:{" "}
                  <strong className="text-foreground">{formatCurrency(cashbackAvailable)}</strong>
                  {cashbackLimit > 0 && cashbackLimit < cashbackAvailable ? (
                    <span className="block text-xs text-muted-foreground">
                      Neste pedido você pode usar até {formatCurrency(cashbackLimit)}.
                    </span>
                  ) : null}
                  {cashbackLimit <= 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      Saldo indisponível para este pedido.
                    </span>
                  ) : null}
                  {cashback?.expiresAt ? (
                    <span className="block text-xs text-muted-foreground">
                      Válido até {new Date(cashback.expiresAt).toLocaleDateString("pt-BR")}.
                    </span>
                  ) : null}
                </span>
              </label>
            ) : null}

            {cashback?.referralEnabled && !cashback.referredAlready && cashback.referralCount === 0 ? (
              <div className="space-y-2 rounded-xl border border-border/70 p-3 text-sm">
                <p className="font-medium text-foreground">Tem um código de indicação?</p>
                <p className="text-xs text-muted-foreground">
                  Você e quem indicou recebem cashback depois que este pedido for concluído.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={referralInput}
                    onChange={(event) => setReferralInput(event.target.value.toUpperCase())}
                    placeholder="CODIGO"
                    disabled={Boolean(referralApplied)}
                    aria-label="Código de indicação"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={Boolean(referralApplied) || referralInput.trim().length < 4}
                    onClick={async () => {
                      const result = await applyReferralCode({
                        data: { storeSlug: slug, phone: form.phone, code: referralInput },
                      });
                      setReferralMessage(result.message);
                      if (result.ok) {
                        setReferralApplied(referralInput.trim().toUpperCase());
                        await cashbackQuery.refetch();
                      }
                    }}
                  >
                    Aplicar
                  </Button>
                </div>
                {referralMessage ? (
                  <p
                    className={
                      referralApplied ? "text-xs text-emerald-700" : "text-xs text-destructive"
                    }
                  >
                    {referralMessage}
                  </p>
                ) : null}
              </div>
            ) : null}


            <PaymentMethodPicker
              enabled={enabledPayments}
              value={payment}
              onChange={setPayment}
              needsChange={needsChange}
              onNeedsChangeToggle={setNeedsChange}
              changeFor={changeFor}
              onChangeForChange={setChangeFor}
            />
          </CardContent>
        </Card>

        {capacityBlock ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-base">Este horário não tem vaga</CardTitle>
              <CardDescription>{capacityBlock.reason}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {capacityBlock.suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {capacityBlock.suggestions.slice(0, 6).map((suggestion) => {
                    const slotDate = new Date(suggestion.slot);
                    return (
                      <Button
                        key={suggestion.slot}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDate(slotDate.toISOString().slice(0, 10));
                          setTime(slotDate.toTimeString().slice(0, 5));
                          setCapacityBlock(null);
                        }}
                      >
                        {slotDate.toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
              {capacityBlock.canQueue ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    const result = await joinProductionQueue({
                      data: {
                        storeSlug: slug,
                        customerName: form.name.trim() || "Cliente",
                        customerPhone: form.phone.trim(),
                        desiredAt: new Date(`${date}T${time}:00`).toISOString(),
                        itemsCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
                      },
                    });
                    toast[result.ok ? "success" : "error"](result.message);
                  }}
                >
                  Entrar na fila de encomendas
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <LoyaltyCard storeSlug={slug} phone={form.phone} />

        {account && account.orders.length > 0 ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Seus pedidos anteriores nesta loja</CardTitle>
              <CardDescription>Repita um pedido com um toque.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {account.orders.map((order) => (
                <div
                  key={order.code}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 p-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    #{order.code} · {formatCurrency(order.total)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      order.items.forEach((item) =>
                        cart.add(
                          {
                            productId: item.productId ?? item.name,
                            name: item.name,
                            unitPrice: item.unitPrice,
                            notes: item.notes,
                          },
                          item.quantity,
                        ),
                      );
                      toast.success("Itens adicionados ao carrinho.");
                    }}
                  >
                    Repetir pedido
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <UpsellSuggestions
          suggestions={upsellSuggestions}
          onAdd={(suggestion) => {
            cart.add(
              {
                productId: suggestion.product.id,
                name: suggestion.product.name,
                unitPrice: suggestion.price,
                maxQuantity: suggestion.maxQuantity,
              },
              1,
            );
            toast.success(`${suggestion.product.name} adicionado.`);
          }}
        />
      </main>



      {/* Barra fixa com o total */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border/70 bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="text-sm">
            <p className="text-muted-foreground">
              Subtotal {formatCurrency(cart.subtotal)}
              {deliveryFee > 0 ? ` · entrega ${formatCurrency(deliveryFee)}` : ""}
              {discountFromCoupon > 0 ? ` · cupom −${formatCurrency(discountFromCoupon)}` : ""}
              {cashbackApplied > 0 ? ` · saldo −${formatCurrency(cashbackApplied)}` : ""}
            </p>
            <p className="text-lg font-semibold text-foreground">Total {formatCurrency(total)}</p>
          </div>
          <Button type="button" size="lg" onClick={openReview} disabled={cart.items.length === 0}>
            Revisar pedido
          </Button>
        </div>
      </div>

      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisar e confirmar</DialogTitle>
            <DialogDescription>Confira tudo antes de enviar para a loja.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-foreground">Itens</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {cart.items.map((item) => (
                  <li key={item.lineId}>
                    {item.quantity}× {item.name} — {formatCurrency(item.unitPrice * item.quantity)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{selected?.label}</Badge>
              {timing === "scheduled" ? (
                <Badge variant="secondary">{`${date} às ${time}`}</Badge>
              ) : null}
              <Badge variant="secondary">
                {payment ? PAYMENT_METHOD_LABEL[payment as keyof typeof PAYMENT_METHOD_LABEL] : ""}
              </Badge>
              {fulfillment === "table" ? (
                <Badge variant="secondary">Mesa {form.table}</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground">
              {form.name} · {form.phone}
              {isDelivery
                ? ` · ${form.street}, ${form.number}${form.district ? ` - ${form.district}` : ""}${form.complement ? ` (${form.complement})` : ""}`
                : ""}
            </p>
            {form.notes ? <p className="text-muted-foreground">Obs.: {form.notes}</p> : null}
            <div className="rounded-xl bg-secondary/60 p-3">
              <p className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(cart.subtotal)}</span>
              </p>
              {discountFromCoupon > 0 ? (
                <p className="flex justify-between">
                  <span>Cupom {coupon?.code}</span>
                  <span>−{formatCurrency(discountFromCoupon)}</span>
                </p>
              ) : null}
              {cashbackApplied > 0 ? (
                <p className="flex justify-between">
                  <span>Saldo de fidelidade</span>
                  <span>−{formatCurrency(cashbackApplied)}</span>
                </p>
              ) : null}
              {deliveryFee > 0 ? (
                <p className="flex justify-between">
                  <span>Taxa de entrega</span>
                  <span>{formatCurrency(deliveryFee)}</span>
                </p>
              ) : null}
              <p className="mt-1 flex justify-between text-base font-semibold text-foreground">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(false)} disabled={submitting}>
              Voltar e editar
            </Button>
            <Button onClick={() => void submitOrder()} disabled={submitting}>
              {submitting ? "Enviando..." : "Confirmar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CheckoutThemeProvider>
  );
}

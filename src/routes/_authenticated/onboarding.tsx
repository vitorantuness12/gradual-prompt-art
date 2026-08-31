import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  Rocket,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Logo } from "@/components/brand/Logo";
import { DeliveryAreasEditor } from "@/components/store/DeliveryAreasEditor";
import { FirstCatalogWizard } from "@/components/store/FirstCatalogWizard";
import { ImageUploadField } from "@/components/store/ImageUploadField";
import { OnboardingChecklist } from "@/components/store/OnboardingChecklist";
import { OpeningHoursEditor } from "@/components/store/OpeningHoursEditor";
import { PaymentMethodsEditor } from "@/components/store/PaymentMethodsEditor";
import { SlugField, type SlugStatus } from "@/components/store/SlugField";
import { StoreShareCard } from "@/components/store/StoreShareCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMyStores } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { isValidDocument, isValidPhone, maskDocument, maskPhone, maskZip, onlyDigits } from "@/lib/masks";
import { slugify } from "@/lib/slug";
import {
  defaultOpeningHours,
  defaultPaymentMethods,
  parseDeliveryAreas,
  parseHolidays,
  parseOnboarding,
  parseOpeningHours,
  parsePaymentMethods,
  type DayHours,
  type DeliveryArea,
  type DeliveryMode,
  type Holiday,
  type OnboardingState,
  type PaymentMethods,
} from "@/lib/store-config";
import { storePublicUrl } from "@/lib/store-url";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

const SEGMENTS = [
  "Restaurante",
  "Pizzaria",
  "Lanchonete",
  "Cafeteria",
  "Mercado",
  "Farmácia",
  "Pet shop",
  "Salão de beleza",
  "Barbearia",
  "Loja",
  "Assistência técnica",
  "Prestador de serviços",
  "Produto digital",
  "Assinatura",
] as const;

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

const STEP_KEYS = ["segment", "store", "hours", "payments", "delivery", "catalog", "published"] as const;
type StepKey = (typeof STEP_KEYS)[number];

const storeSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome fantasia do negócio."),
  legalName: z.string().trim().max(150).optional(),
  document: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidDocument(value), "Informe um CPF ou CNPJ válido."),
  description: z.string().trim().max(500, "A descrição deve ter no máximo 500 caracteres.").optional(),
  phone: z.string().trim().refine((value) => value === "" || isValidPhone(value), "Telefone inválido."),
  whatsapp: z.string().trim().refine((value) => value === "" || isValidPhone(value), "WhatsApp inválido."),
  street: z.string().trim().optional(),
  number: z.string().trim().optional(),
  district: z.string().trim().optional(),
  city: z.string().trim().min(2, "Informe a cidade."),
  state: z.string().trim().length(2, "Informe a UF com 2 letras."),
  zip: z.string().trim().optional(),
});

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: memberships = [], isLoading } = useMyStores();

  const existing = useMemo(
    () => memberships.find((item) => !item.store.is_demo && item.role === "owner")?.store ?? null,
    [memberships],
  );

  const [storeId, setStoreId] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("segment");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<OnboardingState>({});

  // Etapa 1
  const [segment, setSegment] = useState<string>("");

  // Etapa 2
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [document, setDocument] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [zip, setZip] = useState("");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugTouched, setSlugTouched] = useState(false);
  const [timezone, setTimezone] = useState<string>("America/Sao_Paulo");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  // Etapa 3
  const [hours, setHours] = useState<DayHours[]>(defaultOpeningHours());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [acceptsDelivery, setAcceptsDelivery] = useState(true);
  const [acceptsPickup, setAcceptsPickup] = useState(true);
  const [acceptsScheduling, setAcceptsScheduling] = useState(false);

  // Etapa 4
  const [payments, setPayments] = useState<PaymentMethods>(defaultPaymentMethods());

  // Etapa 5
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("fixed");
  const [deliveryAreas, setDeliveryAreas] = useState<DeliveryArea[]>([]);
  const [baseFee, setBaseFee] = useState(0);
  const [minOrder, setMinOrder] = useState(0);


  /** Retoma um onboarding iniciado anteriormente. */
  useEffect(() => {
    if (!existing || storeId) return;
    setStoreId(existing.id);
    setSegment(existing.segment ?? "");
    setName(existing.name);
    setLegalName(existing.legal_name ?? "");
    setDocument(existing.document ? maskDocument(existing.document) : "");
    setDescription(existing.description ?? "");
    setPhone(existing.phone ? maskPhone(existing.phone) : "");
    setWhatsapp(existing.whatsapp ? maskPhone(existing.whatsapp) : "");
    setStreet(existing.address_street ?? "");
    setNumber(existing.address_number ?? "");
    setDistrict(existing.address_district ?? "");
    setCity(existing.address_city ?? "");
    setUf(existing.address_state ?? "");
    setZip(existing.address_zip ? maskZip(existing.address_zip) : "");
    setSlug(existing.slug);
    setSlugTouched(true);
    setTimezone(existing.timezone ?? "America/Sao_Paulo");
    setLogoUrl(existing.logo_url);
    setCoverUrl(existing.cover_url);
    setHours(parseOpeningHours(existing.opening_hours));
    setHolidays(parseHolidays(existing.holidays));
    setAcceptsDelivery(existing.accepts_delivery);
    setAcceptsPickup(existing.accepts_pickup);
    setAcceptsScheduling(existing.accepts_scheduling);
    setPayments(parsePaymentMethods(existing.payment_methods));
    setDeliveryMode((existing.delivery_mode as DeliveryMode) ?? "fixed");
    setDeliveryAreas(parseDeliveryAreas(existing.delivery_areas));
    setBaseFee(Number(existing.delivery_fee));
    setMinOrder(Number(existing.min_order_value));

    const state = parseOnboarding(existing.onboarding);
    setProgress(state);
    const next = STEP_KEYS.find((key) => !state[key]);
    setStep(next ?? "published");
  }, [existing, storeId]);

  async function persist(patch: Record<string, unknown>, stepDone: StepKey, nextStep: StepKey | null) {
    if (!storeId) return;
    setSaving(true);
    try {
      const nextProgress = { ...progress, [stepDone]: true };
      const { error } = await supabase
        .from("stores")
        .update({ ...patch, onboarding: nextProgress } as never)
        .eq("id", storeId);
      if (error) throw new Error(error.message);

      setProgress(nextProgress);
      await queryClient.invalidateQueries({ queryKey: ["my-stores"] });
      if (nextStep) setStep(nextStep);
      toast.success("Configuração salva.");
    } catch {
      toast.error("Não foi possível salvar agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStoreSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = storeSchema.safeParse({
      name,
      legalName,
      document,
      description,
      phone,
      whatsapp,
      street,
      number,
      district,
      city,
      state: uf.toUpperCase(),
      zip,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados informados.");
      return;
    }
    if (slugStatus !== "available") {
      toast.error("Escolha um endereço de loja disponível antes de continuar.");
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada. Entre novamente.");

      const payload = {
        name: parsed.data.name,
        slug,
        segment: segment || null,
        legal_name: parsed.data.legalName || null,
        document: parsed.data.document ? onlyDigits(parsed.data.document) : null,
        description: parsed.data.description || null,
        phone: parsed.data.phone ? onlyDigits(parsed.data.phone) : null,
        whatsapp: parsed.data.whatsapp ? onlyDigits(parsed.data.whatsapp) : null,
        address_street: parsed.data.street || null,
        address_number: parsed.data.number || null,
        address_district: parsed.data.district || null,
        address_city: parsed.data.city,
        address_state: parsed.data.state,
        address_zip: parsed.data.zip ? onlyDigits(parsed.data.zip) : null,
        timezone,
        logo_url: logoUrl,
        cover_url: coverUrl,
      };

      const nextProgress: OnboardingState = { ...progress, segment: true, store: true };

      if (storeId) {
        const { error } = await supabase
          .from("stores")
          .update({ ...payload, onboarding: nextProgress } as never)
          .eq("id", storeId);
        if (error) throw new Error(error.code === "23505" ? "Este endereço já está em uso." : error.message);
      } else {
        const { data: store, error } = await supabase
          .from("stores")
          .insert({ ...payload, owner_id: userId, is_published: false, onboarding: nextProgress } as never)
          .select("id")
          .single();
        if (error || !store) {
          throw new Error(error?.code === "23505" ? "Este endereço já está em uso." : "Não foi possível criar a loja.");
        }

        // O vínculo de dono (store_members) é criado automaticamente por gatilho no banco.
        const { error: memberError } = await supabase
          .from("store_members")
          .upsert({ store_id: store.id, user_id: userId, role: "owner" }, { onConflict: "store_id,user_id" });
        if (memberError && memberError.code !== "23505") {
          throw new Error("Loja criada, mas houve falha ao vincular seu acesso.");
        }


        await supabase.from("audit_logs").insert({
          store_id: store.id,
          user_id: userId,
          action: "create",
          entity: "store",
          entity_id: store.id,
          metadata: { name: payload.name, slug },
        });
        setStoreId(store.id);
      }

      setProgress(nextProgress);
      await queryClient.invalidateQueries({ queryKey: ["my-stores"] });
      setStep("hours");
      toast.success("Dados da loja salvos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a loja.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(publish: boolean) {
    if (!storeId) return;
    setSaving(true);
    try {
      const nextProgress = { ...progress, published: publish };
      const { error } = await supabase
        .from("stores")
        .update({
          is_published: publish,
          availability_status: publish ? "open" : "closed",
          onboarding: nextProgress,
        } as never)
        .eq("id", storeId);
      if (error) throw new Error(error.message);

      setProgress(nextProgress);
      await queryClient.invalidateQueries({ queryKey: ["my-stores"] });
      toast.success(publish ? "Loja publicada!" : "Loja despublicada.");
      if (publish) void navigate({ to: "/painel" });
    } catch {
      toast.error("Não foi possível alterar a publicação da loja.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  const stepIndex = STEP_KEYS.indexOf(step);

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/painel">Continuar depois</Link>
        </Button>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          {step === "segment" ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Qual é o seu segmento?</CardTitle>
                <CardDescription>Usamos isso para sugerir o painel e o catálogo ideais para você.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SEGMENTS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSegment(item)}
                      aria-pressed={segment === item}
                      className={cn(
                        "rounded-xl border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        segment === item
                          ? "border-primary bg-primary/10 font-medium text-foreground"
                          : "border-border/70 hover:bg-muted",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={!segment}
                  onClick={() => {
                    setProgress((current) => ({ ...current, segment: true }));
                    setStep("store");
                  }}
                >
                  Continuar
                  <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {step === "store" ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Dados da loja</CardTitle>
                <CardDescription>
                  Essas informações aparecem na sua página pública. Você pode editar tudo depois.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleStoreSubmit} className="space-y-5" noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome fantasia</Label>
                      <Input
                        id="nome"
                        value={name}
                        required
                        onChange={(event) => {
                          setName(event.target.value);
                          if (!slugTouched) setSlug(slugify(event.target.value));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="razao">Razão social (opcional)</Label>
                      <Input id="razao" value={legalName} onChange={(event) => setLegalName(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="documento">CNPJ ou CPF</Label>
                      <Input
                        id="documento"
                        inputMode="numeric"
                        value={document}
                        onChange={(event) => setDocument(maskDocument(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fuso">Fuso horário</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger id="fuso">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((zone) => (
                            <SelectItem key={zone} value={zone}>
                              {zone.replace("America/", "").replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <SlugField
                    value={slug}
                    storeId={storeId}
                    onChange={(value) => {
                      setSlugTouched(true);
                      setSlug(value);
                    }}
                    onStatusChange={setSlugStatus}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="descricao">Descrição</Label>
                    <Textarea
                      id="descricao"
                      rows={3}
                      maxLength={500}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="telefone">Telefone</Label>
                      <Input
                        id="telefone"
                        inputMode="tel"
                        value={phone}
                        onChange={(event) => setPhone(maskPhone(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp">WhatsApp</Label>
                      <Input
                        id="whatsapp"
                        inputMode="tel"
                        value={whatsapp}
                        onChange={(event) => setWhatsapp(maskPhone(event.target.value))}
                      />
                    </div>
                  </div>

                  <fieldset className="grid gap-4 sm:grid-cols-6">
                    <legend className="mb-2 text-sm font-medium">Endereço</legend>
                    <div className="space-y-2 sm:col-span-4">
                      <Label htmlFor="rua">Rua</Label>
                      <Input id="rua" value={street} onChange={(event) => setStreet(event.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="numero">Número</Label>
                      <Input id="numero" value={number} onChange={(event) => setNumber(event.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="bairro">Bairro</Label>
                      <Input id="bairro" value={district} onChange={(event) => setDistrict(event.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="cidade">Cidade</Label>
                      <Input id="cidade" value={city} required onChange={(event) => setCity(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="uf">UF</Label>
                      <Input
                        id="uf"
                        maxLength={2}
                        value={uf}
                        onChange={(event) => setUf(event.target.value.toUpperCase())}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cep">CEP</Label>
                      <Input
                        id="cep"
                        inputMode="numeric"
                        value={zip}
                        onChange={(event) => setZip(maskZip(event.target.value))}
                      />
                    </div>
                  </fieldset>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <ImageUploadField
                      storeId={storeId}
                      kind="logo"
                      label="Logo"
                      value={logoUrl}
                      onChange={setLogoUrl}
                      hint={storeId ? "Quadrada, até 8 MB." : "Salve os dados para liberar o envio de imagens."}
                    />
                    <ImageUploadField
                      storeId={storeId}
                      kind="cover"
                      label="Capa"
                      value={coverUrl}
                      onChange={setCoverUrl}
                      hint={storeId ? "Formato panorâmico, até 8 MB." : "Disponível após o primeiro salvamento."}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" onClick={() => setStep("segment")}>
                      <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
                      Voltar
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar e continuar"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {step === "hours" ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Funcionamento</CardTitle>
                <CardDescription>Defina dias, horários, pausas, feriados e formas de atendimento.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <OpeningHoursEditor
                  hours={hours}
                  onChange={setHours}
                  holidays={holidays}
                  onHolidaysChange={setHolidays}
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { id: "delivery", label: "Entrega (delivery)", value: acceptsDelivery, set: setAcceptsDelivery },
                    { id: "pickup", label: "Retirada no local", value: acceptsPickup, set: setAcceptsPickup },
                    { id: "scheduling", label: "Agendamento", value: acceptsScheduling, set: setAcceptsScheduling },
                  ].map((option) => (
                    <div key={option.id} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                      <Label htmlFor={`modo-${option.id}`} className="cursor-pointer text-sm">
                        {option.label}
                      </Label>
                      <Switch id={`modo-${option.id}`} checked={option.value} onCheckedChange={option.set} />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => setStep("store")}>
                    <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void persist(
                        {
                          opening_hours: hours,
                          holidays,
                          accepts_delivery: acceptsDelivery,
                          accepts_pickup: acceptsPickup,
                          accepts_scheduling: acceptsScheduling,
                        },
                        "hours",
                        "payments",
                      )
                    }
                  >
                    {saving ? "Salvando..." : "Salvar e continuar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === "payments" ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Formas de recebimento</CardTitle>
                <CardDescription>Escolha como seus clientes poderão pagar os pedidos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <PaymentMethodsEditor value={payments} onChange={setPayments} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => setStep("hours")}>
                    <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void persist({ payment_methods: payments }, "payments", "delivery")}
                  >
                    {saving ? "Salvando..." : "Salvar e continuar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === "delivery" ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Áreas e taxas de entrega</CardTitle>
                <CardDescription>Configure por bairro, CEP, distância ou use uma taxa única.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <DeliveryAreasEditor
                  mode={deliveryMode}
                  onModeChange={setDeliveryMode}
                  areas={deliveryAreas}
                  onAreasChange={setDeliveryAreas}
                  baseFee={baseFee}
                  onBaseFeeChange={setBaseFee}
                />
                <div className="space-y-2 sm:max-w-xs">
                  <Label htmlFor="pedido-minimo">Pedido mínimo (R$)</Label>
                  <Input
                    id="pedido-minimo"
                    type="number"
                    min={0}
                    step="0.01"
                    value={minOrder}
                    onChange={(event) => setMinOrder(Number(event.target.value))}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => setStep("payments")}>
                    <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void persist(
                        {
                          delivery_mode: deliveryMode,
                          delivery_areas: deliveryAreas,
                          delivery_fee: baseFee,
                          min_order_value: minOrder,
                        },
                        "delivery",
                        "catalog",
                      )
                    }
                  >
                    {saving ? "Salvando..." : "Salvar e continuar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === "catalog" && storeId ? (
            <FirstCatalogWizard
              storeId={storeId}
              segment={segment}
              onBack={() => setStep("delivery")}
              onDone={() => persist({}, "catalog", "published")}
            />
          ) : null}


          {step === "published" && storeId ? (
            <div className="space-y-6">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Pré-visualize e publique</CardTitle>
                  <CardDescription>
                    Confira como sua loja aparece para os clientes antes de deixá-la disponível.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
                    <p className="text-sm text-muted-foreground">Endereço público</p>
                    <p className="mt-1 break-all font-medium text-foreground">{storePublicUrl(slug)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/$slug" params={{ slug }} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                          Pré-visualizar loja
                        </Link>
                      </Button>
                      <Button size="sm" disabled={saving} onClick={() => void handlePublish(true)}>
                        <Rocket className="mr-2 size-4" aria-hidden="true" />
                        Publicar loja
                      </Button>
                      {progress.published ? (
                        <Button size="sm" variant="ghost" disabled={saving} onClick={() => void handlePublish(false)}>
                          Despublicar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {progress.published ? (
                    <p className="flex items-center gap-2 text-sm text-success">
                      <Check className="size-4" aria-hidden="true" />
                      Loja publicada e recebendo pedidos.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <StoreShareCard key={`${slug}:${String(progress.published)}`} slug={slug} storeName={name} isPublished={Boolean(progress.published)} />
            </div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Sua configuração</CardTitle>
              <CardDescription>Etapa {stepIndex + 1} de {STEP_KEYS.length}. Você pode continuar depois.</CardDescription>
            </CardHeader>
            <CardContent>
              <OnboardingChecklist
                state={progress}
                onStepClick={(key) => {
                  if (key !== "segment" && !storeId) {
                    toast.info("Salve os dados da loja primeiro.");
                    return;
                  }
                  setStep(key as StepKey);
                }}
              />
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}

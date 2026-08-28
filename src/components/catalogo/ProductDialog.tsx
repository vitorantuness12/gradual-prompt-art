import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { OptionGroupsEditor } from "@/components/catalogo/OptionGroupsEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRINT_STATIONS } from "@/lib/salao";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogData, ProductRow } from "@/hooks/useCatalog";
import { supabase } from "@/integrations/supabase/client";
import { parseCustomFields, parseCustomFieldsText, serializeCustomFields } from "@/lib/encomendas";
import { isValidEan13, nextInternalEan } from "@/lib/etiquetas";
import type { SegmentGroupId } from "@/lib/painel-segmentos";
import { PRODUCT_KINDS, SUBSCRIPTION_PERIODS, UNITS, WEEKDAYS, type ProductKind } from "@/lib/catalog";

interface ProductDialogProps {
  storeId: string;
  catalog: CatalogData;
  product: ProductRow | null;
  open: boolean;
  /** Tipos oferecidos conforme o ramo de atividade da loja. */
  kinds?: ProductKind[];
  /** Tipo pré-selecionado ao criar um item novo. */
  defaultKind?: ProductKind;
  /** Ramo de atividade da loja: define quais campos físicos fazem sentido. */
  segment?: SegmentGroupId;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const schema = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres."),
  price: z.number().nonnegative("O preço não pode ser negativo."),
  promoPrice: z.number().nonnegative().nullable(),
  stock: z.number().min(0),
  minStock: z.number().min(0),
});

interface FormState {
  name: string;
  description: string;
  categoryId: string;
  kind: ProductKind;
  price: string;
  promoPrice: string;
  sku: string;
  barcode: string;
  prepStation: string;
  unit: string;
  weight: string;
  brand: string;
  costPrice: string;
  ncm: string;
  warranty: string;
  packLength: string;
  packWidth: string;
  packHeight: string;
  trackStock: boolean;
  soldByWeight: boolean;
  unitLabel: string;
  trackBatches: boolean;
  requiresPrescription: boolean;
  stock: string;
  minStock: string;
  isFeatured: boolean;
  isAvailable: boolean;
  unavailableReason: string;
  allowsNotes: boolean;
  maxQuantity: string;
  tags: string;
  days: number[];
  start: string;
  end: string;
  duration: string;
  buffer: string;
  requiresConfirmation: boolean;
  leadDays: string;
  deposit: string;
  allowsCustomization: boolean;
  customFields: string;
  allowsAttachments: boolean;
  requiresApproval: boolean;
  period: string;
  benefits: string;
  digitalUrl: string;
  digitalInstructions: string;
}

function initialState(product: ProductRow | null, defaultKind: ProductKind = "product"): FormState {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.category_id ?? "none",
    kind: (product?.kind ?? defaultKind) as ProductKind,
    price: product ? String(Number(product.price)) : "",
    promoPrice: product?.promo_price == null ? "" : String(Number(product.promo_price)),
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    prepStation: product?.prep_station ?? "cozinha",
    unit: product?.unit ?? "un",
    weight: product?.weight_grams == null ? "" : String(product.weight_grams),
    brand: product?.brand ?? "",
    costPrice: product?.cost_price ? String(Number(product.cost_price)) : "",
    ncm: product?.ncm ?? "",
    warranty: product?.warranty_months == null ? "" : String(product.warranty_months),
    packLength: product?.package_length_cm == null ? "" : String(Number(product.package_length_cm)),
    packWidth: product?.package_width_cm == null ? "" : String(Number(product.package_width_cm)),
    packHeight: product?.package_height_cm == null ? "" : String(Number(product.package_height_cm)),
    trackStock: product?.track_stock ?? false,
    soldByWeight: product?.sold_by_weight ?? false,
    unitLabel: product?.unit_label ?? "un",
    trackBatches: product?.track_batches ?? false,
    requiresPrescription: product?.requires_prescription ?? false,
    stock: String(product?.stock_quantity ?? 0),
    minStock: String(product?.min_stock ?? 0),
    isFeatured: product?.is_featured ?? false,
    isAvailable: product?.is_available ?? true,
    unavailableReason: product?.unavailable_reason ?? "",
    allowsNotes: product?.allows_notes ?? true,
    maxQuantity: product?.max_quantity_per_order == null ? "" : String(product.max_quantity_per_order),
    tags: (product?.tags ?? []).join(", "),
    days: (product?.availability_days as number[] | null) ?? [0, 1, 2, 3, 4, 5, 6],
    start: product?.availability_start?.slice(0, 5) ?? "",
    end: product?.availability_end?.slice(0, 5) ?? "",
    duration: product?.duration_minutes == null ? "" : String(product.duration_minutes),
    buffer: String(product?.buffer_minutes ?? 0),
    requiresConfirmation: product?.requires_confirmation ?? false,
    leadDays: String(product?.lead_time_days ?? 0),
    deposit: String(Number(product?.deposit_percent ?? 0)),
    allowsCustomization: product?.allows_customization ?? false,
    customFields: serializeCustomFields(parseCustomFields(product?.custom_fields)),
    allowsAttachments: product?.allows_attachments ?? false,
    requiresApproval: product?.requires_customer_approval ?? false,
    period: product?.subscription_period ?? "monthly",
    benefits: (product?.subscription_benefits ?? []).join("\n"),
    digitalUrl: product?.digital_url ?? "",
    digitalInstructions: product?.digital_instructions ?? "",
  };
}

/** Formulário completo do item, com abas por área e campos específicos de cada modelo de negócio. */
export function ProductDialog({
  storeId,
  catalog,
  product,
  open,
  kinds,
  defaultKind = "product",
  segment = "alimentacao",
  onOpenChange,
  onChanged,
}: ProductDialogProps) {
  const kindOptions = kinds?.length ? PRODUCT_KINDS.filter((kind) => kinds.includes(kind.value)) : PRODUCT_KINDS;
  const [form, setForm] = useState<FormState>(() => initialState(product, defaultKind));
  const [saving, setSaving] = useState(false);
  const [comboSelection, setComboSelection] = useState<string[]>(
    catalog.comboItems.filter((item) => item.combo_product_id === product?.id).map((item) => item.item_product_id),
  );
  const [professionalSelection, setProfessionalSelection] = useState<string[]>(
    catalog.productProfessionals.filter((link) => link.product_id === product?.id).map((link) => link.professional_id),
  );
  const [restrictSchedule, setRestrictSchedule] = useState<boolean>(
    Boolean(
      product?.availability_start ||
        product?.availability_end ||
        ((product?.availability_days as number[] | null)?.length ?? 7) < 7,
    ),
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const groups = catalog.optionGroups.filter((group) => group.product_id === product?.id);

  /** Um único formulário atende todos os ramos: os campos seguem o modelo de negócio do item. */
  const isDigital = form.kind === "digital" || form.kind === "subscription";
  const isService = form.kind === "service";
  const isPhysical = !isDigital && !isService;
  const priceTabLabel = isDigital ? "Preço e acesso" : isService ? "Preço" : "Preço e estoque";
  const modelTabLabel = isDigital
    ? form.kind === "subscription"
      ? "Assinatura"
      : "Entrega digital"
    : isService
      ? "Agenda"
      : "Modelo";
  const availabilityTabLabel = isDigital ? "Publicação" : "Disponibilidade";
  const optionsTabLabel = isDigital
    ? "Planos e extras"
    : isService
      ? "Complementos"
      : segment === "varejo"
        ? "Variações e adicionais"
        : "Opções";

  /** Campos físicos variam por ramo: gôndola de varejo não precisa de cozinha nem de receita controlada. */
  const isFood = segment === "alimentacao";
  const isConvenience = segment === "conveniencia";
  const isRetail = segment === "varejo";
  const showPrepStation = isPhysical && isFood;
  const showWeightSale = isPhysical && (isFood || isConvenience);
  const showBatches = isPhysical && (isFood || isConvenience);
  const showPrescription = isPhysical && isConvenience;
  const showRetailFields = isPhysical && (isRetail || isConvenience);
  const showShippingBox = isPhysical && isRetail;

  const priceNumber = Number(String(form.price).replace(",", ".")) || 0;
  const costNumber = Number(String(form.costPrice).replace(",", ".")) || 0;
  const effectivePrice = Number(String(form.promoPrice).replace(",", ".")) || priceNumber;
  const marginValue = effectivePrice - costNumber;
  const marginPercent = effectivePrice > 0 ? (marginValue / effectivePrice) * 100 : 0;
  const markupPercent = costNumber > 0 ? ((effectivePrice - costNumber) / costNumber) * 100 : 0;
  const barcodeInvalid = Boolean(form.barcode.trim()) && !isValidEan13(form.barcode.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = schema.safeParse({
      name: form.name,
      price: Number(form.price.replace(",", ".")) || 0,
      promoPrice: form.promoPrice ? Number(form.promoPrice.replace(",", ".")) : null,
      stock: form.soldByWeight
        ? Math.round((Number(String(form.stock).replace(",", ".")) || 0) * 1000) / 1000
        : Math.trunc(Number(form.stock) || 0),
      minStock: form.soldByWeight
        ? Math.round((Number(String(form.minStock).replace(",", ".")) || 0) * 1000) / 1000
        : Math.trunc(Number(form.minStock) || 0),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos.");
      return;
    }
    if (parsed.data.promoPrice != null && parsed.data.promoPrice >= parsed.data.price) {
      toast.error("O preço promocional precisa ser menor que o preço normal.");
      return;
    }
    if (isPhysical && barcodeInvalid) {
      toast.error("Código de barras inválido: informe um EAN-13 válido ou gere um código interno.");
      return;
    }
    if (isPhysical && costNumber > 0 && costNumber > (parsed.data.promoPrice ?? parsed.data.price)) {
      toast.warning("Atenção: o custo informado está acima do preço de venda.");
    }

    const payload = {
      store_id: storeId,
      name: parsed.data.name,
      description: form.description.trim() || null,
      category_id: form.categoryId === "none" ? null : form.categoryId,
      kind: form.kind,
      price: parsed.data.price,
      promo_price: parsed.data.promoPrice,
      sku: form.sku.trim() || null,
      barcode: isPhysical ? form.barcode.trim() || null : null,
      prep_station: showPrepStation ? form.prepStation : null,
      brand: showRetailFields ? form.brand.trim() || null : null,
      cost_price: isPhysical ? costNumber : 0,
      ncm: showRetailFields ? form.ncm.replace(/\D/g, "").slice(0, 8) || null : null,
      warranty_months: showRetailFields && form.warranty ? Math.trunc(Number(form.warranty)) : null,
      package_length_cm: showShippingBox && form.packLength ? Number(form.packLength.replace(",", ".")) : null,
      package_width_cm: showShippingBox && form.packWidth ? Number(form.packWidth.replace(",", ".")) : null,
      package_height_cm: showShippingBox && form.packHeight ? Number(form.packHeight.replace(",", ".")) : null,
      unit: isPhysical ? form.unit : "un",
      weight_grams: isPhysical && form.weight ? Math.trunc(Number(form.weight)) : null,
      track_stock: isPhysical ? form.trackStock : false,
      sold_by_weight: showWeightSale ? form.soldByWeight : false,
      unit_label: showWeightSale && form.soldByWeight ? form.unitLabel || "kg" : "un",
      track_batches: showBatches ? form.trackBatches : false,
      requires_prescription: showPrescription ? form.requiresPrescription : false,
      stock_quantity: isPhysical ? parsed.data.stock : 0,
      min_stock: isPhysical ? parsed.data.minStock : 0,
      is_featured: form.isFeatured,
      is_available: form.isAvailable,
      unavailable_reason: form.isAvailable ? null : form.unavailableReason.trim() || null,
      allows_notes: form.allowsNotes,
      max_quantity_per_order: form.maxQuantity ? Math.trunc(Number(form.maxQuantity)) : null,
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      availability_days: isRetail && !restrictSchedule ? [0, 1, 2, 3, 4, 5, 6] : form.days,
      availability_start: isRetail && !restrictSchedule ? null : form.start || null,
      availability_end: isRetail && !restrictSchedule ? null : form.end || null,
      is_service: form.kind === "service",
      duration_minutes: form.duration ? Math.trunc(Number(form.duration)) : null,
      buffer_minutes: Math.trunc(Number(form.buffer) || 0),
      requires_confirmation: form.requiresConfirmation,
      lead_time_days: Math.trunc(Number(form.leadDays) || 0),
      deposit_percent: Number(form.deposit) || 0,
      allows_customization: form.allowsCustomization,
      custom_fields: parseCustomFieldsText(form.customFields) as unknown as never,
      allows_attachments: form.allowsAttachments,
      requires_customer_approval: form.requiresApproval,
      subscription_period: form.kind === "subscription" ? form.period : null,
      subscription_benefits: form.benefits
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      digital_url: form.digitalUrl.trim() || null,
      digital_instructions: form.digitalInstructions.trim() || null,
    };

    setSaving(true);
    try {
      let productId = product?.id ?? null;
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({ ...payload, sort_order: catalog.products.length + 1 })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "Falha ao criar o item.");
        productId = data.id;
      }

      if (productId) {
        if (form.kind === "combo") {
          await supabase.from("product_combo_items").delete().eq("combo_product_id", productId);
          if (comboSelection.length > 0) {
            await supabase.from("product_combo_items").insert(
              comboSelection.map((itemId) => ({
                store_id: storeId,
                combo_product_id: productId!,
                item_product_id: itemId,
                quantity: 1,
              })),
            );
          }
        }
        if (form.kind === "service") {
          await supabase.from("product_professionals").delete().eq("product_id", productId);
          if (professionalSelection.length > 0) {
            await supabase.from("product_professionals").insert(
              professionalSelection.map((professionalId) => ({
                store_id: storeId,
                product_id: productId!,
                professional_id: professionalId,
              })),
            );
          }
        }
      }

      toast.success(product ? "Item atualizado." : "Item criado.");
      onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {product
              ? `Editar ${product.name}`
              : isDigital
                ? "Novo infoproduto"
                : isService
                  ? "Novo serviço"
                  : isRetail
                    ? "Novo produto"
                    : "Novo item do catálogo"}
          </DialogTitle>
          <DialogDescription>
            {isDigital
              ? "Cadastre o produto digital: preço, arquivo ou link de acesso, instruções e planos de assinatura."
              : isService
                ? "Cadastre o serviço: duração, intervalo, profissionais e sinal para reservar o horário."
                : isRetail
                  ? "Cadastre o produto da loja: marca, código de barras, custo e margem, estoque, dimensões para frete e variações."
                  : "Escolha o modelo de negócio: produto, serviço, encomenda, assinatura, digital ou combo."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Tabs defaultValue="geral">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="preco">{priceTabLabel}</TabsTrigger>
              <TabsTrigger value="disponibilidade">{availabilityTabLabel}</TabsTrigger>
              <TabsTrigger value="modelo">{modelTabLabel}</TabsTrigger>
              <TabsTrigger value="opcoes">{optionsTabLabel}</TabsTrigger>
            </TabsList>

            {/* -------------------- GERAL -------------------- */}
            <TabsContent value="geral" className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="product-name">
                    {isDigital ? "Nome do infoproduto" : isService ? "Nome do serviço" : "Nome"}
                  </Label>
                  <Input
                    id="product-name"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    required
                    maxLength={120}
                    placeholder={
                      isDigital
                        ? "Ex.: Curso de confeitaria — módulo 1"
                        : isService
                          ? "Ex.: Corte masculino + barba"
                          : undefined
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="product-description">
                    {isDigital ? "O que o cliente recebe" : isService ? "Como é o atendimento" : "Descrição"}
                  </Label>
                  <Textarea
                    id="product-description"
                    value={form.description}
                    onChange={(event) => set("description", event.target.value)}
                    rows={3}
                    maxLength={800}
                    placeholder={
                      isDigital
                        ? "Ex.: 12 aulas em vídeo, apostila em PDF e grupo de suporte por 90 dias."
                        : isService
                          ? "Ex.: avaliação, lavagem, corte e finalização. Traga referências se quiser."
                          : undefined
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-kind">Tipo de item</Label>
                  <Select value={form.kind} onValueChange={(value) => set("kind", value as ProductKind)}>
                    <SelectTrigger id="product-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {kindOptions.map((kind) => (
                        <SelectItem key={kind.value} value={kind.value}>
                          {kind.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {PRODUCT_KINDS.find((kind) => kind.value === form.kind)?.hint}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-category">Categoria</Label>
                  <Select value={form.categoryId} onValueChange={(value) => set("categoryId", value)}>
                    <SelectTrigger id="product-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {catalog.categories
                        .filter((category) => !category.archived_at)
                        .map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-sku">{isDigital ? "Código interno" : "SKU"}</Label>
                  <Input id="product-sku" value={form.sku} onChange={(event) => set("sku", event.target.value)} />
                </div>
                {isPhysical ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="product-barcode">Código de barras (EAN-13)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="product-barcode"
                          value={form.barcode}
                          inputMode="numeric"
                          maxLength={13}
                          aria-invalid={barcodeInvalid}
                          onChange={(event) => set("barcode", event.target.value.replace(/\D/g, ""))}
                          placeholder="7891234567895"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => set("barcode", nextInternalEan())}
                          title="Gerar código interno"
                        >
                          Gerar
                        </Button>
                      </div>
                      <p className={`text-xs ${barcodeInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                        {barcodeInvalid
                          ? "Dígito verificador inválido para EAN-13."
                          : "Use o código do fabricante ou gere um EAN-13 interno para imprimir etiquetas."}
                      </p>
                    </div>
                    {showRetailFields ? (
                      <div className="space-y-2">
                        <Label htmlFor="product-brand">Marca / fabricante</Label>
                        <Input
                          id="product-brand"
                          value={form.brand}
                          onChange={(event) => set("brand", event.target.value)}
                          placeholder="Ex.: Nike, Samsung, marca própria"
                        />
                      </div>
                    ) : null}
                    {showPrepStation ? (
                      <div className="space-y-2">
                        <Label htmlFor="product-station">Setor de preparo</Label>
                        <Select value={form.prepStation} onValueChange={(value) => set("prepStation", value)}>
                          <SelectTrigger id="product-station">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRINT_STATIONS.filter((station) => station.value !== "caixa").map((station) => (
                              <SelectItem key={station.value} value={station.value}>
                                {station.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Define para onde o cupom do item é enviado no monitor de preparo e na impressão.
                        </p>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="product-unit">Unidade de venda</Label>
                      <Select value={form.unit} onValueChange={(value) => set("unit", value)}>
                        <SelectTrigger id="product-unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-weight">{isRetail ? "Peso do produto (g)" : "Peso (g)"}</Label>
                      <Input
                        id="product-weight"
                        type="number"
                        min={0}
                        value={form.weight}
                        onChange={(event) => set("weight", event.target.value)}
                      />
                      {isRetail ? (
                        <p className="text-xs text-muted-foreground">Usado no cálculo de frete e nas etiquetas.</p>
                      ) : null}
                    </div>
                    {showRetailFields ? (
                      <div className="space-y-2">
                        <Label htmlFor="product-ncm">NCM (fiscal)</Label>
                        <Input
                          id="product-ncm"
                          value={form.ncm}
                          inputMode="numeric"
                          maxLength={8}
                          onChange={(event) => set("ncm", event.target.value.replace(/\D/g, ""))}
                          placeholder="61091000"
                        />
                        <p className="text-xs text-muted-foreground">Opcional, usado na emissão de nota.</p>
                      </div>
                    ) : null}
                    {showRetailFields ? (
                      <div className="space-y-2">
                        <Label htmlFor="product-warranty">Garantia (meses)</Label>
                        <Input
                          id="product-warranty"
                          type="number"
                          min={0}
                          value={form.warranty}
                          onChange={(event) => set("warranty", event.target.value)}
                          placeholder="Sem garantia"
                        />
                        <p className="text-xs text-muted-foreground">
                          Exibida na loja e usada como referência em trocas e devoluções.
                        </p>
                      </div>
                    ) : null}
                    {showShippingBox ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Dimensões da embalagem (cm)</Label>
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            aria-label="Comprimento em centímetros"
                            inputMode="decimal"
                            value={form.packLength}
                            onChange={(event) => set("packLength", event.target.value)}
                            placeholder="Compr."
                          />
                          <Input
                            aria-label="Largura em centímetros"
                            inputMode="decimal"
                            value={form.packWidth}
                            onChange={(event) => set("packWidth", event.target.value)}
                            placeholder="Larg."
                          />
                          <Input
                            aria-label="Altura em centímetros"
                            inputMode="decimal"
                            value={form.packHeight}
                            onChange={(event) => set("packHeight", event.target.value)}
                            placeholder="Alt."
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Necessário para envios por transportadora e para o cálculo de frete por cubagem.
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="product-tags">Etiquetas (separadas por vírgula)</Label>
                  <Input
                    id="product-tags"
                    value={form.tags}
                    onChange={(event) => set("tags", event.target.value)}
                    placeholder={
                      isDigital
                        ? "iniciante, acesso vitalício, com certificado"
                        : isService
                          ? "sem química, atende crianças, mais procurado"
                          : "vegano, sem glúten, mais pedido"
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <Label htmlFor="product-featured">Destacar na loja</Label>
                  <Switch
                    id="product-featured"
                    checked={form.isFeatured}
                    onCheckedChange={(checked) => set("isFeatured", checked)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <Label htmlFor="product-notes">
                    {isDigital
                      ? "Permitir mensagem do comprador"
                      : isService
                        ? "Permitir observações do cliente"
                        : "Permitir observações"}
                  </Label>
                  <Switch
                    id="product-notes"
                    checked={form.allowsNotes}
                    onCheckedChange={(checked) => set("allowsNotes", checked)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* -------------------- PREÇO E ESTOQUE -------------------- */}
            <TabsContent value="preco" className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="product-price">
                    {form.kind === "subscription"
                      ? "Valor por período (R$)"
                      : isRetail
                        ? "Preço de venda / etiqueta (R$)"
                        : "Preço (R$)"}
                  </Label>
                  <Input
                    id="product-price"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(event) => set("price", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-promo">
                    {isDigital ? "Preço de lançamento (R$)" : "Preço promocional (R$)"}
                  </Label>
                  <Input
                    id="product-promo"
                    inputMode="decimal"
                    value={form.promoPrice}
                    onChange={(event) => set("promoPrice", event.target.value)}
                  />
                </div>

                {isDigital ? (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Infoprodutos não usam estoque físico: o acesso é liberado automaticamente após o pagamento
                    confirmado. Configure o arquivo e as instruções na aba “{modelTabLabel}”.
                  </p>
                ) : null}

                {isService ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="service-deposit">Sinal exigido no agendamento (% do valor)</Label>
                    <Input
                      id="service-deposit"
                      type="number"
                      min={0}
                      max={100}
                      value={form.deposit}
                      onChange={(event) => set("deposit", event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use 0 para cobrar tudo no atendimento. Com sinal, o cliente paga a porcentagem ao reservar o
                      horário.
                    </p>
                  </div>
                ) : null}

                {isPhysical ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="product-cost">Custo de compra (R$)</Label>
                      <Input
                        id="product-cost"
                        inputMode="decimal"
                        value={form.costPrice}
                        onChange={(event) => set("costPrice", event.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">Margem estimada</p>
                      {costNumber > 0 && effectivePrice > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Lucro de {marginValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por
                          unidade · margem {marginPercent.toFixed(1)}% · markup {markupPercent.toFixed(1)}%
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Informe o custo de compra para acompanhar a margem por produto.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 sm:col-span-2">
                      <Label htmlFor="product-track">
                        {isRetail ? "Controlar estoque da loja" : "Controlar estoque"}
                      </Label>
                      <Switch
                        id="product-track"
                        checked={form.trackStock}
                        onCheckedChange={(checked) => set("trackStock", checked)}
                      />
                    </div>
                    {form.trackStock ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="product-stock">Estoque atual</Label>
                          <Input
                            id="product-stock"
                            type="number"
                            min={0}
                            value={form.stock}
                            onChange={(event) => set("stock", event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="product-min-stock">Estoque mínimo (alerta)</Label>
                          <Input
                            id="product-min-stock"
                            type="number"
                            min={0}
                            value={form.minStock}
                            onChange={(event) => set("minStock", event.target.value)}
                          />
                        </div>
                      </>
                    ) : null}
                    {form.trackStock && isRetail && product?.has_variants ? (
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        Este produto usa grade de variações: o estoque real é controlado por SKU na aba “Grade e
                        etiquetas”. O valor acima serve apenas como referência.
                      </p>
                    ) : null}
                    {showWeightSale ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 sm:col-span-2">
                        <div>
                          <Label htmlFor="product-weight-sale">Vender por peso / fração</Label>
                          <p className="text-xs text-muted-foreground">
                            O PDV pede o peso (ou lê a etiqueta da balança) e cobra pelo preço da unidade.
                          </p>
                        </div>
                        <Switch
                          id="product-weight-sale"
                          checked={form.soldByWeight}
                          onCheckedChange={(checked) => set("soldByWeight", checked)}
                        />
                      </div>
                    ) : null}
                    {showWeightSale && form.soldByWeight ? (
                      <div className="space-y-2">
                        <Label htmlFor="product-unit-label">Unidade de venda</Label>
                        <Input
                          id="product-unit-label"
                          value={form.unitLabel === "un" ? "kg" : form.unitLabel}
                          onChange={(event) => set("unitLabel", event.target.value)}
                          placeholder="kg"
                        />
                      </div>
                    ) : null}
                    {showBatches ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 sm:col-span-2">
                        <div>
                          <Label htmlFor="product-batches">Controlar lote e validade</Label>
                          <p className="text-xs text-muted-foreground">
                            Cadastre os lotes em Estoque › Lotes e validade; a venda baixa o que vence primeiro.
                          </p>
                        </div>
                        <Switch
                          id="product-batches"
                          checked={form.trackBatches}
                          onCheckedChange={(checked) => set("trackBatches", checked)}
                        />
                      </div>
                    ) : null}
                    {showPrescription ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 sm:col-span-2">
                        <div>
                          <Label htmlFor="product-prescription">Item controlado (exige receita)</Label>
                          <p className="text-xs text-muted-foreground">
                            A venda só é concluída com o registro da receita ou do profissional.
                          </p>
                        </div>
                        <Switch
                          id="product-prescription"
                          checked={form.requiresPrescription}
                          onCheckedChange={(checked) => set("requiresPrescription", checked)}
                        />
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="product-max">Limite por pedido</Label>
                      <Input
                        id="product-max"
                        type="number"
                        min={1}
                        value={form.maxQuantity}
                        onChange={(event) => set("maxQuantity", event.target.value)}
                        placeholder="Sem limite"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </TabsContent>

            {/* -------------------- DISPONIBILIDADE -------------------- */}
            <TabsContent value="disponibilidade" className="space-y-4 pt-4">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                <Label htmlFor="product-available">
                  {isDigital ? "Publicado na loja (aceita novas compras)" : "Item disponível para pedido"}
                </Label>
                <Switch
                  id="product-available"
                  checked={form.isAvailable}
                  onCheckedChange={(checked) => set("isAvailable", checked)}
                />
              </div>
              {!form.isAvailable ? (
                <div className="space-y-2">
                  <Label htmlFor="product-reason">Motivo exibido ao cliente</Label>
                  <Input
                    id="product-reason"
                    value={form.unavailableReason}
                    onChange={(event) => set("unavailableReason", event.target.value)}
                    placeholder={isDigital ? "Ex.: turma encerrada" : "Ex.: esgotado hoje"}
                  />
                </div>
              ) : null}

              {isDigital ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="digital-limit">Limite de vagas / licenças</Label>
                    <Input
                      id="digital-limit"
                      type="number"
                      min={1}
                      value={form.maxQuantity}
                      onChange={(event) => set("maxQuantity", event.target.value)}
                      placeholder="Sem limite"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use para turmas fechadas, lotes promocionais ou mentorias com vagas limitadas.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {isRetail ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                      <div>
                        <Label htmlFor="product-restrict">Restringir dias e horários de venda</Label>
                        <p className="text-xs text-muted-foreground">
                          Por padrão o produto segue o horário de funcionamento da loja. Ative apenas para itens
                          sazonais ou de horário específico.
                        </p>
                      </div>
                      <Switch
                        id="product-restrict"
                        checked={restrictSchedule}
                        onCheckedChange={setRestrictSchedule}
                      />
                    </div>
                  ) : null}
                  {!isRetail || restrictSchedule ? (
                  <>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-foreground">
                      {isService ? "Dias em que o serviço é oferecido" : "Dias disponíveis"}
                    </legend>
                    <div className="flex flex-wrap gap-3">
                      {WEEKDAYS.map((day) => (
                        <label key={day.value} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.days.includes(day.value)}
                            onCheckedChange={(checked) =>
                              set(
                                "days",
                                checked
                                  ? [...form.days, day.value].sort((a, b) => a - b)
                                  : form.days.filter((value) => value !== day.value),
                              )
                            }
                            aria-label={day.label}
                          />
                          {day.short}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="product-start">
                        {isService ? "Atende a partir de" : "Disponível a partir de"}
                      </Label>
                      <Input
                        id="product-start"
                        type="time"
                        value={form.start}
                        onChange={(event) => set("start", event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-end">{isService ? "Atende até" : "Disponível até"}</Label>
                      <Input
                        id="product-end"
                        type="time"
                        value={form.end}
                        onChange={(event) => set("end", event.target.value)}
                      />
                    </div>
                  </div>
                  </>
                  ) : null}
                </>
              )}
            </TabsContent>

            {/* -------------------- MODELO ESPECÍFICO -------------------- */}
            <TabsContent value="modelo" className="space-y-4 pt-4">
              {form.kind === "service" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="service-duration">Duração (minutos)</Label>
                    <Input
                      id="service-duration"
                      type="number"
                      min={5}
                      value={form.duration}
                      onChange={(event) => set("duration", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-buffer">Intervalo entre atendimentos (min)</Label>
                    <Input
                      id="service-buffer"
                      type="number"
                      min={0}
                      value={form.buffer}
                      onChange={(event) => set("buffer", event.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 sm:col-span-2">
                    <Label htmlFor="service-confirm">Exige confirmação da loja</Label>
                    <Switch
                      id="service-confirm"
                      checked={form.requiresConfirmation}
                      onCheckedChange={(checked) => set("requiresConfirmation", checked)}
                    />
                  </div>
                  <fieldset className="space-y-2 sm:col-span-2">
                    <legend className="text-sm font-medium text-foreground">Profissionais responsáveis</legend>
                    {catalog.professionals.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Cadastre profissionais na aba “Agenda” para vinculá-los a este serviço.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {catalog.professionals.map((professional) => (
                          <label key={professional.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={professionalSelection.includes(professional.id)}
                              onCheckedChange={(checked) =>
                                setProfessionalSelection((current) =>
                                  checked
                                    ? [...current, professional.id]
                                    : current.filter((id) => id !== professional.id),
                                )
                              }
                              aria-label={professional.name}
                            />
                            {professional.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                </div>
              ) : null}

              {form.kind === "preorder" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="preorder-lead">Prazo mínimo (dias)</Label>
                    <Input
                      id="preorder-lead"
                      type="number"
                      min={0}
                      value={form.leadDays}
                      onChange={(event) => set("leadDays", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preorder-deposit">Sinal (% do valor)</Label>
                    <Input
                      id="preorder-deposit"
                      type="number"
                      min={0}
                      max={100}
                      value={form.deposit}
                      onChange={(event) => set("deposit", event.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                    <Label htmlFor="preorder-custom">Permite personalização</Label>
                    <Switch
                      id="preorder-custom"
                      checked={form.allowsCustomization}
                      onCheckedChange={(checked) => set("allowsCustomization", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                    <Label htmlFor="preorder-files">Permite anexos</Label>
                    <Switch
                      id="preorder-files"
                      checked={form.allowsAttachments}
                      onCheckedChange={(checked) => set("allowsAttachments", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 sm:col-span-2">
                    <Label htmlFor="preorder-approval">Exige aprovação do cliente</Label>
                    <Switch
                      id="preorder-approval"
                      checked={form.requiresApproval}
                      onCheckedChange={(checked) => set("requiresApproval", checked)}
                    />
                  </div>
                </div>
              ) : null}

              {form.kind === "subscription" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sub-period">Periodicidade</Label>
                    <Select value={form.period} onValueChange={(value) => set("period", value)}>
                      <SelectTrigger id="sub-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBSCRIPTION_PERIODS.map((period) => (
                          <SelectItem key={period.value} value={period.value}>
                            {period.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub-url">Link da área de membros</Label>
                    <Input
                      id="sub-url"
                      type="url"
                      value={form.digitalUrl}
                      onChange={(event) => set("digitalUrl", event.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="sub-benefits">Benefícios (um por linha)</Label>
                    <Textarea
                      id="sub-benefits"
                      rows={4}
                      value={form.benefits}
                      onChange={(event) => set("benefits", event.target.value)}
                      placeholder={"Acesso a todas as aulas\nGrupo exclusivo de suporte\nNovos conteúdos todo mês"}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="sub-instructions">Instruções enviadas na ativação</Label>
                    <Textarea
                      id="sub-instructions"
                      rows={3}
                      value={form.digitalInstructions}
                      onChange={(event) => set("digitalInstructions", event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      A cobrança recorrente, a reativação após pagamento e o cancelamento são controlados em Painel ›
                      Digitais.
                    </p>
                  </div>
                </div>
              ) : null}

              {form.kind === "digital" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="digital-url">Link protegido do arquivo</Label>
                    <Input
                      id="digital-url"
                      type="url"
                      value={form.digitalUrl}
                      onChange={(event) => set("digitalUrl", event.target.value)}
                      placeholder="https://..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Pode ser um PDF, uma pasta na nuvem ou a aula em vídeo. O link nunca aparece na loja: após o
                      pagamento confirmado, o cliente recebe um link protegido com validade e limite de downloads,
                      configurados em Painel › Digitais.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="digital-instructions">Instruções de acesso</Label>
                    <Textarea
                      id="digital-instructions"
                      rows={3}
                      value={form.digitalInstructions}
                      onChange={(event) => set("digitalInstructions", event.target.value)}
                      placeholder="Ex.: baixe o arquivo, salve no celular e entre no grupo pelo link do e-mail."
                    />
                  </div>
                </div>
              ) : null}

              {form.kind === "combo" ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-foreground">Itens que compõem o combo</legend>
                  <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                    {catalog.products
                      .filter((item) => item.id !== product?.id && item.kind !== "combo")
                      .map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={comboSelection.includes(item.id)}
                            onCheckedChange={(checked) =>
                              setComboSelection((current) =>
                                checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                              )
                            }
                            aria-label={item.name}
                          />
                          {item.name}
                        </label>
                      ))}
                  </div>
                </fieldset>
              ) : null}

              {form.kind === "product" ? (
                isRetail ? (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      Depois de salvar, use a aba <strong>“Grade e etiquetas”</strong> do catálogo para criar variações
                      (tamanho × cor) com SKU, código de barras e estoque próprio de cada combinação.
                    </p>
                    <p>
                      Em <strong>“Coleções”</strong> você agrupa este produto em vitrines temáticas (lançamentos,
                      promoções, temporada) exibidas na loja.
                    </p>
                    <p>
                      Entradas por nota, reservas para retirada e trocas/devoluções ficam em <strong>Estoque</strong> e
                      em <strong>Pedidos</strong>.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Produtos simples usam apenas preço, estoque e disponibilidade. Configure adicionais na aba “Opções”.
                  </p>
                )
              ) : null}
            </TabsContent>

            {/* -------------------- OPÇÕES -------------------- */}
            <TabsContent value="opcoes" className="pt-4">
              {product ? (
                <OptionGroupsEditor
                  storeId={storeId}
                  productId={product.id}
                  groups={groups}
                  options={catalog.options}
                  onChanged={onChanged}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {isDigital
                    ? "Salve o item primeiro para criar planos, versões (PDF, vídeo, bônus) e ofertas adicionais."
                    : isService
                      ? "Salve o item primeiro para criar complementos do atendimento (ex.: hidratação, design, retoque)."
                      : "Salve o item primeiro para configurar variações, tamanhos, sabores e adicionais."}
                </p>
              )}
            </TabsContent>
          </Tabs>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Salvando..." : product ? "Salvar alterações" : "Criar item"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

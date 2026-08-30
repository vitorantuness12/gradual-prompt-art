/**
 * Regras puras dos checkouts especializados (agendamento, digital e loja online).
 *
 * Este arquivo NÃO acessa banco nem rede: recebe os dados já carregados e devolve
 * o resultado do cálculo. Isso permite que o servidor seja a única fonte de
 * verdade (o cliente nunca decide preço, frete ou disponibilidade) e que cada
 * regra tenha teste de regressão.
 */

/* ------------------------------- Frete / loja ------------------------------ */

export interface ShippingZone {
  id: string;
  label: string;
  /** "fixed" | "district" | "zip" | "distance" (demais valores caem em taxa fixa). */
  rule_type: string;
  district: string | null;
  zip_start: string | null;
  zip_end: string | null;
  distance_min_km: number;
  distance_max_km: number | null;
  weight_max_grams: number | null;
  fee: number;
  min_fee: number;
  price_per_km: number;
  free_above: number | null;
  min_order_value: number;
  eta_minutes: number;
  is_active: boolean;
  sort_order: number;
}

export interface ShippingInput {
  subtotal: number;
  zip?: string | null;
  district?: string | null;
  distanceKm?: number | null;
  weightGrams?: number | null;
}

export type ShippingReason =
  | "ok"
  | "no_zones"
  | "no_match"
  | "below_min_order"
  | "missing_address";

export interface ShippingQuote {
  ok: boolean;
  fee: number;
  etaMinutes: number;
  label: string;
  zoneId: string | null;
  /** Verdadeiro quando a zona zerou o frete por valor mínimo de compra. */
  free: boolean;
  reason: ShippingReason;
  message: string;
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function zoneMatches(zone: ShippingZone, input: ShippingInput): boolean {
  if (zone.weight_max_grams != null && (input.weightGrams ?? 0) > zone.weight_max_grams) return false;

  switch (zone.rule_type) {
    case "district":
      return Boolean(zone.district) && normalize(zone.district) === normalize(input.district);
    case "zip": {
      const zip = digits(input.zip);
      if (zip.length < 8) return false;
      const start = digits(zone.zip_start) || "00000000";
      const end = digits(zone.zip_end) || "99999999";
      return zip >= start.padEnd(8, "0") && zip <= end.padEnd(8, "9");
    }
    case "distance": {
      const km = input.distanceKm;
      if (km == null) return false;
      return km >= zone.distance_min_km && (zone.distance_max_km == null || km <= zone.distance_max_km);
    }
    default:
      // Taxa fixa: atende qualquer endereço.
      return true;
  }
}

function feeForZone(zone: ShippingZone, input: ShippingInput): number {
  if (zone.rule_type === "distance" && zone.price_per_km > 0) {
    const km = Math.max(0, input.distanceKm ?? 0);
    return Math.max(zone.min_fee, zone.fee + km * zone.price_per_km);
  }
  return Math.max(zone.min_fee, zone.fee);
}

/**
 * Frete calculado pelas regras cadastradas pelo lojista.
 * A ordem de avaliação segue `sort_order` — a primeira zona compatível vence.
 */
export function quoteShipping(zones: readonly ShippingZone[], input: ShippingInput): ShippingQuote {
  const active = zones
    .filter((zone) => zone.is_active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  if (active.length === 0) {
    return {
      ok: true,
      fee: 0,
      etaMinutes: 0,
      label: "Frete combinado com a loja",
      zoneId: null,
      free: false,
      reason: "no_zones",
      message: "A loja ainda não cadastrou regras de frete: o valor será combinado após o pedido.",
    };
  }

  const needsAddress = active.some((zone) => zone.rule_type === "district" || zone.rule_type === "zip");
  if (needsAddress && digits(input.zip).length < 8 && !input.district) {
    return {
      ok: false,
      fee: 0,
      etaMinutes: 0,
      label: "",
      zoneId: null,
      free: false,
      reason: "missing_address",
      message: "Informe o CEP para calcularmos o frete.",
    };
  }

  const zone = active.find((item) => zoneMatches(item, input));
  if (!zone) {
    return {
      ok: false,
      fee: 0,
      etaMinutes: 0,
      label: "",
      zoneId: null,
      free: false,
      reason: "no_match",
      message: "Ainda não entregamos nesse endereço. Confira o CEP ou escolha retirada.",
    };
  }

  if (input.subtotal < zone.min_order_value) {
    return {
      ok: false,
      fee: 0,
      etaMinutes: zone.eta_minutes,
      label: zone.label,
      zoneId: zone.id,
      free: false,
      reason: "below_min_order",
      message: `Pedido mínimo de ${zone.min_order_value.toFixed(2)} para ${zone.label}.`,
    };
  }

  const free = zone.free_above != null && zone.free_above > 0 && input.subtotal >= zone.free_above;
  const fee = free ? 0 : feeForZone(zone, input);

  return {
    ok: true,
    fee: Math.round(fee * 100) / 100,
    etaMinutes: zone.eta_minutes,
    label: zone.label,
    zoneId: zone.id,
    free,
    reason: "ok",
    message: free ? `Frete grátis em ${zone.label}.` : `Frete de ${zone.label}.`,
  };
}

/* --------------------- Revalidação de preço e estoque --------------------- */

export interface CartLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  notes?: string | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  promo_price: number | null;
  is_active: boolean;
  is_available: boolean;
  track_stock: boolean;
  stock_quantity: number;
  max_quantity_per_order: number | null;
  weight_grams: number | null;
  kind?: string | null;
}

export interface CatalogVariant {
  id: string;
  product_id: string;
  price: number | null;
  stock_quantity: number;
  is_active: boolean;
  option1_value: string | null;
  option2_value: string | null;
}

export interface ValidatedLine {
  productId: string;
  variantId: string | null;
  variantName: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
  notes: string | null;
  weightGrams: number;
}

export interface RevalidationResult {
  ok: boolean;
  lines: ValidatedLine[];
  subtotal: number;
  weightGrams: number;
  /** Mensagens prontas para o cliente, uma por problema encontrado. */
  problems: string[];
}

/** Preço vigente do produto/variação, sempre lido do catálogo do servidor. */
export function currentUnitPrice(product: CatalogProduct, variant?: CatalogVariant | null): number {
  if (variant && variant.price != null) return variant.price;
  if (product.promo_price != null && product.promo_price > 0 && product.promo_price < product.price) {
    return product.promo_price;
  }
  return product.price;
}

function variantLabel(variant: CatalogVariant): string {
  return [variant.option1_value, variant.option2_value].filter(Boolean).join(" / ") || "Variação";
}

/**
 * Confere no servidor cada linha do carrinho: produto ativo, estoque suficiente,
 * limite por pedido e preço atual. O total do pedido nunca vem do navegador.
 */
export function revalidateCart(
  lines: readonly CartLineInput[],
  products: readonly CatalogProduct[],
  variants: readonly CatalogVariant[] = [],
): RevalidationResult {
  const problems: string[] = [];
  const validated: ValidatedLine[] = [];

  if (lines.length === 0) {
    return { ok: false, lines: [], subtotal: 0, weightGrams: 0, problems: ["Seu carrinho está vazio."] };
  }

  for (const line of lines) {
    const product = products.find((item) => item.id === line.productId);
    if (!product || !product.is_active) {
      problems.push("Um item saiu do catálogo e foi removido do pedido.");
      continue;
    }
    if (!product.is_available) {
      problems.push(`${product.name} está indisponível no momento.`);
      continue;
    }

    const quantity = Math.max(1, Math.floor(line.quantity));
    const variant = line.variantId ? variants.find((item) => item.id === line.variantId) ?? null : null;
    if (line.variantId && (!variant || !variant.is_active || variant.product_id !== product.id)) {
      problems.push(`A variação escolhida de ${product.name} não está mais disponível.`);
      continue;
    }

    const limit = product.max_quantity_per_order;
    if (limit != null && limit > 0 && quantity > limit) {
      problems.push(`${product.name}: máximo de ${limit} por pedido.`);
      continue;
    }

    if (product.track_stock) {
      const available = variant ? variant.stock_quantity : product.stock_quantity;
      if (available <= 0) {
        problems.push(`${product.name} está sem estoque.`);
        continue;
      }
      if (available < quantity) {
        problems.push(`${product.name}: restam apenas ${available} em estoque.`);
        continue;
      }
    }

    const unitPrice = currentUnitPrice(product, variant);
    validated.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantName: variant ? variantLabel(variant) : null,
      name: product.name,
      unitPrice,
      quantity,
      total: Math.round(unitPrice * quantity * 100) / 100,
      notes: line.notes?.trim() ? line.notes.trim().slice(0, 300) : null,
      weightGrams: (product.weight_grams ?? 0) * quantity,
    });
  }

  const subtotal = Math.round(validated.reduce((sum, line) => sum + line.total, 0) * 100) / 100;
  const weightGrams = validated.reduce((sum, line) => sum + line.weightGrams, 0);

  return {
    ok: problems.length === 0 && validated.length > 0,
    lines: validated,
    subtotal,
    weightGrams,
    problems,
  };
}

/** Total final do pedido: nunca deixa o desconto passar do subtotal. */
export function orderTotals(input: { subtotal: number; shipping?: number; discount?: number }) {
  const subtotal = Math.max(0, Math.round(input.subtotal * 100) / 100);
  const shipping = Math.max(0, Math.round((input.shipping ?? 0) * 100) / 100);
  const discount = Math.min(subtotal, Math.max(0, Math.round((input.discount ?? 0) * 100) / 100));
  return {
    subtotal,
    shipping,
    discount,
    total: Math.round((subtotal + shipping - discount) * 100) / 100,
  };
}

/* ------------------------------ Agendamento ------------------------------- */

export interface SchedulingConfig {
  slot_minutes: number;
  open_time: string | null;
  close_time: string | null;
  require_deposit: boolean;
  deposit_percent: number;
}

export interface BusyInterval {
  professional_id: string | null;
  starts_at: string;
  ends_at: string | null;
}

export interface BlockInterval {
  professional_id: string | null;
  is_recurring: boolean;
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface AgendaSlot {
  startsAt: string;
  endsAt: string;
  label: string;
}

function minutesOf(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

/**
 * Horários livres de um serviço em um dia, considerando expediente, bloqueios,
 * agenda ocupada do profissional e antecedência mínima.
 */
export function buildAgendaSlots(input: {
  /** Dia consultado no formato AAAA-MM-DD. */
  date: string;
  durationMinutes: number;
  config: SchedulingConfig;
  professionalId?: string | null;
  busy?: readonly BusyInterval[];
  blocks?: readonly BlockInterval[];
  /** Agora, para descartar horários no passado. Injetável para testes. */
  now?: Date;
  minLeadMinutes?: number;
}): AgendaSlot[] {
  const [year, month, day] = input.date.split("-").map(Number);
  if (!year || !month || !day) return [];

  const step = Math.max(5, input.config.slot_minutes || 30);
  const duration = Math.max(step, input.durationMinutes || step);
  const open = minutesOf(input.config.open_time, 9 * 60);
  const close = minutesOf(input.config.close_time, 18 * 60);
  const now = input.now ?? new Date();
  const earliest = now.getTime() + Math.max(0, input.minLeadMinutes ?? 30) * 60_000;

  const slots: AgendaSlot[] = [];
  for (let minutes = open; minutes + duration <= close; minutes += step) {
    const start = new Date(year, month - 1, day, 0, 0, 0, 0);
    start.setMinutes(minutes);
    const end = new Date(start.getTime() + duration * 60_000);
    if (start.getTime() < earliest) continue;

    const blocked = (input.blocks ?? []).some((block) => {
      if (block.professional_id && input.professionalId && block.professional_id !== input.professionalId) {
        return false;
      }
      if (block.is_recurring) {
        if (block.weekday !== start.getDay()) return false;
        const value = start.getHours() * 60 + start.getMinutes();
        return value >= minutesOf(block.start_time, 0) && value < minutesOf(block.end_time, 24 * 60);
      }
      if (!block.starts_at || !block.ends_at) return false;
      return overlaps(
        start.getTime(),
        end.getTime(),
        new Date(block.starts_at).getTime(),
        new Date(block.ends_at).getTime(),
      );
    });
    if (blocked) continue;

    const taken = (input.busy ?? []).some((item) => {
      if (input.professionalId && item.professional_id && item.professional_id !== input.professionalId) {
        return false;
      }
      const busyStart = new Date(item.starts_at).getTime();
      const busyEnd = item.ends_at ? new Date(item.ends_at).getTime() : busyStart + duration * 60_000;
      return overlaps(start.getTime(), end.getTime(), busyStart, busyEnd);
    });
    if (taken) continue;

    slots.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      label: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
    });
  }

  return slots;
}

/** Sinal (entrada) exigido pela loja para confirmar o agendamento. */
export function depositForService(price: number, config: SchedulingConfig | null): number {
  if (!config?.require_deposit) return 0;
  const percent = Math.min(100, Math.max(0, config.deposit_percent ?? 0));
  return Math.round(price * (percent / 100) * 100) / 100;
}

/* --------------------------- Produtos digitais ---------------------------- */

/** Métodos que confirmam o pagamento na hora e permitem liberar o acesso. */
export const INSTANT_PAYMENT_METHODS = ["card_online", "pix_online"] as const;

/**
 * O acesso digital só é liberado com pagamento confirmado.
 * Pix com comprovante e cartão fora do sistema ficam pendentes de conferência.
 */
export function canReleaseDigital(input: {
  paymentStatus: string | null | undefined;
  total: number;
  paidAmount?: number | null;
}): boolean {
  if (input.paymentStatus !== "paid") return false;
  if (input.paidAmount == null) return true;
  // Tolerância de 1 centavo para arredondamentos do provedor.
  return input.paidAmount + 0.01 >= input.total;
}

/** Parcelas oferecidas no cartão, conforme o valor e o limite da loja. */
export function installmentOptions(total: number, maxInstallments = 12, minPerInstallment = 20) {
  const max = Math.max(1, Math.min(maxInstallments, Math.floor(total / minPerInstallment) || 1));
  return Array.from({ length: max }, (_, index) => {
    const count = index + 1;
    const value = Math.round((total / count) * 100) / 100;
    return { count, value, label: count === 1 ? "À vista" : `${count}x de ${value.toFixed(2)}` };
  });
}

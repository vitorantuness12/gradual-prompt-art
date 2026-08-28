/**
 * Calculadora de preço de venda.
 *
 * Regra central: o preço recomendado cobre todos os custos fixos por unidade
 * e ainda paga os custos percentuais (impostos, gateway, comissão de canal)
 * sobre o próprio preço. Por isso a fórmula divide pelo que "sobra" do preço
 * depois desses percentuais — somar a margem por cima do custo daria um
 * resultado menor do que o necessário.
 */

export interface CostInput {
  /** Custo do produto/insumo por unidade. */
  productCost: number;
  /** Embalagem por unidade. */
  packagingCost: number;
  /** Mão de obra por unidade. */
  laborCost: number;
  /** Outros custos fixos por unidade (energia, rateio). */
  otherCost: number;
  /** Taxa de entrega paga pela loja (quando não é repassada). */
  deliveryCost: number;
  /** Impostos sobre a venda, em %. */
  taxPercent: number;
  /** Taxa do gateway de pagamento, em %. */
  gatewayPercent: number;
  /** Comissão do canal (marketplace, indicação), em %. */
  channelPercent: number;
  /** Margem de lucro desejada sobre o preço, em %. */
  marginPercent: number;
  /** Desconto máximo autorizado, em %. */
  maxDiscountPercent: number;
  /** Preço promocional que a loja pretende praticar (opcional). */
  promoPrice?: number;
  /** Preço praticado hoje (opcional) — usado na comparação. */
  currentPrice?: number;
}

export type RoundingMode = "none" | "cents_90" | "cents_99" | "half_real" | "real" | "five";

export const ROUNDING_OPTIONS: { key: RoundingMode; label: string; help: string }[] = [
  { key: "none", label: "Sem arredondar", help: "Mantém os centavos exatos do cálculo." },
  { key: "cents_90", label: "Terminar em ,90", help: "Ex.: 27,43 vira 27,90." },
  { key: "cents_99", label: "Terminar em ,99", help: "Ex.: 27,43 vira 27,99." },
  { key: "half_real", label: "Meio real", help: "Arredonda para 0,50 mais próximo para cima." },
  { key: "real", label: "Real cheio", help: "Ex.: 27,43 vira 28,00." },
  { key: "five", label: "Múltiplo de 5", help: "Ex.: 27,43 vira 30,00." },
];

export const DEFAULT_COSTS: CostInput = {
  productCost: 0,
  packagingCost: 0,
  laborCost: 0,
  otherCost: 0,
  deliveryCost: 0,
  taxPercent: 0,
  gatewayPercent: 0,
  channelPercent: 0,
  marginPercent: 30,
  maxDiscountPercent: 10,
};

export interface PricingLine {
  key: string;
  label: string;
  value: number;
  /** Explicação em linguagem simples do que compõe a linha. */
  help: string;
  kind: "fixed" | "percent";
}

export interface PricingResult {
  /** Soma dos custos que não dependem do preço. */
  fixedCost: number;
  /** Percentual total que incide sobre o preço (impostos + gateway + canal). */
  variablePercent: number;
  /** Preço sugerido antes do arredondamento. */
  rawPrice: number;
  /** Preço sugerido depois do arredondamento configurado. */
  recommendedPrice: number;
  /** Custo total já considerando os percentuais no preço recomendado. */
  totalCost: number;
  grossProfit: number;
  /** Margem obtida no preço recomendado, em %. */
  marginPercent: number;
  /** Menor preço aceitável com o desconto máximo autorizado. */
  minPrice: number;
  /** Margem no preço mínimo, em %. */
  minMarginPercent: number;
  /** Situação do preço promocional informado. */
  promo: { price: number; profit: number; marginPercent: number; viable: boolean } | null;
  breakdown: PricingLine[];
  warnings: string[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Arredonda o preço conforme a preferência da loja (sempre para cima). */
export function applyRounding(value: number, mode: RoundingMode): number {
  if (value <= 0) return 0;
  switch (mode) {
    case "cents_90":
    case "cents_99": {
      const cents = mode === "cents_90" ? 0.9 : 0.99;
      const floor = Math.floor(value);
      const candidate = floor + cents;
      return round2(candidate >= value ? candidate : floor + 1 + cents);
    }
    case "half_real":
      return round2(Math.ceil(value * 2) / 2);
    case "real":
      return Math.ceil(value);
    case "five":
      return Math.ceil(value / 5) * 5;
    default:
      return round2(value);
  }
}

function safePercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 100);
}

/** Calcula preço recomendado, custos, lucro e margem. */
export function calculatePricing(input: CostInput, rounding: RoundingMode = "none"): PricingResult {
  const fixed = [
    {
      key: "productCost",
      label: "Custo do produto",
      value: input.productCost,
      help: "Insumos ou compra da mercadoria.",
    },
    {
      key: "packagingCost",
      label: "Embalagem",
      value: input.packagingCost,
      help: "Caixa, sacola, etiqueta e talheres.",
    },
    {
      key: "laborCost",
      label: "Mão de obra",
      value: input.laborCost,
      help: "Tempo de preparo rateado por unidade.",
    },
    {
      key: "otherCost",
      label: "Outros custos",
      value: input.otherCost,
      help: "Energia, gás, rateio de despesas fixas.",
    },
    {
      key: "deliveryCost",
      label: "Taxa de entrega assumida",
      value: input.deliveryCost,
      help: "Parte da entrega que a loja paga.",
    },
  ].map((line) => ({ ...line, value: Math.max(0, line.value || 0), kind: "fixed" as const }));

  const fixedCost = round2(fixed.reduce((sum, line) => sum + line.value, 0));

  const tax = safePercent(input.taxPercent);
  const gateway = safePercent(input.gatewayPercent);
  const channel = safePercent(input.channelPercent);
  const margin = safePercent(input.marginPercent);
  const variablePercent = round2(tax + gateway + channel);

  const warnings: string[] = [];
  const consumed = variablePercent + margin;

  let rawPrice: number;
  if (consumed >= 100) {
    warnings.push(
      "Impostos, taxas e margem somam 100% ou mais do preço. Reduza a margem ou as taxas.",
    );
    rawPrice = fixedCost > 0 ? fixedCost * 2 : 0;
  } else {
    rawPrice = fixedCost / (1 - consumed / 100);
  }

  const recommendedPrice = applyRounding(rawPrice, rounding);

  const variableCost = round2(recommendedPrice * (variablePercent / 100));
  const totalCost = round2(fixedCost + variableCost);
  const grossProfit = round2(recommendedPrice - totalCost);
  const marginPercent = recommendedPrice > 0 ? round2((grossProfit / recommendedPrice) * 100) : 0;

  const maxDiscount = safePercent(input.maxDiscountPercent);
  const minPrice = round2(recommendedPrice * (1 - maxDiscount / 100));
  const minVariable = round2(minPrice * (variablePercent / 100));
  const minProfit = round2(minPrice - fixedCost - minVariable);
  const minMarginPercent = minPrice > 0 ? round2((minProfit / minPrice) * 100) : 0;

  if (minProfit < 0) {
    warnings.push(
      "Com o desconto máximo o preço fica abaixo do custo. Reduza o desconto autorizado.",
    );
  }

  let promo: PricingResult["promo"] = null;
  if (typeof input.promoPrice === "number" && input.promoPrice > 0) {
    const promoVariable = round2(input.promoPrice * (variablePercent / 100));
    const promoProfit = round2(input.promoPrice - fixedCost - promoVariable);
    const promoMargin = round2((promoProfit / input.promoPrice) * 100);
    promo = {
      price: round2(input.promoPrice),
      profit: promoProfit,
      marginPercent: promoMargin,
      viable: promoProfit >= 0,
    };
    if (promoProfit < 0) warnings.push("O preço promocional informado dá prejuízo.");
  }

  if (fixedCost === 0)
    warnings.push("Informe ao menos o custo do produto para um resultado confiável.");

  const breakdown: PricingLine[] = [
    ...fixed,
    {
      key: "tax",
      label: "Impostos",
      value: tax,
      kind: "percent",
      help: "Percentual de imposto sobre a venda.",
    },
    {
      key: "gateway",
      label: "Taxa do gateway",
      value: gateway,
      kind: "percent",
      help: "Percentual cobrado pelo meio de pagamento.",
    },
    {
      key: "channel",
      label: "Comissão do canal",
      value: channel,
      kind: "percent",
      help: "Comissão de marketplace ou parceiro.",
    },
    {
      key: "margin",
      label: "Margem desejada",
      value: margin,
      kind: "percent",
      help: "Lucro que você quer sobre o preço final.",
    },
  ];

  return {
    fixedCost,
    variablePercent,
    rawPrice: round2(rawPrice),
    recommendedPrice,
    totalCost,
    grossProfit,
    marginPercent,
    minPrice,
    minMarginPercent,
    promo,
    breakdown,
    warnings,
  };
}

/** Margem de um preço já praticado — usado para comparar com o recomendado. */
export function marginForPrice(input: CostInput, price: number): number {
  if (price <= 0) return 0;
  const fixedCost =
    Math.max(0, input.productCost) +
    Math.max(0, input.packagingCost) +
    Math.max(0, input.laborCost) +
    Math.max(0, input.otherCost) +
    Math.max(0, input.deliveryCost);
  const variable =
    price *
    ((safePercent(input.taxPercent) +
      safePercent(input.gatewayPercent) +
      safePercent(input.channelPercent)) /
      100);
  return round2(((price - fixedCost - variable) / price) * 100);
}

/** Lê a ficha de custos salva no produto, preenchendo o que faltar. */
export function parsePricing(value: unknown): CostInput & { rounding: RoundingMode } {
  const source = (value ?? {}) as Partial<CostInput> & { rounding?: RoundingMode };
  return {
    ...DEFAULT_COSTS,
    ...Object.fromEntries(
      Object.entries(source).filter(
        ([key, item]) => key !== "rounding" && typeof item === "number",
      ),
    ),
    rounding: (source.rounding ?? "none") as RoundingMode,
  };
}

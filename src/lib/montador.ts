/**
 * Montador configurável (pizza e similares).
 *
 * O lojista define tamanhos, quantos sabores cabem em cada tamanho, bordas,
 * massas, adicionais e ingredientes que podem ser removidos. A regra de preço
 * decide como combinar sabores: o mais caro, a média, a soma proporcional ou
 * uma tabela própria por tamanho + sabor.
 *
 * Client-safe: a mesma função calcula o preço na loja e no servidor, então o
 * total exibido ao cliente e o total gravado no pedido não divergem.
 */

export type FlavorRule = "highest" | "average" | "proportional" | "table";

export const FLAVOR_RULES: { key: FlavorRule; label: string; help: string }[] = [
  { key: "highest", label: "Sabor mais caro", help: "Cobra o preço do sabor mais caro escolhido." },
  {
    key: "average",
    label: "Média dos sabores",
    help: "Soma os preços e divide pela quantidade de sabores.",
  },
  {
    key: "proportional",
    label: "Proporcional à fração",
    help: "Cada sabor entra pela fração que ocupa na pizza.",
  },
  {
    key: "table",
    label: "Tabela própria",
    help: "Usa o preço definido para cada tamanho e sabor.",
  },
];

export interface BuilderSize {
  id: string;
  label: string;
  /** Preço base do tamanho (sem sabores nem extras). */
  basePrice: number;
  /** Quantos sabores cabem neste tamanho. */
  maxFlavors: number;
  slices?: number;
}

export interface BuilderOption {
  id: string;
  label: string;
  price: number;
  /** Preço por tamanho (opcional) — vence o preço geral quando existir. */
  priceBySize?: Record<string, number>;
  isDefault?: boolean;
}

export interface BuilderIngredient {
  id: string;
  label: string;
  /** Pode ser removido pelo cliente sem alterar o preço. */
  removable: boolean;
}

export interface BuilderConfig {
  enabled: boolean;
  label: string;
  flavorRule: FlavorRule;
  sizes: BuilderSize[];
  flavors: BuilderOption[];
  crusts: BuilderOption[];
  doughs: BuilderOption[];
  extras: BuilderOption[];
  ingredients: BuilderIngredient[];
  /** Máximo de adicionais por item. */
  maxExtras: number;
  notesEnabled: boolean;
}

export const EMPTY_BUILDER: BuilderConfig = {
  enabled: false,
  label: "Monte sua pizza",
  flavorRule: "highest",
  sizes: [],
  flavors: [],
  crusts: [],
  doughs: [],
  extras: [],
  ingredients: [],
  maxExtras: 5,
  notesEnabled: true,
};

export interface BuilderSelection {
  sizeId: string;
  flavorIds: string[];
  crustId?: string | null;
  doughId?: string | null;
  extraIds: string[];
  removedIngredientIds: string[];
  quantity: number;
  notes?: string;
}

export interface BuilderLine {
  label: string;
  value: number;
}

export interface BuilderQuote {
  ok: boolean;
  errors: string[];
  /** Preço unitário já montado. */
  unitPrice: number;
  total: number;
  lines: BuilderLine[];
  /** Resumo legível para o cupom e para a cozinha. */
  description: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function optionPrice(option: BuilderOption, sizeId: string): number {
  const bySize = option.priceBySize?.[sizeId];
  return typeof bySize === "number" ? bySize : option.price;
}

/** Preço dos sabores conforme a regra configurada. */
export function flavorsPrice(
  config: BuilderConfig,
  size: BuilderSize,
  flavors: BuilderOption[],
): number {
  if (flavors.length === 0) return 0;
  const prices = flavors.map((flavor) => optionPrice(flavor, size.id));
  switch (config.flavorRule) {
    case "average":
      return round2(prices.reduce((sum, price) => sum + price, 0) / prices.length);
    case "proportional":
      return round2(prices.reduce((sum, price) => sum + price / prices.length, 0));
    case "table":
      // Na tabela própria o preço já vem por tamanho; usamos o maior definido.
      return round2(Math.max(...prices));
    case "highest":
    default:
      return round2(Math.max(...prices));
  }
}

/**
 * Valida a montagem e devolve o preço. A mesma função roda no navegador e no
 * servidor: se o cliente adulterar o total, o backend recalcula e recusa.
 */
export function quoteBuilder(config: BuilderConfig, selection: BuilderSelection): BuilderQuote {
  const errors: string[] = [];
  const lines: BuilderLine[] = [];

  const size = config.sizes.find((item) => item.id === selection.sizeId);
  if (!size) {
    return {
      ok: false,
      errors: ["Escolha um tamanho."],
      unitPrice: 0,
      total: 0,
      lines,
      description: "",
    };
  }

  const quantity = Math.max(1, Math.floor(selection.quantity || 1));

  const flavors = selection.flavorIds
    .map((id) => config.flavors.find((flavor) => flavor.id === id))
    .filter((flavor): flavor is BuilderOption => Boolean(flavor));

  if (flavors.length !== selection.flavorIds.length)
    errors.push("Um dos sabores escolhidos não está disponível.");
  if (flavors.length === 0) errors.push("Escolha ao menos um sabor.");
  if (flavors.length > size.maxFlavors) {
    errors.push(`O tamanho ${size.label} aceita no máximo ${size.maxFlavors} sabor(es).`);
  }

  const crust = selection.crustId
    ? config.crusts.find((item) => item.id === selection.crustId)
    : null;
  if (selection.crustId && !crust) errors.push("Borda indisponível.");

  const dough = selection.doughId
    ? config.doughs.find((item) => item.id === selection.doughId)
    : null;
  if (selection.doughId && !dough) errors.push("Massa indisponível.");

  const extras = selection.extraIds
    .map((id) => config.extras.find((extra) => extra.id === id))
    .filter((extra): extra is BuilderOption => Boolean(extra));
  if (extras.length !== selection.extraIds.length)
    errors.push("Um dos adicionais não está disponível.");
  if (extras.length > config.maxExtras)
    errors.push(`Máximo de ${config.maxExtras} adicionais por item.`);

  const removable = new Set(
    config.ingredients.filter((item) => item.removable).map((item) => item.id),
  );
  const invalidRemovals = selection.removedIngredientIds.filter((id) => !removable.has(id));
  if (invalidRemovals.length > 0) errors.push("Um dos ingredientes não pode ser removido.");

  const base = round2(size.basePrice);
  lines.push({ label: `Tamanho ${size.label}`, value: base });

  const flavorValue = flavorsPrice(config, size, flavors);
  if (flavorValue > 0) {
    const rule = FLAVOR_RULES.find((item) => item.key === config.flavorRule)?.label ?? "";
    lines.push({ label: `Sabores (${rule.toLowerCase()})`, value: flavorValue });
  }

  const crustValue = crust ? optionPrice(crust, size.id) : 0;
  if (crustValue > 0) lines.push({ label: `Borda ${crust?.label}`, value: crustValue });

  const doughValue = dough ? optionPrice(dough, size.id) : 0;
  if (doughValue > 0) lines.push({ label: `Massa ${dough?.label}`, value: doughValue });

  const extrasValue = round2(extras.reduce((sum, extra) => sum + optionPrice(extra, size.id), 0));
  if (extrasValue > 0) lines.push({ label: `Adicionais (${extras.length})`, value: extrasValue });

  const unitPrice = round2(base + flavorValue + crustValue + doughValue + extrasValue);
  const removedLabels = config.ingredients
    .filter((item) => selection.removedIngredientIds.includes(item.id))
    .map((item) => item.label);

  const description = [
    size.label,
    flavors.map((flavor) => flavor.label).join(" / "),
    crust ? `borda ${crust.label}` : "",
    dough ? `massa ${dough.label}` : "",
    extras.length > 0 ? `com ${extras.map((extra) => extra.label).join(", ")}` : "",
    removedLabels.length > 0 ? `sem ${removedLabels.join(", ")}` : "",
    selection.notes?.trim() ? `obs.: ${selection.notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    ok: errors.length === 0,
    errors,
    unitPrice,
    total: round2(unitPrice * quantity),
    lines,
    description,
  };
}

/** Lê a configuração salva no produto, garantindo todos os campos. */
export function parseBuilder(value: unknown): BuilderConfig {
  const source = (value ?? {}) as Partial<BuilderConfig>;
  return {
    ...EMPTY_BUILDER,
    ...source,
    sizes: Array.isArray(source.sizes) ? source.sizes : [],
    flavors: Array.isArray(source.flavors) ? source.flavors : [],
    crusts: Array.isArray(source.crusts) ? source.crusts : [],
    doughs: Array.isArray(source.doughs) ? source.doughs : [],
    extras: Array.isArray(source.extras) ? source.extras : [],
    ingredients: Array.isArray(source.ingredients) ? source.ingredients : [],
  };
}

/** ---------- Combos e kits ---------- */

export interface ComboComponent {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  deductsStock: boolean;
  isOptional: boolean;
  availableStock: number | null;
}

export interface ComboCheck {
  ok: boolean;
  errors: string[];
  /** Soma dos componentes obrigatórios, para comparar com o preço do kit. */
  componentsTotal: number;
  /** Quantas unidades do kit dá para montar com o estoque atual. */
  maxKits: number | null;
}

/** Valida componentes, quantidades e disponibilidade de um combo/kit. */
export function checkCombo(components: ComboComponent[], kitQuantity = 1): ComboCheck {
  const errors: string[] = [];
  if (components.length === 0) errors.push("Um combo precisa de pelo menos um componente.");

  let maxKits: number | null = null;
  let total = 0;

  for (const component of components) {
    if (component.quantity <= 0) errors.push(`Informe a quantidade de ${component.name}.`);
    if (!component.isOptional) total += component.price * component.quantity;

    if (component.deductsStock && component.availableStock != null && component.quantity > 0) {
      const possible = Math.floor(component.availableStock / component.quantity);
      maxKits = maxKits == null ? possible : Math.min(maxKits, possible);
      if (!component.isOptional && possible < kitQuantity) {
        errors.push(`Estoque insuficiente de ${component.name} para ${kitQuantity} kit(s).`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    componentsTotal: Math.round(total * 100) / 100,
    maxKits,
  };
}

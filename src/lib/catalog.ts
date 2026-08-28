/**
 * Regras e utilitários do catálogo multi-modelo (produtos, serviços, encomendas,
 * assinaturas, digitais e combos). Centralizado para que painel e loja pública
 * usem exatamente a mesma lógica de disponibilidade e preço.
 */
import type { Database } from "@/integrations/supabase/types";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type OptionGroupRow = Database["public"]["Tables"]["product_option_groups"]["Row"];
export type OptionRow = Database["public"]["Tables"]["product_options"]["Row"];
export type ProductKind = Database["public"]["Enums"]["product_kind"];

export const PRODUCT_KINDS: { value: ProductKind; label: string; hint: string }[] = [
  { value: "product", label: "Produto", hint: "Item físico com preço e estoque." },
  { value: "service", label: "Serviço", hint: "Atendimento com duração e agenda." },
  { value: "preorder", label: "Encomenda", hint: "Entrega em data futura, com sinal." },
  { value: "subscription", label: "Assinatura", hint: "Cobrança recorrente com benefícios." },
  { value: "digital", label: "Digital", hint: "Arquivo ou link liberado após o pagamento." },
  { value: "combo", label: "Combo / kit", hint: "Conjunto formado por outros itens." },
];

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = PRODUCT_KINDS.reduce(
  (acc, kind) => ({ ...acc, [kind.value]: kind.label }),
  {} as Record<ProductKind, string>,
);

export const OPTION_GROUP_TYPES = [
  { value: "variation", label: "Variação" },
  { value: "size", label: "Tamanho" },
  { value: "flavor", label: "Sabor" },
  { value: "addon", label: "Adicional" },
  { value: "extra", label: "Complemento" },
] as const;

export const OPTION_GROUP_TYPE_LABEL: Record<string, string> = OPTION_GROUP_TYPES.reduce(
  (acc, item) => ({ ...acc, [item.value]: item.label }),
  {} as Record<string, string>,
);

export const UNITS = ["un", "kg", "g", "l", "ml", "cx", "pct", "porção", "hora"] as const;

export const SUBSCRIPTION_PERIODS = [
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "yearly", label: "Anual" },
] as const;

export const WEEKDAYS = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
] as const;

/** Preço vigente do item (promocional quando houver). */
export function currentPrice(product: Pick<ProductRow, "price" | "promo_price">): number {
  const promo = product.promo_price == null ? null : Number(product.promo_price);
  const base = Number(product.price ?? 0);
  return promo != null && promo > 0 && promo < base ? promo : base;
}

export function hasPromo(product: Pick<ProductRow, "price" | "promo_price">): boolean {
  return currentPrice(product) < Number(product.price ?? 0);
}

function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":");
  const hours = Number(h);
  const minutes = Number(m ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export interface AvailabilityResult {
  available: boolean;
  reason: string | null;
}

/**
 * Diz se o item pode ser pedido agora, considerando arquivamento, pausa manual,
 * estoque, dias da semana e faixa de horário configurada.
 */
export function productAvailability(product: ProductRow, now: Date = new Date()): AvailabilityResult {
  if (product.archived_at) return { available: false, reason: "Item arquivado." };
  if (!product.is_active) return { available: false, reason: "Item inativo." };
  if (!product.is_available) {
    return { available: false, reason: product.unavailable_reason?.trim() || "Indisponível no momento." };
  }
  if (product.track_stock && Number(product.stock_quantity ?? 0) <= 0) {
    return { available: false, reason: "Sem estoque no momento." };
  }

  const days = (product.availability_days ?? []) as number[];
  if (days.length > 0 && !days.includes(now.getDay())) {
    const allowed = WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.short);
    return { available: false, reason: `Disponível apenas: ${allowed.join(", ")}.` };
  }

  const start = minutesOf(product.availability_start);
  const end = minutesOf(product.availability_end);
  if (start != null && end != null && start !== end) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const inside = start < end ? nowMinutes >= start && nowMinutes < end : nowMinutes >= start || nowMinutes < end;
    if (!inside) {
      return {
        available: false,
        reason: `Disponível das ${product.availability_start?.slice(0, 5)} às ${product.availability_end?.slice(0, 5)}.`,
      };
    }
  }

  return { available: true, reason: null };
}

/** Layout da vitrine conforme o segmento informado pelo lojista. */
export type StoreLayout = "menu" | "showcase" | "schedule";

export function layoutForStore(segment: string | null | undefined, products: ProductRow[]): StoreLayout {
  const normalized = (segment ?? "").toLowerCase();
  if (/(aliment|restaur|lanch|pizz|food|padaria|açai|acai|doceria|bar|café|cafe)/.test(normalized)) return "menu";
  if (/(serviç|servic|salão|salao|barbe|estét|estet|clínic|clinic|beleza|studio|petshop|oficina)/.test(normalized)) {
    return "schedule";
  }
  const services = products.filter((product) => product.kind === "service").length;
  if (products.length > 0 && services / products.length > 0.6) return "schedule";
  return "showcase";
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

export const CSV_COLUMNS = [
  "nome",
  "descricao",
  "categoria",
  "tipo",
  "preco",
  "preco_promocional",
  "sku",
  "codigo_barras",
  "unidade",
  "peso_gramas",
  "controla_estoque",
  "estoque",
  "estoque_minimo",
  "destaque",
  "disponivel",
  "duracao_minutos",
  "tags",
  "ordem",
] as const;

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function catalogToCsv(products: ProductRow[], categories: CategoryRow[]): string {
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const rows = products.map((product) =>
    [
      product.name,
      product.description ?? "",
      product.category_id ? (categoryName.get(product.category_id) ?? "") : "",
      product.kind,
      Number(product.price ?? 0).toFixed(2),
      product.promo_price == null ? "" : Number(product.promo_price).toFixed(2),
      product.sku ?? "",
      product.barcode ?? "",
      product.unit ?? "un",
      product.weight_grams ?? "",
      product.track_stock ? "sim" : "nao",
      product.stock_quantity ?? 0,
      product.min_stock ?? 0,
      product.is_featured ? "sim" : "nao",
      product.is_available ? "sim" : "nao",
      product.duration_minutes ?? "",
      (product.tags ?? []).join("|"),
      product.sort_order ?? 0,
    ]
      .map(csvCell)
      .join(";"),
  );
  return [CSV_COLUMNS.join(";"), ...rows].join("\n");
}

/** Divide uma linha CSV respeitando aspas e o separador ";" ou ",". */
function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export interface CsvProductInput {
  name: string;
  description: string | null;
  categoryName: string | null;
  kind: ProductKind;
  price: number;
  promoPrice: number | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  weightGrams: number | null;
  trackStock: boolean;
  stock: number;
  minStock: number;
  isFeatured: boolean;
  isAvailable: boolean;
  durationMinutes: number | null;
  tags: string[];
  sortOrder: number;
}

export interface CsvParseResult {
  items: CsvProductInput[];
  errors: string[];
}

function toBool(value: string | undefined): boolean {
  return ["sim", "s", "true", "1", "yes"].includes((value ?? "").toLowerCase());
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  // "1.234,50" (pt-BR) → o ponto é separador de milhar; "7.5" (exportações
  // em inglês) → o ponto é decimal. A vírgula decide qual formato é.
  const hasComma = value.includes(",");
  const normalized = (hasComma ? value.replace(/\./g, "").replace(",", ".") : value).replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Converte o CSV enviado pelo lojista em itens validados, listando os erros por linha. */
export function parseCatalogCsv(content: string): CsvParseResult {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const errors: string[] = [];
  if (lines.length < 2) return { items: [], errors: ["O arquivo precisa de um cabeçalho e ao menos uma linha."] };

  const headerLine = lines[0] ?? "";
  const separator = (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(headerLine, separator).map((cell) => cell.toLowerCase());
  const indexOf = (column: string) => header.indexOf(column);

  if (indexOf("nome") < 0) return { items: [], errors: ['O cabeçalho precisa conter a coluna "nome".'] };

  const kinds = new Set(PRODUCT_KINDS.map((kind) => kind.value));
  const items: CsvProductInput[] = [];

  lines.slice(1).forEach((line, position) => {
    const cells = splitCsvLine(line, separator);
    const get = (column: string) => {
      const index = indexOf(column);
      return index >= 0 ? cells[index] : undefined;
    };
    const rowNumber = position + 2;
    const name = (get("nome") ?? "").trim();
    if (name.length < 2) {
      errors.push(`Linha ${rowNumber}: nome inválido.`);
      return;
    }
    const price = toNumber(get("preco")) ?? 0;
    if (price < 0) {
      errors.push(`Linha ${rowNumber}: preço não pode ser negativo.`);
      return;
    }
    const rawKind = (get("tipo") ?? "product").trim().toLowerCase();
    const kind = (kinds.has(rawKind as ProductKind) ? rawKind : "product") as ProductKind;

    items.push({
      name,
      description: (get("descricao") ?? "").trim() || null,
      categoryName: (get("categoria") ?? "").trim() || null,
      kind,
      price,
      promoPrice: toNumber(get("preco_promocional")),
      sku: (get("sku") ?? "").trim() || null,
      barcode: (get("codigo_barras") ?? "").trim() || null,
      unit: (get("unidade") ?? "un").trim() || "un",
      weightGrams: toNumber(get("peso_gramas")),
      trackStock: toBool(get("controla_estoque")),
      stock: Math.max(0, Math.trunc(toNumber(get("estoque")) ?? 0)),
      minStock: Math.max(0, Math.trunc(toNumber(get("estoque_minimo")) ?? 0)),
      isFeatured: toBool(get("destaque")),
      isAvailable: get("disponivel") == null ? true : toBool(get("disponivel")),
      durationMinutes: toNumber(get("duracao_minutos")),
      tags: (get("tags") ?? "")
        .split(/[|,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      sortOrder: Math.trunc(toNumber(get("ordem")) ?? 0),
    });
  });

  return { items, errors };
}

export function csvTemplate(): string {
  return [
    CSV_COLUMNS.join(";"),
    "Pizza Margherita;Molho, muçarela e manjericão;Pizzas;product;54.90;49.90;PZ-001;;un;;nao;0;0;sim;sim;;destaque|classica;1",
    "Corte de cabelo;Corte masculino completo;Serviços;service;45.00;;;;hora;;nao;0;0;nao;sim;40;;2",
  ].join("\n");
}

/**
 * Venda por peso / fracionada no PDV.
 *
 * O operador pode digitar o peso (1,250) ou usar a etiqueta da balança, que
 * imprime um código de barras EAN-13 com o peso embutido. Tudo aqui é regra
 * pura para poder ser testado sem tela.
 */

/** Unidades aceitas para venda fracionada. */
export const WEIGHT_UNITS = ["kg", "g", "L", "ml", "m"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Converte "1,250" ou "1.25" em número; devolve 0 quando inválido. */
export function parseWeightInput(value: string): number {
  const normalized = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? round3(parsed) : 0;
}

/** Mostra o peso com no máximo três casas, no formato brasileiro. */
export function formatWeight(value: number, unit: string = "kg"): string {
  const text = round3(Number(value) || 0)
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
  return `${text} ${unit}`;
}

export interface ScaleLabel {
  /** Código do item (SKU/EAN interno) impresso pela balança. */
  itemCode: string;
  /** Peso lido da etiqueta, em quilos. */
  weightKg: number;
  /** Valor impresso na etiqueta, quando a balança grava preço em vez de peso. */
  priceValue: number;
  mode: "weight" | "price";
}

function ean13CheckDigit(digits: string): number {
  const sum = digits
    .slice(0, 12)
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * Lê a etiqueta da balança (EAN-13 iniciado em 2).
 * Formato usado no Brasil: 2 + 6 dígitos de item + 5 dígitos de peso/valor + verificador.
 * Peso vem em gramas (12345 = 1,234 kg) e valor em centavos.
 */
export function parseScaleBarcode(code: string, mode: "weight" | "price" = "weight"): ScaleLabel | null {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length !== 13) return null;
  if (!digits.startsWith("2")) return null;
  if (ean13CheckDigit(digits) !== Number(digits[12])) return null;

  const itemCode = digits.slice(1, 7);
  const raw = Number(digits.slice(7, 12));
  return {
    itemCode,
    weightKg: mode === "weight" ? round3(raw / 1000) : 0,
    priceValue: mode === "price" ? Math.round(raw) / 100 : 0,
    mode,
  };
}

/** Quantidade a lançar na venda a partir da etiqueta e do preço por unidade. */
export function scaleQuantity(label: ScaleLabel, unitPrice: number): number {
  if (label.mode === "price") {
    if (unitPrice <= 0) return 0;
    return round3(label.priceValue / unitPrice);
  }
  return label.weightKg;
}

/** Casa a etiqueta da balança com um produto pelo SKU ou código de barras. */
export function findScaleProduct<T extends { sku?: string | null; barcode?: string | null }>(
  products: T[],
  label: ScaleLabel,
): T | null {
  const code = label.itemCode.replace(/^0+/, "");
  const matches = (value: string | null | undefined) => {
    const clean = String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
    return clean.length > 0 && clean === code;
  };
  return (
    products.find((product) => matches(product.barcode)) ??
    products.find((product) => matches(product.sku)) ??
    null
  );
}

/** Total em reais de uma linha vendida por peso. */
export function weightLineTotal(weight: number, pricePerUnit: number): number {
  return Math.round((Math.max(0, weight) * Math.max(0, pricePerUnit) + Number.EPSILON) * 100) / 100;
}

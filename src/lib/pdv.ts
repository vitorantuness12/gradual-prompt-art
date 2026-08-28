/**
 * Regras puras do PDV (ponto de venda).
 * Ficam separadas da tela e do servidor para poderem ser testadas.
 */

export const POS_PAYMENT_METHODS = [
  { value: "cash", label: "Dinheiro", short: "Dinheiro", allowsChange: true },
  { value: "pix", label: "Pix", short: "Pix", allowsChange: false },
  { value: "debit", label: "Cartão de débito", short: "Débito", allowsChange: false },
  { value: "credit", label: "Cartão de crédito", short: "Crédito", allowsChange: false },
  { value: "voucher", label: "Vale / benefício", short: "Vale", allowsChange: false },
  { value: "online", label: "Pagamento online", short: "Online", allowsChange: false },
  { value: "on_delivery", label: "Pagamento na entrega", short: "Na entrega", allowsChange: false },
] as const;

export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number]["value"];

export const POS_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  POS_PAYMENT_METHODS.map((method) => [method.value, method.label]),
);

export const CASH_MOVEMENT_LABEL: Record<string, string> = {
  sale: "Venda",
  refund: "Estorno",
  cash_in: "Entrada",
  cash_out: "Saída",
  withdrawal: "Sangria",
  supply: "Suprimento",
};

export const POS_FULFILLMENTS = [
  { value: "counter", label: "Balcão" },
  { value: "pickup", label: "Retirada" },
  { value: "delivery", label: "Delivery" },
  { value: "dine_in", label: "Mesa" },
] as const;

export type PosFulfillment = (typeof POS_FULFILLMENTS)[number]["value"];

export interface PosCartLine {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
}

export interface PosSplitPayment {
  id: string;
  method: PosPaymentMethod;
  amount: number;
}

export interface PosTotals {
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Soma dos itens, aplicando desconto e taxa; o total nunca fica negativo. */
export function posTotals(lines: PosCartLine[], discount: number, fee: number): PosTotals {
  const subtotal = round(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const safeDiscount = round(Math.min(Math.max(discount, 0), subtotal));
  const safeFee = round(Math.max(fee, 0));
  return {
    subtotal,
    discount: safeDiscount,
    fee: safeFee,
    total: round(Math.max(subtotal - safeDiscount + safeFee, 0)),
  };
}

export interface SplitValidation {
  ok: boolean;
  paid: number;
  remaining: number;
  change: number;
  message: string;
}

/**
 * Valida o pagamento dividido.
 * - Não conclui com valor abaixo do total.
 * - Só aceita valor acima do total quando o excedente estiver em dinheiro (troco).
 */
export function validateSplitPayments(payments: PosSplitPayment[], total: number): SplitValidation {
  const valid = payments.filter((payment) => payment.amount > 0);
  const paid = round(valid.reduce((sum, payment) => sum + payment.amount, 0));
  const remaining = round(Math.max(total - paid, 0));
  const excess = round(Math.max(paid - total, 0));
  const cashPaid = round(
    valid.filter((payment) => payment.method === "cash").reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (valid.length === 0) {
    return { ok: false, paid: 0, remaining: round(total), change: 0, message: "Informe ao menos uma forma de pagamento." };
  }
  if (total <= 0) {
    return { ok: false, paid, remaining: 0, change: 0, message: "Adicione itens à venda antes de finalizar." };
  }
  if (remaining > 0.009) {
    return {
      ok: false,
      paid,
      remaining,
      change: 0,
      message: `Faltam ${remaining.toFixed(2).replace(".", ",")} para cobrir o total.`,
    };
  }
  if (excess > 0.009 && excess > cashPaid + 0.009) {
    return {
      ok: false,
      paid,
      remaining: 0,
      change: 0,
      message: "Só o dinheiro pode gerar troco. Ajuste os valores das outras formas.",
    };
  }

  return {
    ok: true,
    paid,
    remaining: 0,
    change: excess,
    message: excess > 0 ? `Troco de ${excess.toFixed(2).replace(".", ",")}.` : "Pagamento completo.",
  };
}

/** Saldo esperado em dinheiro no fechamento do turno. */
export function expectedCashBalance(
  openingBalance: number,
  movements: { kind: string; method: string; amount: number }[],
): number {
  const delta = movements.reduce((sum, movement) => {
    if (movement.method !== "cash") return sum;
    if (["sale", "cash_in", "supply"].includes(movement.kind)) return sum + Number(movement.amount);
    if (["refund", "cash_out", "withdrawal"].includes(movement.kind)) return sum - Number(movement.amount);
    return sum;
  }, 0);
  return round(Number(openingBalance) + delta);
}

/** Diferença entre o contado e o esperado (positivo = sobra, negativo = falta). */
export function cashDifference(counted: number, expected: number): number {
  return round(Number(counted) - Number(expected));
}

/** Busca local por nome, SKU ou código de barras (o scanner digita e envia Enter). */
export function matchesSearch(
  product: { name: string; sku?: string | null; barcode?: string | null },
  term: string,
): boolean {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  return (
    product.name.toLowerCase().includes(query) ||
    (product.sku ?? "").toLowerCase().includes(query) ||
    (product.barcode ?? "").toLowerCase() === query
  );
}

/** Um código de barras lido pelo scanner deve casar exatamente. */
export function findByCode<T extends { sku?: string | null; barcode?: string | null }>(
  products: T[],
  code: string,
): T | null {
  const value = code.trim().toLowerCase();
  if (!value) return null;
  return (
    products.find((product) => (product.barcode ?? "").toLowerCase() === value) ??
    products.find((product) => (product.sku ?? "").toLowerCase() === value) ??
    null
  );
}

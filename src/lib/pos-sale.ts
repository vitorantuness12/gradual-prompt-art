/**
 * Estado da venda no PDV: linhas do carrinho, descontos por item, vendas
 * suspensas e cálculo do resumo. São regras puras — o servidor recalcula tudo
 * de novo antes de gravar, então nada aqui é fonte de verdade de dinheiro.
 */

import type { PosFulfillment, PosPaymentMethod } from "@/lib/pdv";

export interface PosLineOption {
  name: string;
  price: number;
}

export interface PosSaleLine {
  lineId: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  /** Adicionais e variações escolhidos (somam ao preço unitário). */
  options: PosLineOption[];
  notes: string;
  /** Desconto em reais aplicado nesta linha inteira. */
  discount: number;
  /** Item vendido por peso/fração: a quantidade aceita casas decimais. */
  soldByWeight?: boolean;
  /** Unidade mostrada no carrinho e no cupom (kg, g, L...). */
  unitLabel?: string;
  /** Dados da receita quando o item é de venda controlada. */
  prescriptionInfo?: string;
}

/** Quantidade válida da linha: fracionada quando vendida por peso. */
export function lineQuantity(line: Pick<PosSaleLine, "quantity" | "soldByWeight">): number {
  const value = Number(line.quantity) || 0;
  if (line.soldByWeight) return Math.max(0.001, Math.round(value * 1000) / 1000);
  return Math.max(1, Math.round(value));
}

export interface PosSaleDraft {
  id: string;
  lines: PosSaleLine[];
  fulfillment: PosFulfillment;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  tableSessionId: string | null;
  tableNumber: string;
  notes: string;
  /** Desconto aplicado na venda inteira (em reais). */
  discount: number;
  discountReason: string;
  couponCode: string;
  fee: number;
  cashbackUsed: number;
  createdAt: string;
  label: string;
}

export function emptySaleDraft(id: string = newDraftId()): PosSaleDraft {
  return {
    id,
    lines: [],
    fulfillment: "counter",
    customerId: null,
    customerName: "",
    customerPhone: "",
    tableSessionId: null,
    tableNumber: "",
    notes: "",
    discount: 0,
    discountReason: "",
    couponCode: "",
    fee: 0,
    cashbackUsed: 0,
    createdAt: new Date().toISOString(),
    label: "",
  };
}

export function newDraftId(): string {
  return `venda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Preço unitário somado aos adicionais escolhidos. */
export function lineUnitPrice(line: PosSaleLine): number {
  const extras = line.options.reduce((sum, option) => sum + Number(option.price || 0), 0);
  return round(Number(line.unitPrice) + extras);
}

/** Total da linha já com o desconto dela, nunca negativo. */
export function lineTotal(line: PosSaleLine): number {
  const gross = round(lineUnitPrice(line) * lineQuantity(line));
  return round(Math.max(gross - Math.max(0, Number(line.discount) || 0), 0));
}

export interface PosSaleTotals {
  subtotal: number;
  itemDiscount: number;
  saleDiscount: number;
  discount: number;
  cashbackUsed: number;
  fee: number;
  total: number;
  itemCount: number;
}

/**
 * Resumo da venda. O desconto da venda e o cashback nunca deixam o total
 * negativo; a taxa é somada por último.
 */
export function saleTotals(draft: PosSaleDraft): PosSaleTotals {
  const subtotal = round(draft.lines.reduce((sum, line) => sum + lineUnitPrice(line) * lineQuantity(line), 0));
  const itemDiscount = round(
    draft.lines.reduce((sum, line) => {
      const gross = lineUnitPrice(line) * lineQuantity(line);
      return sum + Math.min(Math.max(0, Number(line.discount) || 0), gross);
    }, 0),
  );
  const afterItems = round(Math.max(subtotal - itemDiscount, 0));
  const saleDiscount = round(Math.min(Math.max(0, Number(draft.discount) || 0), afterItems));
  const afterSale = round(Math.max(afterItems - saleDiscount, 0));
  const cashbackUsed = round(Math.min(Math.max(0, Number(draft.cashbackUsed) || 0), afterSale));
  const fee = round(Math.max(0, Number(draft.fee) || 0));
  return {
    subtotal,
    itemDiscount,
    saleDiscount,
    discount: round(itemDiscount + saleDiscount),
    cashbackUsed,
    fee,
    total: round(Math.max(afterSale - cashbackUsed, 0) + fee),
    itemCount: draft.lines.reduce((sum, line) => sum + (line.soldByWeight ? 1 : lineQuantity(line)), 0),
  };
}

/** Troco quando o operador informa quanto recebeu em dinheiro. */
export function changeFor(received: number, total: number): number {
  return round(Math.max(Number(received || 0) - Number(total || 0), 0));
}

/* ---------------- Vendas suspensas ---------------- */

export interface SuspendedSale extends PosSaleDraft {
  suspendedAt: string;
}

/** Rótulo curto para a lista de vendas suspensas. */
export function draftLabel(draft: PosSaleDraft): string {
  if (draft.label.trim()) return draft.label.trim();
  if (draft.tableNumber.trim()) return `Mesa ${draft.tableNumber.trim()}`;
  if (draft.customerName.trim()) return draft.customerName.trim();
  const first = draft.lines[0];
  return first ? first.name : "Venda sem itens";
}

/** Um rascunho só é considerado "em andamento" se tiver item ou dado do cliente. */
export function isDraftDirty(draft: PosSaleDraft): boolean {
  return (
    draft.lines.length > 0 ||
    Boolean(draft.customerId) ||
    draft.customerName.trim().length > 0 ||
    draft.notes.trim().length > 0 ||
    draft.tableNumber.trim().length > 0
  );
}

/** Recria uma linha com novo identificador (usado ao duplicar a venda). */
export function cloneDraft(draft: PosSaleDraft, id: string = newDraftId()): PosSaleDraft {
  return {
    ...draft,
    id,
    createdAt: new Date().toISOString(),
    lines: draft.lines.map((line, index) => ({
      ...line,
      lineId: `${id}-${index}`,
      options: line.options.map((option) => ({ ...option })),
    })),
  };
}

/** Normaliza um rascunho vindo do armazenamento local (pode estar desatualizado). */
export function parseSaleDraft(value: unknown): PosSaleDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw["id"] !== "string") return null;
  const base = emptySaleDraft(raw["id"]);
  const lines = Array.isArray(raw["lines"]) ? raw["lines"] : [];
  return {
    ...base,
    fulfillment: (["counter", "pickup", "delivery", "dine_in"] as PosFulfillment[]).includes(raw["fulfillment"] as PosFulfillment)
      ? (raw["fulfillment"] as PosFulfillment)
      : base.fulfillment,
    customerId: typeof raw["customerId"] === "string" ? raw["customerId"] : null,
    customerName: typeof raw["customerName"] === "string" ? raw["customerName"] : "",
    customerPhone: typeof raw["customerPhone"] === "string" ? raw["customerPhone"] : "",
    tableSessionId: typeof raw["tableSessionId"] === "string" ? raw["tableSessionId"] : null,
    tableNumber: typeof raw["tableNumber"] === "string" ? raw["tableNumber"] : "",
    notes: typeof raw["notes"] === "string" ? raw["notes"] : "",
    discount: Number(raw["discount"]) || 0,
    discountReason: typeof raw["discountReason"] === "string" ? raw["discountReason"] : "",
    couponCode: typeof raw["couponCode"] === "string" ? raw["couponCode"] : "",
    fee: Number(raw["fee"]) || 0,
    cashbackUsed: Number(raw["cashbackUsed"]) || 0,
    createdAt: typeof raw["createdAt"] === "string" ? raw["createdAt"] : base.createdAt,
    label: typeof raw["label"] === "string" ? raw["label"] : "",
    lines: lines
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const line = item as Record<string, unknown>;
        if (typeof line["productId"] !== "string" || typeof line["name"] !== "string") return null;
        const options = Array.isArray(line["options"]) ? line["options"] : [];
        return {
          lineId: typeof line["lineId"] === "string" ? line["lineId"] : `${raw["id"]}-${index}`,
          productId: line["productId"],
          name: line["name"],
          imageUrl: typeof line["imageUrl"] === "string" ? line["imageUrl"] : null,
          unitPrice: Number(line["unitPrice"]) || 0,
          quantity: line["soldByWeight"] === true
            ? Math.max(0.001, Number(line["quantity"]) || 1)
            : Math.max(1, Math.floor(Number(line["quantity"]) || 1)),
          soldByWeight: line["soldByWeight"] === true,
          unitLabel: typeof line["unitLabel"] === "string" ? line["unitLabel"] : "un",
          prescriptionInfo: typeof line["prescriptionInfo"] === "string" ? line["prescriptionInfo"] : "",
          notes: typeof line["notes"] === "string" ? line["notes"] : "",
          discount: Number(line["discount"]) || 0,
          options: options
            .map((option) => {
              if (!option || typeof option !== "object") return null;
              const value = option as Record<string, unknown>;
              if (typeof value["name"] !== "string") return null;
              return { name: value["name"], price: Number(value["price"]) || 0 };
            })
            .filter((option): option is PosLineOption => option !== null),
        } as PosSaleLine;
      })
      .filter((line): line is PosSaleLine => line !== null),
  };
}

/* ---------------- Pagamento ---------------- */

export interface PosPaymentEntry {
  id: string;
  method: PosPaymentMethod;
  amount: number;
  /** Quanto o cliente entregou em dinheiro (para calcular o troco). */
  received?: number;
}

export function newPaymentEntry(method: PosPaymentMethod, amount: number): PosPaymentEntry {
  return { id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, method, amount: round(amount) };
}

/** Quanto ainda falta cobrir do total da venda. */
export function remainingToPay(entries: PosPaymentEntry[], total: number): number {
  const paid = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
  return round(Math.max(total - paid, 0));
}

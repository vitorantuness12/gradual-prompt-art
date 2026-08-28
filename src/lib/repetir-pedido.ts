/**
 * Repetir pedido.
 *
 * Recebe os itens de um pedido antigo e o catálogo atual da loja e devolve o
 * que ainda pode ser comprado, o que mudou de preço e o que saiu do ar. Nada
 * é adicionado ao carrinho sem o cliente confirmar.
 */

import { currentPrice, productAvailability, type ProductRow } from "@/lib/catalog";
import type { CartOption } from "@/hooks/useCart";

export interface PreviousOrderItem {
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  options: unknown;
  notes: string | null;
}

export type RepeatIssue = "ok" | "price_changed" | "unavailable" | "removed" | "options_changed";

export interface RepeatLine {
  productId: string;
  name: string;
  quantity: number;
  /** Preço pago no pedido anterior. */
  previousPrice: number;
  /** Preço atual, já recalculado com adicionais válidos. */
  currentPrice: number;
  options: CartOption[];
  notes: string | null;
  maxQuantity: number | null;
  issue: RepeatIssue;
  message: string | null;
}

export interface RepeatResult {
  lines: RepeatLine[];
  /** Linhas que podem ir para o carrinho. */
  available: RepeatLine[];
  /** Linhas que não podem ser repetidas. */
  blocked: RepeatLine[];
  total: number;
  hasChanges: boolean;
}

/** Lê os adicionais gravados no item do pedido. */
export function parseOrderOptions(value: unknown): CartOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<CartOption>;
    if (typeof raw.groupName !== "string" || typeof raw.optionName !== "string") return [];
    return [{ groupName: raw.groupName, optionName: raw.optionName, priceDelta: Number(raw.priceDelta) || 0 }];
  });
}

interface OptionRowLike {
  id: string;
  group_id: string;
  name: string;
  price_delta: number | string;
  is_active?: boolean | null;
}

interface OptionGroupLike {
  id: string;
  product_id: string | null;
  name: string;
}

/**
 * Monta a repetição do pedido com os preços e a disponibilidade de hoje.
 *
 * - Item apagado ou desativado vira "removido".
 * - Item sem estoque ou fora do horário vira "indisponível".
 * - Adicional que não existe mais é descartado e a linha é marcada.
 * - Preço diferente é sinalizado, sempre valendo o preço atual.
 */
export function buildRepeatOrder(
  items: PreviousOrderItem[],
  products: ProductRow[],
  groups: OptionGroupLike[] = [],
  options: OptionRowLike[] = [],
  now: Date = new Date(),
): RepeatResult {
  const byId = new Map(products.map((product) => [product.id, product]));

  const lines: RepeatLine[] = items.map((item) => {
    const previousPrice = Number(item.unit_price) || 0;
    const savedOptions = parseOrderOptions(item.options);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const product = item.product_id ? byId.get(item.product_id) : undefined;

    if (!product) {
      return {
        productId: item.product_id ?? "",
        name: item.name,
        quantity,
        previousPrice,
        currentPrice: previousPrice,
        options: savedOptions,
        notes: item.notes,
        maxQuantity: null,
        issue: "removed",
        message: "Este item não está mais no catálogo da loja.",
      };
    }

    const availability = productAvailability(product, now);
    const productGroups = groups.filter((group) => group.product_id === product.id);
    const groupNames = new Set(productGroups.map((group) => group.name));
    const validOptions: CartOption[] = [];
    let droppedOption = false;

    for (const chosen of savedOptions) {
      const group = productGroups.find((item2) => item2.name === chosen.groupName);
      const match = group
        ? options.find(
            (option) => option.group_id === group.id && option.name === chosen.optionName && option.is_active !== false,
          )
        : undefined;
      if (!match) {
        if (groupNames.size > 0) droppedOption = true;
        continue;
      }
      validOptions.push({
        groupName: chosen.groupName,
        optionName: chosen.optionName,
        priceDelta: Number(match.price_delta) || 0,
      });
    }

    const base = currentPrice(product);
    const price = Number(
      (base + validOptions.reduce((sum, option) => sum + option.priceDelta, 0)).toFixed(2),
    );

    let issue: RepeatIssue = "ok";
    let message: string | null = null;

    if (!availability.available) {
      issue = "unavailable";
      message = availability.reason ?? "Indisponível no momento.";
    } else if (droppedOption) {
      issue = "options_changed";
      message = "Alguns adicionais deste item mudaram e foram removidos.";
    } else if (Math.abs(price - previousPrice) >= 0.01) {
      issue = "price_changed";
      message = price > previousPrice ? "O preço aumentou desde o último pedido." : "O preço está menor que antes.";
    }

    return {
      productId: product.id,
      name: product.name,
      quantity: product.max_quantity_per_order ? Math.min(quantity, product.max_quantity_per_order) : quantity,
      previousPrice,
      currentPrice: price,
      options: validOptions,
      notes: item.notes,
      maxQuantity: product.max_quantity_per_order,
      issue,
      message,
    };
  });

  const blocked = lines.filter((line) => line.issue === "unavailable" || line.issue === "removed");
  const available = lines.filter((line) => line.issue !== "unavailable" && line.issue !== "removed");

  return {
    lines,
    available,
    blocked,
    total: Number(available.reduce((sum, line) => sum + line.currentPrice * line.quantity, 0).toFixed(2)),
    hasChanges: lines.some((line) => line.issue !== "ok"),
  };
}

/** Situações que a loja considera concluídas — só elas podem ser repetidas. */
const REPEATABLE_STATUSES = new Set([
  "delivered",
  "completed",
  "paid",
  "picked_up",
  "ready",
  "out_for_delivery",
  "confirmed",
  "preparing",
]);

/** Pedido cancelado ou recusado não é repetível, salvo liberação da loja. */
export function canRepeatOrder(status: string, allowCancelled = false): boolean {
  if (REPEATABLE_STATUSES.has(status)) return true;
  if (allowCancelled && (status === "cancelled" || status === "rejected")) return true;
  return false;
}

/** Deixa o telefone só com dígitos, do jeito usado na busca do histórico. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

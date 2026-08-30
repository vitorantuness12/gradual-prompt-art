/**
 * Tipos e regras puras da recuperação de carrinho abandonado.
 *
 * O carrinho só sai do navegador quando o cliente se identifica pelo telefone
 * no checkout — antes disso não existe nada para avisar, e guardar o carrinho
 * de um visitante anônimo não traria benefício nem seria correto.
 */

export interface AbandonedCartItem {
  productId: string;
  variantId?: string | null;
  variantName?: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string | null;
  options?: { groupName: string; optionName: string; priceDelta: number }[];
}

export interface AbandonedCartAddress {
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  reference?: string | null;
}

export interface AbandonedCartRecovery {
  ok: boolean;
  message: string;
  storeSlug: string | null;
  storeId: string | null;
  storeName: string | null;
  customerName: string | null;
  couponCode: string | null;
  items: AbandonedCartItem[];
}

/** Janela máxima de recuperação: depois disso o carrinho perde sentido. */
export const ABANDONED_CART_MAX_AGE_HOURS = 48;

/** Quantos lembretes podemos mandar por carrinho (1 = um único toque). */
export const ABANDONED_CART_MAX_REMINDERS = 1;

export const DEFAULT_ABANDONED_DELAY_MINUTES = 30;

/** Espera mínima/máxima aceitas na configuração do lojista. */
export function clampDelayMinutes(value: number | null | undefined): number {
  const minutes = Number(value ?? DEFAULT_ABANDONED_DELAY_MINUTES);
  if (!Number.isFinite(minutes)) return DEFAULT_ABANDONED_DELAY_MINUTES;
  return Math.min(720, Math.max(10, Math.round(minutes)));
}

/** Aceita apenas itens com o formato esperado, evitando lixo no banco. */
export function sanitizeItems(items: unknown): AbandonedCartItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (item): item is AbandonedCartItem =>
        Boolean(item) &&
        typeof (item as AbandonedCartItem).productId === "string" &&
        typeof (item as AbandonedCartItem).name === "string" &&
        Number.isFinite(Number((item as AbandonedCartItem).unitPrice)) &&
        Number((item as AbandonedCartItem).quantity) > 0,
    )
    .slice(0, 60)
    .map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? null,
      variantName: item.variantName ?? null,
      name: String(item.name).slice(0, 160),
      unitPrice: Number(item.unitPrice),
      quantity: Math.min(999, Math.max(1, Math.round(Number(item.quantity)))),
      notes: item.notes ? String(item.notes).slice(0, 300) : null,
      options: Array.isArray(item.options)
        ? item.options.slice(0, 20).map((option) => ({
            groupName: String(option.groupName ?? "").slice(0, 80),
            optionName: String(option.optionName ?? "").slice(0, 80),
            priceDelta: Number(option.priceDelta ?? 0) || 0,
          }))
        : [],
    }));
}

export function cartSubtotal(items: AbandonedCartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

/** Link que devolve o cliente ao carrinho já montado. */
export function recoveryLink(baseUrl: string, storeSlug: string, token: string, coupon?: string | null): string {
  const url = new URL(`/${storeSlug}/carrinho`, baseUrl);
  url.searchParams.set("retomar", token);
  if (coupon) url.searchParams.set("cupom", coupon);
  return url.toString();
}

/** Texto do lembrete. Curto, direto e com o link de retomada. */
export function reminderMessage(input: {
  firstName: string;
  storeName: string;
  itemNames: string[];
  link: string;
  coupon?: string | null;
}): string {
  const greeting = input.firstName ? `${input.firstName}, ` : "";
  const list = input.itemNames.slice(0, 3).join(", ");
  const extra = input.itemNames.length > 3 ? " e mais itens" : "";
  const couponLine = input.coupon
    ? `\n\nUse o cupom *${input.coupon}* para ganhar um desconto ao finalizar.`
    : "";
  return `${greeting}você deixou o pedido pela metade na ${input.storeName} 🙂\n\nAinda está com: ${list}${extra}.\n\nRetome de onde parou: ${input.link}${couponLine}`;
}

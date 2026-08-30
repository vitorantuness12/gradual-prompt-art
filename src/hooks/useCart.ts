import { useCallback, useEffect, useState } from "react";

/** Opção escolhida pelo cliente (tamanho, sabor, adicional, complemento). */
export interface CartOption {
  groupName: string;
  optionName: string;
  priceDelta: number;
}

export interface CartItem {
  /** Identifica a linha do carrinho: o mesmo produto com opções diferentes ocupa linhas distintas. */
  lineId: string;
  productId: string;
  /** SKU escolhido na grade de variações (tamanho × cor), quando houver. */
  variantId?: string | null;
  variantName?: string | null;
  name: string;
  /** Preço unitário já somado aos adicionais escolhidos. */
  unitPrice: number;
  quantity: number;
  options?: CartOption[];
  notes?: string | null;
  maxQuantity?: number | null;
  /**
   * Item adicionado pelo bloco "leve também". Guardado no carrinho para o
   * lojista poder medir quanto o upsell realmente gerou de receita.
   */
  fromUpsell?: boolean;
}

export type CartItemInput = Omit<CartItem, "quantity" | "lineId"> & { lineId?: string };

interface CartEnvelope {
  storeId: string | null;
  items: CartItem[];
  updatedAt: string;
}

export interface StoredOrder {
  code: string;
  storeId: string;
  storeName: string;
  total: number;
  createdAt: string;
  phone: string;
}

const PREFIX = "seu-pedido:cart:";
const ORDERS_PREFIX = "seu-pedido:orders:";

function cartKey(slug: string) {
  return `${PREFIX}${slug}`;
}

function ordersKey(slug: string) {
  return `${ORDERS_PREFIX}${slug}`;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Assinatura estável da linha: produto + opções + observação. */
export function buildLineId(item: {
  productId: string;
  variantId?: string | null;
  options?: CartOption[];
  notes?: string | null;
}): string {
  const options = (item.options ?? [])
    .map((option) => `${option.groupName}:${option.optionName}`)
    .sort()
    .join("|");
  return `${item.productId}::${item.variantId ?? ""}::${options}::${(item.notes ?? "").trim()}`;
}

/** Compatibiliza itens salvos em versões anteriores (sem `lineId`). */
function normalize(items: CartItem[]): CartItem[] {
  return items
    .filter((item) => item && typeof item.productId === "string")
    .map((item) => ({ ...item, lineId: item.lineId ?? buildLineId(item) }));
}

/**
 * Lê o carrinho da loja informada.
 * O `storeId` é conferido para que um endereço reaproveitado por outra loja nunca herde itens antigos.
 */
function readCart(slug: string, storeId?: string | null): CartItem[] {
  if (typeof window === "undefined") return [];
  const stored = parseJson<CartEnvelope | CartItem[]>(window.localStorage.getItem(cartKey(slug)));
  if (!stored) return [];

  // Formato legado: array puro, sem identificação da loja.
  if (Array.isArray(stored)) return normalize(stored);
  if (storeId && stored.storeId && stored.storeId !== storeId) {
    window.localStorage.removeItem(cartKey(slug));
    return [];
  }
  return Array.isArray(stored.items) ? normalize(stored.items) : [];
}

/** Guarda o pedido finalizado no histórico local daquela loja. */
export function rememberOrder(slug: string, order: StoredOrder) {
  if (typeof window === "undefined") return;
  const current = parseJson<StoredOrder[]>(window.localStorage.getItem(ordersKey(slug))) ?? [];
  const next = [order, ...current.filter((entry) => entry.code !== order.code)].slice(0, 5);
  window.localStorage.setItem(ordersKey(slug), JSON.stringify(next));
}

/**
 * Substitui o carrinho daquela loja por um conjunto de itens.
 * Usado pela função "Repetir pedido": o cliente confirma as linhas e cai no
 * checkout já com tudo montado.
 */
export function seedCart(slug: string, storeId: string | null, items: CartItem[]) {
  if (typeof window === "undefined") return;
  const envelope: CartEnvelope = {
    storeId,
    items: normalize(items),
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(cartKey(slug), JSON.stringify(envelope));
}

/** Histórico local de pedidos da loja atual — nunca mistura pedidos de outros endereços. */
export function useOrderHistory(slug: string, storeId?: string | null) {
  const [orders, setOrders] = useState<StoredOrder[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = parseJson<StoredOrder[]>(window.localStorage.getItem(ordersKey(slug))) ?? [];
    setOrders(storeId ? stored.filter((entry) => entry.storeId === storeId) : stored);
  }, [slug, storeId]);

  return orders;
}

/**
 * Carrinho persistido por loja no navegador do cliente.
 * A leitura acontece após a hidratação para evitar divergência entre servidor e cliente.
 */
export function useCart(slug: string, storeId?: string | null) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readCart(slug, storeId));
    setHydrated(true);
  }, [slug, storeId]);

  // Mantém itens e observações idênticos entre carrinho, checkout e outras abas.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setItems(readCart(slug, storeId));
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === cartKey(slug)) sync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, storeId]);

  const persist = useCallback(
    (next: CartItem[]) => {
      setItems(next);
      if (typeof window !== "undefined") {
        const envelope: CartEnvelope = {
          storeId: storeId ?? null,
          items: next,
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(cartKey(slug), JSON.stringify(envelope));
      }
    },
    [slug, storeId],
  );

  const add = useCallback(
    (item: CartItemInput, quantity = 1) => {
      const lineId = item.lineId ?? buildLineId(item);
      const current = readCart(slug, storeId);
      const existing = current.find((entry) => entry.lineId === lineId);
      const limit = item.maxQuantity ?? null;
      const next = existing
        ? current.map((entry) =>
            entry.lineId === lineId
              ? {
                  ...entry,
                  quantity: limit ? Math.min(limit, entry.quantity + quantity) : entry.quantity + quantity,
                }
              : entry,
          )
        : [...current, { ...item, lineId, quantity: limit ? Math.min(limit, quantity) : quantity }];
      persist(next);
    },
    [persist, slug, storeId],
  );

  const setQuantity = useCallback(
    (lineId: string, quantity: number) => {
      const next = readCart(slug, storeId)
        .map((entry) =>
          entry.lineId === lineId
            ? { ...entry, quantity: entry.maxQuantity ? Math.min(entry.maxQuantity, quantity) : quantity }
            : entry,
        )
        .filter((entry) => entry.quantity > 0);
      persist(next);
    },
    [persist, slug, storeId],
  );

  const remove = useCallback((lineId: string) => setQuantity(lineId, 0), [setQuantity]);

  const clear = useCallback(() => persist([]), [persist]);

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, hydrated, add, setQuantity, remove, clear, subtotal, count };
}

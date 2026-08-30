/**
 * Tipos compartilhados do envio de pedido da loja (delivery/restaurante).
 *
 * O navegador monta a intenção do pedido; a gravação acontece no servidor,
 * porque o visitante não autenticado pode inserir mas não pode ler pedidos
 * (RLS), e o checkout precisa receber de volta o código gerado.
 */

export type PedidoLojaType =
  | "delivery"
  | "pickup"
  | "dine_in"
  | "scheduled"
  | "counter";

/** Adicional escolhido; o preço vem do cadastro, nunca do navegador. */
export interface PedidoLojaOptionInput {
  groupName: string;
  optionName: string;
}

export interface PedidoLojaItemInput {
  productId: string;
  variantId?: string | null;
  variantName?: string | null;
  productName: string;
  quantity: number;
  /** Preço informado pelo navegador: usado apenas como referência; o servidor recalcula. */
  unitPrice: number;
  notes?: string | null;
  options?: PedidoLojaOptionInput[];
  fromUpsell?: boolean;
}

export interface PedidoLojaOfferInput {
  offerId: string;
  productId: string;
  name: string;
  price: number;
}

export interface PedidoLojaInput {
  storeSlug: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  type: PedidoLojaType;
  tableNumber?: string | null;
  distanceKm?: number | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  address?: Record<string, string> | null;
  notes?: string | null;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  couponCode?: string | null;
  cashbackUsed: number;
  referralCode?: string | null;
  upsellItems: number;
  upsellTotal: number;
  total: number;
  paymentMethod: string;
  scheduledFor?: string | null;
  channel: string;
  affiliateCode?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  items: PedidoLojaItemInput[];
  offers?: PedidoLojaOfferInput[];
}

export interface PedidoLojaResult {
  ok: boolean;
  message: string;
  id?: string;
  code?: string;
  /** Valores realmente gravados, recalculados no servidor. */
  totals?: {
    subtotal: number;
    deliveryFee: number;
    discount: number;
    cashbackUsed: number;
    total: number;
  };
}

/** Tipos e rótulos do acompanhamento de pedidos (seguros para o navegador). */

export type TrackMode = "code" | "phone" | "token";

export interface TrackedOrderDetail {
  id: string;
  code: string;
  publicToken: string;
  storeName: string;
  storeSlug: string;
  customerName: string;
  status: string;
  type: string;
  createdAt: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  paymentMethod: string | null;
  paymentStatus: string;
  scheduledFor: string | null;
  tableNumber: string | null;
  notes: string | null;
  isDemo: boolean;
  items: Array<{ name: string; quantity: number; total: number; notes: string | null }>;
  timeline: Array<{ status: string; createdAt: string; reason: string | null }>;
}

export interface OrderSummaryView {
  code: string;
  publicToken: string;
  status: string;
  type: string;
  createdAt: string;
  total: number;
  storeName: string;
  storeSlug: string;
}

/** Etapas mostradas na linha do tempo, em ordem. */
export const TRACK_STEPS = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
] as const;

/** Etapas que encerram o pedido fora do caminho normal. */
export const TRACK_FINAL_STATES = ["cancelled", "rejected", "completed", "picked_up"] as const;

export function trackStepIndex(status: string): number {
  return TRACK_STEPS.indexOf(status as (typeof TRACK_STEPS)[number]);
}

/** Monta o link público (compartilhável) de um pedido. */
export function publicTrackingPath(token: string): string {
  return `/acompanhar?codigo=${encodeURIComponent(token)}`;
}

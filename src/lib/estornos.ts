/**
 * Regras puras do módulo de estorno/reembolso de pedidos.
 * Client-safe: tipos, rótulos e chaves de cache.
 */
import type { Database } from "@/integrations/supabase/types";

export type RefundRow = Database["public"]["Tables"]["refunds"]["Row"];

export const REFUND_METHODS = [
  {
    value: "money",
    label: "Devolver o dinheiro",
    help: "Você devolve por Pix, cartão ou dinheiro e o pedido fica registrado como estornado.",
  },
  {
    value: "credit",
    label: "Crédito na loja",
    help: "O valor entra como crédito do cliente para usar no próximo pedido.",
  },
  {
    value: "cashback",
    label: "Cashback",
    help: "O valor volta como saldo de cashback do cliente.",
  },
] as const;

export type RefundMethod = (typeof REFUND_METHODS)[number]["value"];

export const REFUND_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  REFUND_METHODS.map((item) => [item.value, item.label]),
);

export const REFUND_KIND_LABEL: Record<string, string> = {
  full: "Estorno total",
  partial: "Estorno parcial",
};

export const REFUND_REASONS = [
  "Cliente desistiu",
  "Produto em falta",
  "Pedido errado",
  "Atraso na entrega",
  "Problema de qualidade",
  "Cobrança duplicada",
] as const;

export interface RefundSummary {
  orderTotal: number;
  refunded: number;
  remaining: number;
  refunds: RefundRow[];
}

export interface RefundResult {
  ok: boolean;
  message: string;
  remaining: number;
}

export function refundsKey(orderId: string | undefined) {
  return ["estornos-pedido", orderId] as const;
}

/** Valida o valor digitado antes de chamar o servidor. */
export function validateRefundAmount(amount: number, remaining: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Informe um valor maior que zero.";
  if (amount > remaining + 0.001) return "O valor é maior do que o saldo disponível para estorno.";
  return null;
}

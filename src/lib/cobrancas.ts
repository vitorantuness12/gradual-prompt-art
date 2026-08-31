/**
 * Cobranças (transações) da loja — regras puras, sem acesso a banco.
 *
 * Cada pedido digital gera uma cobrança em `payments`. Este arquivo concentra
 * rótulos e cálculos usados tanto no painel do lojista quanto no
 * acompanhamento do cliente, para que os dois falem a mesma língua.
 */

export type ChargeStatus = "pending" | "paid" | "failed" | "refunded";

export const CHARGE_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  failed: "Não aprovado",
  refunded: "Reembolsado",
};

/** Tom visual do selo de situação, em tokens semânticos. */
export const CHARGE_STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  paid: "default",
  failed: "destructive",
  refunded: "outline",
};

export function chargeStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sem cobrança";
  return CHARGE_STATUS_LABEL[status] ?? status;
}

export interface ChargeView {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  customerName: string | null;
  customerEmail: string | null;
  channel: string | null;
  method: string | null;
  status: string;
  amount: number;
  netAmount: number | null;
  refundedAmount: number | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastError: string | null;
  isDemo: boolean;
}

export interface ChargeTotals {
  count: number;
  paid: number;
  pending: number;
  refunded: number;
  failed: number;
}

/** Somatórios exibidos no topo da tela de cobranças. */
export function chargeTotals(rows: ChargeView[]): ChargeTotals {
  return rows.reduce<ChargeTotals>(
    (acc, row) => {
      acc.count += 1;
      const amount = Number(row.amount ?? 0);
      if (row.status === "paid") acc.paid += amount;
      else if (row.status === "pending") acc.pending += amount;
      else if (row.status === "refunded") acc.refunded += Number(row.refundedAmount ?? amount);
      else if (row.status === "failed") acc.failed += amount;
      return acc;
    },
    { count: 0, paid: 0, pending: 0, refunded: 0, failed: 0 },
  );
}

/** Chave de idempotência: garante uma cobrança por pedido. */
export function orderChargeKey(orderId: string): string {
  return `order:${orderId}`;
}

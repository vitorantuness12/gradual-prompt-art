/**
 * Cobrança dos planos da plataforma — regras puras (sem banco).
 *
 * Uma cobrança de plano é uma linha em `subscription_invoices`. O ciclo é:
 * criada → paga (ou não paga) → reembolsada (total ou parcial). Quem paga
 * mantém o plano ativo; quem não paga entra em atraso.
 */
import type { Database } from "@/integrations/supabase/types";

export type PlanInvoiceRow = Database["public"]["Tables"]["subscription_invoices"]["Row"];

export type PlanInvoiceStatus = "open" | "paid" | "refunded" | "void";

export const PLAN_INVOICE_STATUS_LABEL: Record<string, string> = {
  open: "Aguardando pagamento",
  paid: "Paga",
  refunded: "Reembolsada",
  void: "Cancelada",
};

export const PLAN_INVOICE_STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "secondary",
  paid: "default",
  refunded: "outline",
  void: "destructive",
};

export const PLAN_PAYMENT_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
  { value: "card", label: "Cartão" },
  { value: "transfer", label: "Transferência" },
  { value: "manual", label: "Outro / manual" },
] as const;

export const PLAN_PERIODS = [
  { value: "month", label: "Mensal" },
  { value: "year", label: "Anual" },
] as const;

export type PlanPeriod = (typeof PLAN_PERIODS)[number]["value"];

export interface PlanInvoiceView {
  id: string;
  storeId: string;
  storeName: string | null;
  planName: string | null;
  amount: number;
  refundedAmount: number;
  status: string;
  method: string | null;
  number: string | null;
  note: string | null;
  dueAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

export interface PlanBillingTotals {
  open: number;
  paid: number;
  refunded: number;
  mrr: number;
}

export function planBillingTotals(rows: PlanInvoiceView[]): PlanBillingTotals {
  return rows.reduce<PlanBillingTotals>(
    (acc, row) => {
      if (row.status === "open") acc.open += row.amount;
      if (row.status === "paid") acc.paid += row.amount;
      if (row.status === "refunded") acc.refunded += row.refundedAmount || row.amount;
      return acc;
    },
    { open: 0, paid: 0, refunded: 0, mrr: 0 },
  );
}

/** Fim do ciclo a partir do início e do período contratado. */
export function planPeriodEnd(period: string, start: Date = new Date()): string {
  const end = new Date(start);
  if (period === "year") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end.toISOString();
}

/** Número legível da cobrança (ano + sequência curta do id). */
export function planInvoiceNumber(reference: string, date: Date = new Date()): string {
  return `${date.getFullYear()}-${reference.replace(/\D/g, "").slice(0, 6).padStart(6, "0")}`;
}

export interface RefundCheck {
  ok: boolean;
  message: string;
  amount: number;
}

/** Valida um reembolso: só cobrança paga, valor > 0 e dentro do saldo. */
export function validatePlanRefund(invoice: Pick<PlanInvoiceView, "status" | "amount" | "refundedAmount">, raw: number): RefundCheck {
  if (invoice.status !== "paid") return { ok: false, message: "Só é possível reembolsar uma cobrança paga.", amount: 0 };
  const available = Math.max(0, invoice.amount - (invoice.refundedAmount ?? 0));
  const amount = Math.round((Number.isFinite(raw) ? raw : 0) * 100) / 100;
  if (amount <= 0) return { ok: false, message: "Informe um valor maior que zero.", amount: 0 };
  if (amount > available) return { ok: false, message: "O valor passa do que foi pago.", amount: 0 };
  return { ok: true, message: "", amount };
}

export function planBillingKey(storeId?: string | null) {
  return ["plan-billing", storeId ?? "all"] as const;
}

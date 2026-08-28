/**
 * Utilitários de formatação para o padrão brasileiro (pt-BR).
 * Centralizados aqui para manter consistência em toda a plataforma.
 */

export function formatCurrency(value: number | string | null | undefined): string {
  const numeric = typeof value === "string" ? Number(value) : (value ?? 0);
  const safe = Number.isFinite(numeric) ? (numeric as number) : 0;
  return safe.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { dateStyle: "short" });
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Recebido",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  picked_up: "Retirado",
  completed: "Concluído",
  cancelled: "Cancelado",
  rejected: "Recusado",
};

export const ORDER_TYPE_LABEL: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  dine_in: "Consumo no local",
  scheduled: "Agendado",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  refunded: "Estornado",
  failed: "Falhou",
};

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super administrador",
  owner: "Proprietário",
  manager: "Gerente",
  staff: "Atendente",
  delivery_person: "Entregador",
  customer: "Cliente",
};

export function orderStatusTone(status: string): "success" | "warning" | "muted" | "destructive" {
  if (status === "delivered") return "success";
  if (status === "cancelled") return "destructive";
  if (status === "pending") return "warning";
  return "muted";
}

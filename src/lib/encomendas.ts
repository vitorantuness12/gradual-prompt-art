/**
 * Encomendas e eventos: orçamento (proposta → aprovação → pedido),
 * sinal de 50% + saldo na entrega, checklist de produção,
 * personalização obrigatória por produto e capacidade por dia.
 *
 * Regras puras — as mesmas rodam na loja pública, no painel e no servidor.
 */

/* ---------- Personalização por produto ---------- */

export type CustomFieldType = "text" | "select" | "color" | "date" | "number";

export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  /** Opções para o tipo "select" (tema, sabor da cobertura, etc.). */
  options: string[];
  /** Dica exibida ao cliente. */
  hint?: string;
  maxLength?: number;
}

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Texto",
  select: "Lista de opções",
  color: "Cor",
  date: "Data",
  number: "Número",
};

function slugId(value: string, index: number): string {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return base || `campo_${index + 1}`;
}

/** Lê a configuração de personalização salva no produto. */
export function parseCustomFields(value: unknown): CustomFieldDef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const label = String(row["label"] ?? "").trim();
      if (!label) return null;
      const type = String(row["type"] ?? "text") as CustomFieldType;
      const field: CustomFieldDef = {
        id: String(row["id"] ?? "").trim() || slugId(label, index),
        label,
        type: (["text", "select", "color", "date", "number"] as string[]).includes(type) ? type : "text",
        required: row["required"] === true,
        options: Array.isArray(row["options"])
          ? (row["options"] as unknown[]).map((option) => String(option).trim()).filter(Boolean)
          : [],
      };
      const hint = typeof row["hint"] === "string" ? row["hint"].trim() : "";
      if (hint) field.hint = hint;
      const maxLength = Number(row["maxLength"]);
      if (Number.isFinite(maxLength) && maxLength > 0) field.maxLength = Math.trunc(maxLength);
      return field;
    })
    .filter((field): field is CustomFieldDef => field !== null);
}

/** Valida o que o cliente preencheu. Devolve mensagens em linguagem simples. */
export function validateCustomization(
  fields: CustomFieldDef[],
  values: Record<string, string>,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const field of fields) {
    const value = (values[field.id] ?? "").trim();
    if (!value) {
      if (field.required) errors.push(`Preencha "${field.label}".`);
      continue;
    }
    if (field.maxLength && value.length > field.maxLength) {
      errors.push(`"${field.label}" deve ter até ${field.maxLength} caracteres.`);
    }
    if (field.type === "select" && field.options.length > 0 && !field.options.includes(value)) {
      errors.push(`Escolha uma opção válida em "${field.label}".`);
    }
    if (field.type === "number" && !Number.isFinite(Number(value))) {
      errors.push(`"${field.label}" precisa ser um número.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Resumo curto da personalização para o cupom, o KDS e a ficha de produção. */
export function describeCustomization(
  fields: CustomFieldDef[],
  values: Record<string, string>,
): string {
  return fields
    .map((field) => {
      const value = (values[field.id] ?? "").trim();
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .join(" • ");
}

/* ---------- Sinal e saldo ---------- */

export interface DepositSplit {
  deposit: number;
  balance: number;
  percent: number;
}

/** Divide o total entre sinal (padrão 50%) e saldo na entrega. */
export function depositSplit(total: number, percent = 50): DepositSplit {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const deposit = Math.round(safeTotal * (safePercent / 100) * 100) / 100;
  return {
    deposit,
    balance: Math.round((safeTotal - deposit) * 100) / 100,
    percent: safePercent,
  };
}

/* ---------- Data de corte e capacidade por dia ---------- */

export function dayKey(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const copy = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return copy.toISOString().slice(0, 10);
}

/** Encomenda aceita até X dias antes da entrega? */
export function checkCutoff(
  desiredAt: Date,
  cutoffDays: number,
  now = new Date(),
): { ok: boolean; reason: string } {
  const days = Math.max(0, Math.trunc(cutoffDays || 0));
  if (days <= 0) return { ok: true, reason: "" };
  const limit = new Date(now.getTime() + days * 86_400_000);
  if (desiredAt.getTime() >= limit.getTime()) return { ok: true, reason: "" };
  return {
    ok: false,
    reason: `Encomendas para esta data precisam ser feitas com pelo menos ${days} dia(s) de antecedência.`,
  };
}

export interface DayLoad {
  day: string;
  orders: number;
  items: number;
}

/** Agrupa as encomendas já agendadas por dia. */
export function buildDayLoad(orders: { scheduled_for: string | null; items: number }[]): DayLoad[] {
  const map = new Map<string, DayLoad>();
  for (const order of orders) {
    if (!order.scheduled_for) continue;
    const key = dayKey(order.scheduled_for);
    const current = map.get(key) ?? { day: key, orders: 0, items: 0 };
    current.orders += 1;
    current.items += Number(order.items) || 0;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export interface DayCapacity {
  day: string;
  usedOrders: number;
  usedItems: number;
  maxOrders: number;
  maxItems: number;
  remainingOrders: number | null;
  remainingItems: number | null;
  full: boolean;
}

/** Situação de um dia no calendário de capacidade. */
export function dayCapacity(
  day: string,
  load: DayLoad[],
  maxOrders: number,
  maxItems: number,
): DayCapacity {
  const current = load.find((item) => item.day === day) ?? { day, orders: 0, items: 0 };
  const remainingOrders = maxOrders > 0 ? Math.max(0, maxOrders - current.orders) : null;
  const remainingItems = maxItems > 0 ? Math.max(0, maxItems - current.items) : null;
  return {
    day,
    usedOrders: current.orders,
    usedItems: current.items,
    maxOrders,
    maxItems,
    remainingOrders,
    remainingItems,
    full: remainingOrders === 0 || remainingItems === 0,
  };
}

/** Cabe mais uma encomenda neste dia? */
export function checkDayCapacity(
  desiredAt: Date,
  itemsCount: number,
  load: DayLoad[],
  maxOrders: number,
  maxItems: number,
): { ok: boolean; reason: string } {
  const capacity = dayCapacity(dayKey(desiredAt), load, maxOrders, maxItems);
  if (capacity.remainingOrders !== null && capacity.remainingOrders <= 0) {
    return { ok: false, reason: "A agenda deste dia já está completa. Escolha outra data." };
  }
  if (capacity.remainingItems !== null && itemsCount > capacity.remainingItems) {
    return {
      ok: false,
      reason: `Neste dia ainda cabem ${capacity.remainingItems} item(ns) e a encomenda tem ${itemsCount}.`,
    };
  }
  return { ok: true, reason: "" };
}

/** Próximos dias com vaga, para montar o calendário na loja e no painel. */
export function capacityCalendar(
  load: DayLoad[],
  maxOrders: number,
  maxItems: number,
  days = 30,
  now = new Date(),
): DayCapacity[] {
  const result: DayCapacity[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(now.getTime() + index * 86_400_000);
    result.push(dayCapacity(dayKey(date), load, maxOrders, maxItems));
  }
  return result;
}

/* ---------- Orçamento (proposta) ---------- */

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired" | "converted";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado ao cliente",
  approved: "Aprovado",
  rejected: "Recusado",
  expired: "Expirado",
  converted: "Virou pedido",
};

export interface QuoteItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
  customization?: Record<string, string>;
  notes?: string;
}

export interface QuoteTotals {
  subtotal: number;
  total: number;
  deposit: number;
  balance: number;
}

/** Soma o orçamento e já separa sinal e saldo. */
export function quoteTotals(
  items: QuoteItemInput[],
  options: { discount?: number; deliveryFee?: number; depositPercent?: number } = {},
): QuoteTotals {
  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );
  const discount = Math.max(0, Number(options.discount) || 0);
  const fee = Math.max(0, Number(options.deliveryFee) || 0);
  const total = Math.max(0, Math.round((subtotal - discount + fee) * 100) / 100);
  const split = depositSplit(total, options.depositPercent ?? 50);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    total,
    deposit: split.deposit,
    balance: split.balance,
  };
}

/** O cliente ainda pode aprovar esta proposta? */
export function quoteIsOpen(
  status: string,
  validUntil: string | null | undefined,
  now = new Date(),
): boolean {
  if (status !== "sent") return false;
  if (!validUntil) return true;
  const limit = new Date(validUntil);
  return Number.isNaN(limit.getTime()) ? true : limit.getTime() >= now.getTime();
}

/** Etapas iniciais da ficha de produção de uma encomenda. */
export const DEFAULT_CHECKLIST: string[] = [
  "Confirmar personalização com o cliente",
  "Separar ingredientes e materiais",
  "Produzir",
  "Decorar e finalizar",
  "Embalar",
  "Conferir antes da entrega",
];

/* ---------- Editor simples de personalização (uma linha por campo) ---------- */

/**
 * Texto no formato: `Rótulo | tipo | obrigatorio | opção1; opção2`
 * Ex.: `Texto do bolo | text | obrigatorio`
 */
export function parseCustomFieldsText(text: string): CustomFieldDef[] {
  return parseCustomFields(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label = "", type = "text", required = "", options = ""] = line.split("|").map((part) => part.trim());
        return {
          label,
          type,
          required: /^(obrigat|sim|true|1)/i.test(required),
          options: options
            .split(";")
            .map((option) => option.trim())
            .filter(Boolean),
        };
      }),
  );
}

export function serializeCustomFields(fields: CustomFieldDef[]): string {
  return fields
    .map((field) =>
      [field.label, field.type, field.required ? "obrigatorio" : "opcional", field.options.join("; ")]
        .join(" | ")
        .replace(/\s*\|\s*$/, ""),
    )
    .join("\n");
}

/* ---------- Acompanhamento da produção ---------- */

export type ChecklistStatus = "sem_ficha" | "nao_iniciada" | "em_producao" | "concluida";

export const CHECKLIST_STATUS_LABEL: Record<ChecklistStatus, string> = {
  sem_ficha: "Sem ficha de produção",
  nao_iniciada: "Não iniciada",
  em_producao: "Em produção",
  concluida: "Produção concluída",
};

export interface ChecklistProgress {
  total: number;
  done: number;
  percent: number;
  status: ChecklistStatus;
}

/** Situação da ficha de produção de uma encomenda. */
export function checklistProgress(steps: { done: boolean }[]): ChecklistProgress {
  const total = steps.length;
  const done = steps.filter((step) => step.done).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const status: ChecklistStatus =
    total === 0 ? "sem_ficha" : done === 0 ? "nao_iniciada" : done === total ? "concluida" : "em_producao";
  return { total, done, percent, status };
}

/** Quantas pessoas estão alocadas em cada dia. */
export function teamByDay(
  assignments: { work_date: string | null; member_name: string }[],
): { day: string; people: string[] }[] {
  const map = new Map<string, Set<string>>();
  for (const item of assignments) {
    if (!item.work_date) continue;
    const set = map.get(item.work_date) ?? new Set<string>();
    set.add(item.member_name);
    map.set(item.work_date, set);
  }
  return [...map.entries()]
    .map(([day, people]) => ({ day, people: [...people].sort() }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/* ---------- Arquivos e risco de atraso ---------- */

export const ATTACHMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Ajuste pedido",
};

export interface DelayRisk {
  atRisk: boolean;
  message: string;
  hoursLeft: number;
}

/** Alerta de risco: entrega perto com a ficha de produção incompleta. */
export function delayRisk(
  scheduledFor: string | null,
  progress: { done: number; total: number },
  now = new Date(),
): DelayRisk {
  if (!scheduledFor) return { atRisk: false, message: "", hoursLeft: 0 };
  const target = new Date(scheduledFor).getTime();
  if (Number.isNaN(target)) return { atRisk: false, message: "", hoursLeft: 0 };
  const hoursLeft = Math.round((target - now.getTime()) / 3_600_000);
  const pending = Math.max(0, progress.total - progress.done);
  if (progress.total === 0 || pending === 0 || hoursLeft > 24) {
    return { atRisk: false, message: "", hoursLeft };
  }
  return {
    atRisk: true,
    hoursLeft,
    message:
      hoursLeft < 0
        ? `Entrega vencida com ${pending} etapa(s) em aberto. Reprograme com o cliente.`
        : `Faltam ${hoursLeft}h para a entrega e ${pending} etapa(s) em aberto.`,
  };
}

/**
 * Regras puras do módulo de salão: situação das mesas, comandas,
 * roteamento de impressão por setor e cálculo da conta.
 */

export const TABLE_STATUSES = [
  { value: "free", label: "Livre", tone: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40" },
  { value: "occupied", label: "Ocupada", tone: "bg-primary/15 text-primary border-primary/40" },
  { value: "reserved", label: "Reservada", tone: "bg-amber-500/15 text-amber-600 border-amber-500/40" },
  {
    value: "awaiting_payment",
    label: "Aguardando pagamento",
    tone: "bg-orange-500/15 text-orange-600 border-orange-500/40",
  },
  { value: "maintenance", label: "Manutenção", tone: "bg-muted text-muted-foreground border-border" },
] as const;

export type TableStatus = (typeof TABLE_STATUSES)[number]["value"];

export const TABLE_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  TABLE_STATUSES.map((status) => [status.value, status.label]),
);

export const TABLE_STATUS_TONE: Record<string, string> = Object.fromEntries(
  TABLE_STATUSES.map((status) => [status.value, status.tone]),
);

/** Transições aceitas — evita que dois atendentes coloquem a mesa em estados incoerentes. */
const ALLOWED_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  free: ["occupied", "reserved", "maintenance"],
  reserved: ["occupied", "free", "maintenance"],
  occupied: ["awaiting_payment", "free"],
  awaiting_payment: ["occupied", "free"],
  maintenance: ["free"],
};

export function canTransition(from: TableStatus, to: TableStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export const CALL_LABEL: Record<string, string> = {
  waiter: "Chamou o garçom",
  bill: "Pediu a conta",
  help: "Precisa de ajuda",
};

/* ---------------- Setores e impressão ---------------- */

export const PRINT_STATIONS = [
  { value: "cozinha", label: "Cozinha", template: "kitchen" },
  { value: "bar", label: "Bar", template: "bar" },
  { value: "confeitaria", label: "Confeitaria", template: "kitchen" },
  { value: "expedicao", label: "Expedição", template: "delivery" },
  { value: "caixa", label: "Caixa", template: "cashier" },
] as const;

export type PrintStation = (typeof PRINT_STATIONS)[number]["value"];
export type PrintTemplate = "kitchen" | "bar" | "cashier" | "delivery";

export const STATION_LABEL: Record<string, string> = Object.fromEntries(
  PRINT_STATIONS.map((station) => [station.value, station.label]),
);

export const TEMPLATE_LABEL: Record<PrintTemplate, string> = {
  kitchen: "Cozinha",
  bar: "Bar",
  cashier: "Caixa",
  delivery: "Entrega",
};

/** Setor configurado no item; sem configuração, tudo vai para a cozinha. */
export function stationForItem(prepStation: string | null | undefined): PrintStation {
  const value = (prepStation ?? "").trim().toLowerCase();
  const found = PRINT_STATIONS.find((station) => station.value === value || station.label.toLowerCase() === value);
  return found?.value ?? "cozinha";
}

export function templateForStation(station: string): PrintTemplate {
  const found = PRINT_STATIONS.find((item) => item.value === station);
  return (found?.template as PrintTemplate) ?? "kitchen";
}

export interface RoutableItem {
  product_name: string;
  quantity: number;
  notes?: string | null;
  prep_station?: string | null;
}

/** Agrupa os itens do pedido por setor: cada grupo vira um trabalho de impressão. */
export function groupItemsByStation<T extends RoutableItem>(items: T[]): { station: PrintStation; items: T[] }[] {
  const groups = new Map<PrintStation, T[]>();
  for (const item of items) {
    const station = stationForItem(item.prep_station);
    groups.set(station, [...(groups.get(station) ?? []), item]);
  }
  return [...groups.entries()].map(([station, grouped]) => ({ station, items: grouped }));
}

/** Texto do cupom de setor (usado na fila simulada e na impressora térmica). */
export function buildStationTicket(input: {
  station: string;
  storeName: string;
  orderCode: string;
  tableLabel?: string | null;
  sessionCode?: string | null;
  items: RoutableItem[];
  createdAt?: Date;
  notes?: string | null;
}): string {
  const when = (input.createdAt ?? new Date()).toLocaleString("pt-BR");
  const lines = [
    `*** ${(STATION_LABEL[input.station] ?? input.station).toUpperCase()} ***`,
    input.storeName,
    `Pedido ${input.orderCode}`,
    input.tableLabel ? `Mesa ${input.tableLabel}` : null,
    input.sessionCode ? `Comanda ${input.sessionCode}` : null,
    when,
    "--------------------------------",
    ...input.items.map((item) => `${item.quantity}x ${item.product_name}${item.notes ? `\n   obs: ${item.notes}` : ""}`),
    input.notes ? `--------------------------------\nObs.: ${input.notes}` : null,
    "--------------------------------",
  ];
  return lines.filter(Boolean).join("\n");
}

/* ---------------- Conta da comanda ---------------- */

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface BillTotals {
  subtotal: number;
  discount: number;
  serviceFee: number;
  total: number;
  perGuest: number;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Soma dos pedidos da comanda com desconto e taxa de serviço opcional. */
export function billTotals(
  items: BillItem[],
  options: { discount?: number; serviceFeePercent?: number; guests?: number } = {},
): BillTotals {
  const subtotal = round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const discount = round(Math.min(Math.max(options.discount ?? 0, 0), subtotal));
  const base = round(subtotal - discount);
  const serviceFee = round((base * Math.max(options.serviceFeePercent ?? 0, 0)) / 100);
  const total = round(base + serviceFee);
  const guests = Math.max(options.guests ?? 1, 1);
  return { subtotal, discount, serviceFee, total, perGuest: round(total / guests) };
}

/** Junta duas comandas: a de destino recebe os itens e mantém o maior número de pessoas. */
export function mergeGuests(target: number, source: number): number {
  return Math.max(1, Number(target || 1) + Number(source || 1));
}

/** Busca simples por texto (nome do item ou da mesa), sem acento e sem caixa. */
export function matchesTable(value: string, term: string): boolean {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const query = normalize(term);
  if (!query) return true;
  return normalize(value).includes(query);
}

/** Divide o total da conta entre as pessoas, ajustando os centavos na primeira parte. */
export function splitBill(total: number, people: number): number[] {
  const count = Math.max(1, Math.round(people || 1));
  const cents = Math.round(Math.max(total, 0) * 100);
  const base = Math.floor(cents / count);
  const rest = cents - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index < rest ? 1 : 0)) / 100);
}

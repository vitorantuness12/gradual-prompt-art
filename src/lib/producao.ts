/**
 * Capacidade de produção, janela de preparo e fila de encomendas.
 *
 * O mesmo cálculo roda na loja pública (para mostrar horários) e no servidor
 * (para recusar pedidos acima da capacidade), evitando aceitar mais pedidos
 * do que a cozinha consegue entregar.
 */

export interface ProductionSettings {
  isEnabled: boolean;
  /** Tamanho de cada intervalo da agenda, em minutos. */
  slotMinutes: number;
  /** Tempo de preparo considerado para cada pedido, em minutos. */
  prepWindowMinutes: number;
  maxOrdersPerSlot: number;
  maxItemsPerSlot: number;
  /** Antecedência mínima para agendar, em minutos. */
  minLeadMinutes: number;
  maxDaysAhead: number;
  queueEnabled: boolean;
  queueMessage: string | null;
  /** Data de corte: encomendas aceitas até X dias antes da entrega. */
  cutoffDays: number;
  /** Limite de pedidos por dia (0 = sem limite). */
  dailyMaxOrders: number;
  /** Limite de itens por dia (0 = sem limite). */
  dailyMaxItems: number;
  /** Exigir sinal para encomendas. */
  requireDeposit: boolean;
  /** Percentual do sinal (padrão 50%). */
  depositPercent: number;
}

export const DEFAULT_PRODUCTION: ProductionSettings = {
  isEnabled: false,
  slotMinutes: 30,
  prepWindowMinutes: 40,
  maxOrdersPerSlot: 6,
  maxItemsPerSlot: 40,
  minLeadMinutes: 60,
  maxDaysAhead: 15,
  queueEnabled: true,
  queueMessage: null,
  cutoffDays: 0,
  dailyMaxOrders: 0,
  dailyMaxItems: 0,
  requireDeposit: false,
  depositPercent: 50,
};

export interface SlotLoad {
  /** Início do intervalo em ISO. */
  slot: string;
  orders: number;
  items: number;
}

export interface CapacityCheck {
  allowed: boolean;
  /** Quando não permitido, explica o motivo em linguagem simples. */
  reason: string;
  /** Sugere entrar na fila de encomendas. */
  canQueue: boolean;
  slot: string | null;
  remainingOrders: number;
  remainingItems: number;
  /** Horário em que a produção precisa começar. */
  startPrepAt: string | null;
}

/** Início do intervalo que contém a data informada. */
export function slotStart(date: Date, slotMinutes: number): Date {
  const minutes = slotMinutes > 0 ? slotMinutes : 30;
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  const total = copy.getHours() * 60 + copy.getMinutes();
  const floored = Math.floor(total / minutes) * minutes;
  copy.setHours(Math.floor(floored / 60), floored % 60, 0, 0);
  return copy;
}

/** Verifica se o horário desejado cabe na capacidade configurada. */
export function checkCapacity(
  settings: ProductionSettings,
  desiredAt: Date,
  itemsCount: number,
  load: SlotLoad[],
  now = new Date(),
): CapacityCheck {
  const free: CapacityCheck = {
    allowed: true,
    reason: "",
    canQueue: false,
    slot: null,
    remainingOrders: settings.maxOrdersPerSlot,
    remainingItems: settings.maxItemsPerSlot,
    startPrepAt: null,
  };

  if (!settings.isEnabled) return free;

  const leadMinutes = (desiredAt.getTime() - now.getTime()) / 60_000;
  if (leadMinutes < settings.minLeadMinutes) {
    return {
      ...free,
      allowed: false,
      canQueue: false,
      reason: `Precisamos de pelo menos ${settings.minLeadMinutes} minuto(s) de antecedência para este horário.`,
    };
  }

  const maxAhead = now.getTime() + settings.maxDaysAhead * 86_400_000;
  if (desiredAt.getTime() > maxAhead) {
    return {
      ...free,
      allowed: false,
      canQueue: false,
      reason: `Aceitamos agendamentos com até ${settings.maxDaysAhead} dia(s) de antecedência.`,
    };
  }

  const start = slotStart(desiredAt, settings.slotMinutes);
  const key = start.toISOString();
  const current = load.find((item) => item.slot === key) ?? { slot: key, orders: 0, items: 0 };

  const remainingOrders = settings.maxOrdersPerSlot - current.orders;
  const remainingItems = settings.maxItemsPerSlot - current.items;
  const startPrepAt = new Date(
    desiredAt.getTime() - settings.prepWindowMinutes * 60_000,
  ).toISOString();

  if (remainingOrders <= 0) {
    return {
      allowed: false,
      canQueue: settings.queueEnabled,
      reason:
        settings.queueMessage ??
        "Este horário já atingiu o limite de pedidos da cozinha. Escolha outro horário ou entre na fila de encomendas.",
      slot: key,
      remainingOrders: 0,
      remainingItems: Math.max(0, remainingItems),
      startPrepAt,
    };
  }

  if (itemsCount > remainingItems) {
    return {
      allowed: false,
      canQueue: settings.queueEnabled,
      reason: `Neste horário ainda cabem ${Math.max(0, remainingItems)} item(ns) e o pedido tem ${itemsCount}. Escolha outro horário ou divida o pedido.`,
      slot: key,
      remainingOrders,
      remainingItems: Math.max(0, remainingItems),
      startPrepAt,
    };
  }

  return {
    allowed: true,
    reason: "",
    canQueue: false,
    slot: key,
    remainingOrders: remainingOrders - 1,
    remainingItems: remainingItems - itemsCount,
    startPrepAt,
  };
}

/** Lista os próximos horários com vaga, para mostrar ao cliente. */
export function availableSlots(
  settings: ProductionSettings,
  load: SlotLoad[],
  itemsCount: number,
  now = new Date(),
  count = 8,
): { slot: string; remainingOrders: number }[] {
  if (!settings.isEnabled) return [];
  const result: { slot: string; remainingOrders: number }[] = [];
  const step = settings.slotMinutes > 0 ? settings.slotMinutes : 30;
  let cursor = slotStart(new Date(now.getTime() + settings.minLeadMinutes * 60_000), step);

  for (let index = 0; index < count * 6 && result.length < count; index += 1) {
    const check = checkCapacity(settings, cursor, itemsCount, load, now);
    if (check.allowed)
      result.push({ slot: cursor.toISOString(), remainingOrders: check.remainingOrders });
    cursor = new Date(cursor.getTime() + step * 60_000);
  }

  return result;
}

/** Agrupa pedidos já agendados por intervalo. */
export function buildLoad(
  orders: { scheduled_for: string | null; items: number }[],
  slotMinutes: number,
): SlotLoad[] {
  const map = new Map<string, SlotLoad>();
  for (const order of orders) {
    if (!order.scheduled_for) continue;
    const key = slotStart(new Date(order.scheduled_for), slotMinutes).toISOString();
    const current = map.get(key) ?? { slot: key, orders: 0, items: 0 };
    current.orders += 1;
    current.items += order.items;
    map.set(key, current);
  }
  return [...map.values()];
}

export function parseProduction(value: unknown): ProductionSettings {
  const row = (value ?? {}) as Record<string, unknown>;
  const num = (key: string, fallback: number) => {
    const parsed = Number(row[key]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    isEnabled: row["is_enabled"] === true,
    slotMinutes: num("slot_minutes", DEFAULT_PRODUCTION.slotMinutes),
    prepWindowMinutes: num("prep_window_minutes", DEFAULT_PRODUCTION.prepWindowMinutes),
    maxOrdersPerSlot: num("max_orders_per_slot", DEFAULT_PRODUCTION.maxOrdersPerSlot),
    maxItemsPerSlot: num("max_items_per_slot", DEFAULT_PRODUCTION.maxItemsPerSlot),
    minLeadMinutes: num("min_lead_minutes", DEFAULT_PRODUCTION.minLeadMinutes),
    maxDaysAhead: num("max_days_ahead", DEFAULT_PRODUCTION.maxDaysAhead),
    queueEnabled: row["queue_enabled"] !== false,
    queueMessage: (row["queue_message"] as string | null) ?? null,
    cutoffDays: num("cutoff_days", DEFAULT_PRODUCTION.cutoffDays),
    dailyMaxOrders: num("daily_max_orders", DEFAULT_PRODUCTION.dailyMaxOrders),
    dailyMaxItems: num("daily_max_items", DEFAULT_PRODUCTION.dailyMaxItems),
    requireDeposit: row["require_deposit"] === true,
    depositPercent: num("deposit_percent", DEFAULT_PRODUCTION.depositPercent),
  };
}

/** ---------- Canais de origem ---------- */

export const ORDER_CHANNELS = [
  { key: "loja", label: "Loja online" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "pdv", label: "PDV / balcão" },
  { key: "mesa", label: "QR Code de mesa" },
  { key: "marketplace", label: "Marketplace" },
  { key: "app", label: "Aplicativo" },
] as const;

export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  ORDER_CHANNELS.map((channel) => [channel.key, channel.label]),
);

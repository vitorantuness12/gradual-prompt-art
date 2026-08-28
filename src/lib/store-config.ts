import type { Database } from "@/integrations/supabase/types";

export type StoreRow = Database["public"]["Tables"]["stores"]["Row"];

/** ---------- Horário de funcionamento ---------- */

export interface DayHours {
  day: number; // 0 = domingo
  enabled: boolean;
  open: string; // "08:00"
  close: string; // "18:00"
  breakStart: string | null;
  breakEnd: string | null;
}

export interface Holiday {
  date: string; // "2026-12-25"
  label: string;
  closed: boolean;
}

export const WEEK_DAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export function defaultOpeningHours(): DayHours[] {
  return WEEK_DAYS.map((_, day) => ({
    day,
    enabled: day !== 0,
    open: "09:00",
    close: "18:00",
    breakStart: null,
    breakEnd: null,
  }));
}

export function parseOpeningHours(value: unknown): DayHours[] {
  if (!Array.isArray(value) || value.length === 0) return defaultOpeningHours();
  const base = defaultOpeningHours();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<DayHours>;
    const index = Number(raw.day);
    if (!Number.isInteger(index) || index < 0 || index > 6) continue;
    base[index] = {
      day: index,
      enabled: Boolean(raw.enabled),
      open: typeof raw.open === "string" ? raw.open : "09:00",
      close: typeof raw.close === "string" ? raw.close : "18:00",
      breakStart: typeof raw.breakStart === "string" ? raw.breakStart : null,
      breakEnd: typeof raw.breakEnd === "string" ? raw.breakEnd : null,
    };
  }
  return base;
}

export function parseHolidays(value: unknown): Holiday[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<Holiday>;
    if (typeof raw.date !== "string") return [];
    return [{ date: raw.date, label: typeof raw.label === "string" ? raw.label : "Feriado", closed: raw.closed !== false }];
  });
}

/** ---------- Formas de recebimento ---------- */

export interface PaymentMethods {
  pix: boolean;
  card_online: boolean;
  cash: boolean;
  card_on_delivery: boolean;
  pay_on_pickup: boolean;
}

export const PAYMENT_METHOD_LABEL: Record<keyof PaymentMethods, string> = {
  pix: "Pix",
  card_online: "Cartão online",
  cash: "Dinheiro",
  card_on_delivery: "Cartão na entrega",
  pay_on_pickup: "Pagamento na retirada",
};

export function defaultPaymentMethods(): PaymentMethods {
  return { pix: true, card_online: false, cash: true, card_on_delivery: true, pay_on_pickup: true };
}

export function parsePaymentMethods(value: unknown): PaymentMethods {
  const base = defaultPaymentMethods();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof PaymentMethods)[]) {
    if (typeof raw[key] === "boolean") base[key] = raw[key];
  }
  return base;
}

/** ---------- Áreas e taxas de entrega ---------- */

export type DeliveryMode = "fixed" | "district" | "zip" | "radius";

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  fixed: "Taxa única",
  district: "Por bairro",
  zip: "Por faixa de CEP",
  radius: "Por distância (km)",
};

export interface DeliveryArea {
  id: string;
  label: string;
  /** Bairro, CEP inicial ou km inicial, conforme o modo escolhido. */
  from: string;
  /** CEP final ou km final. Vazio nos modos bairro e taxa única. */
  to: string;
  fee: number;
  minOrder: number;
  minutes: number;
}

export function parseDeliveryAreas(value: unknown): DeliveryArea[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<DeliveryArea>;
    return [
      {
        id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
        label: typeof raw.label === "string" ? raw.label : "",
        from: typeof raw.from === "string" ? raw.from : "",
        to: typeof raw.to === "string" ? raw.to : "",
        fee: Number(raw.fee ?? 0),
        minOrder: Number(raw.minOrder ?? 0),
        minutes: Number(raw.minutes ?? 0),
      },
    ];
  });
}

/** ---------- Situação da loja ---------- */

export type AvailabilityStatus = "open" | "closed" | "paused" | "vacation";

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  open: "Funcionamento normal",
  closed: "Modo fechado",
  paused: "Pausa temporária",
  vacation: "Férias",
};

export interface StoreAvailability {
  accepting: boolean;
  message: string;
}

/** Diz se a loja está aceitando pedidos agora, considerando situação, feriados e horários. */
export function storeAvailability(store: {
  availability_status?: string | null;
  paused_until?: string | null;
  opening_hours?: unknown;
  holidays?: unknown;
  timezone?: string | null;
  is_published?: boolean | null;
}): StoreAvailability {
  const status = (store.availability_status ?? "open") as AvailabilityStatus;

  if (status === "vacation") return { accepting: false, message: "Loja em férias. Voltamos em breve." };
  if (status === "closed") return { accepting: false, message: "Loja fechada para pedidos no momento." };
  if (status === "paused") {
    const until = store.paused_until ? new Date(store.paused_until) : null;
    if (!until || until.getTime() > Date.now()) {
      return {
        accepting: false,
        message: until
          ? `Pedidos pausados até ${until.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`
          : "Pedidos pausados temporariamente.",
      };
    }
  }

  const timeZone = store.timezone || "America/Sao_Paulo";
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekdayMap[get("weekday")] ?? now.getDay();
  const current = `${get("hour")}:${get("minute")}`;
  const today = `${get("year")}-${get("month")}-${get("day")}`;

  const holiday = parseHolidays(store.holidays).find((item) => item.date === today && item.closed);
  if (holiday) return { accepting: false, message: `Fechado hoje: ${holiday.label}.` };

  const hours = parseOpeningHours(store.opening_hours)[day];
  if (!hours || !hours.enabled) return { accepting: false, message: "Fechado hoje. Confira os horários de atendimento." };

  const inBreak =
    hours.breakStart && hours.breakEnd && current >= hours.breakStart && current < hours.breakEnd;
  if (inBreak) return { accepting: false, message: `Em intervalo até ${hours.breakEnd}.` };

  const open = hours.open <= current && current < hours.close;
  return open
    ? { accepting: true, message: `Aberto agora até ${hours.close}.` }
    : { accepting: false, message: `Fechado agora. Abre às ${hours.open}.` };
}

/** ---------- Onboarding ---------- */

export interface OnboardingState {
  segment?: boolean;
  store?: boolean;
  hours?: boolean;
  payments?: boolean;
  delivery?: boolean;
  catalog?: boolean;
  published?: boolean;
}

export const ONBOARDING_STEPS = [
  { key: "segment", label: "Escolher o segmento" },
  { key: "store", label: "Dados da loja e endereço público" },
  { key: "hours", label: "Horários de funcionamento" },
  { key: "payments", label: "Formas de recebimento" },
  { key: "delivery", label: "Áreas e taxas de entrega" },
  { key: "catalog", label: "Primeiro produto ou serviço" },
  { key: "published", label: "Publicar a loja" },
] as const satisfies readonly { key: keyof OnboardingState; label: string }[];

export function parseOnboarding(value: unknown): OnboardingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const state: OnboardingState = {};
  for (const step of ONBOARDING_STEPS) {
    if (typeof raw[step.key] === "boolean") state[step.key] = raw[step.key] as boolean;
  }
  return state;
}

export function onboardingProgress(state: OnboardingState): number {
  const done = ONBOARDING_STEPS.filter((step) => state[step.key]).length;
  return Math.round((done / ONBOARDING_STEPS.length) * 100);
}

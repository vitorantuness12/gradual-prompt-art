/**
 * Janelas de entrada da loja pública ("Repetir seu último pedido?" e
 * "Destaques para você").
 *
 * Cada lojista configura as duas janelas de forma independente. A
 * configuração publicada é o único dado que chega ao cliente; o rascunho
 * fica restrito ao painel. Aqui ficam os tipos, os valores padrão e toda a
 * regra de elegibilidade (frequência, dispositivo, agenda, intervalo e
 * "não mostrar novamente"), escrita de forma pura para ser testável.
 */

export type PopupKind = "repeat" | "highlights";
export type PopupDisplayMode = "modal" | "section" | "both" | "manual" | "disabled";
export type PopupFrequency =
  | "first_visit"
  | "session"
  | "daily"
  | "weekly"
  | "new_order"
  | "campaign"
  | "never";
export type PopupDevice = "all" | "mobile" | "tablet" | "desktop";
export type PopupMultiMode = "sequential" | "one_per_session";

export interface RepeatPopupContent {
  title: string;
  description: string;
  phonePlaceholder: string;
  primaryButton: string;
  secondaryLink: string;
  emptyMessage: string;
  emptyButton: string;
  showIcon: boolean;
  offerDontShowAgain: boolean;
}

export interface HighlightsPopupContent {
  /** Texto do selo exibido quando a regra automática não define um. */
  fallbackBadge: string;
  showPrices: boolean;
}

export interface EntryPopupConfig {
  enabled: boolean;
  displayMode: PopupDisplayMode;
  autoOpen: boolean;
  frequency: PopupFrequency;
  device: PopupDevice;
  /** Dias da semana (0 = domingo). Lista vazia = todos os dias. */
  daysOfWeek: number[];
  /** "HH:MM" ou vazio para o dia inteiro. */
  startTime: string;
  endTime: string;
  /** 1 abre primeiro quando as duas estão ativas. */
  priority: number;
  minIntervalMinutes: number;
  /** Quando as duas são elegíveis: sequencial mostra a próxima ao fechar. */
  multiMode: PopupMultiMode;
  /** Campanha de destaques usada pela janela (somente highlights). */
  campaignId: string | null;
  content: RepeatPopupContent | HighlightsPopupContent;
}

export function defaultRepeatContent(): RepeatPopupContent {
  return {
    title: "Repetir seu último pedido?",
    description: "Informe seu telefone e adicionamos os itens do seu último pedido na sacola.",
    phonePlaceholder: "(00) 00000-0000",
    primaryButton: "Repetir pedido",
    secondaryLink: "Agora não",
    emptyMessage: "Não encontramos um pedido anterior para este telefone nesta loja.",
    emptyButton: "Ver cardápio",
    showIcon: true,
    offerDontShowAgain: true,
  };
}

export function defaultHighlightsContent(): HighlightsPopupContent {
  return { fallbackBadge: "Destaque", showPrices: true };
}

export function defaultEntryPopupConfig(kind: PopupKind): EntryPopupConfig {
  return {
    enabled: false,
    displayMode: "modal",
    autoOpen: true,
    frequency: "session",
    device: "all",
    daysOfWeek: [],
    startTime: "",
    endTime: "",
    priority: kind === "repeat" ? 1 : 2,
    minIntervalMinutes: 0,
    multiMode: "sequential",
    campaignId: null,
    content: kind === "repeat" ? defaultRepeatContent() : defaultHighlightsContent(),
  };
}

const DISPLAY_MODES: PopupDisplayMode[] = ["modal", "section", "both", "manual", "disabled"];
const FREQUENCIES: PopupFrequency[] = [
  "first_visit",
  "session",
  "daily",
  "weekly",
  "new_order",
  "campaign",
  "never",
];
const DEVICES: PopupDevice[] = ["all", "mobile", "tablet", "desktop"];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function pickTime(value: unknown): string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : "";
}

/** Une a configuração salva com os padrões, ignorando campos inválidos. */
export function parseEntryPopupConfig(kind: PopupKind, raw: unknown): EntryPopupConfig {
  const base = defaultEntryPopupConfig(kind);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<Record<keyof EntryPopupConfig, unknown>>;
  const contentRaw = (data.content ?? {}) as Record<string, unknown>;

  const content =
    kind === "repeat"
      ? {
          ...defaultRepeatContent(),
          ...Object.fromEntries(
            Object.entries(contentRaw).filter(([, value]) =>
              ["string", "boolean"].includes(typeof value),
            ),
          ),
        }
      : {
          ...defaultHighlightsContent(),
          ...Object.fromEntries(
            Object.entries(contentRaw).filter(([, value]) =>
              ["string", "boolean"].includes(typeof value),
            ),
          ),
        };

  return {
    enabled: Boolean(data.enabled ?? base.enabled),
    displayMode: pick(data.displayMode, DISPLAY_MODES, base.displayMode),
    autoOpen: Boolean(data.autoOpen ?? base.autoOpen),
    frequency: pick(data.frequency, FREQUENCIES, base.frequency),
    device: pick(data.device, DEVICES, base.device),
    daysOfWeek: Array.isArray(data.daysOfWeek)
      ? data.daysOfWeek.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : [],
    startTime: pickTime(data.startTime),
    endTime: pickTime(data.endTime),
    priority: data.priority === 2 ? 2 : 1,
    minIntervalMinutes: Math.max(0, Number(data.minIntervalMinutes) || 0),
    multiMode: data.multiMode === "one_per_session" ? "one_per_session" : "sequential",
    campaignId: typeof data.campaignId === "string" ? data.campaignId : null,
    content,
  };
}

/* ------------------------------------------------------------------ */
/* Elegibilidade                                                       */
/* ------------------------------------------------------------------ */

/** Mínimo de armazenamento necessário para avaliar e registrar exibições. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

export const popupKeys = {
  hide: (slug: string, kind: PopupKind) => `osp:popup:ocultar:${slug}:${kind}`,
  lastShown: (slug: string, kind: PopupKind) => `osp:popup:ultima:${slug}:${kind}`,
  firstVisit: (slug: string, kind: PopupKind) => `osp:popup:visita:${slug}:${kind}`,
  session: (slug: string, kind: PopupKind) => `osp:popup:sessao:${slug}:${kind}`,
  daily: (slug: string, kind: PopupKind) => `osp:popup:dia:${slug}:${kind}`,
  weekly: (slug: string, kind: PopupKind) => `osp:popup:semana:${slug}:${kind}`,
  browserKey: "osp:browser-key",
};

export function detectDevice(width: number): Exclude<PopupDevice, "all"> {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Confere dia da semana e janela de horário (inclusive virada de dia). */
export function withinSchedule(config: EntryPopupConfig, now: Date): boolean {
  if (config.daysOfWeek.length > 0 && !config.daysOfWeek.includes(now.getDay())) return false;
  if (!config.startTime || !config.endTime) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesOf(config.startTime);
  const end = minutesOf(config.endTime);
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function isoWeekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${week}`;
}

export interface PopupEligibilityInput {
  slug: string;
  kind: PopupKind;
  config: EntryPopupConfig;
  /** Versão publicada — "não mostrar novamente" vale até uma nova versão. */
  version: number;
  now: Date;
  device: Exclude<PopupDevice, "all">;
  /** Existe campanha de destaques ativa no momento. */
  hasActiveCampaign: boolean;
  local: StorageLike;
  session: StorageLike;
}

export interface PopupEligibility {
  eligible: boolean;
  reason:
    | "ok"
    | "disabled"
    | "no_auto"
    | "device"
    | "schedule"
    | "hidden_forever"
    | "min_interval"
    | "frequency"
    | "no_campaign";
}

/**
 * Decide se a janela pode abrir automaticamente agora. A abertura manual
 * pelo cliente ignora frequência e intervalo, mas nunca ignora o
 * "não mostrar novamente" — nesse caso o botão manual nem é exibido.
 */
export function evaluatePopup(input: PopupEligibilityInput): PopupEligibility {
  const { config, kind, slug, now, device, local, session } = input;

  if (!config.enabled || config.displayMode === "disabled") return { eligible: false, reason: "disabled" };
  if (config.displayMode === "section" || config.displayMode === "manual")
    return { eligible: false, reason: "no_auto" };
  if (!config.autoOpen || config.frequency === "never") return { eligible: false, reason: "no_auto" };
  if (config.device !== "all" && config.device !== device) return { eligible: false, reason: "device" };
  if (!withinSchedule(config, now)) return { eligible: false, reason: "schedule" };

  const hidden = local.getItem(popupKeys.hide(slug, kind));
  if (hidden !== null && Number(hidden) >= input.version) {
    return { eligible: false, reason: "hidden_forever" };
  }

  if (config.minIntervalMinutes > 0) {
    const last = Number(local.getItem(popupKeys.lastShown(slug, kind)) ?? 0);
    if (last > 0 && now.getTime() - last < config.minIntervalMinutes * 60_000) {
      return { eligible: false, reason: "min_interval" };
    }
  }

  switch (config.frequency) {
    case "first_visit":
      if (local.getItem(popupKeys.firstVisit(slug, kind))) return { eligible: false, reason: "frequency" };
      break;
    case "session":
    case "new_order":
      // "new_order" só é confirmado depois da validação do telefone; na
      // entrada ele se comporta como uma exibição por sessão.
      if (session.getItem(popupKeys.session(slug, kind))) return { eligible: false, reason: "frequency" };
      break;
    case "daily":
      if (local.getItem(popupKeys.daily(slug, kind)) === now.toDateString())
        return { eligible: false, reason: "frequency" };
      break;
    case "weekly":
      if (local.getItem(popupKeys.weekly(slug, kind)) === isoWeekKey(now))
        return { eligible: false, reason: "frequency" };
      break;
    case "campaign":
      if (!input.hasActiveCampaign) return { eligible: false, reason: "no_campaign" };
      if (session.getItem(popupKeys.session(slug, kind))) return { eligible: false, reason: "frequency" };
      break;
    default:
      break;
  }

  return { eligible: true, reason: "ok" };
}

/** Registra a exibição para frequência e intervalo mínimo. */
export function markPopupShown(
  slug: string,
  kind: PopupKind,
  config: EntryPopupConfig,
  now: Date,
  local: StorageLike,
  session: StorageLike,
): void {
  local.setItem(popupKeys.lastShown(slug, kind), String(now.getTime()));
  session.setItem(popupKeys.session(slug, kind), "1");
  if (config.frequency === "first_visit") local.setItem(popupKeys.firstVisit(slug, kind), "1");
  if (config.frequency === "daily") local.setItem(popupKeys.daily(slug, kind), now.toDateString());
  if (config.frequency === "weekly") local.setItem(popupKeys.weekly(slug, kind), isoWeekKey(now));
}

/** Grava o "não mostrar novamente" valendo até a versão atual. */
export function markPopupHidden(slug: string, kind: PopupKind, version: number, local: StorageLike): void {
  local.setItem(popupKeys.hide(slug, kind), String(version));
}

export function isPopupHiddenForever(
  slug: string,
  kind: PopupKind,
  version: number,
  local: StorageLike,
): boolean {
  const hidden = local.getItem(popupKeys.hide(slug, kind));
  return hidden !== null && Number(hidden) >= version;
}

export interface PlannedPopup {
  kind: PopupKind;
  config: EntryPopupConfig;
  version: number;
}

/**
 * Ordena as janelas elegíveis pela prioridade do lojista. O orquestrador
 * mostra a primeira; a segunda só aparece depois do fechamento quando o
 * modo é "sequencial".
 */
export function planEntryPopups(
  popups: PlannedPopup[],
  context: Omit<PopupEligibilityInput, "kind" | "config" | "version">,
): PlannedPopup[] {
  return popups
    .filter((popup) =>
      evaluatePopup({ ...context, kind: popup.kind, config: popup.config, version: popup.version }).eligible,
    )
    .sort((a, b) => a.config.priority - b.config.priority);
}

/** A janela pode ser aberta manualmente (botão no cabeçalho da loja). */
export function manualAccessEnabled(config: EntryPopupConfig): boolean {
  return config.enabled && config.displayMode !== "disabled";
}

/** A seção fixa de destaques aparece dentro do catálogo. */
export function sectionEnabled(config: EntryPopupConfig): boolean {
  return config.enabled && (config.displayMode === "section" || config.displayMode === "both");
}

/** O modal pode existir (abertura automática ou manual). */
export function modalEnabled(config: EntryPopupConfig): boolean {
  return (
    config.enabled &&
    (config.displayMode === "modal" || config.displayMode === "both" || config.displayMode === "manual")
  );
}

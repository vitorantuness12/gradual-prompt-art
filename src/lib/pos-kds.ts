/**
 * Regras puras compartilhadas pelo PDV e pelo KDS em modo de tela exclusiva.
 *
 * Nada aqui toca em rede, DOM ou Supabase: são apenas cálculos e normalizações
 * para poderem ser testados e reutilizados no servidor.
 */

import { PRINT_STATIONS, stationForItem, type PrintStation } from "@/lib/salao";

/* ------------------------------------------------------------------ */
/* Configurações do PDV e do KDS                                       */
/* ------------------------------------------------------------------ */

export type PosKdsTheme = "light" | "dark";
export type PosKdsDensity = "compact" | "comfortable" | "spacious";
export type PosKdsCardSize = "sm" | "md" | "lg";
export type KdsView = "kanban" | "queue" | "station" | "priority" | "compact";
export type KdsSort = "oldest" | "newest" | "priority" | "delay";
export type KdsGroup = "none" | "station" | "channel" | "type";

export interface PosKdsSettings {
  /* aparência */
  theme: PosKdsTheme;
  density: PosKdsDensity;
  cardSize: PosKdsCardSize;
  showProductImages: boolean;
  /* tempos */
  lateMinutes: number;
  warningMinutes: number;
  maxPrepMinutes: number;
  /* som e atualização */
  soundEnabled: boolean;
  soundVolume: number;
  autoRefreshSeconds: number;
  /* impressão */
  autoPrint: boolean;
  printByStation: boolean;
  /* exibição no KDS */
  showPrices: boolean;
  showCustomerName: boolean;
  showNotes: boolean;
  kdsView: KdsView;
  kdsSort: KdsSort;
  kdsGroup: KdsGroup;
  /* operação */
  terminal: string;
  station: string;
  /** O setor pode concluir o pedido inteiro ou apenas os itens dele. */
  stationCanCompleteOrder: boolean;
  hideOutOfStock: boolean;
}

export function defaultPosKdsSettings(): PosKdsSettings {
  return {
    theme: "light",
    density: "comfortable",
    cardSize: "md",
    showProductImages: true,
    lateMinutes: 25,
    warningMinutes: 15,
    maxPrepMinutes: 40,
    soundEnabled: false,
    soundVolume: 0.4,
    autoRefreshSeconds: 20,
    autoPrint: false,
    printByStation: true,
    showPrices: false,
    showCustomerName: true,
    showNotes: true,
    kdsView: "kanban",
    kdsSort: "oldest",
    kdsGroup: "none",
    terminal: "Caixa 1",
    station: "todas",
    stationCanCompleteOrder: true,
    hideOutOfStock: true,
  };
}

const THEMES: PosKdsTheme[] = ["light", "dark"];
const DENSITIES: PosKdsDensity[] = ["compact", "comfortable", "spacious"];
const CARD_SIZES: PosKdsCardSize[] = ["sm", "md", "lg"];
const VIEWS: KdsView[] = ["kanban", "queue", "station", "priority", "compact"];
const SORTS: KdsSort[] = ["oldest", "newest", "priority", "delay"];
const GROUPS: KdsGroup[] = ["none", "station", "channel", "type"];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Junta o que veio do banco com os padrões, descartando valores inválidos. */
export function parsePosKdsSettings(value: unknown): PosKdsSettings {
  const base = defaultPosKdsSettings();
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  const warning = clampNumber(raw["warningMinutes"], 1, 240, base.warningMinutes);
  const late = clampNumber(raw["lateMinutes"], 1, 480, base.lateMinutes);
  return {
    theme: pick(raw["theme"], THEMES, base.theme),
    density: pick(raw["density"], DENSITIES, base.density),
    cardSize: pick(raw["cardSize"], CARD_SIZES, base.cardSize),
    showProductImages: bool(raw["showProductImages"], base.showProductImages),
    // O alerta amarelo nunca pode passar do vermelho.
    warningMinutes: Math.min(warning, late),
    lateMinutes: late,
    maxPrepMinutes: clampNumber(raw["maxPrepMinutes"], 1, 480, base.maxPrepMinutes),
    soundEnabled: bool(raw["soundEnabled"], base.soundEnabled),
    soundVolume: clampNumber(raw["soundVolume"], 0, 1, base.soundVolume),
    autoRefreshSeconds: clampNumber(raw["autoRefreshSeconds"], 5, 300, base.autoRefreshSeconds),
    autoPrint: bool(raw["autoPrint"], base.autoPrint),
    printByStation: bool(raw["printByStation"], base.printByStation),
    showPrices: bool(raw["showPrices"], base.showPrices),
    showCustomerName: bool(raw["showCustomerName"], base.showCustomerName),
    showNotes: bool(raw["showNotes"], base.showNotes),
    kdsView: pick(raw["kdsView"], VIEWS, base.kdsView),
    kdsSort: pick(raw["kdsSort"], SORTS, base.kdsSort),
    kdsGroup: pick(raw["kdsGroup"], GROUPS, base.kdsGroup),
    terminal: typeof raw["terminal"] === "string" && raw["terminal"].trim() ? raw["terminal"].trim().slice(0, 40) : base.terminal,
    station: typeof raw["station"] === "string" && raw["station"].trim() ? raw["station"].trim().slice(0, 40) : base.station,
    stationCanCompleteOrder: bool(raw["stationCanCompleteOrder"], base.stationCanCompleteOrder),
    hideOutOfStock: bool(raw["hideOutOfStock"], base.hideOutOfStock),
  };
}

export const DENSITY_GAP: Record<PosKdsDensity, string> = {
  compact: "gap-2",
  comfortable: "gap-3",
  spacious: "gap-4",
};

export const CARD_PADDING: Record<PosKdsDensity, string> = {
  compact: "p-2.5",
  comfortable: "p-3.5",
  spacious: "p-5",
};

export const CARD_MIN_WIDTH: Record<PosKdsCardSize, string> = {
  sm: "min-w-56",
  md: "min-w-72",
  lg: "min-w-80",
};

/* ------------------------------------------------------------------ */
/* KDS: colunas, tempos e alertas                                      */
/* ------------------------------------------------------------------ */

export const KDS_COLUMNS = [
  { status: "pending", label: "Novos", next: "confirmed", action: "Aceitar pedido" },
  { status: "confirmed", label: "Confirmados", next: "preparing", action: "Iniciar preparo" },
  { status: "preparing", label: "Em preparo", next: "ready", action: "Marcar pronto" },
  { status: "ready", label: "Prontos", next: "out_for_delivery", action: "Chamar expedição" },
  { status: "out_for_delivery", label: "Aguardando retirada", next: "completed", action: "Concluir" },
  { status: "completed", label: "Concluídos", next: null, action: "" },
] as const;

export type KdsStatus = (typeof KDS_COLUMNS)[number]["status"];

export const KDS_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  KDS_COLUMNS.map((column) => [column.status, column.label]),
);

/** Próximo status permitido pelo fluxo do KDS. */
export function nextKdsStatus(status: string): KdsStatus | null {
  const column = KDS_COLUMNS.find((item) => item.status === status);
  return (column?.next as KdsStatus | null) ?? null;
}

export type DelayTone = "ok" | "warning" | "late";

/** Cor do temporizador: verde até o aviso, amarelo perto do limite, vermelho passando. */
export function delayTone(minutes: number, settings: Pick<PosKdsSettings, "warningMinutes" | "lateMinutes">): DelayTone {
  if (minutes >= settings.lateMinutes) return "late";
  if (minutes >= settings.warningMinutes) return "warning";
  return "ok";
}

export const DELAY_CLASS: Record<DelayTone, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300",
  warning: "bg-amber-500/20 text-amber-700 border-amber-500/50 dark:text-amber-300",
  late: "bg-destructive/20 text-destructive border-destructive/50",
};

/** Minutos decorridos desde a referência informada, nunca negativo. */
export function minutesSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor((now - value) / 60_000));
}

/** Cronômetro no formato mm:ss para o card do pedido. */
export function formatElapsed(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "--:--";
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return "--:--";
  const seconds = Math.max(0, Math.floor((now - value) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/* ------------------------------------------------------------------ */
/* KDS: preparo por item                                               */
/* ------------------------------------------------------------------ */

export type ItemPrepStatus = "pending" | "preparing" | "ready" | "paused";

export const ITEM_PREP_LABEL: Record<ItemPrepStatus, string> = {
  pending: "Aguardando",
  preparing: "Em preparo",
  ready: "Preparado",
  paused: "Pausado",
};

export function normalizeItemPrepStatus(value: unknown): ItemPrepStatus {
  return value === "preparing" || value === "ready" || value === "paused" ? value : "pending";
}

export interface KdsItem {
  id: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  notes: string | null;
  prep_station: string | null;
  prep_status?: string | null;
  unit_price?: number | string | null;
  total?: number | string | null;
}

/** Itens que pertencem ao setor selecionado ("todas" devolve tudo). */
export function itemsForStation<T extends { prep_station?: string | null }>(items: T[], station: string): T[] {
  if (!station || station === "todas") return items;
  return items.filter((item) => stationForItem(item.prep_station) === station);
}

/**
 * O pedido só pode ser marcado como pronto quando todos os itens visíveis para
 * a regra atual estiverem preparados. Quando o setor só responde pelos próprios
 * itens, avaliamos apenas eles.
 */
export function canCompleteOrder(
  items: KdsItem[],
  options: { station: string; stationCanCompleteOrder: boolean },
): boolean {
  const scope = options.stationCanCompleteOrder ? items : itemsForStation(items, options.station);
  if (scope.length === 0) return false;
  return scope.every((item) => normalizeItemPrepStatus(item.prep_status) === "ready");
}

/** Quantos itens do escopo já estão preparados (para a barra de progresso). */
export function itemProgress(items: KdsItem[], station: string): { ready: number; total: number } {
  const scope = itemsForStation(items, station);
  return {
    ready: scope.filter((item) => normalizeItemPrepStatus(item.prep_status) === "ready").length,
    total: scope.length,
  };
}

/** Setores presentes no pedido, para mostrar no card. */
export function stationsOfOrder(items: KdsItem[]): PrintStation[] {
  const set = new Set<PrintStation>();
  for (const item of items) set.add(stationForItem(item.prep_station));
  return [...set];
}

export const KDS_STATIONS = PRINT_STATIONS.filter((station) => station.value !== "caixa");

/* ------------------------------------------------------------------ */
/* KDS: filtros, ordenação e agrupamento                               */
/* ------------------------------------------------------------------ */

export const KDS_CHANNELS = [
  { value: "loja", label: "Loja online" },
  { value: "pdv", label: "PDV" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "mesa", label: "Mesa" },
  { value: "chat", label: "Atendimento" },
  { value: "marketplace", label: "Marketplace" },
] as const;

export const KDS_CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  KDS_CHANNELS.map((channel) => [channel.value, channel.label]),
);

export interface KdsOrderLike {
  id: string;
  code: string;
  status: string;
  type: string;
  channel: string;
  priority: number;
  created_at: string;
  prep_started_at: string | null;
  scheduled_for: string | null;
  payment_status: string;
  delivery_person_id: string | null;
  table_number: string | null;
  customer_name: string;
  notes?: string | null;
  order_items?: KdsItem[] | null;
}

export interface KdsFilters {
  station: string;
  channel: string;
  type: string;
  priority: "all" | "priority" | "normal";
  payment: "all" | "paid" | "pending";
  scheduled: "all" | "scheduled" | "now";
  search: string;
}

export function defaultKdsFilters(): KdsFilters {
  return {
    station: "todas",
    channel: "all",
    type: "all",
    priority: "all",
    payment: "all",
    scheduled: "all",
    search: "",
  };
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesKdsFilters(order: KdsOrderLike, filters: KdsFilters): boolean {
  const items = order.order_items ?? [];
  if (filters.station !== "todas" && !items.some((item) => stationForItem(item.prep_station) === filters.station)) {
    return false;
  }
  if (filters.channel !== "all" && order.channel !== filters.channel) return false;
  if (filters.type !== "all" && order.type !== filters.type) return false;
  if (filters.priority === "priority" && order.priority <= 0) return false;
  if (filters.priority === "normal" && order.priority > 0) return false;
  if (filters.payment === "paid" && order.payment_status !== "paid") return false;
  if (filters.payment === "pending" && order.payment_status === "paid") return false;
  if (filters.scheduled === "scheduled" && !order.scheduled_for) return false;
  if (filters.scheduled === "now" && order.scheduled_for) return false;
  const term = normalize(filters.search);
  if (term) {
    const haystack = [order.code, order.customer_name, order.table_number ?? "", ...items.map((item) => item.product_name)]
      .map(normalize)
      .join(" ");
    if (!haystack.includes(term)) return false;
  }
  return true;
}

/** Pedidos agendados entram primeiro conforme o horário combinado. */
export function sortKdsOrders(orders: KdsOrderLike[], sort: KdsSort, now: number = Date.now()): KdsOrderLike[] {
  const list = [...orders];
  const reference = (order: KdsOrderLike) => new Date(order.prep_started_at ?? order.created_at).getTime();
  list.sort((a, b) => {
    if (sort === "priority" && a.priority !== b.priority) return b.priority - a.priority;
    if (sort === "delay") {
      const delayA = minutesSince(a.scheduled_for ?? a.created_at, now);
      const delayB = minutesSince(b.scheduled_for ?? b.created_at, now);
      if (delayA !== delayB) return delayB - delayA;
    }
    if (sort === "newest") return reference(b) - reference(a);
    // Agendados sempre ordenados pelo horário previsto.
    if (a.scheduled_for && b.scheduled_for) {
      return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
    }
    if (a.priority !== b.priority) return b.priority - a.priority;
    return reference(a) - reference(b);
  });
  return list;
}

export function groupKdsOrders(orders: KdsOrderLike[], group: KdsGroup): { key: string; label: string; orders: KdsOrderLike[] }[] {
  if (group === "none") return [{ key: "all", label: "Todos", orders }];
  const buckets = new Map<string, { label: string; orders: KdsOrderLike[] }>();
  for (const order of orders) {
    let key = "outros";
    let label = "Outros";
    if (group === "channel") {
      key = order.channel;
      label = KDS_CHANNEL_LABEL[order.channel] ?? order.channel;
    } else if (group === "type") {
      key = order.type;
      label = order.type;
    } else {
      const station = stationsOfOrder(order.order_items ?? [])[0] ?? "cozinha";
      key = station;
      label = KDS_STATIONS.find((item) => item.value === station)?.label ?? station;
    }
    const bucket = buckets.get(key) ?? { label, orders: [] };
    bucket.orders.push(order);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].map(([key, value]) => ({ key, label: value.label, orders: value.orders }));
}

/** Indicadores do topo do KDS. */
export interface KdsMetrics {
  total: number;
  byStatus: Record<string, number>;
  late: number;
  averagePrepMinutes: number;
  scheduled: number;
}

export function kdsMetrics(orders: KdsOrderLike[], settings: PosKdsSettings, now: number = Date.now()): KdsMetrics {
  const byStatus: Record<string, number> = {};
  let late = 0;
  let scheduled = 0;
  let prepSum = 0;
  let prepCount = 0;
  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
    const minutes = minutesSince(order.prep_started_at ?? order.created_at, now);
    if (delayTone(minutes, settings) === "late") late += 1;
    if (order.scheduled_for) scheduled += 1;
    if (order.prep_started_at) {
      prepSum += minutes;
      prepCount += 1;
    }
  }
  return {
    total: orders.length,
    byStatus,
    late,
    averagePrepMinutes: prepCount > 0 ? Math.round(prepSum / prepCount) : 0,
    scheduled,
  };
}

/* ------------------------------------------------------------------ */
/* PDV: filtros do catálogo                                            */
/* ------------------------------------------------------------------ */

export const POS_QUICK_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "best_sellers", label: "Mais vendidos" },
  { value: "favorites", label: "Favoritos" },
  { value: "promo", label: "Promoções" },
  { value: "combo", label: "Combos e kits" },
] as const;

export type PosQuickFilter = (typeof POS_QUICK_FILTERS)[number]["value"];

export interface PosProductLike {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price: number | string;
  promo_price?: number | string | null;
  track_stock: boolean;
  stock_quantity: number;
  min_stock?: number | null;
  category_id?: string | null;
  is_featured?: boolean;
  is_available?: boolean;
  kind?: string;
  created_at?: string;
  image_url?: string | null;
  /** Venda por peso/fração (balança). */
  sold_by_weight?: boolean;
  /** Unidade de venda mostrada no PDV (un, kg, g, L...). */
  unit_label?: string | null;
  /** Item controlado: exige registro da receita na venda. */
  requires_prescription?: boolean;
  /** Item com controle de lote e validade. */
  track_batches?: boolean;
}

export function isOutOfStock(product: PosProductLike): boolean {
  if (product.is_available === false) return true;
  return Boolean(product.track_stock) && Number(product.stock_quantity) <= 0;
}

/** Estoque acima de zero, porém já no limite mínimo configurado. */
export function isLowStock(product: PosProductLike): boolean {
  if (!product.track_stock) return false;
  const stock = Number(product.stock_quantity ?? 0);
  const min = Number(product.min_stock ?? 0);
  return stock > 0 && min > 0 && stock <= min;
}

export function unitPriceOf(product: PosProductLike): number {
  const promo = Number(product.promo_price ?? 0);
  return promo > 0 ? promo : Number(product.price);
}

export function hasPromo(product: PosProductLike): boolean {
  return Number(product.promo_price ?? 0) > 0;
}

/** Produto cadastrado nos últimos 14 dias recebe o selo "Novo". */
export function isNewProduct(product: PosProductLike, now: number = Date.now()): boolean {
  if (!product.created_at) return false;
  const created = new Date(product.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created < 14 * 24 * 60 * 60 * 1000;
}

export interface PosCatalogFilter {
  search: string;
  categoryId: string;
  quick: PosQuickFilter;
  hideOutOfStock: boolean;
  bestSellerIds: string[];
  favoriteIds: string[];
}

export function filterPosCatalog(products: PosProductLike[], filter: PosCatalogFilter): PosProductLike[] {
  const term = normalize(filter.search);
  const bestSellers = new Set(filter.bestSellerIds);
  const favorites = new Set(filter.favoriteIds);
  return products.filter((product) => {
    if (filter.hideOutOfStock && isOutOfStock(product)) return false;
    if (filter.categoryId && filter.categoryId !== "all" && product.category_id !== filter.categoryId) return false;
    if (filter.quick === "promo" && !hasPromo(product)) return false;
    if (filter.quick === "favorites" && !favorites.has(product.id) && !product.is_featured) return false;
    if (filter.quick === "best_sellers" && !bestSellers.has(product.id)) return false;
    if (filter.quick === "combo" && product.kind !== "combo") return false;
    if (term) {
      const haystack = normalize(`${product.name} ${product.sku ?? ""} ${product.barcode ?? ""}`);
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

/** Iniciais do produto para os cards sem imagem. */
export function productInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

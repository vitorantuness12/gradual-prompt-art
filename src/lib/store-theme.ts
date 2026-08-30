/**
 * Personalização da loja pública.
 *
 * Guarda o formato do tema (cores, tipografia, layout), os temas prontos,
 * a geração automática de paleta a partir da cor principal, a verificação de
 * contraste e o catálogo de blocos da vitrine.
 *
 * Nada aqui depende de banco: são funções puras usadas pelo editor, pela
 * pré-visualização e pela loja pública.
 */

/** ---------- Tipos ---------- */

export type CardStyle = "list" | "grid" | "compact";
export type ImagePosition = "left" | "top" | "right";
export type ButtonShape = "rounded" | "square" | "pill";
export type ShadowLevel = "none" | "soft" | "medium" | "strong";
export type FontKey = "sora" | "inter" | "poppins" | "dm-sans" | "nunito" | "playfair";

export interface StoreThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  card: string;
  text: string;
  mutedText: string;
  badge: string;
  statusOpen: string;
  statusClosed: string;
  statusScheduling: string;
  statusUnavailable: string;
}

export interface StoreThemeConfig {
  colors: StoreThemeColors;
  branding: {
    logoUrl: string | null;
    logoMobileUrl: string | null;
    faviconUrl: string | null;
    coverUrl: string | null;
    promoImages: string[];
  };
  typography: {
    font: FontKey;
    titleSize: number; // multiplicador 0.9 - 1.4
    titleWeight: number; // 500 - 800
  };
  layout: {
    radius: number; // px
    buttonShape: ButtonShape;
    shadow: ShadowLevel;
    sectionSpacing: number; // px
    maxWidth: number; // px
    cardStyle: CardStyle;
    imagePosition: ImagePosition;
  };
  display: {
    showPromoPrices: boolean;
    showRatings: boolean;
    showPhone: boolean;
    showAddress: boolean;
    showHours: boolean;
    showRepeatOrder: boolean;
  };
  footer: StoreFooterConfig;
}

export interface StoreFooterConfig {
  /** Quando vazio, usa os dados cadastrados da loja. */
  name: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  /** Quando nulo, o rodapé segue a cor principal da loja. */
  background: string | null;
  /** Quando nulo, usa um texto legível sobre o fundo do rodapé. */
  text: string | null;
}

export interface StoreSectionDraft {
  block_key: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  accent_color: string | null;
  sort_order: number;
  is_visible: boolean;
  schedule_rule: SectionScheduleRule;
}

export interface SectionScheduleRule {
  /** Dias da semana em que o bloco aparece (0 = domingo). Vazio = todos. */
  days?: number[];
  /** Faixa de horário "HH:MM". */
  startTime?: string | null;
  endTime?: string | null;
  /** Período promocional em datas ISO. */
  startDate?: string | null;
  endDate?: string | null;
}

/** ---------- Fontes aprovadas ---------- */

export const FONT_OPTIONS: { key: FontKey; label: string; stack: string }[] = [
  { key: "sora", label: "Sora (padrão)", stack: "'Sora', system-ui, sans-serif" },
  { key: "inter", label: "Inter", stack: "'Inter', system-ui, sans-serif" },
  { key: "poppins", label: "Poppins", stack: "'Poppins', system-ui, sans-serif" },
  { key: "dm-sans", label: "DM Sans", stack: "'DM Sans', system-ui, sans-serif" },
  { key: "nunito", label: "Nunito", stack: "'Nunito', system-ui, sans-serif" },
  { key: "playfair", label: "Playfair Display", stack: "'Playfair Display', Georgia, serif" },
];

export function fontStack(key: FontKey): string {
  return FONT_OPTIONS.find((option) => option.key === key)?.stack ?? FONT_OPTIONS[0]!.stack;
}

/** ---------- Cores: utilidades ---------- */

/** Converte "#rrggbb" (ou "#rgb") em canais 0-255. Retorna null se inválido. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function isValidHex(value: string): boolean {
  return hexToRgb(value) !== null;
}

/** Luminância relativa (WCAG). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
}

export type ContrastLevel = "ruim" | "aceitavel" | "bom";

/** Classifica o contraste segundo os limites do WCAG (3:1 e 4.5:1). */
export function contrastLevel(foreground: string, background: string): ContrastLevel {
  const ratio = contrastRatio(foreground, background);
  if (ratio < 3) return "ruim";
  if (ratio < 4.5) return "aceitavel";
  return "bom";
}

/** Escolhe texto claro ou escuro conforme a cor de fundo. */
export function readableTextOn(background: string): string {
  return contrastRatio("#ffffff", background) >= contrastRatio("#111111", background) ? "#ffffff" : "#111111";
}

/** Clareia (amount > 0) ou escurece (amount < 0) uma cor. amount em -1..1. */
export function shade(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = (channel: number) =>
    amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
  return rgbToHex(mix(rgb.r), mix(rgb.g), mix(rgb.b));
}

/** Gera uma paleta coerente a partir da cor principal. */
export function paletteFromPrimary(primary: string): StoreThemeColors {
  const safe = isValidHex(primary) ? primary : "#e2452b";
  return {
    primary: safe,
    // A cor secundária é sempre branca; o lojista pode mudar nos ajustes avançados.
    secondary: "#ffffff",
    accent: shade(safe, -0.18),
    background: "#f7f7f8",
    card: "#ffffff",
    text: "#171719",
    mutedText: "#6b6b76",
    badge: shade(safe, -0.05),
    statusOpen: "#128c4a",
    statusClosed: "#8b8b95",
    statusScheduling: "#1f6fd0",
    statusUnavailable: "#b3261e",
  };
}

/**
 * Cores do rodapé derivadas da cor principal da loja.
 * Mantém o rodapé sempre em harmonia com o restante da paleta.
 */
export function footerColorsFromPrimary(primary: string): { background: string; text: string } {
  const safe = isValidHex(primary) ? primary : "#e2452b";
  return { background: safe, text: readableTextOn(safe) };
}

/**
 * Cores efetivas do rodapé: seguem a cor principal da loja por padrão,
 * mas respeitam a personalização do lojista quando definida.
 */
export function resolvedFooterColors(
  footer: Pick<StoreFooterConfig, "background" | "text">,
  primary: string,
): { background: string; text: string } {
  const derived = footerColorsFromPrimary(primary);
  const background = footer.background && isValidHex(footer.background) ? footer.background : derived.background;
  const text = footer.text && isValidHex(footer.text) ? footer.text : readableTextOn(background);
  return { background, text };
}

/** ---------- Padrão e temas prontos ---------- */

export function defaultThemeConfig(): StoreThemeConfig {
  return {
    colors: paletteFromPrimary("#e2452b"),
    branding: { logoUrl: null, logoMobileUrl: null, faviconUrl: null, coverUrl: null, promoImages: [] },
    typography: { font: "sora", titleSize: 1, titleWeight: 600 },
    layout: {
      radius: 16,
      buttonShape: "rounded",
      shadow: "soft",
      sectionSpacing: 32,
      maxWidth: 1024,
      cardStyle: "list",
      imagePosition: "left",
    },
    display: {
      showPromoPrices: true,
      showRatings: false,
      showPhone: true,
      showAddress: true,
      showHours: true,
      showRepeatOrder: true,
    },
    footer: defaultFooterConfig(),
  };
}

export function defaultFooterConfig(): StoreFooterConfig {
  return {
    name: null,
    phone: null,
    address: null,
    note: null,
    background: null,
    text: null,
  };
}

/** Formata telefone brasileiro para exibição no rodapé. */
export function formatFooterPhone(value: string | null): string | null {
  if (!value) return null;
  const raw = value.replace(/\D/g, "").slice(0, 11);
  if (raw.length === 10) {
    return raw.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }
  if (raw.length === 11) {
    return raw.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }
  return value.trim() || null;
}

/** Formata CEP brasileiro para exibição no rodapé. */
export function formatFooterZip(value: string | null): string | null {
  if (!value) return null;
  const raw = value.replace(/\D/g, "").slice(0, 8);
  if (raw.length === 8) {
    return raw.replace(/^(\d{5})(\d{3})$/, "$1-$2");
  }
  return value.trim() || null;
}

export interface FooterFallbackStore {
  name: string;
  phone?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_district?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
}

/**
 * Preenche campos vazios do rodapé com os dados cadastrados da loja,
 * garantindo que nenhum bloco fique sem conteúdo quando houver informação
 * disponível.
 */
export function resolvedFooterConfig(
  footer: StoreFooterConfig,
  store: FooterFallbackStore,
): StoreFooterConfig {
  const zip = formatFooterZip(store.address_zip ?? null);

  const street = [store.address_street, store.address_number].filter(Boolean).join(", ");
  const districtCity = [store.address_district, [store.address_city, store.address_state].filter(Boolean).join("/")]
    .filter(Boolean)
    .join(", ");
  const baseAddress = [street, districtCity].filter(Boolean).join(" — ");
  const fullAddress = baseAddress ? `${baseAddress}${zip ? `, ${zip}` : ""}` : zip;

  return {
    name: footer.name?.trim() || store.name || null,
    phone: formatFooterPhone(footer.phone?.trim() || store.phone || null),
    address: footer.address?.trim() || fullAddress || null,
    // A assinatura "Feito com O Seu Pedido" é fixa em todas as lojas.
    note: null,
    background: footer.background ?? null,
    text: footer.text ?? null,
  };
}

/** Verifica se o telefone do rodapé tem formato brasileiro válido. */
export function isValidFooterPhone(value: string | null): boolean {
  if (!value) return true; // vazio é permitido (usa fallback)
  const raw = value.replace(/\D/g, "");
  return raw.length === 10 || raw.length === 11;
}

export interface ThemePreset {
  key: string;
  name: string;
  description: string;
  config: StoreThemeConfig;
}

function preset(
  key: string,
  name: string,
  description: string,
  primary: string,
  overrides: Partial<StoreThemeConfig> = {},
  colorOverrides: Partial<StoreThemeColors> = {},
): ThemePreset {
  const base = defaultThemeConfig();
  return {
    key,
    name,
    description,
    config: {
      ...base,
      ...overrides,
      colors: { ...paletteFromPrimary(primary), ...colorOverrides },
      typography: { ...base.typography, ...(overrides.typography ?? {}) },
      layout: { ...base.layout, ...(overrides.layout ?? {}) },
      display: { ...base.display, ...(overrides.display ?? {}) },
      footer: { ...base.footer, ...(overrides.footer ?? {}) },
      branding: base.branding,
    },
  };
}

/** Dez pontos de partida — o lojista pode alterar tudo depois. */
export const THEME_PRESETS: ThemePreset[] = [
  preset("delivery-moderno", "Delivery moderno", "Cores quentes e cards em lista, ideal para entrega rápida.", "#e2452b"),
  preset("pizzaria", "Pizzaria e hamburgueria", "Fundo escuro e destaque forte para preços.", "#d92d20", {
    layout: { ...defaultThemeConfig().layout, radius: 20, shadow: "medium" },
  }, { background: "#141416", card: "#1e1e22", text: "#f5f5f7", mutedText: "#a7a7b3" }),
  preset("mercado", "Mercado e conveniência", "Grade compacta para muitos itens.", "#1f7a3f", {
    layout: { ...defaultThemeConfig().layout, cardStyle: "grid", imagePosition: "top", radius: 12 },
  }),
  preset("petshop", "Pet shop", "Tons alegres e cantos bem arredondados.", "#f0821e", {
    layout: { ...defaultThemeConfig().layout, radius: 24, buttonShape: "pill" },
    typography: { font: "nunito", titleSize: 1.05, titleWeight: 700 },
  }),
  preset("farmacia", "Farmácia", "Visual limpo, azul de confiança e leitura fácil.", "#1867c0", {
    layout: { ...defaultThemeConfig().layout, cardStyle: "grid", imagePosition: "top", shadow: "none" },
    typography: { font: "inter", titleSize: 1, titleWeight: 600 },
  }),
  preset("loja-produtos", "Loja de produtos", "Vitrine em grade com imagens grandes.", "#3f3fd1", {
    layout: { ...defaultThemeConfig().layout, cardStyle: "grid", imagePosition: "top", maxWidth: 1200 },
  }),
  preset("salao", "Salão e barbearia", "Elegante, com títulos maiores.", "#8a4bd3", {
    typography: { font: "playfair", titleSize: 1.2, titleWeight: 700 },
    layout: { ...defaultThemeConfig().layout, shadow: "medium", radius: 18 },
  }),
  preset("servicos", "Serviços e agendamentos", "Foco em horários e disponibilidade.", "#0f7d84", {
    layout: { ...defaultThemeConfig().layout, cardStyle: "compact", sectionSpacing: 40 },
    display: { ...defaultThemeConfig().display, showHours: true, showRatings: true },
  }),
  preset("artesanal", "Artesanal e confeitaria", "Tons suaves e acolhedores.", "#c2557a", {
    typography: { font: "dm-sans", titleSize: 1.1, titleWeight: 600 },
    layout: { ...defaultThemeConfig().layout, radius: 22, shadow: "soft" },
  }, { background: "#fdf7f4", card: "#ffffff" }),
  preset("minimalista", "Minimalista", "Preto e branco, sem sombras, muito espaço.", "#111827", {
    layout: { ...defaultThemeConfig().layout, shadow: "none", radius: 8, buttonShape: "square", sectionSpacing: 48 },
    typography: { font: "inter", titleSize: 1, titleWeight: 500 },
  }, { background: "#ffffff", card: "#ffffff", secondary: "#ffffff" }),
];

export function presetByKey(key: string): ThemePreset {
  return THEME_PRESETS.find((item) => item.key === key) ?? THEME_PRESETS[0]!;
}

/** ---------- Leitura tolerante do banco ---------- */

/** Converte o jsonb salvo em um tema completo, preenchendo o que faltar. */
export function parseThemeConfig(value: unknown): StoreThemeConfig {
  const base = defaultThemeConfig();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<StoreThemeConfig>;
  return {
    colors: { ...base.colors, ...(raw.colors ?? {}) },
    branding: {
      ...base.branding,
      ...(raw.branding ?? {}),
      promoImages: Array.isArray(raw.branding?.promoImages) ? raw.branding.promoImages.filter((i) => typeof i === "string") : [],
    },
    typography: { ...base.typography, ...(raw.typography ?? {}) },
    layout: { ...base.layout, ...(raw.layout ?? {}) },
    display: { ...base.display, ...(raw.display ?? {}) },
    footer: { ...base.footer, ...(raw.footer ?? {}) },
  };
}

/** ---------- Variáveis CSS aplicadas na vitrine ---------- */

const SHADOW_VALUES: Record<ShadowLevel, string> = {
  none: "none",
  soft: "0 1px 2px rgba(15, 15, 20, 0.06), 0 4px 12px rgba(15, 15, 20, 0.05)",
  medium: "0 4px 10px rgba(15, 15, 20, 0.10), 0 12px 28px rgba(15, 15, 20, 0.10)",
  strong: "0 8px 18px rgba(15, 15, 20, 0.16), 0 24px 48px rgba(15, 15, 20, 0.18)",
};

const BUTTON_RADIUS: Record<ButtonShape, (radius: number) => string> = {
  rounded: (radius) => `${radius * 0.6}px`,
  square: () => "2px",
  pill: () => "999px",
};

/**
 * Traduz o tema em variáveis CSS. São as mesmas variáveis do design system,
 * então os componentes da loja pegam as cores da loja sem classe fixa.
 */
export function themeCssVars(config: StoreThemeConfig): Record<string, string> {
  const { colors, layout, typography } = config;
  return {
    "--background": colors.background,
    "--foreground": colors.text,
    "--card": colors.card,
    "--card-foreground": colors.text,
    "--popover": colors.card,
    "--popover-foreground": colors.text,
    "--primary": colors.primary,
    "--primary-foreground": readableTextOn(colors.primary),
    "--secondary": colors.secondary,
    "--secondary-foreground": readableTextOn(colors.secondary),
    "--accent": colors.accent,
    "--accent-foreground": readableTextOn(colors.accent),
    "--muted": colors.secondary,
    "--muted-foreground": colors.mutedText,
    "--border": shade(colors.text, 0.82),
    "--input": shade(colors.text, 0.82),
    "--ring": colors.primary,
    "--radius": `${layout.radius}px`,
    "--store-badge": colors.badge,
    "--store-badge-foreground": readableTextOn(colors.badge),
    "--store-status-open": colors.statusOpen,
    "--store-status-closed": colors.statusClosed,
    "--store-status-scheduling": colors.statusScheduling,
    "--store-status-unavailable": colors.statusUnavailable,
    "--store-shadow": SHADOW_VALUES[layout.shadow],
    "--store-button-radius": BUTTON_RADIUS[layout.buttonShape](layout.radius),
    "--store-section-gap": `${layout.sectionSpacing}px`,
    "--store-max-width": `${layout.maxWidth}px`,
    "--store-font": fontStack(typography.font),
    "--store-title-scale": String(typography.titleSize),
    "--store-title-weight": String(typography.titleWeight),
  };
}

/** Avisos de contraste mostrados no editor. */
export function contrastWarnings(colors: StoreThemeColors): string[] {
  const checks: { label: string; fg: string; bg: string }[] = [
    { label: "Texto principal sobre o fundo", fg: colors.text, bg: colors.background },
    { label: "Texto principal sobre os cards", fg: colors.text, bg: colors.card },
    { label: "Texto secundário sobre os cards", fg: colors.mutedText, bg: colors.card },
    { label: "Texto do botão principal", fg: readableTextOn(colors.primary), bg: colors.primary },
    { label: "Texto do botão de destaque", fg: readableTextOn(colors.accent), bg: colors.accent },
  ];
  return checks
    .filter((check) => contrastLevel(check.fg, check.bg) === "ruim")
    .map((check) => `${check.label}: contraste ${contrastRatio(check.fg, check.bg)}:1 (mínimo recomendado 4.5:1).`);
}

/** ---------- Catálogo de blocos ---------- */

export interface BlockDefinition {
  key: string;
  label: string;
  description: string;
  defaultTitle: string | null;
  /** Blocos estruturais não podem ser desligados. */
  required?: boolean;
}

export const BLOCK_CATALOG: BlockDefinition[] = [
  { key: "header", label: "Cabeçalho da loja", description: "Barra superior com nome, busca e carrinho.", defaultTitle: null, required: true },
  { key: "identity", label: "Logo e identidade", description: "Logo, nome e descrição curta.", defaultTitle: null },
  { key: "banner", label: "Banner principal", description: "Imagem de capa com chamada.", defaultTitle: null },
  { key: "store_info", label: "Informações da loja", description: "Resumo do que a loja oferece.", defaultTitle: "Sobre a loja" },
  { key: "status", label: "Status da loja", description: "Aberto, fechado ou aberto para agendamentos.", defaultTitle: null },
  { key: "min_order", label: "Pedido mínimo", description: "Valor mínimo para fechar o pedido.", defaultTitle: null },
  { key: "hours", label: "Horário de funcionamento", description: "Tabela de horários por dia.", defaultTitle: "Horários" },
  { key: "address", label: "Endereço e áreas atendidas", description: "Endereço da loja e regiões de entrega.", defaultTitle: "Onde entregamos" },
  { key: "track_order", label: "Botão de acompanhar pedido", description: "Atalho para o acompanhamento.", defaultTitle: "Acompanhar pedido" },
  { key: "repeat_order", label: "Botão de repetir pedido", description: "Atalho para pedidos anteriores.", defaultTitle: "Peça novamente" },
  { key: "highlights", label: "Destaques para você", description: "Seleção especial de itens.", defaultTitle: "Destaques para você" },
  { key: "promotions", label: "Promoções", description: "Itens com preço promocional.", defaultTitle: "Promoções" },
  { key: "categories", label: "Categorias", description: "Navegação por categorias.", defaultTitle: "Categorias" },
  { key: "best_sellers", label: "Produtos mais vendidos", description: "Itens com maior número de pedidos.", defaultTitle: "Mais pedidos" },
  { key: "new_items", label: "Novidades", description: "Itens adicionados recentemente.", defaultTitle: "Novidades" },
  { key: "combos", label: "Combos e kits", description: "Kits montados pela loja.", defaultTitle: "Combos e kits" },
  { key: "offers", label: "Produtos em oferta", description: "Ofertas por tempo limitado.", defaultTitle: "Ofertas do dia" },
  { key: "recommended", label: "Produtos recomendados", description: "Sugestões complementares.", defaultTitle: "Você também pode gostar" },
  { key: "loyalty", label: "Programa de fidelidade", description: "Pontos, níveis e recompensas.", defaultTitle: "Programa de fidelidade" },
  { key: "delivery_info", label: "Entrega e retirada", description: "Como o cliente recebe o pedido.", defaultTitle: "Entrega e retirada" },
  { key: "reviews", label: "Avaliações", description: "Somente avaliações reais registradas.", defaultTitle: "Avaliações" },
  { key: "contact", label: "WhatsApp ou contato", description: "Canal direto com a loja.", defaultTitle: "Fale com a gente" },
  { key: "footer", label: "Rodapé", description: "Informações legais e links.", defaultTitle: null, required: true },
];

export function blockByKey(key: string): BlockDefinition | undefined {
  return BLOCK_CATALOG.find((block) => block.key === key);
}

/** Conjunto inicial de blocos de uma loja nova. */
export function defaultSections(): StoreSectionDraft[] {
  const enabledByDefault = new Set([
    "header",
    "identity",
    "banner",
    "status",
    "min_order",
    "track_order",
    "repeat_order",
    "highlights",
    "promotions",
    "categories",
    "recommended",
    "hours",
    "address",
    "contact",
    "footer",
  ]);
  return BLOCK_CATALOG.map((block, index) => ({
    block_key: block.key,
    title: block.defaultTitle,
    subtitle: null,
    image_url: null,
    accent_color: null,
    sort_order: index,
    is_visible: enabledByDefault.has(block.key),
    schedule_rule: {},
  }));
}

/** Lê a regra de agendamento salva no banco. */
export function parseScheduleRule(value: unknown): SectionScheduleRule {
  if (!value || typeof value !== "object") return {};
  const raw = value as SectionScheduleRule;
  return {
    days: Array.isArray(raw.days) ? raw.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    startTime: typeof raw.startTime === "string" ? raw.startTime : null,
    endTime: typeof raw.endTime === "string" ? raw.endTime : null,
    startDate: typeof raw.startDate === "string" ? raw.startDate : null,
    endDate: typeof raw.endDate === "string" ? raw.endDate : null,
  };
}

/** Um bloco só aparece se estiver visível e dentro da regra de dia/hora/período. */
export function isSectionVisibleNow(
  section: { is_visible: boolean; schedule_rule: unknown },
  now: Date = new Date(),
): boolean {
  if (!section.is_visible) return false;
  const rule = parseScheduleRule(section.schedule_rule);

  if (rule.days && rule.days.length > 0 && !rule.days.includes(now.getDay())) return false;

  if (rule.startDate && now < new Date(`${rule.startDate}T00:00:00`)) return false;
  if (rule.endDate && now > new Date(`${rule.endDate}T23:59:59`)) return false;

  if (rule.startTime || rule.endTime) {
    const minutes = now.getHours() * 60 + now.getMinutes();
    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const start = rule.startTime ? toMinutes(rule.startTime) : 0;
    const end = rule.endTime ? toMinutes(rule.endTime) : 24 * 60;
    if (start <= end) {
      if (minutes < start || minutes > end) return false;
    } else if (minutes < start && minutes > end) {
      // Faixa que atravessa a meia-noite.
      return false;
    }
  }

  return true;
}

/** Ordena e devolve apenas os blocos que o cliente deve ver agora. */
export function visibleSections<T extends { block_key: string; sort_order: number; is_visible: boolean; schedule_rule: unknown }>(
  sections: T[],
  now: Date = new Date(),
): T[] {
  return [...sections]
    .filter((section) => isSectionVisibleNow(section, now))
    .sort((a, b) => a.sort_order - b.sort_order);
}

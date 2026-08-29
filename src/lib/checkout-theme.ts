/**
 * Tema padrão do fluxo de compra (carrinho, checkout e acompanhamento).
 *
 * Estas telas NÃO seguem as cores personalizadas do lojista: usam sempre a
 * paleta neutra clara com destaque verde, para que o momento do pagamento
 * tenha aparência previsível e confiável em qualquer loja.
 *
 * Todos os valores ficam centralizados aqui — nunca escreva estes hex
 * diretamente em componentes.
 */

import { ORDER_STATUS_META, type OrderStatus } from "@/lib/orders";
import { defaultThemeConfig, paletteFromPrimary, type StoreThemeConfig } from "@/lib/store-theme";

/** Tokens crus da paleta. Fonte única de verdade. */
export const CHECKOUT_PALETTE = {
  /** Vermelho principal (ações, seleção, preço em destaque). */
  primary: "#dc2626",
  /** Vermelho escurecido para hover e ênfase. */
  primaryStrong: "#b91c1c",
  /** Fundo neutro da página. */
  background: "#f4f6f8",
  /** Superfície dos cards. */
  card: "#ffffff",
  /** Blocos sutis (linhas de resumo, campos). */
  surfaceMuted: "#eef1f5",
  /** Texto principal — contraste ≈ 15:1 sobre o card. */
  text: "#131a22",
  /** Texto auxiliar — contraste ≈ 5:1 sobre o card (AA para texto normal). */
  mutedText: "#54606e",
  /** Bordas visíveis sobre fundo neutro. */
  border: "#d8dee6",
  /** Estados. Todos escolhidos para ≥ 4.5:1 sobre branco/neutro. */
  success: "#15803d",
  warning: "#a1620a",
  info: "#1d4ed8",
  danger: "#b3261e",
} as const;

/** Configuração completa aplicada pelo CheckoutThemeProvider. */
export const checkoutThemeConfig: StoreThemeConfig = (() => {
  const base = defaultThemeConfig();
  return {
    ...base,
    typography: { ...base.typography, font: "inter" },
    layout: { ...base.layout, radius: 14, shadow: "soft", buttonShape: "rounded" },
    colors: {
      ...paletteFromPrimary(CHECKOUT_PALETTE.primary),
      background: CHECKOUT_PALETTE.background,
      card: CHECKOUT_PALETTE.card,
      text: CHECKOUT_PALETTE.text,
      mutedText: CHECKOUT_PALETTE.mutedText,
      primary: CHECKOUT_PALETTE.primary,
      secondary: CHECKOUT_PALETTE.surfaceMuted,
      accent: CHECKOUT_PALETTE.primaryStrong,
      badge: CHECKOUT_PALETTE.primary,
      statusOpen: CHECKOUT_PALETTE.success,
      statusClosed: CHECKOUT_PALETTE.mutedText,
      statusScheduling: CHECKOUT_PALETTE.info,
      statusUnavailable: CHECKOUT_PALETTE.danger,
    },
  };
})();

/**
 * Sobrescritas extras de variáveis do design system que o tema da loja não cobre.
 * Garantem que estados de sucesso/alerta/erro também fiquem legíveis no fundo neutro.
 */
export const checkoutExtraCssVars: Record<string, string> = {
  "--success": CHECKOUT_PALETTE.success,
  "--success-foreground": "#ffffff",
  "--destructive": CHECKOUT_PALETTE.danger,
  "--destructive-foreground": "#ffffff",
  "--border": CHECKOUT_PALETTE.border,
  "--input": CHECKOUT_PALETTE.border,
  "--shadow-glow": "0 0 40px -14px color-mix(in oklab, #dc2626 45%, transparent)",
  "--shadow-glow-sm": "0 0 22px -10px color-mix(in oklab, #dc2626 40%, transparent)",
  "--checkout-warning": CHECKOUT_PALETTE.warning,
  "--checkout-info": CHECKOUT_PALETTE.info,
};

/**
 * Classes de badge de situação com contraste garantido no tema do checkout.
 * Texto escuro sobre fundo bem claro da mesma família (≥ 4.5:1).
 */
export const CHECKOUT_STATUS_BADGE: Record<"success" | "warning" | "info" | "muted" | "destructive", string> = {
  success: "border-success/30 bg-success/12 text-success",
  warning: "border-[color:var(--checkout-warning)]/30 bg-[color:var(--checkout-warning)]/12 text-[color:var(--checkout-warning)]",
  info: "border-[color:var(--checkout-info)]/30 bg-[color:var(--checkout-info)]/12 text-[color:var(--checkout-info)]",
  muted: "border-border bg-muted text-foreground",
  destructive: "border-destructive/30 bg-destructive/12 text-destructive",
};

/** Badge da situação do pedido dentro do fluxo de compra. */
export function checkoutStatusClass(status: string): string {
  const tone = ORDER_STATUS_META[status as OrderStatus]?.tone ?? "muted";
  return CHECKOUT_STATUS_BADGE[tone];
}

/**
 * Central de marketing automática — regras puras, sem banco.
 *
 * Cada "receita" liga uma automação pronta (`automation_rules`) com valores
 * seguros por padrão: só clientes que aceitaram receber mensagens, um envio por
 * cliente por dia e cupom opcional criado junto.
 */
import type { AutomationEvent } from "@/lib/automacoes";

export interface MarketingRecipe {
  event: AutomationEvent;
  title: string;
  /** Explicação em linguagem do lojista. */
  summary: string;
  message: string;
  /** Sugere cupom de desconto junto com a mensagem. */
  suggestsCoupon: boolean;
  couponCode: string;
  discountPercent: number;
  /** Dias sem comprar (só faz sentido em "sentimos sua falta"). */
  inactiveDays?: number;
  /** Atraso após a entrega, em minutos. */
  delayMinutes: number;
}

export const MARKETING_RECIPES: MarketingRecipe[] = [
  {
    event: "birthday",
    title: "Cupom de aniversário",
    summary: "No dia do aniversário do cliente, envia uma mensagem com cupom de desconto.",
    message:
      "Feliz aniversário, {cliente}! 🎉 A {loja} preparou um presente: use o cupom {cupom} no seu próximo pedido.",
    suggestsCoupon: true,
    couponCode: "ANIVERSARIO",
    discountPercent: 15,
    delayMinutes: 0,
  },
  {
    event: "inactive",
    title: "Sentimos sua falta (30 dias)",
    summary: "Quem não compra há 30 dias recebe um convite com desconto para voltar.",
    message: "Oi {cliente}, sentimos sua falta na {loja}! Volte usando o cupom {cupom} e aproveite.",
    suggestsCoupon: true,
    couponCode: "VOLTEI",
    discountPercent: 10,
    inactiveDays: 30,
    delayMinutes: 0,
  },
  {
    event: "post_purchase",
    title: "Pós-compra pedindo avaliação",
    summary: "Algumas horas depois da entrega, agradece e pede uma avaliação da loja.",
    message:
      "Obrigado pelo pedido, {cliente}! Conta pra gente como foi? Sua avaliação ajuda muito a {loja}. 💚",
    suggestsCoupon: false,
    couponCode: "",
    discountPercent: 0,
    delayMinutes: 180,
  },
];

export function recipeFor(event: string): MarketingRecipe | undefined {
  return MARKETING_RECIPES.find((item) => item.event === event);
}

export interface MarketingEventStat {
  event: string;
  sent: number;
  failed: number;
}

export interface MarketingOverview {
  /** Uma linha por receita, ativa ou não. */
  rules: {
    event: string;
    id: string | null;
    isActive: boolean;
    channel: string;
    message: string;
    couponCode: string | null;
    inactiveDays: number | null;
    delayMinutes: number;
    lastRunAt: string | null;
  }[];
  stats: MarketingEventStat[];
  /** Total de clientes elegíveis hoje por receita (prévia). */
  audience: Record<string, number>;
  /** Cupons ativos da loja, para reaproveitar. */
  coupons: { code: string; discountType: string; discountValue: number }[];
  channelReady: boolean;
}

export function marketingOverviewKey(storeId: string | undefined) {
  return ["marketing-overview", storeId] as const;
}

export function totalSent(stats: MarketingEventStat[]): number {
  return stats.reduce((sum, item) => sum + item.sent, 0);
}

/** Cupom sempre em maiúsculas, sem espaços nem acentos. */
export function normalizeCouponCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20);
}

export interface RecipeFormState {
  channel: string;
  message: string;
  couponCode: string;
  discountPercent: number;
  inactiveDays: number;
  delayMinutes: number;
}

export function initialFormState(recipe: MarketingRecipe, overview?: MarketingOverview): RecipeFormState {
  const saved = overview?.rules.find((row) => row.event === recipe.event);
  return {
    channel: saved?.channel ?? "whatsapp",
    message: saved?.message || recipe.message,
    couponCode: saved?.couponCode ?? recipe.couponCode,
    discountPercent: recipe.discountPercent,
    inactiveDays: saved?.inactiveDays ?? recipe.inactiveDays ?? 30,
    delayMinutes: saved?.delayMinutes ?? recipe.delayMinutes,
  };
}

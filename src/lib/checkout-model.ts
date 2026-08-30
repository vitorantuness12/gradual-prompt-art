/**
 * Fase 1 dos checkouts especializados: núcleo de decisão do modelo de checkout.
 *
 * Aqui vive APENAS a regra de "qual checkout esta loja usa". Nenhuma regra de
 * preço, cliente, pagamento ou criação de pedido é duplicada — essas continuam
 * em `@/lib/orders`, `@/lib/orders.functions` e nos hooks compartilhados.
 *
 * Regras de fallback (ordem de precedência):
 * 1. `stores.checkout_type`, quando preenchido pelo lojista e compatível com o segmento.
 * 2. Sugestão pelo segmento da loja.
 * 3. `delivery` quando a loja tem configuração de alimentação/entrega/mesa.
 * 4. `loja` (produtos físicos) como padrão seguro.
 */

import { suggestSegmentGroup, type SegmentGroupId } from "@/lib/painel-segmentos";

export const CHECKOUT_MODELS = ["delivery", "digital", "agendamento", "loja"] as const;

export type CheckoutModel = (typeof CHECKOUT_MODELS)[number];

export const CHECKOUT_MODEL_LABEL: Record<CheckoutModel, string> = {
  delivery: "Delivery e restaurantes",
  digital: "Produtos digitais",
  agendamento: "Serviços e agendamentos",
  loja: "Loja online (produtos físicos)",
};

export const CHECKOUT_MODEL_DESCRIPTION: Record<CheckoutModel, string> = {
  delivery: "Endereço, entrega, retirada, mesa, adicionais e taxa de entrega. Modelo atual, sem alterações.",
  digital: "Cursos, mentorias, e-books e assinaturas: acesso, oferta e liberação digital.",
  agendamento: "Serviço, profissional, data e horário com validação de disponibilidade.",
  loja: "Variações, estoque, endereço de entrega e frete para produtos físicos.",
};

/** Caminho público de cada modelo, relativo à loja (`/{slug}`). */
export const CHECKOUT_MODEL_PATH: Record<CheckoutModel, string> = {
  delivery: "/checkout",
  digital: "/checkout/digital",
  agendamento: "/checkout/agendamento",
  loja: "/checkout/loja",
};

/** Modelos que fazem sentido em cada ramo de atividade. */
const ALLOWED_BY_SEGMENT: Record<SegmentGroupId, CheckoutModel[]> = {
  alimentacao: ["delivery", "loja"],
  varejo: ["loja", "delivery"],
  conveniencia: ["loja", "delivery"],
  servicos: ["agendamento", "loja"],
  digital: ["digital", "loja"],
  encomendas: ["delivery", "loja", "agendamento"],
};

export interface CheckoutModelStore {
  checkout_type?: string | null;
  segment?: string | null;
  accepts_delivery?: boolean | null;
  accepts_dine_in?: boolean | null;
  accepts_scheduling?: boolean | null;
}

function segmentGroupOf(store: CheckoutModelStore): SegmentGroupId {
  return suggestSegmentGroup(store.segment);
}

/** Modelos que o lojista pode escolher, dado o segmento da loja. */
export function allowedCheckoutModels(store: CheckoutModelStore): CheckoutModel[] {
  return ALLOWED_BY_SEGMENT[segmentGroupOf(store)];
}

export function isCheckoutModel(value: unknown): value is CheckoutModel {
  return typeof value === "string" && (CHECKOUT_MODELS as readonly string[]).includes(value);
}

/**
 * Decide o checkout da loja. Nunca lança: em qualquer dúvida devolve um modelo
 * seguro, para que a loja jamais fique sem checkout.
 */
export function resolveCheckoutModel(store: CheckoutModelStore | null | undefined): CheckoutModel {
  if (!store) return "loja";

  const allowed = allowedCheckoutModels(store);

  // 1. Escolha explícita do lojista, respeitada apenas se compatível com o segmento.
  if (isCheckoutModel(store.checkout_type) && allowed.includes(store.checkout_type)) {
    return store.checkout_type;
  }

  // 2. Sugestão pelo segmento.
  const suggested = allowed[0];
  if (suggested && suggested !== "loja") return suggested;

  // 3. Loja com operação de alimentação/entrega/mesa continua no fluxo atual.
  if (store.accepts_delivery || store.accepts_dine_in) return "delivery";

  // 4. Padrão seguro.
  return "loja";
}

/** Endereço público do checkout desta loja, já resolvido. */
export function checkoutPathFor(slug: string, store: CheckoutModelStore | null | undefined): string {
  return `/${slug}${CHECKOUT_MODEL_PATH[resolveCheckoutModel(store)]}`;
}

/**
 * Fase 1: apenas o modelo de delivery possui interface própria implementada.
 * Os demais compartilham o checkout atual até que suas telas específicas entrem.
 */
export const IMPLEMENTED_CHECKOUT_MODELS: CheckoutModel[] = ["delivery"];

export function hasDedicatedScreen(model: CheckoutModel): boolean {
  return IMPLEMENTED_CHECKOUT_MODELS.includes(model);
}

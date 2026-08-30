import { createServerFn } from "@tanstack/react-start";

import type { CartLineInput } from "@/lib/checkout-especializado";

/**
 * Pontes RPC dos checkouts especializados. Cada função é uma casca fina: toda
 * a regra vive em `checkout-especializado.server.ts`, que roda apenas no
 * servidor. São públicas de propósito (compra sem login), então cada uma passa
 * por limite de requisições antes de tocar o banco.
 */

interface CustomerFields {
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
}

/** Opções de agendamento da loja: serviços, profissionais, unidades e política. */
export const getAgendaOptions = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAgendaOptions } = await import("@/lib/checkout-especializado.server");
    return loadAgendaOptions(supabaseAdmin, data.slug);
  });

/** Horários livres do serviço no dia escolhido (fonte de verdade: servidor). */
export const getAgendaSlots = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { slug: string; productId: string; professionalId?: string | null; date: string }) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAgendaSlots } = await import("@/lib/checkout-especializado.server");
    return loadAgendaSlots(supabaseAdmin, data);
  });

/** Fecha o agendamento reconferindo a disponibilidade real do horário. */
export const submitAgendamento = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input: CustomerFields & {
        slug: string;
        productId: string;
        professionalId?: string | null;
        unitId?: string | null;
        startsAt: string;
        paymentMethod: string;
      },
    ) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkRateLimit } = await import("@/lib/security.server");
    const limit = await checkRateLimit(supabaseAdmin, "checkout", data.phone);
    if (!limit.allowed) return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };

    const { createAgendamento } = await import("@/lib/checkout-especializado.server");
    return createAgendamento(supabaseAdmin, data);
  });

/** Compra de produto digital: registra o pedido sem liberar o acesso. */
export const submitDigitalCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input: CustomerFields & {
        slug: string;
        lines: CartLineInput[];
        couponCode?: string | null;
        paymentMethod: string;
        installments?: number | null;
      },
    ) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkRateLimit } = await import("@/lib/security.server");
    const limit = await checkRateLimit(supabaseAdmin, "checkout", data.phone);
    if (!limit.allowed) return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };

    const { createDigitalOrder } = await import("@/lib/checkout-especializado.server");
    return createDigitalOrder(supabaseAdmin, data);
  });

/** Frete calculado pelas regras do lojista, com o peso real do carrinho. */
export const getShippingQuote = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      slug: string;
      lines: CartLineInput[];
      zip?: string | null;
      district?: string | null;
      distanceKm?: number | null;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { quoteStoreShipping } = await import("@/lib/checkout-especializado.server");
    return quoteStoreShipping(supabaseAdmin, data);
  });

/** Pedido de produto físico: revalida preço, estoque e frete antes de gravar. */
export const submitStoreCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input: CustomerFields & {
        slug: string;
        lines: CartLineInput[];
        couponCode?: string | null;
        paymentMethod: string;
        fulfillment: "delivery" | "pickup";
        address?: {
          zip?: string | null;
          street?: string | null;
          number?: string | null;
          district?: string | null;
          city?: string | null;
          state?: string | null;
          complement?: string | null;
        } | null;
        distanceKm?: number | null;
      },
    ) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkRateLimit } = await import("@/lib/security.server");
    const limit = await checkRateLimit(supabaseAdmin, "checkout", data.phone);
    if (!limit.allowed) return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };

    const { createStoreOrder } = await import("@/lib/checkout-especializado.server");
    return createStoreOrder(supabaseAdmin, data);
  });

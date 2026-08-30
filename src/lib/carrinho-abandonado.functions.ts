import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import type { AbandonedCartRecovery } from "@/lib/carrinho-abandonado";

/**
 * Endpoints da recuperação de carrinho.
 *
 * São públicos por natureza (o cliente não tem login), então cada um valida a
 * loja, normaliza o telefone e passa por limite de tentativas por IP. Nenhuma
 * informação de outro cliente é devolvida: a leitura acontece por token opaco.
 */

const cartItemSchema = z.object({
  productId: z.string().trim().min(1).max(60),
  variantId: z.string().trim().max(60).nullish(),
  variantName: z.string().trim().max(120).nullish(),
  name: z.string().trim().min(1).max(160),
  unitPrice: z.number().finite().nonnegative(),
  quantity: z.number().int().positive().max(999),
  notes: z.string().trim().max(300).nullish(),
  options: z
    .array(
      z.object({
        groupName: z.string().trim().max(80),
        optionName: z.string().trim().max(80),
        priceDelta: z.number().finite(),
      }),
    )
    .max(20)
    .optional(),
});

const saveInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(8).max(30),
  name: z.string().trim().max(120).optional(),
  items: z.array(cartItemSchema).max(60),
  notes: z.string().trim().max(500).optional(),
  couponCode: z.string().trim().max(40).optional(),
  address: z
    .object({
      zipCode: z.string().trim().max(20).optional(),
      street: z.string().trim().max(160).optional(),
      number: z.string().trim().max(30).optional(),
      complement: z.string().trim().max(120).optional(),
      district: z.string().trim().max(120).optional(),
      reference: z.string().trim().max(160).optional(),
    })
    .optional(),
});

async function loadStore(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("stores")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

/**
 * Guarda o carrinho do cliente já identificado pelo telefone, para permitir o
 * lembrete e a retomada. Chamado com debounce pelo checkout.
 */
export const salvarCarrinhoAbandonado = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { normalizePhoneBR } = await import("@/lib/phone");
    const phone = normalizePhoneBR(data.phone);
    if (!phone.ok) return { ok: false };

    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit(
      "abandoned_cart",
      `${clientIdentifier(getRequest()?.headers)}:${data.storeSlug}`,
    );
    if (!limit.allowed) return { ok: false };

    const store = await loadStore(data.storeSlug);
    if (!store) return { ok: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A loja precisa querer o recurso ligado.
    const { data: settings } = await supabaseAdmin
      .from("store_checkout_settings")
      .select("abandoned_cart_enabled")
      .eq("store_id", store.id)
      .maybeSingle();
    if (settings && settings.abandoned_cart_enabled === false) return { ok: false };

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("store_id", store.id)
      .eq("phone_e164", phone.e164)
      .maybeSingle();

    const { saveAbandonedCart } = await import("@/lib/carrinho-abandonado.server");
    return saveAbandonedCart(supabaseAdmin, {
      storeId: store.id,
      phoneE164: phone.e164,
      customerId: customer?.id ?? null,
      customerName: data.name?.trim() || customer?.name || null,
      items: data.items,
      notes: data.notes ?? null,
      address: data.address ?? null,
      couponCode: data.couponCode ?? null,
    });
  });

/** Encerra o ciclo: o pedido saiu, então não há mais o que lembrar. */
export const marcarCarrinhoRecuperado = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        storeSlug: z.string().trim().min(1).max(60),
        phone: z.string().trim().min(8).max(30),
        orderId: z.string().trim().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { normalizePhoneBR } = await import("@/lib/phone");
    const phone = normalizePhoneBR(data.phone);
    if (!phone.ok) return { ok: false };

    const store = await loadStore(data.storeSlug);
    if (!store) return { ok: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { markCartRecovered } = await import("@/lib/carrinho-abandonado.server");
    await markCartRecovered(supabaseAdmin, {
      storeId: store.id,
      phoneE164: phone.e164,
      orderId: data.orderId ?? null,
    });
    return { ok: true };
  });

/** Lê o carrinho pelo token do link enviado no lembrete. */
export const recuperarCarrinhoAbandonado = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().trim().min(16).max(64) }).parse(data),
  )
  .handler(async ({ data }): Promise<AbandonedCartRecovery> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("abandoned_cart_open", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) {
      return {
        ok: false,
        message: "Muitas tentativas. Aguarde alguns instantes.",
        storeSlug: null,
        storeId: null,
        storeName: null,
        customerName: null,
        couponCode: null,
        items: [],
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCartByToken } = await import("@/lib/carrinho-abandonado.server");
    return loadCartByToken(supabaseAdmin, data.token);
  });

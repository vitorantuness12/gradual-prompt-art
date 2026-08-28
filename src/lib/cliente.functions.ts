import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OrderAddress, OrderSummaryView, TrackedOrderDetail } from "@/lib/acompanhamento";
import type { RepeatLine } from "@/lib/repetir-pedido";

/**
 * Área do cliente: histórico, acompanhamento ao vivo, repetir pedido e
 * preferências de aviso. O login é por telefone + código de 6 dígitos
 * (mesmo fluxo do acompanhamento) e a sessão é um token assinado no servidor.
 */

const sessionInput = z.object({ session: z.string().trim().min(10).max(600) });
const startInput = z.object({
  phone: z.string().trim().min(8).max(30),
  code: z.string().trim().min(4).max(10),
});
const orderInput = sessionInput.extend({ orderId: z.string().uuid() });
const prefsInput = sessionInput.extend({
  storeId: z.string().uuid(),
  whatsapp: z.boolean().optional(),
  email: z.boolean().optional(),
});

export interface CustomerSession {
  ok: boolean;
  message: string;
  session: string | null;
  expiresAt: string | null;
  phoneMasked: string;
}

export interface StorePrefs {
  storeId: string;
  storeName: string;
  storeSlug: string;
  whatsapp: boolean;
  email: boolean;
  hasEmail: boolean;
}

export interface CustomerHistory {
  ok: boolean;
  message: string;
  name: string;
  orders: Array<OrderSummaryView & { id: string; storeId: string; canRepeat: boolean }>;
  stores: StorePrefs[];
}

/** Troca o código de 6 dígitos por uma sessão de 12 horas. */
export const startCustomerSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => startInput.parse(data))
  .handler(async ({ data }): Promise<CustomerSession> => {
    const { normalizePhoneBR, maskPhoneForDisplay } = await import("@/lib/phone");
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );

    const phone = normalizePhoneBR(data.phone);
    const fail = (message: string): CustomerSession => ({
      ok: false,
      message,
      session: null,
      expiresAt: null,
      phoneMasked: "",
    });
    if (!phone.ok) return fail(phone.message);

    const limit = await consumeRateLimit(
      "login",
      `${clientIdentifier(getRequest()?.headers)}:${phone.e164}:area`,
    );
    if (!limit.allowed) return fail(rateLimitMessage(limit));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkVerificationCode } = await import("@/lib/acompanhamento.server");
    const check = await checkVerificationCode(supabaseAdmin, phone.e164, data.code);
    if (!check.ok) return fail(check.message);

    const { issueSession, markPhoneVerified } = await import("@/lib/cliente.server");
    await markPhoneVerified(supabaseAdmin, phone.e164);
    const session = issueSession(phone.e164);

    return {
      ok: true,
      message: "",
      session: session.token,
      expiresAt: session.expiresAt,
      phoneMasked: maskPhoneForDisplay(phone.e164),
    };
  });

/** Histórico do telefone verificado, com as lojas e preferências de aviso. */
export const customerHistory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionInput.parse(data))
  .handler(async ({ data }): Promise<CustomerHistory> => {
    const helpers = await import("@/lib/cliente.server");
    const session = helpers.readSession(data.session);
    if (!session.ok) {
      return { ok: false, message: session.message, name: "", orders: [], stores: [] };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canRepeatOrder } = await import("@/lib/repetir-pedido");

    const { data: rows } = await supabaseAdmin
      .from("orders")
      .select(
        "id, store_id, code, public_token, status, type, created_at, total, customer_phone, customer_name, store:stores(name, slug)",
      )
      .order("created_at", { ascending: false })
      .limit(400);

    const mine = (rows ?? [])
      .filter((row) => helpers.samePhone(row.customer_phone ?? "", session.phoneE164))
      .slice(0, 30);

    const orders = mine.map((row) => {
      const store = row.store as { name: string; slug: string } | null;
      return {
        id: row.id,
        storeId: row.store_id,
        code: row.code,
        publicToken: row.public_token,
        status: row.status as string,
        type: row.type as string,
        createdAt: row.created_at,
        total: Number(row.total),
        storeName: store?.name ?? "Loja",
        storeSlug: store?.slug ?? "",
        canRepeat: canRepeatOrder(row.status as string),
      };
    });

    const storeIds = [...new Set(orders.map((order) => order.storeId))];
    const stores: StorePrefs[] = [];
    for (const storeId of storeIds) {
      const prefs = await helpers.readNotificationPrefs(supabaseAdmin, storeId, session.phoneE164);
      const { data: customer } = await supabaseAdmin
        .from("customers")
        .select("email")
        .eq("store_id", storeId)
        .eq("phone_e164", session.phoneE164)
        .maybeSingle();
      const first = orders.find((order) => order.storeId === storeId);
      stores.push({
        storeId,
        storeName: first?.storeName ?? "Loja",
        storeSlug: first?.storeSlug ?? "",
        whatsapp: prefs.whatsapp,
        email: prefs.email,
        hasEmail: Boolean(customer?.email),
      });
    }

    return {
      ok: true,
      message: orders.length === 0 ? "Ainda não encontramos pedidos para este telefone." : "",
      name: (mine[0]?.customer_name ?? "").trim(),
      orders,
      stores,
    };
  });

/** Detalhe do pedido para o acompanhamento ao vivo dentro da área do cliente. */
export const customerOrderDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => orderInput.parse(data))
  .handler(
    async ({ data }): Promise<{ ok: boolean; message: string; order: TrackedOrderDetail | null }> => {
      const helpers = await import("@/lib/cliente.server");
      const session = helpers.readSession(data.session);
      if (!session.ok) return { ok: false, message: session.message, order: null };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const tracking = await import("@/lib/acompanhamento.server");
      const { data: row } = await supabaseAdmin
        .from("orders")
        .select(tracking.ORDER_SELECT)
        .eq("id", data.orderId)
        .maybeSingle();

      if (!row || !helpers.samePhone(row.customer_phone ?? "", session.phoneE164)) {
        return { ok: false, message: "Pedido não encontrado nesta conta.", order: null };
      }

      return { ok: true, message: "", order: await tracking.buildDetail(supabaseAdmin, row) };
    },
  );

export interface RepeatPrepared {
  ok: boolean;
  message: string;
  storeSlug: string;
  storeId: string;
  lines: RepeatLine[];
  total: number;
  /** Endereço usado no pedido original, para repetir com os mesmos dados. */
  address: OrderAddress | null;
}

/** Recalcula um pedido antigo com os preços e a disponibilidade de hoje. */
export const prepareCustomerRepeat = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => orderInput.parse(data))
  .handler(async ({ data }): Promise<RepeatPrepared> => {
    const helpers = await import("@/lib/cliente.server");
    const session = helpers.readSession(data.session);
    const empty = { storeSlug: "", storeId: "", lines: [], total: 0, address: null };
    if (!session.ok) return { ok: false, message: session.message, ...empty };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, store_id, status, customer_phone, address, store:stores(slug), order_items(product_id, product_name, quantity, unit_price, notes)",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order || !helpers.samePhone(order.customer_phone ?? "", session.phoneE164)) {
      return { ok: false, message: "Pedido não encontrado nesta conta.", ...empty };
    }

    const [{ data: products }, { data: groups }, { data: options }] = await Promise.all([
      supabaseAdmin.from("products").select("*").eq("store_id", order.store_id),
      supabaseAdmin.from("product_option_groups").select("id, product_id, name").eq("store_id", order.store_id),
      supabaseAdmin.from("product_options").select("id, group_id, name, price_delta"),
    ]);

    const { parseOrderAddress } = await import("@/lib/acompanhamento");
    const { buildRepeatOrder } = await import("@/lib/repetir-pedido");
    const result = buildRepeatOrder(
      (order.order_items ?? []).map((item) => ({
        product_id: item.product_id,
        name: item.product_name,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        options: [],
        notes: item.notes,
      })),
      (products ?? []) as never,
      groups ?? [],
      options ?? [],
    );

    const store = order.store as { slug: string } | null;
    return {
      ok: true,
      message: "",
      storeSlug: store?.slug ?? "",
      storeId: order.store_id,
      lines: result.lines,
      total: result.total,
      address: parseOrderAddress(order.address),
    };
  });

/** Liga ou desliga os avisos automáticos daquela loja. */
export const setCustomerNotifications = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => prefsInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const helpers = await import("@/lib/cliente.server");
    const session = helpers.readSession(data.session);
    if (!session.ok) return { ok: false, message: session.message };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { whatsapp?: boolean; email?: boolean } = {};
    if (typeof data.whatsapp === "boolean") patch.whatsapp = data.whatsapp;
    if (typeof data.email === "boolean") patch.email = data.email;

    await helpers.setOrderNotifications(supabaseAdmin, data.storeId, session.phoneE164, patch);
    return { ok: true, message: "Preferências salvas." };
  });

/**
 * Aviso automático ao cliente quando a loja muda a situação do pedido.
 * Chamada pelo painel (usuário autenticado): a leitura do pedido passa pelo
 * RLS da loja, então ninguém dispara aviso de pedido de outra loja.
 */
export const notifyCustomerOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.string().trim().min(2).max(40),
        event: z.string().trim().max(60).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { data: allowed } = await context.supabase
      .from("orders")
      .select("id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!allowed) return { ok: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyCustomerStatus } = await import("@/lib/cliente.server");
    await notifyCustomerStatus(supabaseAdmin, {
      orderId: data.orderId,
      status: data.status,
      event: data.event ?? null,
    });
    return { ok: true };
  });

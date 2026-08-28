import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import type { OrderSummaryView, TrackedOrderDetail } from "@/lib/acompanhamento";

/**
 * Consulta pública de pedidos: por número do pedido + telefone, por telefone
 * (com código de verificação) ou pelo código público do link.
 * Toda a validação acontece no servidor; o navegador nunca acessa a tabela.
 */

const codeInput = z.object({
  code: z.string().trim().min(4).max(24),
  phone: z.string().trim().min(8).max(30),
});

const tokenInput = z.object({ token: z.string().trim().min(8).max(80) });

const requestCodeInput = z.object({
  phone: z.string().trim().min(8).max(30),
  storeSlug: z.string().trim().max(60).optional(),
});

const phoneListInput = z.object({
  phone: z.string().trim().min(8).max(30),
  code: z.string().trim().min(4).max(10),
  storeSlug: z.string().trim().max(60).optional(),
});

export interface TrackResponse {
  ok: boolean;
  /** A loja exige código de verificação para liberar o histórico. */
  needsVerification: boolean;
  message: string;
  order: TrackedOrderDetail | null;
}

export interface RequestCodeResponse {
  ok: boolean;
  channel: "whatsapp" | "email" | null;
  message: string;
}

export interface PhoneOrdersResponse {
  ok: boolean;
  message: string;
  orders: OrderSummaryView[];
}

/** Pedido pelo número + telefone da compra (o telefone é o segundo fator). */
export const trackByCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => codeInput.parse(data))
  .handler(async ({ data }): Promise<TrackResponse> => {
    const helpers = await import("@/lib/acompanhamento.server");
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );
    const { normalizePhoneBR } = await import("@/lib/phone");

    const notFound: TrackResponse = {
      ok: false,
      needsVerification: false,
      message: "Não encontramos um pedido com esses dados. Confira o número e o telefone da compra.",
      order: null,
    };

    const phone = normalizePhoneBR(data.phone);
    if (!phone.ok) return { ...notFound, message: phone.message };

    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return { ...notFound, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select(helpers.ORDER_SELECT)
      .eq("code", data.code.trim().toUpperCase())
      .limit(5);

    if (error) {
      console.error("[acompanhar] consulta por código", error.message);
      return { ...notFound, message: "Não foi possível consultar o pedido agora." };
    }

    const digits = phone.national;
    const match = (rows ?? []).find(
      (row) => helpers.onlyDigits(row.customer_phone ?? "").slice(-11) === digits.slice(-11),
    );
    if (!match) return notFound;

    return {
      ok: true,
      needsVerification: false,
      message: "",
      order: await buildDetail(supabaseAdmin, match),
    };
  });

/** Pedido pelo código público do link compartilhado pela loja. */
export const trackByToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data }): Promise<TrackResponse> => {
    const helpers = await import("@/lib/acompanhamento.server");
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );

    const notFound: TrackResponse = {
      ok: false,
      needsVerification: false,
      message: "Código público inválido ou expirado. Peça um novo link para a loja.",
      order: null,
    };

    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return { ...notFound, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: match } = await supabaseAdmin
      .from("orders")
      .select(helpers.ORDER_SELECT)
      .eq("public_token", data.token.trim().toLowerCase())
      .maybeSingle();

    if (!match) return notFound;

    const settings = await helpers.trackingSettings(supabaseAdmin, match.store_id);
    if (!settings.allowPublicTracking) {
      return { ...notFound, message: "Esta loja desativou o acompanhamento por link público." };
    }
    if (helpers.linkExpired(match.created_at, settings.trackingLinkDays)) {
      return { ...notFound, message: "Este link de acompanhamento expirou. Fale com a loja." };
    }

    return {
      ok: true,
      needsVerification: false,
      message: "",
      order: await buildDetail(supabaseAdmin, match),
    };
  });

/** Envia um código de 6 dígitos para o telefone antes de liberar o histórico. */
export const requestTrackingCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => requestCodeInput.parse(data))
  .handler(async ({ data }): Promise<RequestCodeResponse> => {
    const helpers = await import("@/lib/acompanhamento.server");
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );
    const { normalizePhoneBR } = await import("@/lib/phone");

    const phone = normalizePhoneBR(data.phone);
    if (!phone.ok) return { ok: false, channel: null, message: phone.message };

    const ip = clientIdentifier(getRequest()?.headers);
    const limit = await consumeRateLimit("login", `${ip}:${phone.e164}`, {
      limit: 5,
      windowSeconds: 900,
    });
    if (!limit.allowed) return { ok: false, channel: null, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // O código só é enviado se existir pedido com esse telefone; a resposta é
    // sempre a mesma, para não revelar quem é cliente da plataforma.
    const generic: RequestCodeResponse = {
      ok: true,
      channel: "whatsapp",
      message: "Se houver pedidos com este telefone, enviamos um código pelo WhatsApp. Ele vale por 10 minutos.",
    };

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, customer_phone, customer_id")
      .order("created_at", { ascending: false })
      .limit(200);

    const owned = (orders ?? []).filter(
      (row) => helpers.onlyDigits(row.customer_phone ?? "").slice(-11) === phone.national.slice(-11),
    );
    if (owned.length === 0) return generic;

    const code = helpers.generateCode();
    await helpers.storeVerificationCode(supabaseAdmin, phone.e164, code, "whatsapp");

    const storeId = owned[0]!.store_id;
    const body = `Seu código para acompanhar pedidos é ${code}. Ele vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem.`;

    try {
      const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");
      const outcome = await sendWhatsappMessage(supabaseAdmin, {
        storeId,
        phone: phone.e164,
        body,
        messageType: "transactional",
        templateKey: "acompanhamento_codigo",
      });
      if (!outcome.ok) console.warn("[acompanhar] envio do código:", outcome.message);
    } catch (error) {
      console.error("[acompanhar] falha ao enviar código", error);
    }

    return generic;
  });

/** Lista os pedidos do telefone depois da confirmação do código. */
export const listOrdersByPhone = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => phoneListInput.parse(data))
  .handler(async ({ data }): Promise<PhoneOrdersResponse> => {
    const helpers = await import("@/lib/acompanhamento.server");
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );
    const { normalizePhoneBR } = await import("@/lib/phone");

    const phone = normalizePhoneBR(data.phone);
    if (!phone.ok) return { ok: false, message: phone.message, orders: [] };

    const limit = await consumeRateLimit("historico", `${clientIdentifier(getRequest()?.headers)}:${phone.e164}`);
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit), orders: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const check = await helpers.checkVerificationCode(supabaseAdmin, phone.e164, data.code);
    if (!check.ok) return { ok: false, message: check.message, orders: [] };

    const { data: rows } = await supabaseAdmin
      .from("orders")
      .select("code, public_token, status, type, created_at, total, customer_phone, store:stores(name, slug)")
      .order("created_at", { ascending: false })
      .limit(300);

    const mine = (rows ?? [])
      .filter((row) => helpers.onlyDigits(row.customer_phone ?? "").slice(-11) === phone.national.slice(-11))
      .slice(0, 20)
      .map((row) => {
        const store = row.store as { name: string; slug: string } | null;
        return {
          code: row.code,
          publicToken: row.public_token,
          status: row.status,
          type: row.type,
          createdAt: row.created_at,
          total: Number(row.total),
          storeName: store?.name ?? "Loja",
          storeSlug: store?.slug ?? "",
        };
      });

    return {
      ok: true,
      message: mine.length === 0 ? "Nenhum pedido encontrado para este telefone." : "",
      orders: mine,
    };
  });

/** Converte a linha do banco no formato mostrado na página. */
async function buildDetail(
  admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  row: Record<string, unknown>,
): Promise<TrackedOrderDetail> {
  const order = row as never as {
    id: string;
    code: string;
    public_token: string;
    customer_name: string | null;
    status: string;
    type: string;
    created_at: string;
    total: number;
    subtotal: number;
    delivery_fee: number;
    discount: number | null;
    payment_method: string | null;
    payment_status: string;
    scheduled_for: string | null;
    table_number: string | null;
    notes: string | null;
    is_demo: boolean;
    store: { name: string; slug: string } | null;
    order_items: Array<{ product_name: string; quantity: number; total: number; notes: string | null }> | null;
  };

  const { data: history } = await admin
    .from("order_status_history")
    .select("status, created_at, reason")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  return {
    id: order.id,
    code: order.code,
    publicToken: order.public_token,
    storeName: order.store?.name ?? "Loja",
    storeSlug: order.store?.slug ?? "",
    customerName: order.customer_name ?? "Cliente",
    status: order.status,
    type: order.type,
    createdAt: order.created_at,
    total: Number(order.total),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    discount: Number(order.discount ?? 0),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    scheduledFor: order.scheduled_for,
    tableNumber: order.table_number,
    notes: order.notes,
    isDemo: order.is_demo,
    items: (order.order_items ?? []).map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      total: Number(item.total),
      notes: item.notes,
    })),
    timeline: (history ?? []).map((entry) => ({
      status: entry.status,
      createdAt: entry.created_at,
      reason: entry.reason,
    })),
  };
}

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Funções de pagamento. A criação de cobrança é pública (o cliente da loja
 * não tem conta), mas exige o código do pedido + telefone usado na compra.
 * Estorno e consulta de transações exigem login e vínculo com a loja.
 */

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export interface ChargeResponse {
  ok: boolean;
  message: string;
  status?: "pending" | "paid" | "failed";
  method?: string;
  provider?: string;
  amount?: number;
  pixPayload?: string | null;
  checkoutUrl?: string | null;
  expiresAt?: string | null;
}

const chargeInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  orderCode: z.string().trim().min(2).max(40),
  phone: z.string().trim().min(8).max(30),
  method: z.enum(["pix", "card_online"]),
  returnUrl: z.string().trim().url().max(300).optional(),
});

export const createCharge = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => chargeInput.parse(data))
  .handler(async ({ data }): Promise<ChargeResponse> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("payment", `${clientIdentifier(getRequest()?.headers)}:${data.orderCode}`);
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getGateway } = await import("@/lib/payments/gateway.server");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id, name, address_city")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return { ok: false, message: "Loja não encontrada." };

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, code, total, customer_name, customer_phone, customer_email, payment_status")
      .eq("store_id", store.id)
      .eq("code", data.orderCode.trim().toUpperCase())
      .maybeSingle();
    if (!order || onlyDigits(order.customer_phone ?? "") !== onlyDigits(data.phone)) {
      return { ok: false, message: "Pedido não encontrado para os dados informados." };
    }
    if (order.payment_status === "paid") {
      return { ok: true, message: "Este pedido já está pago.", status: "paid", amount: Number(order.total) };
    }

    const { data: settings } = await supabaseAdmin
      .from("payment_settings")
      .select("*")
      .eq("store_id", store.id)
      .maybeSingle();

    const provider = settings?.provider ?? "manual";
    const gateway = getGateway(provider);
    const idempotencyKey = `${order.id}:${data.method}`;

    // Idempotência: se já existe cobrança válida para este pedido/método, reaproveita.
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id, status, amount, method, provider, pix_payload, expires_at, provider_reference")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing && existing.status !== "failed") {
      const expired = existing.expires_at ? new Date(existing.expires_at).getTime() < Date.now() : false;
      if (!expired) {
        return {
          ok: true,
          message: existing.status === "paid" ? "Pagamento confirmado." : "Cobrança gerada.",
          status: existing.status === "paid" ? "paid" : "pending",
          method: existing.method,
          provider: existing.provider,
          amount: Number(existing.amount),
          pixPayload: existing.pix_payload,
          checkoutUrl: existing.provider_reference?.startsWith("http") ? existing.provider_reference : null,
          expiresAt: existing.expires_at,
        };
      }
    }

    const chargeInputData = {
      amount: Number(order.total),
      orderCode: order.code,
      description: `Pedido ${order.code} — ${store.name}`,
      payerName: order.customer_name,
      payerEmail: order.customer_email,
      expiresMinutes: settings?.pix_expires_minutes ?? 30,
      pix: settings?.pix_key
        ? {
            key: settings.pix_key,
            keyType: (settings.pix_key_type ?? "cpf") as "cpf" | "cnpj" | "email" | "phone" | "random",
            holderName: settings.pix_holder_name ?? store.name,
            city: settings.pix_city ?? store.address_city ?? "SAO PAULO",
          }
        : null,
      ...(data.returnUrl ? { returnUrl: data.returnUrl } : {}),
    };

    if (data.method === "pix" && settings && settings.pix_enabled === false) {
      return { ok: false, message: "Esta loja não está aceitando Pix no momento." };
    }
    if (data.method === "card_online" && (!settings?.card_online_enabled || !gateway.supportsCard || !gateway.isConfigured())) {
      return { ok: false, message: "Pagamento com cartão online não está disponível nesta loja." };
    }

    const result =
      data.method === "pix"
        ? await gateway.createPixCharge(chargeInputData)
        : await gateway.createCardCharge(chargeInputData);

    if (result.status === "failed") {
      return { ok: false, message: result.error ?? "Não foi possível gerar a cobrança." };
    }

    const row = {
      store_id: store.id,
      order_id: order.id,
      method: data.method,
      provider: result.provider,
      status: result.status === "paid" ? ("paid" as const) : ("pending" as const),
      amount: Number(order.total),
      provider_reference: result.checkoutUrl ?? result.externalId,
      external_id: result.externalId,
      pix_payload: result.pixPayload,
      expires_at: result.expiresAt,
      idempotency_key: idempotencyKey,
      paid_at: result.status === "paid" ? new Date().toISOString() : null,
    };

    if (existing) {
      await supabaseAdmin.from("payments").update(row).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("payments").insert(row);
    }

    if (result.status === "paid") {
      await supabaseAdmin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
    } else {
      await supabaseAdmin.from("orders").update({ payment_status: "pending" }).eq("id", order.id);
    }

    return {
      ok: true,
      message: result.status === "paid" ? "Pagamento confirmado." : "Cobrança gerada.",
      status: result.status,
      method: data.method,
      provider: result.provider,
      amount: Number(order.total),
      pixPayload: result.pixPayload,
      checkoutUrl: result.checkoutUrl,
      expiresAt: result.expiresAt,
    };
  });

const statusInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  orderCode: z.string().trim().min(2).max(40),
  phone: z.string().trim().min(8).max(30),
});

export const chargeStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data }): Promise<{ status: string; paidAt: string | null }> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers), { limit: 240, windowSeconds: 300 });
    if (!limit.allowed) return { status: "unknown", paidAt: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .maybeSingle();
    if (!store) return { status: "unknown", paidAt: null };

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, customer_phone, payment_status")
      .eq("store_id", store.id)
      .eq("code", data.orderCode.trim().toUpperCase())
      .maybeSingle();
    if (!order || onlyDigits(order.customer_phone ?? "") !== onlyDigits(data.phone)) {
      return { status: "unknown", paidAt: null };
    }

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("status, paid_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { status: payment?.status ?? order.payment_status, paidAt: payment?.paid_at ?? null };
  });

/** ---------- Estorno (equipe da loja) ---------- */

const refundInput = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive(),
});

export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => refundInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { data: payment, error } = await context.supabase
      .from("payments")
      .select("id, store_id, order_id, amount, refunded_amount, status, provider, external_id")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error || !payment) return { ok: false, message: "Transação não encontrada." };
    if (payment.status !== "paid") return { ok: false, message: "Somente transações pagas podem ser estornadas." };

    const remaining = Number(payment.amount) - Number(payment.refunded_amount ?? 0);
    if (data.amount > remaining + 0.001) return { ok: false, message: "Valor maior que o disponível para estorno." };

    const { getGateway } = await import("@/lib/payments/gateway.server");
    const gateway = getGateway(payment.provider);
    if (payment.external_id) {
      const result = await gateway.refund(payment.external_id, data.amount);
      if (!result.ok) return { ok: false, message: result.error ?? "O provedor recusou o estorno." };
    }

    const refunded = Number(payment.refunded_amount ?? 0) + data.amount;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("payments")
      .update({
        refunded_amount: refunded,
        refunded_at: new Date().toISOString(),
        status: refunded >= Number(payment.amount) - 0.001 ? "refunded" : "paid",
      })
      .eq("id", payment.id);

    if (payment.order_id && refunded >= Number(payment.amount) - 0.001) {
      await supabaseAdmin.from("orders").update({ payment_status: "refunded" }).eq("id", payment.order_id);
    }

    return { ok: true, message: "Estorno registrado." };
  });

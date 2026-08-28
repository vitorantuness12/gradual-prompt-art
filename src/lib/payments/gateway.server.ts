/**
 * Camada de abstração de gateway de pagamento.
 *
 * A aplicação nunca fala com um provedor específico: ela pede uma cobrança
 * ao gateway ativo da loja. Hoje existem três implementações — Pix direto
 * (sem gateway), Mercado Pago e Stripe — e novas podem ser adicionadas
 * apenas registrando outro objeto em `GATEWAYS`.
 *
 * Nenhum dado bruto de cartão passa por aqui: o cartão é sempre tokenizado
 * ou coletado no checkout hospedado do provedor.
 */

import { buildPixPayload, type PixKeyType } from "@/lib/pix";

export type ProviderId = "manual" | "mercadopago" | "stripe";

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  manual: "Pix direto (sem gateway)",
  mercadopago: "Mercado Pago",
  stripe: "Stripe",
};

export interface PixConfig {
  key: string;
  keyType: PixKeyType;
  holderName: string;
  city: string;
}

export interface ChargeInput {
  amount: number;
  orderCode: string;
  description: string;
  payerName: string;
  payerEmail?: string | null;
  expiresMinutes: number;
  pix?: PixConfig | null;
  returnUrl?: string;
}

export interface ChargeResult {
  provider: ProviderId;
  status: "pending" | "paid" | "failed";
  externalId: string | null;
  pixPayload: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
  feeAmount: number;
  error?: string;
}

export interface RefundResult {
  ok: boolean;
  refundedAmount: number;
  error?: string;
}

export type WebhookKind = "paid" | "failed" | "expired" | "refunded" | "unknown";

export interface WebhookEvent {
  eventId: string;
  kind: WebhookKind;
  externalId: string | null;
  amount: number | null;
  feeAmount: number | null;
  refundedAmount: number | null;
}

export interface PaymentGateway {
  id: ProviderId;
  isConfigured: () => boolean;
  supportsCard: boolean;
  createPixCharge: (input: ChargeInput) => Promise<ChargeResult>;
  createCardCharge: (input: ChargeInput) => Promise<ChargeResult>;
  refund: (externalId: string, amount: number) => Promise<RefundResult>;
  /** Confere a assinatura do webhook antes de qualquer processamento. */
  verifyWebhook: (headers: Headers, rawBody: string) => Promise<boolean>;
  parseWebhook: (rawBody: string) => Promise<WebhookEvent>;
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function unsupported(provider: ProviderId, what: string): ChargeResult {
  return {
    provider,
    status: "failed",
    externalId: null,
    pixPayload: null,
    checkoutUrl: null,
    expiresAt: null,
    feeAmount: 0,
    error: `${what} não está disponível para ${PROVIDER_LABEL[provider]}.`,
  };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** ---------- Pix direto (sem gateway) ---------- */

const manualGateway: PaymentGateway = {
  id: "manual",
  supportsCard: false,
  isConfigured: () => true,
  createPixCharge: async (input) => {
    if (!input.pix?.key) {
      return { ...unsupported("manual", "Pix"), error: "Cadastre a chave Pix da loja nas configurações de pagamento." };
    }
    return {
      provider: "manual",
      status: "pending",
      externalId: null,
      pixPayload: buildPixPayload({
        key: input.pix.key,
        keyType: input.pix.keyType,
        holderName: input.pix.holderName,
        city: input.pix.city,
        amount: input.amount,
        txid: input.orderCode,
        description: input.description,
      }),
      checkoutUrl: null,
      expiresAt: minutesFromNow(input.expiresMinutes),
      feeAmount: 0,
    };
  },
  createCardCharge: async () => unsupported("manual", "Cartão online"),
  refund: async (_externalId, amount) => ({ ok: true, refundedAmount: amount }),
  verifyWebhook: async () => false,
  parseWebhook: async () => ({
    eventId: crypto.randomUUID(),
    kind: "unknown",
    externalId: null,
    amount: null,
    feeAmount: null,
    refundedAmount: null,
  }),
};

/** ---------- Mercado Pago ---------- */

const mercadoPagoGateway: PaymentGateway = {
  id: "mercadopago",
  supportsCard: true,
  isConfigured: () => Boolean(process.env["MERCADO_PAGO_ACCESS_TOKEN"]),
  createPixCharge: async (input) => {
    const token = process.env["MERCADO_PAGO_ACCESS_TOKEN"];
    if (!token) return unsupported("mercadopago", "Pix");
    try {
      const response = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${input.orderCode}-pix`,
        },
        body: JSON.stringify({
          transaction_amount: Number(input.amount.toFixed(2)),
          description: input.description,
          payment_method_id: "pix",
          date_of_expiration: minutesFromNow(input.expiresMinutes),
          payer: { email: input.payerEmail || "cliente@oseupedido.com.br", first_name: input.payerName },
        }),
      });
      const json = (await response.json()) as {
        id?: number;
        status?: string;
        point_of_interaction?: { transaction_data?: { qr_code?: string } };
        message?: string;
      };
      if (!response.ok || !json.id) {
        return { ...unsupported("mercadopago", "Pix"), error: json.message ?? "Falha ao criar cobrança." };
      }
      return {
        provider: "mercadopago",
        status: json.status === "approved" ? "paid" : "pending",
        externalId: String(json.id),
        pixPayload: json.point_of_interaction?.transaction_data?.qr_code ?? null,
        checkoutUrl: null,
        expiresAt: minutesFromNow(input.expiresMinutes),
        feeAmount: 0,
      };
    } catch {
      return { ...unsupported("mercadopago", "Pix"), error: "Provedor indisponível no momento." };
    }
  },
  createCardCharge: async (input) => {
    const token = process.env["MERCADO_PAGO_ACCESS_TOKEN"];
    if (!token) return unsupported("mercadopago", "Cartão online");
    try {
      const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ title: input.description, quantity: 1, unit_price: Number(input.amount.toFixed(2)), currency_id: "BRL" }],
          external_reference: input.orderCode,
          back_urls: input.returnUrl ? { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl } : undefined,
        }),
      });
      const json = (await response.json()) as { id?: string; init_point?: string; message?: string };
      if (!response.ok || !json.init_point) {
        return { ...unsupported("mercadopago", "Cartão online"), error: json.message ?? "Falha ao criar checkout." };
      }
      return {
        provider: "mercadopago",
        status: "pending",
        externalId: json.id ?? null,
        pixPayload: null,
        checkoutUrl: json.init_point,
        expiresAt: minutesFromNow(input.expiresMinutes),
        feeAmount: 0,
      };
    } catch {
      return { ...unsupported("mercadopago", "Cartão online"), error: "Provedor indisponível no momento." };
    }
  },
  refund: async (externalId, amount) => {
    const token = process.env["MERCADO_PAGO_ACCESS_TOKEN"];
    if (!token) return { ok: false, refundedAmount: 0, error: "Gateway não configurado." };
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${externalId}/refunds`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount.toFixed(2)) }),
    });
    if (!response.ok) return { ok: false, refundedAmount: 0, error: "Falha ao estornar." };
    return { ok: true, refundedAmount: amount };
  },
  verifyWebhook: async (headers, rawBody) => {
    const secret = process.env["MERCADO_PAGO_WEBHOOK_SECRET"];
    if (!secret) return false;
    const header = headers.get("x-signature") ?? "";
    const requestId = headers.get("x-request-id") ?? "";
    const parts = Object.fromEntries(
      header.split(",").map((part) => part.split("=").map((piece) => piece.trim()) as [string, string]),
    );
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;
    let dataId = "";
    try {
      dataId = String((JSON.parse(rawBody) as { data?: { id?: string | number } }).data?.id ?? "");
    } catch {
      return false;
    }
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    return safeEqual(await hmacHex(secret, manifest), v1);
  },
  parseWebhook: async (rawBody) => {
    const body = JSON.parse(rawBody) as { id?: string | number; type?: string; action?: string; data?: { id?: string | number } };
    const externalId = body.data?.id ? String(body.data.id) : null;
    const token = process.env["MERCADO_PAGO_ACCESS_TOKEN"];
    let kind: WebhookKind = "unknown";
    let amount: number | null = null;
    let feeAmount: number | null = null;
    let refundedAmount: number | null = null;

    if (token && externalId) {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${externalId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const payment = (await response.json()) as {
          status?: string;
          transaction_amount?: number;
          transaction_amount_refunded?: number;
          fee_details?: { amount?: number }[];
        };
        amount = payment.transaction_amount ?? null;
        feeAmount = (payment.fee_details ?? []).reduce((sum, fee) => sum + Number(fee.amount ?? 0), 0);
        refundedAmount = payment.transaction_amount_refunded ?? null;
        if (payment.status === "approved") kind = "paid";
        else if (payment.status === "refunded" || payment.status === "charged_back") kind = "refunded";
        else if (payment.status === "cancelled") kind = "expired";
        else if (payment.status === "rejected") kind = "failed";
      }
    }

    return {
      eventId: String(body.id ?? `${externalId}-${body.action ?? body.type ?? "event"}`),
      kind,
      externalId,
      amount,
      feeAmount,
      refundedAmount,
    };
  },
};

/** ---------- Stripe ---------- */

const stripeGateway: PaymentGateway = {
  id: "stripe",
  supportsCard: true,
  isConfigured: () => Boolean(process.env["STRIPE_SECRET_KEY"]),
  createPixCharge: async (input) =>
    // Pix na Stripe depende de habilitação específica da conta; enquanto isso,
    // o Pix da loja continua saindo pela chave cadastrada.
    manualGateway.createPixCharge(input),
  createCardCharge: async (input) => {
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) return unsupported("stripe", "Cartão online");
    try {
      const body = new URLSearchParams({
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "brl",
        "line_items[0][price_data][unit_amount]": String(Math.round(input.amount * 100)),
        "line_items[0][price_data][product_data][name]": input.description,
        client_reference_id: input.orderCode,
      });
      if (input.returnUrl) {
        body.set("success_url", input.returnUrl);
        body.set("cancel_url", input.returnUrl);
      }
      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `${input.orderCode}-card`,
        },
        body,
      });
      const json = (await response.json()) as { id?: string; url?: string; error?: { message?: string } };
      if (!response.ok || !json.url) {
        return { ...unsupported("stripe", "Cartão online"), error: json.error?.message ?? "Falha ao criar checkout." };
      }
      return {
        provider: "stripe",
        status: "pending",
        externalId: json.id ?? null,
        pixPayload: null,
        checkoutUrl: json.url,
        expiresAt: minutesFromNow(input.expiresMinutes),
        feeAmount: 0,
      };
    } catch {
      return { ...unsupported("stripe", "Cartão online"), error: "Provedor indisponível no momento." };
    }
  },
  refund: async (externalId, amount) => {
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) return { ok: false, refundedAmount: 0, error: "Gateway não configurado." };
    const response = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ payment_intent: externalId, amount: String(Math.round(amount * 100)) }),
    });
    if (!response.ok) return { ok: false, refundedAmount: 0, error: "Falha ao estornar." };
    return { ok: true, refundedAmount: amount };
  },
  verifyWebhook: async (headers, rawBody) => {
    const secret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!secret) return false;
    const header = headers.get("stripe-signature") ?? "";
    const parts = Object.fromEntries(
      header.split(",").map((part) => part.split("=").map((piece) => piece.trim()) as [string, string]),
    );
    const timestamp = parts["t"];
    const signature = parts["v1"];
    if (!timestamp || !signature) return false;
    // Rejeita eventos antigos (proteção contra replay).
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
    return safeEqual(await hmacHex(secret, `${timestamp}.${rawBody}`), signature);
  },
  parseWebhook: async (rawBody) => {
    const body = JSON.parse(rawBody) as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const object = body.data?.object ?? {};
    const type = body.type ?? "";
    let kind: WebhookKind = "unknown";
    if (type === "checkout.session.completed" || type === "payment_intent.succeeded") kind = "paid";
    else if (type === "payment_intent.payment_failed") kind = "failed";
    else if (type === "checkout.session.expired") kind = "expired";
    else if (type === "charge.refunded") kind = "refunded";

    const amountTotal = Number(object["amount_total"] ?? object["amount"] ?? 0) / 100;
    const refunded = Number(object["amount_refunded"] ?? 0) / 100;

    return {
      eventId: body.id ?? crypto.randomUUID(),
      kind,
      externalId: String(object["id"] ?? object["payment_intent"] ?? ""),
      amount: amountTotal || null,
      feeAmount: null,
      refundedAmount: refunded || null,
    };
  },
};

const GATEWAYS: Record<ProviderId, PaymentGateway> = {
  manual: manualGateway,
  mercadopago: mercadoPagoGateway,
  stripe: stripeGateway,
};

export function getGateway(provider: string): PaymentGateway {
  return GATEWAYS[(provider as ProviderId) in GATEWAYS ? (provider as ProviderId) : "manual"];
}

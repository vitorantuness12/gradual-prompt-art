import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Funções públicas do fluxo de compra do cliente (sem login).
 * Rodam no servidor para não expor tabelas sensíveis: devolvem apenas
 * os campos necessários e sempre exigem identificação (telefone ou e-mail).
 */

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** ---------- Cupom ---------- */

const couponInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  code: z.string().trim().min(2).max(40),
  subtotal: z.number().nonnegative(),
});

export interface CouponResult {
  ok: boolean;
  message: string;
  /** Classifica a recusa (cupom inválido, expirado, loja errada etc.). */
  reason?: "not_found" | "inactive" | "not_started" | "expired" | "usage_limit" | "min_order";
  code?: string;
  discount?: number;
}

export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => couponInput.parse(data))
  .handler(async ({ data }): Promise<CouponResult> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } =
      await import("@/lib/security.server");
    const limit = await consumeRateLimit(
      "coupon",
      `${clientIdentifier(getRequest()?.headers)}:${data.storeSlug}`,
    );
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return { ok: false, message: "Loja não encontrada." };

    const { data: promo } = await supabaseAdmin
      .from("promotions")
      .select(
        "code, discount_type, discount_value, min_order_value, starts_at, ends_at, usage_limit, used_count, is_active",
      )
      .eq("store_id", store.id)
      .eq("code", data.code.trim().toUpperCase())
      .maybeSingle();

    const { evaluateCoupon } = await import("@/lib/orders");
    return evaluateCoupon(promo, data.subtotal);
  });

/** ---------- Conta do cliente (histórico + saldo) ---------- */

const accountInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
});

export interface PastOrderItem {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
}

export interface PastOrder {
  code: string;
  status: string;
  type: string;
  createdAt: string;
  total: number;
  items: PastOrderItem[];
}

export interface CustomerAccount {
  orders: PastOrder[];
  /** Cashback acumulado (2% dos pedidos concluídos) menos o que já foi usado. */
  cashback: number;
  /** Pedidos concluídos usados no cálculo do programa de fidelidade. */
  completedCount: number;
}

const CASHBACK_RATE = 0.02;

export const customerAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => accountInput.parse(data))
  .handler(async ({ data }): Promise<CustomerAccount> => {
    const empty: CustomerAccount = { orders: [], cashback: 0, completedCount: 0 };
    const digits = onlyDigits(data.phone ?? "");
    const email = (data.email ?? "").trim().toLowerCase();
    if (digits.length < 8 && email.length < 5) return empty;

    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return empty;

    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select(
        "code, status, type, created_at, total, customer_phone, customer_email, cashback_used, credits_used, order_items(product_id, product_name, quantity, unit_price, notes)",
      )
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) return empty;

    const mine = (rows ?? []).filter((row) => {
      const byPhone = digits.length >= 8 && onlyDigits(row.customer_phone ?? "") === digits;
      const byEmail = email.length >= 5 && (row.customer_email ?? "").toLowerCase() === email;
      return byPhone || byEmail;
    });

    const finished = mine.filter((row) =>
      ["delivered", "picked_up", "completed"].includes(row.status),
    );
    const earned = finished.reduce((sum, row) => sum + Number(row.total) * CASHBACK_RATE, 0);
    const used = mine.reduce(
      (sum, row) => sum + Number(row.cashback_used ?? 0) + Number(row.credits_used ?? 0),
      0,
    );

    return {
      completedCount: finished.length,
      cashback: Math.max(0, Math.round((earned - used) * 100) / 100),
      orders: mine.slice(0, 5).map((row) => ({
        code: row.code,
        status: row.status,
        type: row.type,
        createdAt: row.created_at,
        total: Number(row.total),
        items: (row.order_items ?? []).map((item) => ({
          productId: item.product_id,
          name: item.product_name,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          notes: item.notes,
        })),
      })),
    };
  });

/** ---------- Proteção do checkout ---------- */

const checkoutGuardInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(30).default(""),
});

/**
 * Chamado antes de gravar o pedido: limita rajadas de checkout por IP e
 * telefone e recusa telefones bloqueados manualmente pela loja.
 * A gravação em si continua protegida por RLS.
 */
export const checkoutGuard = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => checkoutGuardInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } =
      await import("@/lib/security.server");
    const ip = clientIdentifier(getRequest()?.headers);
    const phone = data.phone.replace(/\D/g, "");
    const identifier = `${ip}:${data.storeSlug}:${phone.slice(-11)}`;
    const limit = await consumeRateLimit("checkout", identifier);
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    if (phone.length >= 8) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: store } = await supabaseAdmin
        .from("stores")
        .select("id")
        .eq("slug", data.storeSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (store) {
        const { data: blocked } = await supabaseAdmin.rpc("is_customer_blocked", {
          _store_id: store.id,
          _phone: phone,
        });
        if (blocked === true) {
          return {
            ok: false,
            message:
              "Não é possível concluir pedidos com este telefone no momento. Fale com a loja para revisar a situação.",
          };
        }
      }
    }

    return { ok: true, message: "" };
  });

/** ---------- Proteção do login ---------- */

const loginGuardInput = z.object({
  email: z.string().trim().email().max(160),
  kind: z.enum(["login", "signup"]).default("login"),
});

export const authGuard = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginGuardInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } =
      await import("@/lib/security.server");
    const ip = clientIdentifier(getRequest()?.headers);
    const limit = await consumeRateLimit(data.kind, `${ip}:${data.email.toLowerCase()}`);
    return limit.allowed
      ? { ok: true, message: "" }
      : { ok: false, message: rateLimitMessage(limit) };
  });

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Funções de apoio ao login unificado.
 * Rodam no servidor para não expor e-mails nem tentativas de acesso ao cliente.
 */

const identifierInput = z.object({
  identifier: z.string().trim().min(3).max(120),
});

export interface ResolveIdentifierResult {
  ok: boolean;
  email?: string;
  message?: string;
}

/** Converte telefone em e-mail de login (o Supabase autentica por e-mail). */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => identifierInput.parse(data))
  .handler(async ({ data }): Promise<ResolveIdentifierResult> => {
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );
    const limit = await consumeRateLimit("login", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const value = data.identifier.trim();
    if (value.includes("@")) return { ok: true, email: value.toLowerCase() };

    const phone = value.replace(/\D/g, "");
    if (phone.length < 10) {
      return { ok: false, message: "Informe um e-mail válido ou um telefone com DDD." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tables = ["customer_profiles", "delivery_profiles", "merchant_profiles"] as const;
    for (const table of tables) {
      const { data: row } = await supabaseAdmin
        .from(table)
        .select("email, phone")
        .eq("phone", phone)
        .not("email", "is", null)
        .limit(1)
        .maybeSingle();
      if (row?.email) return { ok: true, email: row.email };
    }
    return { ok: false, message: "Não encontramos uma conta com esse telefone." };
  });

const attemptInput = z.object({
  identifier: z.string().trim().min(1).max(120),
  success: z.boolean(),
  profileKind: z.string().trim().max(20).optional(),
});

/** Guarda a tentativa de login para auditoria e bloqueio por excesso. */
export const recordLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => attemptInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; blocked?: boolean; message?: string }> => {
    const headers = getRequest()?.headers;
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("login_attempts").insert({
      identifier: data.identifier.toLowerCase(),
      ip_address: clientIdentifier(headers),
      user_agent: headers?.get("user-agent") ?? null,
      profile_kind: data.profileKind ?? null,
      success: data.success,
    });

    if (data.success) return { ok: true };

    const limit = await consumeRateLimit("login", data.identifier.toLowerCase());
    if (!limit.allowed) {
      return { ok: false, blocked: true, message: rateLimitMessage(limit) };
    }
    return { ok: true };
  });

/** ---------- Histórico do cliente logado ---------- */

export interface MyOrderSummary {
  id: string;
  code: string;
  status: string;
  type: string;
  total: number;
  createdAt: string;
  storeName: string;
  storeSlug: string;
}

/** Pedidos feitos pelo telefone do cliente logado, em todas as lojas. */
export const myCustomerOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyOrderSummary[]> => {
    const { data: profile } = await context.supabase
      .from("customer_profiles")
      .select("phone")
      .eq("user_id", context.userId)
      .maybeSingle();

    const phone = (profile?.phone ?? "").replace(/\D/g, "");
    if (phone.length < 8) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("orders")
      .select("id, code, status, type, total, created_at, customer_phone, store:stores(name, slug)")
      .order("created_at", { ascending: false })
      .limit(200);

    return (rows ?? [])
      .filter((row) => (row.customer_phone ?? "").replace(/\D/g, "") === phone)
      .slice(0, 30)
      .map((row) => ({
        id: row.id,
        code: row.code,
        status: row.status as string,
        type: row.type as string,
        total: Number(row.total),
        createdAt: row.created_at,
        storeName: (row.store as { name: string } | null)?.name ?? "Loja",
        storeSlug: (row.store as { slug: string } | null)?.slug ?? "",
      }));
  });

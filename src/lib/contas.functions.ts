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
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } =
      await import("@/lib/security.server");
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
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } =
      await import("@/lib/security.server");
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
  publicToken: string;
}

export interface MySavedAddress {
  id: string;
  label: string;
  street: string;
  number: string | null;
  complement: string | null;
  reference: string | null;
  district: string | null;
  city: string;
  state: string | null;
  zipCode: string | null;
  isDefault: boolean;
}

export interface CustomerDashboardData {
  profile: {
    fullName: string;
    email: string;
    phone: string;
    birthDate: string | null;
    marketingOptIn: boolean;
  } | null;
  orders: MyOrderSummary[];
  addresses: MySavedAddress[];
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
      .select(
        "id, code, status, type, total, created_at, customer_phone, public_token, store:stores(name, slug)",
      )
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
        publicToken: row.public_token,
      }));
  });

export const getCustomerDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomerDashboardData> => {
    const [
      { data: profile, error: profileError },
      { data: orders, error: ordersError },
      { data: addresses, error: addressesError },
    ] = await Promise.all([
      context.supabase
        .from("customer_profiles")
        .select("full_name, email, phone, birth_date, marketing_opt_in")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("orders")
        .select("id, code, status, type, total, created_at, public_token, store:stores(name, slug)")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("saved_addresses")
        .select(
          "id, label, street, number, complement, reference, district, city, state, zip_code, is_default",
        )
        .eq("user_id", context.userId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    const error = profileError ?? ordersError ?? addressesError;
    if (error) throw new Error("Não foi possível carregar sua conta agora.");

    return {
      profile: profile
        ? {
            fullName: profile.full_name,
            email: profile.email ?? String(context.claims.email ?? ""),
            phone: profile.phone ?? "",
            birthDate: profile.birth_date,
            marketingOptIn: profile.marketing_opt_in,
          }
        : null,
      orders: (orders ?? []).map((order) => ({
        id: order.id,
        code: order.code,
        status: order.status,
        type: order.type,
        total: Number(order.total),
        createdAt: order.created_at,
        storeName: (order.store as { name: string } | null)?.name ?? "Loja",
        storeSlug: (order.store as { slug: string } | null)?.slug ?? "",
        publicToken: order.public_token,
      })),
      addresses: (addresses ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        street: item.street,
        number: item.number,
        complement: item.complement,
        reference: item.reference,
        district: item.district,
        city: item.city,
        state: item.state,
        zipCode: item.zip_code,
        isDefault: item.is_default,
      })),
    };
  });

const addressInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(40),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().max(30).optional(),
  complement: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(160).optional(),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().max(40).optional(),
  zipCode: z.string().trim().max(20).optional(),
  makeDefault: z.boolean(),
});

export const saveMyAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addressInput.parse(data))
  .handler(async ({ data, context }) => {
    const values = {
      user_id: context.userId,
      label: data.label,
      street: data.street,
      number: data.number || null,
      complement: data.complement || null,
      reference: data.reference || null,
      district: data.district || null,
      city: data.city,
      state: data.state || null,
      zip_code: data.zipCode?.replace(/\D/g, "") || null,
      is_default: data.makeDefault ? false : undefined,
    };

    const query = data.id
      ? context.supabase
          .from("saved_addresses")
          .update(values)
          .eq("id", data.id)
          .eq("user_id", context.userId)
          .select("id")
          .single()
      : context.supabase.from("saved_addresses").insert(values).select("id").single();
    const { data: savedAddress, error } = await query;
    if (error) throw new Error("Não foi possível salvar o endereço.");

    if (data.makeDefault) {
      const { error: defaultError } = await context.supabase.rpc("set_my_default_address", {
        _address_id: savedAddress.id,
      });
      if (defaultError) throw new Error("O endereço foi salvo, mas não pôde ser definido como principal.");
    }
    return { ok: true };
  });

export const setMyDefaultAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_my_default_address", {
      _address_id: data.id,
    });
    if (error) throw new Error("Não foi possível alterar o endereço principal.");
    return { ok: true };
  });

export const deleteMyAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("delete_my_saved_address", {
      _address_id: data.id,
    });
    if (error) throw new Error("Não foi possível excluir o endereço.");
    return { ok: true };
  });

export const saveCustomerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(10).max(14),
        birthDate: z.string().date().nullable(),
        marketingOptIn: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("customer_profiles").upsert({
      user_id: context.userId,
      full_name: data.fullName,
      phone: data.phone.replace(/\D/g, ""),
      birth_date: data.birthDate,
      marketing_opt_in: data.marketingOptIn,
    });
    if (error) throw new Error("Não foi possível atualizar seus dados.");
    return { ok: true };
  });

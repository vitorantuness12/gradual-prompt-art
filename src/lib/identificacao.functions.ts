import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Identificação do cliente por telefone no checkout.
 *
 * Regras de segurança aplicadas aqui (nunca no navegador):
 * - a busca é sempre por `store_id` + telefone normalizado (isolamento por loja);
 * - resposta genérica quando o telefone não existe, para impedir varredura;
 * - limite de tentativas por IP + loja;
 * - quando a loja exige verificação por código, os dados só são liberados
 *   depois que o telefone estiver verificado (fluxo da próxima fase).
 */

export interface CheckoutSettings {
  requirePhone: boolean;
  allowGuest: boolean;
  allowQuickRegister: boolean;
  requireVerification: boolean;
  allowPhoneLookup: boolean;
  allowPublicTracking: boolean;
  allowRepeatOrder: boolean;
  trackingLinkDays: number;
  requireEmail: boolean;
  requireFullAddress: boolean;
}

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  requirePhone: true,
  allowGuest: true,
  allowQuickRegister: true,
  requireVerification: false,
  allowPhoneLookup: true,
  allowPublicTracking: true,
  allowRepeatOrder: true,
  trackingLinkDays: 30,
  requireEmail: false,
  requireFullAddress: true,
};

export interface CustomerAddressOption {
  id: string;
  label: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  reference: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  isDefault: boolean;
}

export interface IdentifyResult {
  /** Telefone aceito pela validação brasileira. */
  valid: boolean;
  /** Existe cadastro deste telefone nesta loja. */
  found: boolean;
  /** A loja exige código antes de liberar os dados salvos. */
  needsVerification: boolean;
  phoneE164: string;
  message: string;
  customer: {
    firstName: string;
    name: string | null;
    email: string | null;
    preferredFulfillment: string | null;
    addresses: CustomerAddressOption[];
  } | null;
}

const identifyInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(8).max(30),
});

async function loadStore(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("stores")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

async function loadSettings(storeId: string): Promise<CheckoutSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_checkout_settings")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!data) return DEFAULT_CHECKOUT_SETTINGS;
  return {
    requirePhone: data.require_phone,
    allowGuest: data.allow_guest,
    allowQuickRegister: data.allow_quick_register,
    requireVerification: data.require_verification,
    allowPhoneLookup: data.allow_phone_lookup,
    allowPublicTracking: data.allow_public_tracking,
    allowRepeatOrder: data.allow_repeat_order,
    trackingLinkDays: data.tracking_link_days,
    requireEmail: data.require_email,
    requireFullAddress: data.require_full_address,
  };
}

/** Preferências públicas do checkout (usadas para montar o formulário). */
export const getCheckoutSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ storeSlug: z.string().trim().min(1).max(60) }).parse(data))
  .handler(async ({ data }): Promise<CheckoutSettings> => {
    const store = await loadStore(data.storeSlug);
    if (!store) return DEFAULT_CHECKOUT_SETTINGS;
    return loadSettings(store.id);
  });

export const identifyPhone = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => identifyInput.parse(data))
  .handler(async ({ data }): Promise<IdentifyResult> => {
    const { normalizePhoneBR } = await import("@/lib/phone");
    const phone = normalizePhoneBR(data.phone);

    const base: IdentifyResult = {
      valid: phone.ok,
      found: false,
      needsVerification: false,
      phoneE164: phone.e164,
      message: phone.ok ? "" : phone.message,
      customer: null,
    };
    if (!phone.ok) return base;

    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );
    const limit = await consumeRateLimit(
      "identify",
      `${clientIdentifier(getRequest()?.headers)}:${data.storeSlug}`,
    );
    if (!limit.allowed) return { ...base, message: rateLimitMessage(limit) };

    const store = await loadStore(data.storeSlug);
    if (!store) return { ...base, message: "Loja não encontrada." };

    const settings = await loadSettings(store.id);
    if (!settings.allowPhoneLookup) return base;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("id, name, email, phone_verified_at, preferences")
      .eq("store_id", store.id)
      .eq("phone_e164", phone.e164)
      .maybeSingle();

    if (!customer) return base;

    const verified = Boolean(customer.phone_verified_at);
    if (settings.requireVerification && !verified) {
      return {
        ...base,
        found: true,
        needsVerification: true,
        message: "Encontramos um cadastro. Confirme o código enviado para liberar seus dados.",
        customer: {
          firstName: (customer.name ?? "").trim().split(" ")[0] ?? "",
          name: null,
          email: null,
          preferredFulfillment: null,
          addresses: [],
        },
      };
    }

    const { data: addresses } = await supabaseAdmin
      .from("customer_addresses")
      .select("id, label, street, number, complement, reference, district, city, state, zip_code, is_default")
      .eq("store_id", store.id)
      .eq("customer_id", customer.id)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(6);

    const preferences = (customer.preferences ?? {}) as { fulfillment?: string };

    return {
      ...base,
      found: true,
      message: "Encontramos seus dados. Confirme para continuar.",
      customer: {
        firstName: (customer.name ?? "").trim().split(" ")[0] ?? "",
        name: customer.name ?? null,
        email: customer.email ?? null,
        preferredFulfillment: preferences.fulfillment ?? null,
        addresses: (addresses ?? []).map((row) => ({
          id: row.id,
          label: row.label,
          street: row.street,
          number: row.number,
          complement: row.complement,
          reference: row.reference,
          district: row.district,
          city: row.city,
          state: row.state,
          zipCode: row.zip_code,
          isDefault: row.is_default,
        })),
      },
    };
  });

/** ---------- Cadastro rápido / atualização no fechamento do pedido ---------- */

const saveInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(8).max(30),
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().max(160).optional(),
  fulfillment: z.string().trim().max(20).optional(),
  acceptedTerms: z.boolean(),
  marketingOptIn: z.boolean().default(false),
  createProfile: z.boolean().default(true),
  address: z
    .object({
      street: z.string().trim().max(160).optional(),
      number: z.string().trim().max(30).optional(),
      complement: z.string().trim().max(120).optional(),
      reference: z.string().trim().max(160).optional(),
      district: z.string().trim().max(120).optional(),
      city: z.string().trim().max(120).optional(),
      state: z.string().trim().max(40).optional(),
      zipCode: z.string().trim().max(20).optional(),
    })
    .optional(),
});

export interface SaveIdentityResult {
  ok: boolean;
  created: boolean;
  message: string;
  customerId: string | null;
}

export const saveCheckoutIdentity = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data }): Promise<SaveIdentityResult> => {
    const fail = (message: string): SaveIdentityResult => ({
      ok: false,
      created: false,
      message,
      customerId: null,
    });

    const { normalizePhoneBR } = await import("@/lib/phone");
    const phone = normalizePhoneBR(data.phone);
    if (!phone.ok) return fail(phone.message);
    if (!data.acceptedTerms) {
      return fail("É necessário aceitar os Termos de Uso e a Política de Privacidade.");
    }

    const { clientIdentifier, consumeRateLimit, rateLimitMessage, sanitizeText } = await import(
      "@/lib/security.server"
    );
    const ip = clientIdentifier(getRequest()?.headers);
    const limit = await consumeRateLimit("signup", `${ip}:${data.storeSlug}:${phone.e164}`, {
      limit: 20,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return fail(rateLimitMessage(limit));

    const store = await loadStore(data.storeSlug);
    if (!store) return fail("Loja não encontrada.");

    const settings = await loadSettings(store.id);
    const email = (data.email ?? "").trim().toLowerCase();
    if (settings.requireEmail && email.length < 5) return fail("Esta loja pede um e-mail válido.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const name = sanitizeText(data.name, 120);

    // Nunca cria duas contas para o mesmo telefone dentro da mesma loja.
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id, preferences")
      .eq("store_id", store.id)
      .eq("phone_e164", phone.e164)
      .maybeSingle();

    let customerId = existing?.id ?? null;
    let created = false;

    if (!data.createProfile && !existing) {
      // Compra como visitante: registra apenas o aceite, sem criar cadastro.
      await supabaseAdmin.from("customer_consents").insert([
        { store_id: store.id, phone_e164: phone.e164, kind: "terms", accepted: true, source: "checkout" },
        { store_id: store.id, phone_e164: phone.e164, kind: "privacy", accepted: true, source: "checkout" },
      ]);
      return { ok: true, created: false, message: "", customerId: null };
    }

    const preferences = {
      ...((existing?.preferences ?? {}) as Record<string, unknown>),
      ...(data.fulfillment ? { fulfillment: data.fulfillment } : {}),
    };

    if (existing) {
      await supabaseAdmin
        .from("customers")
        .update({
          name,
          email: email || null,
          phone: phone.e164,
          phone_e164: phone.e164,
          marketing_opt_in: data.marketingOptIn,
          preferences,
        })
        .eq("id", existing.id);
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("customers")
        .insert({
          store_id: store.id,
          name,
          phone: phone.e164,
          phone_e164: phone.e164,
          email: email || null,
          marketing_opt_in: data.marketingOptIn,
          preferences,
        })
        .select("id")
        .single();
      if (error || !inserted) return fail("Não foi possível salvar seu cadastro agora.");
      customerId = inserted.id;
      created = true;
    }

    if (customerId && data.address && (data.address.street || data.address.zipCode)) {
      await supabaseAdmin
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", customerId);
      await supabaseAdmin.from("customer_addresses").insert({
        store_id: store.id,
        customer_id: customerId,
        label: "Entrega",
        street: data.address.street ?? null,
        number: data.address.number ?? null,
        complement: data.address.complement ?? null,
        reference: data.address.reference ?? null,
        district: data.address.district ?? null,
        city: data.address.city ?? null,
        state: data.address.state ?? null,
        zip_code: data.address.zipCode ?? null,
        is_default: true,
      });
    }

    if (customerId) {
      await supabaseAdmin.from("customer_consents").insert([
        { store_id: store.id, customer_id: customerId, phone_e164: phone.e164, kind: "terms", accepted: true, source: "checkout" },
        { store_id: store.id, customer_id: customerId, phone_e164: phone.e164, kind: "privacy", accepted: true, source: "checkout" },
        { store_id: store.id, customer_id: customerId, phone_e164: phone.e164, kind: "marketing", accepted: data.marketingOptIn, source: "checkout" },
      ]);
    }

    return {
      ok: true,
      created,
      message: created
        ? "Cadastro criado. Você poderá acompanhar seus pedidos e repetir compras usando este telefone."
        : "",
      customerId,
    };
  });

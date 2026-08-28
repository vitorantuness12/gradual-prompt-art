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
  /** É preciso confirmar um código antes de liberar os dados salvos. */
  needsVerification: boolean;
  phoneE164: string;
  message: string;
  /** E-mail parcialmente oculto, quando o cadastro tiver um. */
  emailMasked: string | null;
  /** Canais disponíveis para receber o código de confirmação. */
  channels: { whatsapp: boolean; email: boolean };
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

/**
 * Busca o cadastro pelo telefone. Nunca devolve dados pessoais aqui: quando o
 * telefone já tem cadastro, exigimos a confirmação de um código (WhatsApp ou
 * e-mail, à escolha do cliente) antes de liberar nome, e-mail e endereços.
 */
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
      emailMasked: null,
      channels: { whatsapp: false, email: false },
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
      .select("id, name, email")
      .eq("store_id", store.id)
      .eq("phone_e164", phone.e164)
      .maybeSingle();

    if (!customer) return base;

    const { maskEmail } = await import("@/lib/identificacao.server");
    const emailMasked = maskEmail(customer.email);

    return {
      ...base,
      found: true,
      needsVerification: true,
      emailMasked,
      channels: { whatsapp: true, email: Boolean(emailMasked) },
      message: "Encontramos um cadastro com este telefone. Para sua segurança, confirme um código.",
      customer: {
        firstName: (customer.name ?? "").trim().split(" ")[0] ?? "",
        name: null,
        email: null,
        preferredFulfillment: null,
        addresses: [],
      },
    };
  });

/** ---------- Confirmação de identidade por código (WhatsApp ou e-mail) ---------- */

const codeChannel = z.enum(["whatsapp", "email"]);

export interface RequestIdentifyCodeResult {
  ok: boolean;
  channel: "whatsapp" | "email" | null;
  message: string;
}

/** Envia um código de 6 dígitos pelo canal escolhido pelo cliente. */
export const requestIdentifyCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    identifyInput.extend({ channel: codeChannel }).parse(data),
  )
  .handler(async ({ data }): Promise<RequestIdentifyCodeResult> => {
    const { normalizePhoneBR } = await import("@/lib/phone");
    const phone = normalizePhoneBR(data.phone);
    if (!phone.ok) return { ok: false, channel: null, message: phone.message };

    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );
    const limit = await consumeRateLimit("login", `${clientIdentifier(getRequest()?.headers)}:${phone.e164}`, {
      limit: 5,
      windowSeconds: 900,
    });
    if (!limit.allowed) return { ok: false, channel: null, message: rateLimitMessage(limit) };

    const store = await loadStore(data.storeSlug);
    if (!store) return { ok: false, channel: null, message: "Loja não encontrada." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("id, name, email")
      .eq("store_id", store.id)
      .eq("phone_e164", phone.e164)
      .maybeSingle();

    // Resposta genérica: não revelamos se o telefone existe nesta loja.
    const generic: RequestIdentifyCodeResult = {
      ok: true,
      channel: data.channel,
      message:
        data.channel === "email"
          ? "Se houver cadastro, enviamos um código para o e-mail salvo. Ele vale por 10 minutos."
          : "Se houver cadastro, enviamos um código pelo WhatsApp. Ele vale por 10 minutos.",
    };
    if (!customer) return generic;
    if (data.channel === "email" && !customer.email) {
      return { ok: false, channel: null, message: "Este cadastro não tem e-mail salvo. Receba o código pelo WhatsApp." };
    }

    const helpers = await import("@/lib/acompanhamento.server");
    const code = helpers.generateCode();
    await helpers.storeVerificationCode(supabaseAdmin, `${store.id}:${phone.e164}`, code, data.channel);

    try {
      if (data.channel === "email" && customer.email) {
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        await sendTemplateEmail("verification-code", customer.email, {
          templateData: { code, storeName: store.name ?? "a loja", customerName: customer.name ?? "Olá" },
        });
      } else {
        const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");
        const outcome = await sendWhatsappMessage(supabaseAdmin, {
          storeId: store.id,
          phone: phone.e164,
          body: `Seu código de confirmação é ${code}. Ele vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem.`,
          messageType: "transactional",
          templateKey: "identificacao_codigo",
        });
        if (!outcome.ok) console.warn("[identificacao] envio do código:", outcome.message);
      }
    } catch (error) {
      console.error("[identificacao] falha ao enviar código", error);
    }

    return generic;
  });

/** Confere o código e libera nome, e-mail e endereços salvos. */
export const confirmIdentifyCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    identifyInput.extend({ code: z.string().trim().min(4).max(10) }).parse(data),
  )
  .handler(async ({ data }): Promise<IdentifyResult> => {
    const { normalizePhoneBR } = await import("@/lib/phone");
    const phone = normalizePhoneBR(data.phone);

    const base: IdentifyResult = {
      valid: phone.ok,
      found: false,
      needsVerification: true,
      phoneE164: phone.e164,
      message: phone.ok ? "" : phone.message,
      emailMasked: null,
      channels: { whatsapp: true, email: false },
      customer: null,
    };
    if (!phone.ok) return base;

    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import(
      "@/lib/security.server"
    );
    const limit = await consumeRateLimit("login", `${clientIdentifier(getRequest()?.headers)}:${phone.e164}:confirm`, {
      limit: 12,
      windowSeconds: 900,
    });
    if (!limit.allowed) return { ...base, message: rateLimitMessage(limit) };

    const store = await loadStore(data.storeSlug);
    if (!store) return { ...base, message: "Loja não encontrada." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("@/lib/acompanhamento.server");
    const check = await helpers.checkVerificationCode(supabaseAdmin, `${store.id}:${phone.e164}`, data.code);
    if (!check.ok) return { ...base, found: true, message: check.message };

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("id, name, email, preferences")
      .eq("store_id", store.id)
      .eq("phone_e164", phone.e164)
      .maybeSingle();
    if (!customer) return { ...base, message: "Cadastro não encontrado." };

    await supabaseAdmin
      .from("customers")
      .update({ phone_verified_at: new Date().toISOString() })
      .eq("id", customer.id);

    const { loadCustomerAddresses } = await import("@/lib/identificacao.server");
    const preferences = (customer.preferences ?? {}) as { fulfillment?: string };

    return {
      ...base,
      found: true,
      needsVerification: false,
      message: "Telefone confirmado. Seus dados foram liberados.",
      customer: {
        firstName: (customer.name ?? "").trim().split(" ")[0] ?? "",
        name: customer.name ?? null,
        email: customer.email ?? null,
        preferredFulfillment: preferences.fulfillment ?? null,
        addresses: await loadCustomerAddresses(supabaseAdmin, store.id, customer.id),
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

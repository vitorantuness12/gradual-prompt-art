import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const phoneSchema = z.string().trim().min(8).max(30);

export interface CheckoutCustomerSession {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  addresses: Array<{
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
  }>;
}

export const getCheckoutCustomer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CheckoutCustomerSession> => {
    const [{ data: profile }, { data: addresses }] = await Promise.all([
      context.supabase
        .from("customer_profiles")
        .select("full_name, email, phone")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("saved_addresses")
        .select("id, label, street, number, complement, reference, district, city, state, zip_code, is_default")
        .eq("user_id", context.userId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    if (!profile?.full_name || !profile.phone || !profile.email) {
      throw new Error("Complete seu perfil de cliente para continuar.");
    }

    return {
      userId: context.userId,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      addresses: (addresses ?? []).map((address) => ({
        id: address.id,
        label: address.label,
        street: address.street,
        number: address.number,
        complement: address.complement,
        reference: address.reference,
        district: address.district,
        city: address.city,
        state: address.state,
        zipCode: address.zip_code,
        isDefault: address.is_default,
      })),
    };
  });

const requestSchema = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  identifier: z.string().trim().min(5).max(160),
  channel: z.enum(["email", "whatsapp"]),
});

export const requestCheckoutCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => requestSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizePhoneBR } = await import("@/lib/phone");
    const { generateCode, storeVerificationCode, CODE_TTL_MINUTES } = await import("@/lib/acompanhamento.server");
    const { consumeRateLimit, rateLimitMessage } = await import("@/lib/security.server");

    const normalizedPhone = normalizePhoneBR(data.identifier);
    const identifier = data.identifier.trim().toLowerCase();
    const limit = await consumeRateLimit("login", `checkout:${identifier}`, { limit: 5, windowSeconds: 900 });
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit), retryAfterSeconds: 0 };

    const query = supabaseAdmin.from("customer_profiles").select("user_id, full_name, email, phone");
    const { data: profile } = data.channel === "email"
      ? await query.eq("email", identifier).maybeSingle()
      : normalizedPhone.ok
        ? await query.eq("phone", normalizedPhone.digits).maybeSingle()
        : { data: null };

    const generic = {
      ok: true,
      message: `Se a conta existir, enviaremos um código de 6 dígitos. Ele vale por ${CODE_TTL_MINUTES} minutos.`,
      retryAfterSeconds: 30,
    };
    if (!profile) return generic;

    const codeIdentifier = `checkout-login:${profile.user_id}`;
    const code = generateCode();
    const stored = await storeVerificationCode(supabaseAdmin, codeIdentifier, code, data.channel);
    if (!stored.ok) return { ok: false, message: stored.message, retryAfterSeconds: stored.retryAfterSeconds };

    if (data.channel === "email") {
      await (await import("@/lib/email-templates/send-email")).sendTemplateEmail("verification-code", profile.email, {
        templateData: { code, ttlMinutes: CODE_TTL_MINUTES, storeName: "Pedi Um", customerName: profile.full_name },
      });
    } else {
      const { data: store } = await supabaseAdmin.from("stores").select("id").eq("slug", data.storeSlug).maybeSingle();
      if (store) {
        await (await import("@/lib/whatsapp/send.server")).sendWhatsappMessage(supabaseAdmin, {
          storeId: store.id,
          phone: profile.phone,
          body: `Seu código de acesso ao Pedi Um é ${code}. Ele vale por ${CODE_TTL_MINUTES} minutos.`,
          messageType: "transactional",
          templateKey: "checkout_login",
        });
      }
    }
    return generic;
  });

export const confirmCheckoutCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => requestSchema.extend({ code: z.string().regex(/^\d{6}$/) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizePhoneBR } = await import("@/lib/phone");
    const phone = normalizePhoneBR(data.identifier);
    const query = supabaseAdmin.from("customer_profiles").select("user_id, email");
    const { data: profile } = data.channel === "email"
      ? await query.eq("email", data.identifier.trim().toLowerCase()).maybeSingle()
      : phone.ok
        ? await query.eq("phone", phone.digits).maybeSingle()
        : { data: null };
    if (!profile) return { ok: false, message: "Código inválido ou expirado.", tokenHash: null };

    const { checkVerificationCode } = await import("@/lib/acompanhamento.server");
    const checked = await checkVerificationCode(supabaseAdmin, `checkout-login:${profile.user_id}`, data.code);
    if (!checked.ok) return { ok: false, message: checked.message, tokenHash: null };

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });
    if (error || !link.properties.hashed_token) {
      return { ok: false, message: "Não foi possível iniciar sua sessão agora.", tokenHash: null };
    }
    return { ok: true, message: "Identidade confirmada.", tokenHash: link.properties.hashed_token };
  });

export const saveCheckoutAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    label: z.string().trim().min(1).max(40),
    street: z.string().trim().min(2).max(160),
    number: z.string().trim().max(30).optional(),
    complement: z.string().trim().max(120).optional(),
    reference: z.string().trim().max(160).optional(),
    district: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2).max(120),
    state: z.string().trim().max(40).optional(),
    zipCode: z.string().trim().max(20).optional(),
    makeDefault: z.boolean().default(false),
  }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.makeDefault) {
      await context.supabase.from("saved_addresses").update({ is_default: false }).eq("user_id", context.userId);
    }
    const { data: row, error } = await context.supabase.from("saved_addresses").insert({
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
      is_default: data.makeDefault,
    }).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Não foi possível salvar o endereço.");
    return { id: row.id };
  });
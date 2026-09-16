type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export interface AuthenticatedCheckoutCustomer {
  userId: string;
  customerId: string;
  name: string;
  email: string;
  phone: string;
}

/** Resolve a identidade exclusivamente pela sessão validada no servidor. */
export async function resolveAuthenticatedCheckoutCustomer(
  admin: Admin,
  userId: string,
  storeId: string,
): Promise<AuthenticatedCheckoutCustomer | null> {
  const { data: profile } = await admin
    .from("customer_profiles")
    .select("full_name, email, phone, marketing_opt_in")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.full_name || !profile.email || !profile.phone) return null;

  const phoneDigits = profile.phone.replace(/\D/g, "");
  const phoneE164 = phoneDigits.startsWith("55") ? `+${phoneDigits}` : `+55${phoneDigits}`;
  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await admin.from("customers").update({
      name: profile.full_name,
      email: profile.email,
      phone_e164: phoneE164,
      marketing_opt_in: profile.marketing_opt_in ?? false,
    }).eq("id", existing.id);
    return { userId, customerId: existing.id, name: profile.full_name, email: profile.email, phone: phoneE164 };
  }

  const { data: byPhone } = await admin
    .from("customers")
    .select("id, user_id")
    .eq("store_id", storeId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (byPhone?.user_id && byPhone.user_id !== userId) return null;

  if (byPhone) {
    const { error } = await admin.from("customers").update({
      user_id: userId,
      name: profile.full_name,
      email: profile.email,
      marketing_opt_in: profile.marketing_opt_in ?? false,
      phone_verified_at: new Date().toISOString(),
    }).eq("id", byPhone.id);
    if (error) return null;
    return { userId, customerId: byPhone.id, name: profile.full_name, email: profile.email, phone: phoneE164 };
  }

  const { data: created, error } = await admin.from("customers").insert({
    store_id: storeId,
    user_id: userId,
    name: profile.full_name,
    email: profile.email,
    phone_e164: phoneE164,
    marketing_opt_in: profile.marketing_opt_in ?? false,
    phone_verified_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !created) return null;
  return { userId, customerId: created.id, name: profile.full_name, email: profile.email, phone: phoneE164 };
}
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { consumeRateLimit, rateLimitMessage } from "@/lib/security.server";

const inviteInput = z.object({
  storeId: z.string().uuid(),
  fullName: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().min(10).max(15)),
  vehicleType: z.enum(["moto", "carro", "bicicleta", "outro"]),
  plate: z.string().trim().max(12).optional(),
  region: z.string().trim().max(120).optional(),
  pixKey: z.string().trim().min(3).max(160),
  commissionAmount: z.number().min(0).max(10000),
});
const tokenInput = z.object({ token: z.string().trim().min(32).max(128) });
const activateInput = tokenInput.extend({ password: z.string().min(8).max(72) });
const manageInput = z.object({ storeId: z.string().uuid(), linkId: z.string().uuid(), action: z.enum(["block", "reactivate", "remove", "resend"]) });

export interface CourierInvitePreview {
  ok: boolean;
  message: string;
  email?: string | undefined;
  fullName?: string | undefined;
  storeName?: string | undefined;
  expiresAt?: string | undefined;
  existingAccount?: boolean | undefined;
}

async function findAuthUserByEmail(email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Não foi possível verificar a conta do entregador.");
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function syncCourierAccess(linkId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link, error } = await supabaseAdmin.from("store_couriers").select("*").eq("id", linkId).single();
  if (error || !link) throw new Error("Convite não encontrado.");
  const details = (link.invite_data ?? {}) as Record<string, unknown>;
  const fullName = String(details["fullName"] ?? "Entregador");
  const vehicleType = String(details["vehicleType"] ?? "moto");
  const plate = typeof details["plate"] === "string" && details["plate"] ? details["plate"] : null;
  const pixKey = typeof details["pixKey"] === "string" ? details["pixKey"] : null;
  const now = new Date().toISOString();

  const { error: profileError } = await supabaseAdmin.from("delivery_profiles").upsert({
    user_id: userId, full_name: fullName, email: link.invite_email, phone: link.invite_phone,
    region: link.region, vehicle_type: vehicleType, plate, pix_key: pixKey, pix_key_type: "chave",
    status: "active", approved_at: now, approved_by: link.invited_by, terms_accepted_at: now,
  }, { onConflict: "user_id" });
  if (profileError) throw new Error(profileError.message);

  const { data: currentCourier } = await supabaseAdmin.from("couriers").select("id")
    .eq("store_id", link.store_id).eq("user_id", userId).maybeSingle();
  const payload = { store_id: link.store_id, user_id: userId, name: fullName, phone: link.invite_phone,
    vehicle: vehicleType, plate, areas: link.region ? [link.region] : [], is_active: true };
  const courierResult = currentCourier
    ? await supabaseAdmin.from("couriers").update(payload).eq("id", currentCourier.id)
    : await supabaseAdmin.from("couriers").insert(payload);
  if (courierResult.error) throw new Error(courierResult.error.message);

  const { error: linkError } = await supabaseAdmin.from("store_couriers").update({
    courier_user_id: userId, status: "approved", activated_at: now, approved_at: now,
    approved_by: link.invited_by, blocked_until: null, status_reason: null,
  }).eq("id", link.id);
  if (linkError) throw new Error(linkError.message);
}

async function sendCourierInvite(email: string, fullName: string, storeName: string, token: string) {
  const origin = process.env["PUBLIC_SITE_URL"] ?? "https://pedium.com.br";
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail("courier-invite", email, {
      templateData: { courierName: fullName, storeName, activationUrl: `${origin}/entregadores?convite=${encodeURIComponent(token)}` },
      idempotencyKey: `courier-invite:${token}`,
    });
    return result.sent;
  } catch { return false; }
}

async function loadInvitePreview(token: string): Promise<CourierInvitePreview> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin.from("store_couriers")
    .select("invite_email, invite_data, invitation_expires_at, status, store:stores(name)")
    .eq("invite_token", token).maybeSingle();
  if (!link) return { ok: false, message: "Convite não encontrado." };
  if (link.status !== "invited" && link.status !== "pending") return { ok: false, message: "Este convite não está mais disponível." };
  if (!link.invitation_expires_at || new Date(link.invitation_expires_at).getTime() < Date.now()) return { ok: false, message: "Este convite expirou. Peça um novo à loja." };
  const details = (link.invite_data ?? {}) as Record<string, unknown>;
  const existingAccount = link.invite_email ? Boolean(await findAuthUserByEmail(link.invite_email)) : false;
  return { ok: true, message: "Convite válido.", email: link.invite_email ?? undefined,
    fullName: String(details["fullName"] ?? "Entregador"), storeName: (link.store as { name?: string } | null)?.name ?? "Loja",
    expiresAt: link.invitation_expires_at, existingAccount };
}

export const createCourierInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((data: unknown) => inviteInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_store_role", { _store_id: data.storeId, _user_id: context.userId, _roles: ["owner", "manager"] });
    if (!allowed) throw new Error("Você não pode cadastrar entregadores nesta loja.");
    const limit = await consumeRateLimit("invite", `${context.userId}:${data.storeId}`);
    if (!limit.allowed) throw new Error(rateLimitMessage(limit));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: store } = await supabaseAdmin.from("stores").select("name").eq("id", data.storeId).single();
    const existingUser = await findAuthUserByEmail(data.email);
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const { data: existingLink } = await supabaseAdmin.from("store_couriers").select("id").eq("store_id", data.storeId)
      .ilike("invite_email", data.email).neq("status", "removed").maybeSingle();
    const payload = { store_id: data.storeId, courier_user_id: existingUser?.id ?? null,
      invite_email: data.email.toLowerCase(), invite_phone: data.phone, invite_token: token,
      invitation_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), invited_at: new Date().toISOString(),
      invited_by: context.userId, commission_amount: data.commissionAmount, region: data.region || null,
      status: "invited" as const, status_reason: null,
      invite_data: { fullName: data.fullName, vehicleType: data.vehicleType, plate: data.plate || null, pixKey: data.pixKey } };
    const result = existingLink
      ? await supabaseAdmin.from("store_couriers").update(payload).eq("id", existingLink.id).select("id").single()
      : await supabaseAdmin.from("store_couriers").insert(payload).select("id").single();
    if (result.error) throw new Error(result.error.message);
    await supabaseAdmin.from("audit_logs").insert({ store_id: data.storeId, user_id: context.userId, action: "courier.invited", entity: "store_couriers", entity_id: result.data.id, metadata: { email: data.email } });
    const emailed = await sendCourierInvite(data.email, data.fullName, store?.name ?? "sua loja", token);
    return { ok: true, emailed, token, message: emailed ? "Convite enviado por e-mail." : "Convite criado. Compartilhe o link com o entregador." };
  });

export const previewCourierInvite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data }) => loadInvitePreview(data.token));

export const activateNewCourierInvite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => activateInput.parse(data))
  .handler(async ({ data }) => {
    const limit = await consumeRateLimit("signup", `courier:${data.token.slice(0, 16)}`);
    if (!limit.allowed) throw new Error(rateLimitMessage(limit));
    const preview = await loadInvitePreview(data.token);
    if (!preview.ok || !preview.email) throw new Error(preview.message);
    if (preview.existingAccount) return { ok: false, existingAccount: true, email: preview.email, message: "Esta conta já existe. Entre com sua senha para aceitar o convite." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error: linkError } = await supabaseAdmin.from("store_couriers").select("id, invite_phone").eq("invite_token", data.token).single();
    if (linkError || !link) throw new Error("Convite não encontrado.");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email: preview.email, password: data.password,
      email_confirm: true, user_metadata: { full_name: preview.fullName, phone: link.invite_phone, account_kind: "motoboy" } });
    if (error || !created.user) throw new Error(error?.message ?? "Não foi possível criar a conta.");
    try { await syncCourierAccess(link.id, created.user.id); }
    catch (syncError) { await supabaseAdmin.auth.admin.deleteUser(created.user.id); throw syncError; }
    return { ok: true, existingAccount: false, email: preview.email, message: "Acesso ativado. Entre para começar." };
  });

export const acceptCourierInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data, context }) => {
    const email = typeof context.claims["email"] === "string" ? context.claims["email"].toLowerCase() : "";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin.from("store_couriers").select("id, invite_email, invitation_expires_at, status").eq("invite_token", data.token).maybeSingle();
    if (!link || !["invited", "pending"].includes(link.status)) throw new Error("Convite indisponível.");
    if (!link.invitation_expires_at || new Date(link.invitation_expires_at).getTime() < Date.now()) throw new Error("Convite expirado.");
    if (!email || email !== link.invite_email?.toLowerCase()) throw new Error(`Entre com a conta ${link.invite_email ?? "convidada"}.`);
    await syncCourierAccess(link.id, context.userId);
    return { ok: true, message: "Convite aceito. Suas entregas já estão disponíveis." };
  });

export const manageCourierLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((data: unknown) => manageInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_store_role", { _store_id: data.storeId, _user_id: context.userId, _roles: ["owner", "manager"] });
    if (!allowed) throw new Error("Você não pode alterar esta equipe.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin.from("store_couriers").select("*, store:stores(name)").eq("id", data.linkId).eq("store_id", data.storeId).single();
    if (!link) throw new Error("Vínculo não encontrado.");
    if (data.action === "resend") {
      const details = (link.invite_data ?? {}) as Record<string, unknown>;
      const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      await supabaseAdmin.from("store_couriers").update({ invite_token: token, invitation_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), invited_at: new Date().toISOString(), status: "invited" }).eq("id", link.id);
      const emailed = link.invite_email ? await sendCourierInvite(link.invite_email, String(details["fullName"] ?? "Entregador"), (link.store as { name?: string } | null)?.name ?? "sua loja", token) : false;
      return { ok: true, token, message: emailed ? "Convite reenviado." : "Novo link criado." };
    }
    const now = new Date().toISOString();
    const patch = data.action === "reactivate"
      ? { status: "approved" as const, approved_at: now, approved_by: context.userId, blocked_until: null, status_reason: null }
      : data.action === "block"
        ? { status: "blocked" as const, blocked_until: null, status_reason: "Bloqueado pela loja" }
        : { status: "removed" as const, blocked_until: null, status_reason: "Removido pela loja" };
    const { error } = await supabaseAdmin.from("store_couriers").update(patch).eq("id", link.id);
    if (error) throw new Error(error.message);
    if (link.courier_user_id) await supabaseAdmin.from("couriers").update({ is_active: data.action === "reactivate", is_online: false }).eq("store_id", data.storeId).eq("user_id", link.courier_user_id);
    await supabaseAdmin.from("audit_logs").insert({ store_id: data.storeId, user_id: context.userId, action: `courier.${data.action}`, entity: "store_couriers", entity_id: link.id });
    return { ok: true, message: "Vínculo atualizado." };
  });
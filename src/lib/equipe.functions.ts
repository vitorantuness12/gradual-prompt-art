import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Convites de equipe.
 * A criação exige papel owner/manager na loja; a aceitação exige que o
 * e-mail da conta autenticada seja o mesmo do convite.
 */

const createInviteInput = z.object({
  storeId: z.string().uuid(),
  email: z.string().trim().email().max(160),
  role: z.enum(["owner", "manager", "staff", "delivery_person"]),
  permissions: z.record(z.string(), z.boolean()).default({}),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export interface InviteResult {
  ok: boolean;
  message: string;
  link?: string;
  emailed?: boolean;
}

async function sendInviteEmail(to: string, storeName: string, link: string): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM"];
  if (!apiKey || !from) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `Convite para a equipe de ${storeName}`,
        html: `<p>Você foi convidado para a equipe de <strong>${storeName}</strong> no O Seu Pedido.</p><p><a href="${link}">Aceitar convite</a></p>`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const createStoreInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createInviteInput.parse(data))
  .handler(async ({ data, context }): Promise<InviteResult> => {
    const { supabase, userId } = context;

    const { data: allowed } = await supabase.rpc("has_store_role", {
      _store_id: data.storeId,
      _user_id: userId,
      _roles: ["owner", "manager"],
    });
    if (!allowed) return { ok: false, message: "Você não pode convidar pessoas nesta loja." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("name")
      .eq("id", data.storeId)
      .maybeSingle();

    const expiresAt = new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();

    await supabaseAdmin
      .from("store_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("store_id", data.storeId)
      .eq("status", "pending")
      .ilike("email", data.email);

    const { data: invite, error } = await supabaseAdmin
      .from("store_invites")
      .insert({
        store_id: data.storeId,
        email: data.email.toLowerCase(),
        role: data.role,
        permissions: data.permissions,
        expires_at: expiresAt,
        invited_by: userId,
      })
      .select("token")
      .single();

    if (error || !invite) return { ok: false, message: error?.message ?? "Não foi possível criar o convite." };

    const origin = process.env["PUBLIC_SITE_URL"] ?? "";
    const link = `${origin}/convite/${invite.token}`;

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: userId,
      action: "invite.created",
      entity: "store_invites",
      metadata: { email: data.email, role: data.role },
    });

    const emailed = await sendInviteEmail(data.email, store?.name ?? "sua loja", link);
    return {
      ok: true,
      message: emailed ? "Convite enviado por e-mail." : "Convite criado. Envie o link para a pessoa.",
      link: invite.token,
      emailed,
    };
  });

const tokenInput = z.object({ token: z.string().trim().min(10).max(120) });

export interface InvitePreview {
  ok: boolean;
  message: string;
  storeName?: string;
  role?: string;
  email?: string;
  expiresAt?: string;
}

export const previewStoreInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data }): Promise<InvitePreview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("store_invites")
      .select("email, role, status, expires_at, store:stores(name)")
      .eq("token", data.token)
      .maybeSingle();

    if (!invite) return { ok: false, message: "Convite não encontrado." };
    if (invite.status !== "pending") return { ok: false, message: "Este convite não está mais disponível." };
    if (new Date(invite.expires_at).getTime() < Date.now()) return { ok: false, message: "Este convite expirou." };

    return {
      ok: true,
      message: "Convite válido.",
      storeName: (invite.store as { name: string } | null)?.name ?? "Loja",
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expires_at,
    };
  });

export const acceptStoreInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; storeId?: string }> => {
    const { userId, claims } = context;
    const email = typeof claims["email"] === "string" ? (claims["email"] as string).toLowerCase() : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("store_invites")
      .select("id, store_id, email, role, permissions, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!invite) return { ok: false, message: "Convite não encontrado." };
    if (invite.status !== "pending") return { ok: false, message: "Este convite não está mais disponível." };
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("store_invites").update({ status: "expired" }).eq("id", invite.id);
      return { ok: false, message: "Este convite expirou. Peça um novo para o responsável da loja." };
    }
    if (!email || email !== invite.email.toLowerCase()) {
      return { ok: false, message: `Entre com a conta ${invite.email} para aceitar este convite.` };
    }

    const { data: existing } = await supabaseAdmin
      .from("store_members")
      .select("id")
      .eq("store_id", invite.store_id)
      .eq("user_id", userId)
      .maybeSingle();

    const memberPayload = {
      role: invite.role,
      permissions: invite.permissions,
      is_active: true,
      deactivated_at: null,
    };

    const { error: memberError } = existing
      ? await supabaseAdmin.from("store_members").update(memberPayload).eq("id", existing.id)
      : await supabaseAdmin
          .from("store_members")
          .insert({ store_id: invite.store_id, user_id: userId, ...memberPayload });
    if (memberError) return { ok: false, message: memberError.message };

    await supabaseAdmin
      .from("store_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", invite.id);

    await supabaseAdmin.from("audit_logs").insert({
      store_id: invite.store_id,
      user_id: userId,
      action: "invite.accepted",
      entity: "store_members",
      metadata: { role: invite.role },
    });

    return { ok: true, message: "Convite aceito. Bem-vindo à equipe!", storeId: invite.store_id };
  });

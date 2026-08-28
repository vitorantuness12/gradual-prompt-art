import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Direitos do titular (LGPD): exportação e exclusão dos dados da conta.
 * Tudo roda no servidor com o usuário autenticado e fica registrado
 * em `data_requests` + `audit_logs`.
 */

export interface ExportPayload {
  ok: boolean;
  message: string;
  generatedAt?: string;
  /** Conteúdo do arquivo já serializado em JSON. */
  json?: string;
}

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExportPayload> => {
    const { userId, claims } = context;
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("data_request", `${clientIdentifier(getRequest()?.headers)}:${userId}`);
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profile, roles, memberships, stores, invites, subscriptions, tickets, requests] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role, created_at").eq("user_id", userId),
      supabaseAdmin.from("store_members").select("store_id, role, permissions, is_active, created_at").eq("user_id", userId),
      supabaseAdmin.from("stores").select("id, name, slug, created_at").eq("owner_id", userId),
      supabaseAdmin.from("store_invites").select("email, role, status, created_at").eq("accepted_by", userId),
      supabaseAdmin.from("store_subscriptions").select("store_id, status, period, created_at"),
      supabaseAdmin.from("support_tickets").select("subject, status, created_at").eq("created_by", userId),
      supabaseAdmin.from("data_requests").select("kind, status, created_at").eq("user_id", userId),
    ]);

    const ownedStoreIds = (stores.data ?? []).map((store) => store.id);

    await supabaseAdmin.from("data_requests").insert({ user_id: userId, kind: "export" });
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      action: "privacy.export",
      entity: "profiles",
      entity_id: userId,
      metadata: {},
    });

    return {
      ok: true,
      message: "Exportação gerada.",
      generatedAt: new Date().toISOString(),
      json: JSON.stringify({
        conta: { id: userId, email: claims["email"] ?? null },
        perfil: profile.data ?? null,
        papeis: roles.data ?? [],
        equipes: memberships.data ?? [],
        lojas: stores.data ?? [],
        convites_aceitos: invites.data ?? [],
        assinaturas: (subscriptions.data ?? []).filter((row) => ownedStoreIds.includes(row.store_id)),
        tickets: tickets.data ?? [],
        solicitacoes_anteriores: requests.data ?? [],
      }, null, 2),
    };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ confirmation: z.string().trim().max(40) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    if (data.confirmation.toUpperCase() !== "EXCLUIR") {
      return { ok: false, message: 'Digite "EXCLUIR" para confirmar.' };
    }

    const { userId } = context;
    const { clientIdentifier, consumeRateLimit, rateLimitMessage } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("data_request", `${clientIdentifier(getRequest()?.headers)}:${userId}`);
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Lojas com outros donos possíveis? O titular só pode excluir a conta
    // quando não for o único responsável por uma loja ativa com pedidos.
    const { data: ownedStores } = await supabaseAdmin.from("stores").select("id, name").eq("owner_id", userId);
    for (const store of ownedStores ?? []) {
      const { count } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", store.id)
        .eq("is_demo", false);
      if ((count ?? 0) > 0) {
        return {
          ok: false,
          message: `A loja "${store.name}" tem pedidos reais. Transfira a propriedade ou solicite a exclusão da loja antes de encerrar a conta.`,
        };
      }
    }

    await supabaseAdmin.from("data_requests").insert({ user_id: userId, kind: "delete", status: "processing" });
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      action: "privacy.delete",
      entity: "profiles",
      entity_id: userId,
      metadata: { stores: (ownedStores ?? []).length },
    });

    for (const store of ownedStores ?? []) {
      await supabaseAdmin.from("stores").delete().eq("id", store.id);
    }
    await supabaseAdmin.from("store_members").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) return { ok: false, message: `Não foi possível concluir a exclusão: ${error.message}` };

    return { ok: true, message: "Conta e dados pessoais excluídos." };
  });

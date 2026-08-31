import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Pontes RPC da área de membros.
 *
 * As funções do cliente são públicas de propósito (o comprador não tem conta
 * no painel), por isso login e troca de senha passam por limite de tentativas.
 * As funções do lojista exigem sessão e vínculo com a loja.
 */

/* ------------------------------- Cliente ---------------------------------- */

export const loginMembro = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; email: string; password: string }) => input)
  .handler(async ({ data }) => {
    const { consumeRateLimit, rateLimitMessage } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("membros_login", `${data.slug}:${data.email.toLowerCase()}`);
    if (!limit.allowed) return { ok: false, message: rateLimitMessage(limit) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { memberLogin } = await import("@/lib/membros.server");
    return memberLogin(supabaseAdmin, data);
  });

export const carregarMembro = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { memberContent } = await import("@/lib/membros.server");
    return memberContent(supabaseAdmin, data.token);
  });

export const trocarSenhaMembro = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; currentPassword: string; newPassword: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { memberChangePassword } = await import("@/lib/membros.server");
    return memberChangePassword(supabaseAdmin, data);
  });

export const linkMaterialMembro = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; resourceId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { memberResourceLink } = await import("@/lib/membros.server");
    return memberResourceLink(supabaseAdmin, data);
  });

export const sairMembro = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { memberLogout } = await import("@/lib/membros.server");
    return memberLogout(supabaseAdmin, data.token);
  });

/* ------------------------------- Lojista ---------------------------------- */

async function assertStaff(
  context: { supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> }; userId: string },
  storeId: string,
) {
  const { data } = await context.supabase.rpc("is_store_staff", { _store_id: storeId, _user_id: context.userId });
  if (data !== true) throw new Error("Sem permissão nesta loja.");
}

/** Contas de membros da loja, com data do último acesso. */
export const listarMembros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as never, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("member_accounts")
      .select("id, email, must_change_password, last_login_at, created_at")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false })
      .limit(300);
    return (rows ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      mustChangePassword: Boolean(row.must_change_password),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    }));
  });

/** Volta a conta para a senha padrão (uso: cliente perdeu o acesso). */
export const redefinirSenhaMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string; memberId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as never, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resetMemberPassword } = await import("@/lib/membros.server");
    return resetMemberPassword(supabaseAdmin, data);
  });

/** Materiais hospedados de um produto digital. */
export const listarMateriais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string; productId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as never, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("member_resources")
      .select("id, title, kind, url, file_path, sort_order, created_at")
      .eq("store_id", data.storeId)
      .eq("product_id", data.productId)
      .order("sort_order");
    return (rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind === "link" ? ("link" as const) : ("file" as const),
      url: row.url,
      filePath: row.file_path,
      sortOrder: row.sort_order ?? 0,
      createdAt: row.created_at,
    }));
  });

/** Cadastra um material: arquivo já enviado ao armazenamento ou link externo. */
export const salvarMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      storeId: string;
      productId: string;
      title: string;
      kind: "file" | "link";
      url?: string | null;
      filePath?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as never, data.storeId);
    const title = data.title.trim();
    if (title.length < 2) return { ok: false, message: "Dê um nome ao material." };
    if (data.kind === "link" && !/^https?:\/\//i.test(data.url ?? "")) {
      return { ok: false, message: "Informe um link começando com https://" };
    }
    if (data.kind === "file" && !data.filePath) {
      return { ok: false, message: "Envie o arquivo antes de salvar." };
    }
    // O caminho precisa começar pela pasta da loja: impede gravar em outra loja.
    if (data.kind === "file" && !(data.filePath ?? "").startsWith(`${data.storeId}/`)) {
      return { ok: false, message: "Arquivo fora da pasta desta loja." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("member_resources").insert({
      store_id: data.storeId,
      product_id: data.productId,
      title,
      kind: data.kind,
      url: data.kind === "link" ? data.url : null,
      file_path: data.kind === "file" ? data.filePath : null,
    });
    if (error) return { ok: false, message: "Não foi possível salvar o material." };
    return { ok: true, message: "Material publicado para os membros." };
  });

/** Remove o material (e o arquivo hospedado, quando houver). */
export const excluirMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string; resourceId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context as never, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("member_resources")
      .select("id, file_path")
      .eq("id", data.resourceId)
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!row) return { ok: false, message: "Material não encontrado." };

    if (row.file_path) {
      await supabaseAdmin.storage.from("produtos-digitais").remove([row.file_path]);
    }
    await supabaseAdmin.from("member_resources").delete().eq("id", row.id);
    return { ok: true, message: "Material removido." };
  });

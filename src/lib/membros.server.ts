/**
 * Área de membros — camada de servidor.
 *
 * Decisões sensíveis que ficam aqui:
 * - a senha nunca é guardada em texto puro (scrypt + salt aleatório);
 * - o login só devolve um token opaco de sessão, com prazo de validade;
 * - o cliente só vê produtos com entrega liberada (pagamento confirmado);
 * - o arquivo hospedado sai por link temporário, nunca por URL fixa pública.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

import {
  DEFAULT_MEMBER_PASSWORD,
  MEMBER_SESSION_DAYS,
  checkNewPassword,
  type MemberProductView,
  type MemberSessionView,
} from "@/lib/membros";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const BUCKET = "produtos-digitais";
const SIGNED_TTL = 60 * 10;

/* ------------------------------- Senhas ---------------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, key] = parts as [string, string, string];
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(key, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/* ------------------------------- Contas ---------------------------------- */

export interface EnsureAccountResult {
  ok: boolean;
  created: boolean;
  /** Senha em texto puro apenas quando a conta acaba de ser criada. */
  password: string | null;
}

/**
 * Garante a conta de acesso do cliente na loja. Contas existentes NÃO têm a
 * senha redefinida — só a primeira criação usa a senha padrão.
 */
export async function ensureMemberAccount(
  admin: Admin,
  input: { storeId: string; email: string },
): Promise<EnsureAccountResult> {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) return { ok: false, created: false, password: null };

  const { data: existing } = await admin
    .from("member_accounts")
    .select("id")
    .eq("store_id", input.storeId)
    .eq("email", email)
    .maybeSingle();
  if (existing?.id) return { ok: true, created: false, password: null };

  const { error } = await admin.from("member_accounts").insert({
    store_id: input.storeId,
    email,
    password_hash: hashPassword(DEFAULT_MEMBER_PASSWORD),
    must_change_password: true,
  });
  if (error) return { ok: false, created: false, password: null };

  return { ok: true, created: true, password: DEFAULT_MEMBER_PASSWORD };
}

/** Volta a conta para a senha padrão (pedido do lojista no painel). */
export async function resetMemberPassword(
  admin: Admin,
  input: { storeId: string; memberId: string },
): Promise<{ ok: boolean; message: string }> {
  const { error } = await admin
    .from("member_accounts")
    .update({ password_hash: hashPassword(DEFAULT_MEMBER_PASSWORD), must_change_password: true })
    .eq("id", input.memberId)
    .eq("store_id", input.storeId);
  if (error) return { ok: false, message: "Não foi possível redefinir a senha." };
  return { ok: true, message: `Senha redefinida para ${DEFAULT_MEMBER_PASSWORD}. O cliente terá de trocá-la no acesso.` };
}

/* ------------------------------- Sessão ---------------------------------- */

async function storeBySlug(admin: Admin, slug: string) {
  const { data } = await admin
    .from("stores")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

export interface LoginOutcome {
  ok: boolean;
  message: string;
  token?: string;
  mustChangePassword?: boolean;
}

export async function memberLogin(
  admin: Admin,
  input: { slug: string; email: string; password: string },
): Promise<LoginOutcome> {
  const store = await storeBySlug(admin, input.slug);
  if (!store) return { ok: false, message: "Loja não encontrada." };

  const email = normalizeEmail(input.email);
  const { data: account } = await admin
    .from("member_accounts")
    .select("id, password_hash, must_change_password")
    .eq("store_id", store.id)
    .eq("email", email)
    .maybeSingle();

  // Mensagem única para e-mail inexistente e senha errada: não confirmamos
  // quem é cliente da loja para quem não tem a senha.
  const generic = { ok: false, message: "E-mail ou senha incorretos." };
  if (!account || !verifyPassword(input.password, account.password_hash)) return generic;

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + MEMBER_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("member_sessions").insert({
    token,
    member_id: account.id,
    expires_at: expires,
  });
  if (error) return { ok: false, message: "Não foi possível entrar agora. Tente novamente." };

  await admin.from("member_accounts").update({ last_login_at: new Date().toISOString() }).eq("id", account.id);

  return {
    ok: true,
    message: "Acesso liberado.",
    token,
    mustChangePassword: Boolean(account.must_change_password),
  };
}

interface SessionRow {
  memberId: string;
  storeId: string;
  email: string;
  mustChangePassword: boolean;
}

async function sessionFor(admin: Admin, token: string): Promise<SessionRow | null> {
  if (!token || token.length < 16) return null;
  const { data } = await admin
    .from("member_sessions")
    .select("member_id, expires_at, member:member_accounts(id, store_id, email, must_change_password)")
    .eq("token", token)
    .maybeSingle();
  const row = data as unknown as
    | {
        member_id: string;
        expires_at: string;
        member: { id: string; store_id: string; email: string; must_change_password: boolean } | null;
      }
    | null;
  if (!row?.member) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from("member_sessions").delete().eq("token", token);
    return null;
  }
  return {
    memberId: row.member.id,
    storeId: row.member.store_id,
    email: row.member.email,
    mustChangePassword: Boolean(row.member.must_change_password),
  };
}

export async function memberLogout(admin: Admin, token: string): Promise<{ ok: boolean }> {
  await admin.from("member_sessions").delete().eq("token", token);
  return { ok: true };
}

export async function memberChangePassword(
  admin: Admin,
  input: { token: string; currentPassword: string; newPassword: string },
): Promise<{ ok: boolean; message: string }> {
  const session = await sessionFor(admin, input.token);
  if (!session) return { ok: false, message: "Sessão expirada. Entre novamente." };

  const check = checkNewPassword(input.newPassword);
  if (!check.ok) return { ok: false, message: check.message };

  const { data: account } = await admin
    .from("member_accounts")
    .select("password_hash")
    .eq("id", session.memberId)
    .maybeSingle();
  if (!account || !verifyPassword(input.currentPassword, account.password_hash)) {
    return { ok: false, message: "Senha atual incorreta." };
  }

  await admin
    .from("member_accounts")
    .update({ password_hash: hashPassword(input.newPassword.trim()), must_change_password: false })
    .eq("id", session.memberId);

  return { ok: true, message: "Senha atualizada. Use a nova senha nos próximos acessos." };
}

/* ------------------------------ Conteúdo --------------------------------- */

/** Produtos liberados para o membro, com os materiais hospedados pela loja. */
export async function memberContent(
  admin: Admin,
  token: string,
): Promise<{ ok: boolean; message: string; session?: MemberSessionView }> {
  const session = await sessionFor(admin, token);
  if (!session) return { ok: false, message: "Sessão expirada. Entre novamente." };

  const [{ data: store }, { data: deliveries }] = await Promise.all([
    admin.from("stores").select("name, slug").eq("id", session.storeId).maybeSingle(),
    admin
      .from("digital_deliveries")
      .select("product_id, released_at, expires_at, revoked_at, product:products(name, digital_instructions)")
      .eq("store_id", session.storeId)
      .eq("customer_email", session.email)
      .not("released_at", "is", null)
      .order("released_at", { ascending: false }),
  ]);

  const rows = (deliveries ?? []) as unknown as Array<{
    product_id: string;
    released_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    product: { name: string; digital_instructions: string | null } | null;
  }>;

  const productIds = [...new Set(rows.map((row) => row.product_id).filter(Boolean))];
  const { data: resources } = await admin
    .from("member_resources")
    .select("id, product_id, title, kind")
    .eq("store_id", session.storeId)
    .in("product_id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"])
    .order("sort_order");

  const byProduct = new Map<string, MemberProductView>();
  for (const row of rows) {
    if (byProduct.has(row.product_id)) continue;
    const expired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
    byProduct.set(row.product_id, {
      productId: row.product_id,
      productName: row.product?.name ?? "Produto digital",
      instructions: row.product?.digital_instructions ?? null,
      releasedAt: row.released_at,
      expiresAt: row.expires_at,
      blocked: Boolean(row.revoked_at) || expired,
      blockedReason: row.revoked_at ? "Acesso revogado pela loja." : expired ? "Prazo de acesso encerrado." : null,
      resources: [],
    });
  }
  for (const resource of (resources ?? []) as Array<{ id: string; product_id: string; title: string; kind: string }>) {
    const product = byProduct.get(resource.product_id);
    if (!product) continue;
    product.resources.push({ id: resource.id, title: resource.title, kind: resource.kind === "link" ? "link" : "file" });
  }

  return {
    ok: true,
    message: "Sessão válida.",
    session: {
      email: session.email,
      storeName: store?.name ?? "Loja",
      storeSlug: store?.slug ?? "",
      mustChangePassword: session.mustChangePassword,
      products: [...byProduct.values()],
    },
  };
}

/** Link temporário do material — só para membro com acesso liberado. */
export async function memberResourceLink(
  admin: Admin,
  input: { token: string; resourceId: string },
): Promise<{ ok: boolean; message: string; url?: string }> {
  const content = await memberContent(admin, input.token);
  if (!content.ok || !content.session) return { ok: false, message: content.message };

  const allowed = content.session.products.filter((product) => !product.blocked);
  const owns = allowed.some((product) => product.resources.some((resource) => resource.id === input.resourceId));
  if (!owns) return { ok: false, message: "Este material não está disponível na sua conta." };

  const { data: resource } = await admin
    .from("member_resources")
    .select("kind, url, file_path")
    .eq("id", input.resourceId)
    .maybeSingle();
  if (!resource) return { ok: false, message: "Material não encontrado." };

  if (resource.kind === "link") {
    if (!resource.url) return { ok: false, message: "Material sem link cadastrado." };
    return { ok: true, message: "Link liberado.", url: resource.url };
  }

  if (!resource.file_path) return { ok: false, message: "Material sem arquivo enviado." };
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(resource.file_path, SIGNED_TTL);
  if (error || !signed?.signedUrl) return { ok: false, message: "Não foi possível gerar o link de download." };

  return { ok: true, message: "Download liberado.", url: signed.signedUrl };
}

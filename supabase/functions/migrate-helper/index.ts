// Auxiliar temporário de exportação para migração.
// Somente um usuário autenticado com papel super_admin pode usá-lo.
// Credenciais administrativas nunca são devolvidas ao cliente.

import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_PAGE_SIZE = 1_000;
const SAFE_TABLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

const cors = {
  "Access-Control-Allow-Origin": "https://oseupedido.com.br",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return jsonResponse({ error: "server_not_configured" }, 503);
  }
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "authentication_required" }, 401);
  }

  try {
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "invalid_session" }, 401);

    const { data: isSuperAdmin, error: roleError } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "super_admin",
    });
    if (roleError || isSuperAdmin !== true) return jsonResponse({ error: "forbidden" }, 403);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "ping";
    if (action === "ping") return jsonResponse({ ok: true });
    if (action !== "export") return jsonResponse({ error: "unknown_action" }, 400);

    const table = url.searchParams.get("table") ?? "";
    if (!SAFE_TABLE_NAME.test(table)) return jsonResponse({ error: "invalid_table" }, 400);

    const requestedOffset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? String(MAX_PAGE_SIZE), 10);
    const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
    const limit = Number.isSafeInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE)
      : MAX_PAGE_SIZE;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error, count } = await adminClient
      .from(table)
      .select("*", { count: "exact" })
      .range(offset, offset + limit - 1);

    if (error) return jsonResponse({ error: "export_failed", detail: error.message }, 400);

    const rows = data ?? [];
    return jsonResponse({
      table,
      offset,
      limit,
      total: count ?? rows.length,
      next_offset: rows.length === limit ? offset + rows.length : null,
      rows,
    });
  } catch (error) {
    console.error("migrate-helper failed", error);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
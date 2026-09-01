import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://oseupedido.com.br",
  "https://www.oseupedido.com.br",
]);

const MIGRATION_TABLES = new Set([
  "consent_records",
  "plans",
  "store_features",
  "store_highlights",
  "store_sections",
]);

const NATURAL_CONFLICT_KEYS: Readonly<Record<string, string>> = {
  plans: "key",
  store_features: "store_id",
  store_highlights: "store_id",
  store_sections: "store_id,block_key",
};

const MAX_BATCH_SIZE = 1_000;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://oseupedido.com.br",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value;
}

function parseTable(url: URL): string | null {
  const table = url.searchParams.get("table")?.trim() ?? "";
  return MIGRATION_TABLES.has(table) ? table : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return json(request, { error: "unauthorized" }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const publishableKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const token = authorization.slice("Bearer ".length);
    const authClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json(request, { error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: role, error: roleError } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (roleError || !role) return json(request, { error: "forbidden" }, 403);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "ping";
    if (action === "ping") return json(request, { ok: true });

    const table = parseTable(url);
    if (!table) return json(request, { error: "table_not_allowed" }, 400);

    if (action === "export" && request.method === "GET") {
      const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
      const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "500", 10) || 500;
      const limit = Math.min(MAX_BATCH_SIZE, Math.max(1, requestedLimit));
      const { data, error, count } = await admin
        .from(table)
        .select("*", { count: "exact" })
        .range(offset, offset + limit - 1);
      if (error) return json(request, { error: error.message }, 400);
      return json(request, { rows: data ?? [], offset, limit, total: count ?? 0 });
    }

    if (action === "import" && request.method === "POST") {
      const payload: unknown = await request.json();
      const rows = typeof payload === "object" && payload !== null && "rows" in payload
        ? (payload as { rows?: unknown }).rows
        : null;
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH_SIZE) {
        return json(request, { error: `rows deve conter entre 1 e ${MAX_BATCH_SIZE} registros` }, 400);
      }
      if (rows.some((row) => typeof row !== "object" || row === null || Array.isArray(row))) {
        return json(request, { error: "invalid_rows" }, 400);
      }

      // Consentimentos só podem entrar depois da migração dos respectivos usuários.
      // Em vez de abortar todo o job por FK, devolvemos quais linhas devem ser repetidas após Auth.
      if (table === "consent_records") {
        const userIds = [...new Set(rows.map((row) => String((row as Record<string, unknown>).user_id ?? "")))]
          .filter(Boolean);
        const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });
        if (usersError) return json(request, { error: usersError.message }, 400);
        const existingUsers = new Set(usersPage.users.map((user) => user.id));
        const acceptedRows = rows.filter((row) => existingUsers.has(String((row as Record<string, unknown>).user_id)));
        const deferredUserIds = userIds.filter((id) => !existingUsers.has(id));

        if (acceptedRows.length > 0) {
          const { error } = await admin.from(table).upsert(acceptedRows, { onConflict: "id" });
          if (error) return json(request, { error: error.message }, 400);
        }
        return json(request, {
          imported: acceptedRows.length,
          deferred: rows.length - acceptedRows.length,
          deferred_user_ids: deferredUserIds,
          retry_after_auth_import: deferredUserIds.length > 0,
        });
      }

      // Usa a chave única de negócio. Assim, reiniciar o wizard atualiza a linha
      // já criada no destino em vez de falhar por UUID ou chave única diferente.
      const onConflict = NATURAL_CONFLICT_KEYS[table] ?? "id";
      const { error } = await admin.from(table).upsert(rows, { onConflict });
      if (error) return json(request, { error: error.message }, 400);
      return json(request, { imported: rows.length, deferred: 0, on_conflict: onConflict });
    }

    return json(request, { error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return json(request, { error: message }, 500);
  }
});
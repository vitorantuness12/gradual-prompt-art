/**
 * Autenticação, escopos, limite de uso e registro da API pública v1.
 * Server-only: manipula o valor completo das chaves e o cliente de serviço.
 */

export interface ApiContext {
  keyId: string;
  storeId: string;
  scopes: string[];
  rateLimitPerMinute: number;
}

const PREFIX_LIVE = "sp_live_";
const PREFIX_TEST = "sp_test_";

/** Gera uma chave nova. O valor completo só aparece uma vez para o lojista. */
export async function generateApiKey(
  sandbox = false,
): Promise<{ value: string; prefix: string; hash: string }> {
  const { randomBytes } = await import("node:crypto");
  const value = `${sandbox ? PREFIX_TEST : PREFIX_LIVE}${randomBytes(24).toString("hex")}`;
  return { value, prefix: value.slice(0, 16), hash: await hashApiKey(value) };
}

export async function hashApiKey(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function extractKey(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+([^\s,]+)$/i.exec(header);
  if (bearer?.[1]) return bearer[1];
  return request.headers.get("x-api-key");
}

export interface AuthFailure {
  response: Response;
}

/** Valida a chave, os escopos e o limite por minuto. */
export async function authenticateApiRequest(
  request: Request,
  requiredScope: string | null,
): Promise<{ context: ApiContext } | AuthFailure> {
  const raw = extractKey(request);
  if (!raw)
    return {
      response: apiError(401, "chave_ausente", "Envie a chave em Authorization: Bearer <chave>."),
    };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await hashApiKey(raw);

  const { data: key } = await supabaseAdmin
    .from("api_keys")
    .select(
      "id, store_id, scopes, rate_limit_per_minute, is_active, expires_at, revoked_at, requests_count",
    )
    .eq("key_hash", hash)
    .maybeSingle();

  if (!key || !key.is_active || key.revoked_at) {
    return { response: apiError(401, "chave_invalida", "Chave inválida ou revogada.") };
  }
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
    return {
      response: apiError(401, "chave_expirada", "Chave expirada. Gere uma nova no painel."),
    };
  }
  if (requiredScope && !key.scopes.includes(requiredScope)) {
    return {
      response: apiError(
        403,
        "escopo_insuficiente",
        `Esta chave não tem o escopo ${requiredScope}.`,
      ),
    };
  }

  const { consumeRateLimit } = await import("@/lib/security.server");
  const limit = await consumeRateLimit("webhook", `api:${key.id}`, {
    limit: key.rate_limit_per_minute,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return {
      response: apiError(429, "limite_excedido", "Limite de requisições por minuto atingido.", {
        "retry-after": String(limit.retryAfterSeconds),
      }),
    };
  }

  await supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString(), requests_count: key.requests_count + 1 })
    .eq("id", key.id);

  return {
    context: {
      keyId: key.id,
      storeId: key.store_id,
      scopes: key.scopes,
      rateLimitPerMinute: key.rate_limit_per_minute,
    },
  };
}

/** Registra a chamada para auditoria e para o painel de logs. */
export async function logApiRequest(input: {
  storeId: string | null;
  keyId: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("api_request_logs").insert({
      store_id: input.storeId,
      api_key_id: input.keyId,
      method: input.method,
      path: input.path.slice(0, 300),
      status: input.status,
      duration_ms: input.durationMs,
      ip: input.ip,
      error: input.error ?? null,
    });
  } catch (error) {
    console.error("[api-log]", error);
  }
}

/** ---------- Respostas ---------- */

const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function apiJson(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return apiJson({ error: { code, message } }, status, headers);
}

export interface PageParams {
  page: number;
  perPage: number;
  from: number;
  to: number;
}

export function pageParams(url: URL): PageParams {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? 25) || 25));
  return { page, perPage, from: (page - 1) * perPage, to: page * perPage - 1 };
}

export function paginated(data: unknown[], total: number | null, params: PageParams): Response {
  return apiJson({
    data,
    meta: {
      page: params.page,
      per_page: params.perPage,
      total: total ?? data.length,
      total_pages: Math.max(1, Math.ceil((total ?? data.length) / params.perPage)),
    },
  });
}

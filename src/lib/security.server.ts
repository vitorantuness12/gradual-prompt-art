/**
 * Utilidades de segurança do servidor: limite de tentativas (rate limiting),
 * identificação do chamador e sanitização de texto livre.
 *
 * O contador vive no banco (tabela `rate_limits`, acessível só pelo
 * service_role) porque os workers são sem estado — memória local não serve.
 */

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  retryAfterSeconds: number;
}

export type RateLimitBucket =
  | "login"
  | "signup"
  | "coupon"
  | "checkout"
  | "payment"
  | "webhook"
  | "tracking"
  | "invite"
  | "data_request"
  | "historico"
  | "popup"
  | "identify"
  | "abandoned_cart"
  | "abandoned_cart_open";

const DEFAULTS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  login: { limit: 10, windowSeconds: 300 },
  signup: { limit: 5, windowSeconds: 3600 },
  coupon: { limit: 20, windowSeconds: 300 },
  checkout: { limit: 12, windowSeconds: 300 },
  payment: { limit: 15, windowSeconds: 300 },
  webhook: { limit: 600, windowSeconds: 60 },
  tracking: { limit: 60, windowSeconds: 300 },
  invite: { limit: 30, windowSeconds: 3600 },
  data_request: { limit: 5, windowSeconds: 3600 },
  historico: { limit: 30, windowSeconds: 300 },
  popup: { limit: 120, windowSeconds: 300 },
  identify: { limit: 12, windowSeconds: 600 },
  // Salvamento do carrinho acontece com debounce, mas o cliente pode editar
  // bastante antes de fechar; janela curta e limite generoso.
  abandoned_cart: { limit: 60, windowSeconds: 300 },
  abandoned_cart_open: { limit: 30, windowSeconds: 300 },
};



/** IP do chamador a partir dos cabeçalhos do proxy (fallback: "desconhecido"). */
export function clientIdentifier(headers: Headers | undefined, fallback = "desconhecido"): string {
  if (!headers) return fallback;
  const forwarded = headers.get("x-forwarded-for");
  const candidate =
    headers.get("cf-connecting-ip") ??
    (forwarded ? forwarded.split(",")[0] : null) ??
    headers.get("x-real-ip");
  return (candidate ?? fallback).trim().slice(0, 80) || fallback;
}

/**
 * Consome uma tentativa do balde informado.
 * Em caso de falha na verificação, libera a chamada (fail-open) para não
 * derrubar o fluxo do cliente, mas registra o erro no log do servidor.
 */
export async function consumeRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
  override?: { limit?: number; windowSeconds?: number },
): Promise<RateLimitResult> {
  const config = DEFAULTS[bucket];
  const limit = override?.limit ?? config.limit;
  const windowSeconds = override?.windowSeconds ?? config.windowSeconds;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
      _bucket: bucket,
      _identifier: identifier.slice(0, 160),
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);

    const result = (data ?? {}) as { allowed?: boolean; hits?: number; retry_after_seconds?: number };
    return {
      allowed: result.allowed !== false,
      hits: result.hits ?? 0,
      retryAfterSeconds: result.retry_after_seconds ?? windowSeconds,
    };
  } catch (error) {
    console.error("[rate-limit]", error);
    return { allowed: true, hits: 0, retryAfterSeconds: 0 };
  }
}

/** Mensagem padronizada em português para o usuário final. */
export function rateLimitMessage(result: RateLimitResult): string {
  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
  return `Muitas tentativas em pouco tempo. Aguarde ${minutes} minuto(s) e tente novamente.`;
}

/**
 * Remove marcações perigosas de texto livre vindo do cliente
 * (observações de pedido, mensagens, nomes). Guardamos texto puro:
 * nada de HTML é renderizado a partir desses campos.
 */
export function sanitizeText(value: string, maxLength = 500): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Endereço público oficial das lojas.
 * O formato canônico é https://oseupedido.com.br/nomedaloja (sem /loja e sem IDs internos).
 */
export const PUBLIC_STORE_DOMAIN = "oseupedido.com.br";
export const PUBLIC_STORE_BASE_URL = `https://${PUBLIC_STORE_DOMAIN}`;

/** URL pública canônica da loja, usada em compartilhamento, QR Code e SEO. */
export function storePublicUrl(slug: string): string {
  return `${PUBLIC_STORE_BASE_URL}/${slug}`;
}

/** Versão curta para exibição na interface (sem o protocolo). */
export function storePublicLabel(slug: string): string {
  return `${PUBLIC_STORE_DOMAIN}/${slug || "nomedaloja"}`;
}

/**
 * URL utilizável no ambiente atual (preview, domínio próprio ou produção).
 * Mantém o mesmo caminho do endereço canônico, preservando o slug.
 */
export function storeRuntimeUrl(slug: string, path = ""): string {
  const origin = typeof window === "undefined" ? PUBLIC_STORE_BASE_URL : window.location.origin;
  return `${origin}/${slug}${path}`;
}

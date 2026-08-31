/**
 * Área de membros dos produtos digitais — regras puras.
 *
 * A senha inicial é sempre a mesma e o cliente é avisado, no e-mail e dentro da
 * área, para trocá-la no primeiro acesso. Nada aqui toca banco ou rede.
 */

/** Senha padrão entregue ao cliente no e-mail de liberação. */
export const DEFAULT_MEMBER_PASSWORD = "123456789";

/** Validade da sessão do membro, em dias. */
export const MEMBER_SESSION_DAYS = 30;

export const MIN_MEMBER_PASSWORD = 8;

/** Endereço da área de membros da loja. */
export function memberAreaUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${slug}/membros`;
}

export interface MemberPasswordCheck {
  ok: boolean;
  message: string;
}

/** Regras mínimas da nova senha, checadas no cliente e no servidor. */
export function checkNewPassword(password: string): MemberPasswordCheck {
  const value = (password ?? "").trim();
  if (value.length < MIN_MEMBER_PASSWORD) {
    return { ok: false, message: `A nova senha precisa de pelo menos ${MIN_MEMBER_PASSWORD} caracteres.` };
  }
  if (value === DEFAULT_MEMBER_PASSWORD) {
    return { ok: false, message: "Escolha uma senha diferente da senha padrão." };
  }
  return { ok: true, message: "Senha válida." };
}

export interface MemberResourceView {
  id: string;
  title: string;
  kind: "file" | "link";
}

export interface MemberProductView {
  productId: string;
  productName: string;
  instructions: string | null;
  releasedAt: string | null;
  expiresAt: string | null;
  blocked: boolean;
  blockedReason: string | null;
  resources: MemberResourceView[];
}

export interface MemberSessionView {
  email: string;
  storeName: string;
  storeSlug: string;
  mustChangePassword: boolean;
  products: MemberProductView[];
}

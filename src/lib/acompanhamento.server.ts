import { parseOrderAddress, type TrackedOrderDetail } from "@/lib/acompanhamento";

/**
 * Apoio ao acompanhamento público de pedidos.
 *
 * Regras de segurança centralizadas aqui (nada disso roda no navegador):
 * - todo pedido é localizado com um segundo fator: telefone da compra ou
 *   código público (link secreto). Nunca só pelo número do pedido;
 * - a listagem por telefone exige código de verificação de 6 dígitos, porque
 *   o telefone sozinho não prova que a pessoa é a dona do número;
 * - códigos são guardados apenas como hash, expiram e têm limite de tentativas;
 * - links públicos deixam de funcionar depois do prazo definido pela loja.
 */
import { createHash, randomInt, timingSafeEqual } from "crypto";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
/** Espera mínima entre dois envios do código. */
export const CODE_RESEND_COOLDOWN_SECONDS = 30;
/** Bloqueio temporário depois de errar o código muitas vezes. */
export const CODE_LOCK_MINUTES = 15;

/** Campos devolvidos ao cliente: nada de endereço completo, e-mail ou telefone. */
export const ORDER_SELECT =
  "id, store_id, customer_name, code, public_token, status, type, created_at, total, subtotal, delivery_fee, discount, payment_method, payment_status, scheduled_for, table_number, notes, address, customer_phone, is_demo, store:stores(name, slug), order_items(product_name, quantity, total, notes)";

export interface OrderSummary {
  code: string;
  publicToken: string;
  status: string;
  type: string;
  createdAt: string;
  total: number;
  storeName: string;
  storeSlug: string;
}

export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(identifier: string, code: string): string {
  return createHash("sha256").update(`${identifier}:${code}`).digest("hex");
}

/** Comparação em tempo constante para não vazar informação pelo tempo de resposta. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Mostra apenas o começo do código público em mensagens de apoio. */
export function maskToken(token: string): string {
  return `${token.slice(0, 6)}…`;
}

export async function findStoreBySlug(admin: Admin, slug: string) {
  const { data } = await admin
    .from("stores")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

/** Preferências de acompanhamento da loja (com padrões seguros). */
export async function trackingSettings(admin: Admin, storeId: string) {
  const { data } = await admin
    .from("store_checkout_settings")
    .select("allow_public_tracking, require_verification, tracking_link_days")
    .eq("store_id", storeId)
    .maybeSingle();
  return {
    allowPublicTracking: data?.allow_public_tracking ?? true,
    requireVerification: data?.require_verification ?? false,
    trackingLinkDays: data?.tracking_link_days ?? 30,
  };
}

/** Verdadeiro quando o link público do pedido já passou do prazo da loja. */
export function linkExpired(createdAt: string, days: number): boolean {
  if (days <= 0) return false;
  const limit = new Date(createdAt).getTime() + days * 86_400_000;
  return Date.now() > limit;
}

export interface StoreCodeResult {
  ok: boolean;
  /** Segundos que faltam para poder pedir/reenviar outro código. */
  retryAfterSeconds: number;
  message: string;
}

/** Segundos restantes (arredondados para cima) até um instante futuro. */
function secondsUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

/**
 * Guarda o hash do código e invalida os anteriores do mesmo telefone.
 * Respeita a espera entre envios (cooldown) e o bloqueio por erros repetidos.
 */
export async function storeVerificationCode(
  admin: Admin,
  identifier: string,
  code: string,
  channel: "whatsapp" | "email",
): Promise<StoreCodeResult> {
  const { data: last } = await admin
    .from("verification_codes")
    .select("id, created_at, locked_until, channel")
    .eq("identifier", identifier)
    .eq("purpose", "phone")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Bloqueio ativo: nem reenvio nem nova confirmação são liberados.
  const lockLeft = secondsUntil(last?.locked_until ?? null);
  if (lockLeft > 0) {
    return {
      ok: false,
      retryAfterSeconds: lockLeft,
      message: `Muitas tentativas incorretas. Aguarde ${Math.ceil(lockLeft / 60)} minuto(s) para pedir um novo código.`,
    };
  }

  // Espera mínima entre envios, para evitar disparos em sequência.
  if (last?.created_at) {
    const elapsed = Math.floor((Date.now() - new Date(last.created_at).getTime()) / 1000);
    const wait = CODE_RESEND_COOLDOWN_SECONDS - elapsed;
    if (wait > 0) {
      return {
        ok: false,
        retryAfterSeconds: wait,
        message: `Aguarde ${wait} segundo(s) para reenviar o código.`,
      };
    }
  }

  await admin
    .from("verification_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("identifier", identifier)
    .eq("purpose", "phone")
    .is("consumed_at", null);

  await admin.from("verification_codes").insert({
    identifier,
    channel,
    purpose: "phone",
    code_hash: hashCode(identifier, code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });

  return { ok: true, retryAfterSeconds: CODE_RESEND_COOLDOWN_SECONDS, message: "" };
}

export interface CodeCheck {
  ok: boolean;
  message: string;
  /** Quando > 0, novas tentativas estão bloqueadas por este tempo. */
  lockedForSeconds: number;
  /** Tentativas restantes com o código atual. */
  attemptsLeft: number;
}

/** Confere o código informado: valida validade, tentativas e consome no acerto. */
export async function checkVerificationCode(
  admin: Admin,
  identifier: string,
  code: string,
): Promise<CodeCheck> {
  const fail = (message: string, extra: Partial<CodeCheck> = {}): CodeCheck => ({
    ok: false,
    message,
    lockedForSeconds: 0,
    attemptsLeft: 0,
    ...extra,
  });

  const digits = onlyDigits(code);
  if (digits.length !== 6) return fail("Informe os 6 dígitos do código recebido.");

  const { data: row } = await admin
    .from("verification_codes")
    .select("id, code_hash, attempts, expires_at, locked_until, consumed_at")
    .eq("identifier", identifier)
    .eq("purpose", "phone")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return fail("Código não encontrado. Peça um novo código.");

  const lockLeft = secondsUntil(row.locked_until);
  if (lockLeft > 0) {
    return fail(
      `Muitas tentativas incorretas. Aguarde ${Math.ceil(lockLeft / 60)} minuto(s) antes de tentar de novo.`,
      { lockedForSeconds: lockLeft },
    );
  }

  if (row.consumed_at) return fail("Este código já foi usado. Peça um novo código.");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return fail("Este código expirou. Peça um novo código.");
  }

  if (!sameHash(row.code_hash, hashCode(identifier, digits))) {
    const attempts = row.attempts + 1;
    const locked = attempts >= CODE_MAX_ATTEMPTS;
    await admin
      .from("verification_codes")
      .update({
        attempts,
        locked_until: locked
          ? new Date(Date.now() + CODE_LOCK_MINUTES * 60_000).toISOString()
          : null,
        ...(locked ? { consumed_at: new Date().toISOString() } : {}),
      })
      .eq("id", row.id);

    if (locked) {
      return fail(
        `Você errou o código ${CODE_MAX_ATTEMPTS} vezes. Por segurança, aguarde ${CODE_LOCK_MINUTES} minutos e peça um novo código.`,
        { lockedForSeconds: CODE_LOCK_MINUTES * 60 },
      );
    }
    const left = CODE_MAX_ATTEMPTS - attempts;
    return fail(
      `Código incorreto. Você ainda tem ${left} tentativa(s) antes do bloqueio temporário.`,
      { attemptsLeft: left },
    );
  }

  await admin
    .from("verification_codes")
    .update({ consumed_at: new Date().toISOString(), locked_until: null })
    .eq("id", row.id);
  return { ok: true, message: "", lockedForSeconds: 0, attemptsLeft: CODE_MAX_ATTEMPTS };

}

/** Converte a linha do banco no formato mostrado na página. */
export async function buildDetail(
  admin: Admin,
  row: Record<string, unknown>,
): Promise<TrackedOrderDetail> {
  const order = row as never as {
    id: string;
    code: string;
    public_token: string;
    customer_name: string | null;
    status: string;
    type: string;
    created_at: string;
    total: number;
    subtotal: number;
    delivery_fee: number;
    discount: number | null;
    payment_method: string | null;
    payment_status: string;
    scheduled_for: string | null;
    table_number: string | null;
    notes: string | null;
    address: unknown;
    is_demo: boolean;
    store: { name: string; slug: string } | null;
    order_items: Array<{ product_name: string; quantity: number; total: number; notes: string | null }> | null;
  };

  const { data: history } = await admin
    .from("order_status_history")
    .select("status, created_at, reason")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  return {
    id: order.id,
    code: order.code,
    publicToken: order.public_token,
    storeName: order.store?.name ?? "Loja",
    storeSlug: order.store?.slug ?? "",
    customerName: order.customer_name ?? "Cliente",
    status: order.status,
    type: order.type,
    createdAt: order.created_at,
    total: Number(order.total),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    discount: Number(order.discount ?? 0),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    scheduledFor: order.scheduled_for,
    tableNumber: order.table_number,
    notes: order.notes,
    isDemo: order.is_demo,
    address: parseOrderAddress(order.address),
    items: (order.order_items ?? []).map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      total: Number(item.total),
      notes: item.notes,
    })),
    timeline: (history ?? []).map((entry) => ({
      status: entry.status,
      createdAt: entry.created_at,
      reason: entry.reason,
    })),
  };
}

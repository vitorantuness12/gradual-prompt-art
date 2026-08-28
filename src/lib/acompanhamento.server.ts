import type { TrackedOrderDetail } from "@/lib/acompanhamento";

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

/** Guarda o hash do código e invalida os anteriores do mesmo telefone. */
export async function storeVerificationCode(
  admin: Admin,
  identifier: string,
  code: string,
  channel: "whatsapp" | "email",
): Promise<void> {
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
}

export interface CodeCheck {
  ok: boolean;
  message: string;
}

/** Confere o código informado: valida validade, tentativas e consome no acerto. */
export async function checkVerificationCode(
  admin: Admin,
  identifier: string,
  code: string,
): Promise<CodeCheck> {
  const digits = onlyDigits(code);
  if (digits.length !== 6) return { ok: false, message: "Informe os 6 dígitos do código recebido." };

  const { data: row } = await admin
    .from("verification_codes")
    .select("id, code_hash, attempts, expires_at")
    .eq("identifier", identifier)
    .eq("purpose", "phone")
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { ok: false, message: "Código não encontrado. Peça um novo código." };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, message: "Este código expirou. Peça um novo código." };
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    return { ok: false, message: "Muitas tentativas com este código. Peça um novo código." };
  }

  if (!sameHash(row.code_hash, hashCode(identifier, digits))) {
    await admin
      .from("verification_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return { ok: false, message: "Código incorreto. Confira os 6 dígitos e tente novamente." };
  }

  await admin
    .from("verification_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);
  return { ok: true, message: "" };
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

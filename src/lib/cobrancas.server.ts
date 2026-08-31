/**
 * Cobranças da loja — camada de servidor.
 *
 * Regras que valem aqui:
 * - Todo pedido digital nasce com uma cobrança pendente (uma só por pedido,
 *   garantida pela chave de idempotência).
 * - Marcar como paga é a ÚNICA porta que libera acesso digital: o valor é
 *   conferido dentro de `releaseDigitalForOrder`.
 */
import { orderChargeKey, type ChargeView } from "@/lib/cobrancas";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export interface EnsureChargeInput {
  storeId: string;
  orderId: string;
  method: string | null;
  amount: number;
  isDemo?: boolean | null;
}

/**
 * Cria (ou reaproveita) a cobrança do pedido. Nunca lança: uma falha aqui não
 * pode derrubar a compra do cliente — o pedido continua registrado.
 */
export async function ensureOrderCharge(admin: Admin, input: EnsureChargeInput): Promise<string | null> {
  const key = orderChargeKey(input.orderId);

  const { data: existing } = await admin
    .from("payments")
    .select("id")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from("payments")
    .insert({
      store_id: input.storeId,
      order_id: input.orderId,
      method: input.method ?? "pix",
      provider: "manual",
      status: "pending",
      amount: Math.max(0, Number(input.amount ?? 0)),
      idempotency_key: key,
      is_demo: input.isDemo ?? false,
    })
    .select("id")
    .maybeSingle();

  if (error) return null;
  return data?.id ?? null;
}

/** Lista as cobranças da loja no período, já no formato da tela. */
export async function listCharges(
  admin: Admin,
  input: { storeId: string; from?: string | null; to?: string | null; status?: string | null },
): Promise<ChargeView[]> {
  let query = admin
    .from("payments")
    .select(
      "id, order_id, method, status, amount, net_amount, refunded_amount, paid_at, expires_at, created_at, last_error, is_demo, order:orders(code, customer_name, customer_email, channel)",
    )
    .eq("store_id", input.storeId)
    .order("created_at", { ascending: false })
    .limit(400);

  if (input.from) query = query.gte("created_at", input.from);
  if (input.to) query = query.lte("created_at", input.to);
  if (input.status && input.status !== "all") query = query.eq("status", input.status as never);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Array<
    Record<string, unknown> & {
      id: string;
      order_id: string | null;
      method: string | null;
      status: string;
      amount: number;
      net_amount: number | null;
      refunded_amount: number | null;
      paid_at: string | null;
      expires_at: string | null;
      created_at: string;
      last_error: string | null;
      is_demo: boolean;
      order: { code: string; customer_name: string | null; customer_email: string | null; channel: string | null } | null;
    }
  >;

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    orderCode: row.order?.code ?? null,
    customerName: row.order?.customer_name ?? null,
    customerEmail: row.order?.customer_email ?? null,
    channel: row.order?.channel ?? null,
    method: row.method,
    status: row.status,
    amount: Number(row.amount ?? 0),
    netAmount: row.net_amount === null ? null : Number(row.net_amount),
    refundedAmount: row.refunded_amount === null ? null : Number(row.refunded_amount),
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastError: row.last_error,
    isDemo: Boolean(row.is_demo),
  }));
}

export interface SettleOutcome {
  ok: boolean;
  message: string;
}

/**
 * Muda a situação de uma cobrança. Em "paid", sincroniza o pedido, libera o
 * acesso digital e garante a conta na área de membros.
 */
export async function settleCharge(
  admin: Admin,
  input: { storeId: string; paymentId: string; status: "pending" | "paid" | "failed" | "refunded"; note?: string | null },
): Promise<SettleOutcome> {
  const { data: charge } = await admin
    .from("payments")
    .select("id, store_id, order_id, amount, status")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (!charge || charge.store_id !== input.storeId) {
    return { ok: false, message: "Cobrança não encontrada nesta loja." };
  }

  const now = new Date().toISOString();
  await admin
    .from("payments")
    .update({
      status: input.status,
      paid_at: input.status === "paid" ? now : null,
      refunded_at: input.status === "refunded" ? now : null,
      refunded_amount: input.status === "refunded" ? Number(charge.amount ?? 0) : null,
      last_error: input.status === "failed" ? (input.note ?? "Pagamento não aprovado") : null,
    })
    .eq("id", charge.id);

  if (!charge.order_id) return { ok: true, message: "Cobrança atualizada." };

  const paymentStatus =
    input.status === "paid" ? "paid" : input.status === "refunded" ? "refunded" : input.status === "failed" ? "failed" : "pending";
  await admin
    .from("orders")
    .update({
      payment_status: paymentStatus as never,
      ...(input.status === "paid" ? { status: "paid" as never } : {}),
    })
    .eq("id", charge.order_id);

  if (input.status !== "paid") {
    return { ok: true, message: "Cobrança atualizada." };
  }

  const { releaseDigitalForOrder } = await import("@/lib/checkout-especializado.server");
  const released = await releaseDigitalForOrder(admin, charge.order_id, Number(charge.amount ?? 0));

  return {
    ok: true,
    message: released.released > 0 ? "Pagamento confirmado e acesso liberado." : `Pagamento confirmado. ${released.message}`,
  };
}

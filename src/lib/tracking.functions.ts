import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Consulta pública de acompanhamento de pedido.
 * Exige código do pedido + telefone informado na compra, e devolve apenas
 * campos não sensíveis. Executa no servidor para não expor a tabela de pedidos.
 */
const inputSchema = z.object({
  code: z.string().trim().min(4).max(20),
  phone: z.string().trim().min(8).max(30),
});

export interface TrackedOrder {
  id: string;
  storeId: string;
  customerName: string;
  code: string;
  status: string;
  type: string;
  createdAt: string;
  total: number;
  deliveryFee: number;
  subtotal: number;
  discount: number;
  paymentMethod: string | null;
  paymentStatus: string;
  scheduledFor: string | null;
  tableNumber: string | null;
  notes: string | null;
  isDemo: boolean;
  storeName: string;
  storeSlug: string;
  items: Array<{ name: string; quantity: number; total: number; notes: string | null }>;
  timeline: Array<{ status: string; createdAt: string; reason: string | null }>;
  /** Cobrança do pedido, quando já houver transação registrada. */
  charge: { status: string; method: string | null; amount: number; paidAt: string | null } | null;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<{ order: TrackedOrder | null }> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return { order: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, store_id, customer_name, code, status, type, created_at, total, subtotal, delivery_fee, discount, payment_method, payment_status, scheduled_for, table_number, notes, customer_phone, is_demo, store:stores(name, slug), order_items(product_name, quantity, total, notes)",
      )
      .eq("code", data.code.trim().toUpperCase())
      .limit(5);

    if (error) {
      console.error("Falha ao consultar pedido", error.message);
      throw new Error("Não foi possível consultar o pedido agora.");
    }

    const digits = onlyDigits(data.phone);
    const match = (rows ?? []).find((row) => onlyDigits(row.customer_phone ?? "") === digits);
    if (!match) return { order: null };

    const { data: history } = await supabaseAdmin
      .from("order_status_history")
      .select("status, created_at, reason")
      .eq("order_id", match.id)
      .order("created_at", { ascending: true });

    const { data: charge } = await supabaseAdmin
      .from("payments")
      .select("status, method, amount, paid_at")
      .eq("order_id", match.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const store = match.store as { name: string; slug: string } | null;

    return {
      order: {
        id: match.id,
        storeId: match.store_id,
        customerName: match.customer_name ?? "Cliente",
        code: match.code,
        status: match.status,
        type: match.type,
        createdAt: match.created_at,
        total: Number(match.total),
        subtotal: Number(match.subtotal),
        deliveryFee: Number(match.delivery_fee),
        discount: Number(match.discount ?? 0),
        paymentMethod: match.payment_method,
        paymentStatus: match.payment_status,
        scheduledFor: match.scheduled_for,
        tableNumber: match.table_number,
        notes: match.notes,
        isDemo: match.is_demo,
        storeName: store?.name ?? "Loja",
        storeSlug: store?.slug ?? "",
        items: (match.order_items ?? []).map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          total: Number(item.total),
          notes: item.notes,
        })),
        charge: charge
          ? {
              status: String(charge.status),
              method: charge.method ? String(charge.method) : null,
              amount: Number(charge.amount ?? 0),
              paidAt: charge.paid_at ? String(charge.paid_at) : null,
            }
          : null,
        timeline: (history ?? []).map((entry) => ({
          status: entry.status,
          createdAt: entry.created_at,
          reason: entry.reason,
        })),
      },
    };
  });

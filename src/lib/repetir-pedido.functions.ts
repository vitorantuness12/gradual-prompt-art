import { createServerFn } from "@tanstack/react-start";

import type { Json } from "@/integrations/supabase/types";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Histórico do cliente em uma loja, usado pela função "Repetir pedido".
 *
 * A busca é feita pelo telefone informado na compra e sempre presa ao slug
 * da loja, então uma loja nunca enxerga o histórico da outra. A chamada é
 * limitada por IP para impedir varredura de telefones.
 */
const inputSchema = z.object({
  slug: z.string().trim().min(2).max(40),
  phone: z.string().trim().min(8).max(30),
});

export interface PreviousOrderSummary {
  id: string;
  code: string;
  status: string;
  type: string;
  createdAt: string;
  total: number;
  paymentMethod: string | null;
  isDemo: boolean;
  items: Array<{
    product_id: string | null;
    name: string;
    quantity: number;
    unit_price: number;
    options: Json;
    notes: string | null;
  }>;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export const listPreviousOrders = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<{ orders: PreviousOrderSummary[]; limited: boolean }> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("historico", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return { orders: [], limited: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.slug.trim().toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

    if (!store) return { orders: [], limited: false };

    const digits = onlyDigits(data.phone);
    if (digits.length < 8) return { orders: [], limited: false };

    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, code, status, type, created_at, total, payment_method, customer_phone, is_demo, order_items(product_id, product_name, quantity, unit_price, notes)",
      )
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      console.error("Falha ao buscar histórico", error.message);
      throw new Error("Não foi possível carregar seus pedidos agora.");
    }

    const orders = (rows ?? [])
      .filter((row) => onlyDigits(row.customer_phone ?? "") === digits)
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        code: row.code,
        status: row.status as string,
        type: row.type as string,
        createdAt: row.created_at,
        total: Number(row.total),
        paymentMethod: row.payment_method,
        isDemo: Boolean(row.is_demo),
        items: (row.order_items ?? []).map((item) => ({
          product_id: item.product_id,
          name: item.product_name,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          options: [],
          notes: item.notes,
        })),
      }));

    return { orders, limited: false };
  });

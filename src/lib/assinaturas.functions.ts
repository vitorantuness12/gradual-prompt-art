import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Área do cliente: criar, listar, pausar, retomar e cancelar assinaturas
 * recorrentes de produtos.
 *
 * Toda leitura/escrita exige a sessão assinada por telefone (mesma de
 * /meus-pedidos) e cruza sempre o telefone verificado com o telefone da
 * assinatura, então um cliente nunca alcança a assinatura de outro.
 */

const sessionField = z.string().trim().min(10).max(600);

const listInput = z.object({ session: sessionField });

const createInput = z.object({
  session: sessionField,
  orderId: z.string().uuid(),
  period: z.enum(["week", "biweek", "month"]),
});

const stateInput = z.object({
  session: sessionField,
  subscriptionId: z.string().uuid(),
  action: z.enum(["pause", "resume", "cancel"]),
  /** Data opcional de retorno automático da pausa (ISO). */
  resumesAt: z.string().datetime().nullish(),
});

export interface CustomerSubscription {
  id: string;
  storeName: string;
  storeSlug: string;
  status: string;
  period: string;
  paused: boolean;
  resumesAt: string | null;
  nextOrderAt: string | null;
  lastOrderAt: string | null;
  ordersCount: number;
  total: number;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
}

export interface SubscriptionsOverview {
  ok: boolean;
  message: string;
  subscriptions: CustomerSubscription[];
}

/** Ids de `customers` do telefone verificado (um por loja). */
async function customerIdsForSession(session: string) {
  const helpers = await import("@/lib/cliente.server");
  const read = helpers.readSession(session);
  if (!read.ok) return { ok: false as const, message: read.message, ids: [] as string[], phone: "" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: customers } = await supabaseAdmin.from("customers").select("id, phone").limit(500);
  const ids = (customers ?? [])
    .filter((row) => helpers.samePhone(row.phone ?? "", read.phoneE164))
    .map((row) => row.id);

  return { ok: true as const, message: "", ids, phone: read.phoneE164 };
}

export const listCustomerSubscriptions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listInput.parse(data))
  .handler(async ({ data }): Promise<SubscriptionsOverview> => {
    const owner = await customerIdsForSession(data.session);
    if (!owner.ok) return { ok: false, message: owner.message, subscriptions: [] };
    if (owner.ids.length === 0) return { ok: true, message: "", subscriptions: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseItems, subscriptionTotal } = await import("@/lib/assinaturas");

    const { data: rows } = await supabaseAdmin
      .from("customer_subscriptions")
      .select(
        "id, status, period, paused_at, resumes_at, next_order_at, last_order_at, orders_count, delivery_fee, delivery_type, items, store:stores(name, slug)",
      )
      .in("customer_id", owner.ids)
      .order("created_at", { ascending: false })
      .limit(50);

    const subscriptions = (rows ?? []).map((row) => {
      const items = parseItems(row.items);
      const store = row.store as { name: string; slug: string } | null;
      return {
        id: row.id,
        storeName: store?.name ?? "",
        storeSlug: store?.slug ?? "",
        status: row.status,
        period: row.period,
        paused: Boolean(row.paused_at),
        resumesAt: row.resumes_at,
        nextOrderAt: row.next_order_at,
        lastOrderAt: row.last_order_at,
        ordersCount: Number(row.orders_count ?? 0),
        total: subscriptionTotal(
          items,
          row.delivery_type === "delivery" ? Number(row.delivery_fee ?? 0) : 0,
        ),
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      } satisfies CustomerSubscription;
    });

    return { ok: true, message: "", subscriptions };
  });

/** Transforma um pedido já feito em assinatura recorrente. */
export const createSubscriptionFromOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const owner = await customerIdsForSession(data.session);
    if (!owner.ok) return { ok: false, message: owner.message };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("@/lib/cliente.server");
    const { nextCycleDate } = await import("@/lib/assinaturas");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, store_id, customer_id, customer_name, customer_phone, customer_email, type, delivery_fee, address, notes, order_items(product_id, product_name, quantity, unit_price, notes)",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order) return { ok: false, message: "Pedido não encontrado." };

    // O pedido tem que ser do telefone verificado da sessão.
    if (!helpers.samePhone(order.customer_phone ?? "", owner.phone)) {
      return { ok: false, message: "Este pedido não está no seu histórico." };
    }

    const items = (order.order_items ?? []).map((item) => ({
      productId: item.product_id,
      name: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      notes: item.notes,
    }));
    if (items.length === 0) return { ok: false, message: "Este pedido não tem itens para assinar." };

    // Uma assinatura ativa por pedido de origem evita duplicidade.
    const { data: existing } = await supabaseAdmin
      .from("customer_subscriptions")
      .select("id")
      .eq("source_order_id", order.id)
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();
    if (existing) return { ok: false, message: "Você já tem uma assinatura ativa para este pedido." };

    const subtotal = items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
    const deliveryFee = order.type === "pickup" ? 0 : Number(order.delivery_fee ?? 0);

    const { error } = await supabaseAdmin.from("customer_subscriptions").insert({
      store_id: order.store_id,
      customer_id: order.customer_id ?? owner.ids[0] ?? null,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      product_id: items[0]!.productId ?? "",
      period: data.period,
      status: "active",
      amount: Math.round((subtotal + deliveryFee) * 100) / 100,
      unit_price: items[0]!.unitPrice,
      quantity: items[0]!.quantity,
      items: items as never,
      delivery_type: order.type === "pickup" ? "pickup" : "delivery",
      delivery_fee: deliveryFee,
      delivery_address: order.address,
      notes: order.notes,
      source_order_id: order.id,
      next_order_at: nextCycleDate(data.period),
      current_period_end: nextCycleDate(data.period),
    });

    if (error) {
      console.error("[assinaturas] falha ao criar assinatura", error.message);
      return { ok: false, message: "Não foi possível criar a assinatura agora." };
    }

    return { ok: true, message: "Assinatura criada! O próximo pedido é gerado automaticamente." };
  });

/** Pausar, retomar ou cancelar a assinatura. */
export const updateSubscriptionState = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => stateInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const owner = await customerIdsForSession(data.session);
    if (!owner.ok) return { ok: false, message: owner.message };
    if (owner.ids.length === 0) return { ok: false, message: "Assinatura não encontrada." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canManage, nextCycleDate } = await import("@/lib/assinaturas");

    const { data: row } = await supabaseAdmin
      .from("customer_subscriptions")
      .select("id, status, period, customer_id")
      .eq("id", data.subscriptionId)
      .maybeSingle();

    if (!row || !row.customer_id || !owner.ids.includes(row.customer_id)) {
      return { ok: false, message: "Assinatura não encontrada." };
    }
    if (!canManage(row.status)) {
      return { ok: false, message: "Esta assinatura já está encerrada." };
    }

    const now = new Date();
    const patch =
      data.action === "pause"
        ? { paused_at: now.toISOString(), resumes_at: data.resumesAt ?? null, status: "paused" }
        : data.action === "resume"
          ? {
              paused_at: null,
              resumes_at: null,
              status: "active",
              next_order_at: nextCycleDate(row.period, now),
            }
          : { status: "canceled", canceled_at: now.toISOString(), next_order_at: null };

    const { error } = await supabaseAdmin
      .from("customer_subscriptions")
      .update(patch)
      .eq("id", row.id);

    if (error) {
      console.error("[assinaturas] falha ao atualizar assinatura", error.message);
      return { ok: false, message: "Não foi possível atualizar agora." };
    }

    const message =
      data.action === "pause"
        ? "Assinatura pausada. Nenhum pedido novo será gerado."
        : data.action === "resume"
          ? "Assinatura retomada."
          : "Assinatura cancelada.";

    return { ok: true, message };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Orçamentos de encomenda: proposta enviada pela loja, aprovação pública
 * do cliente pelo link e conversão em pedido com sinal e saldo na entrega.
 */

type Ctx = {
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> };
  userId: string;
};

async function assertStaff(context: Ctx, storeId: string) {
  const { data } = await context.supabase.rpc("is_store_staff", {
    _store_id: storeId,
    _user_id: context.userId,
  });
  if (data !== true) throw new Error("Você não tem acesso às encomendas desta loja.");
}

export interface QuoteActionResult {
  ok: boolean;
  message: string;
}

/* ---------- Consulta pública do orçamento ---------- */

export interface PublicQuote {
  found: boolean;
  status: string;
  storeName: string;
  storeSlug: string;
  customerName: string;
  eventAt: string | null;
  notes: string | null;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  depositPercent: number;
  depositAmount: number;
  validUntil: string | null;
  canRespond: boolean;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    customization: Record<string, string>;
    notes: string | null;
  }[];
}

const emptyQuote: PublicQuote = {
  found: false,
  status: "draft",
  storeName: "",
  storeSlug: "",
  customerName: "",
  eventAt: null,
  notes: null,
  subtotal: 0,
  discount: 0,
  deliveryFee: 0,
  total: 0,
  depositPercent: 50,
  depositAmount: 0,
  validUntil: null,
  canRespond: false,
  items: [],
};

export const getPublicQuote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().trim().min(8).max(80) }).parse(data))
  .handler(async ({ data }): Promise<PublicQuote> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { quoteIsOpen } = await import("@/lib/encomendas");

    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select(
        "id, status, customer_name, event_at, notes, subtotal, discount, delivery_fee, total, deposit_percent, deposit_amount, valid_until, store:stores(name, slug), quote_items(name, quantity, unit_price, total, customization, notes)",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    if (!quote) return emptyQuote;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (quote as any).store as { name: string; slug: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((quote as any).quote_items ?? []) as Record<string, unknown>[];

    return {
      found: true,
      status: quote.status,
      storeName: store?.name ?? "Loja",
      storeSlug: store?.slug ?? "",
      customerName: quote.customer_name,
      eventAt: quote.event_at,
      notes: quote.notes,
      subtotal: Number(quote.subtotal ?? 0),
      discount: Number(quote.discount ?? 0),
      deliveryFee: Number(quote.delivery_fee ?? 0),
      total: Number(quote.total ?? 0),
      depositPercent: Number(quote.deposit_percent ?? 50),
      depositAmount: Number(quote.deposit_amount ?? 0),
      validUntil: quote.valid_until,
      canRespond: quoteIsOpen(quote.status, quote.valid_until),
      items: items.map((item) => ({
        name: String(item["name"] ?? "Item"),
        quantity: Number(item["quantity"] ?? 1),
        unitPrice: Number(item["unit_price"] ?? 0),
        total: Number(item["total"] ?? 0),
        customization: (item["customization"] ?? {}) as Record<string, string>,
        notes: (item["notes"] as string | null) ?? null,
      })),
    };
  });

/* ---------- Resposta do cliente ---------- */

export const respondQuote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().trim().min(8).max(80),
        approve: z.boolean(),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<QuoteActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { quoteIsOpen } = await import("@/lib/encomendas");
    const { sanitizeText } = await import("@/lib/security.server");

    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select("id, store_id, status, valid_until, customer_name, total")
      .eq("public_token", data.token)
      .maybeSingle();
    if (!quote) return { ok: false, message: "Orçamento não encontrado." };
    if (!quoteIsOpen(quote.status, quote.valid_until)) {
      return { ok: false, message: "Este orçamento não está mais disponível para resposta." };
    }

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("quotes")
      .update(
        data.approve
          ? { status: "approved", approved_at: now, rejected_at: null, rejection_reason: null }
          : {
              status: "rejected",
              rejected_at: now,
              rejection_reason: data.reason ? sanitizeText(data.reason, 300) : null,
            },
      )
      .eq("id", quote.id);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("notifications").insert({
      store_id: quote.store_id,
      title: data.approve ? "Orçamento aprovado" : "Orçamento recusado",
      body: `${quote.customer_name} ${data.approve ? "aprovou" : "recusou"} a proposta.`,
      event: data.approve ? "quote.approved" : "quote.rejected",
      channel: "painel",
    });

    return {
      ok: true,
      message: data.approve
        ? "Proposta aprovada! A loja vai confirmar os próximos passos."
        : "Resposta registrada. Obrigado pelo retorno.",
    };
  });

/* ---------- Conversão em pedido ---------- */

export const convertQuoteToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ quoteId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<QuoteActionResult & { orderId?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { DEFAULT_CHECKLIST, depositSplit, describeCustomization } = await import("@/lib/encomendas");

    const { data: quote } = await supabaseAdmin
      .from("quotes")
      .select(
        "id, store_id, status, customer_name, customer_phone, customer_email, event_at, notes, subtotal, discount, delivery_fee, total, deposit_percent, order_id, quote_items(product_id, name, quantity, unit_price, total, customization, notes)",
      )
      .eq("id", data.quoteId)
      .maybeSingle();
    if (!quote) return { ok: false, message: "Orçamento não encontrado." };
    await assertStaff(context as unknown as Ctx, quote.store_id);
    if (quote.order_id) return { ok: false, message: "Este orçamento já virou pedido." };
    if (quote.status !== "approved") {
      return { ok: false, message: "O cliente ainda não aprovou este orçamento." };
    }

    const split = depositSplit(Number(quote.total ?? 0), Number(quote.deposit_percent ?? 50));
    const code = `ENC${Date.now().toString().slice(-6)}`;

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        store_id: quote.store_id,
        code,
        channel: "encomenda",
        type: "scheduled",
        status: "confirmed",
        customer_name: quote.customer_name,
        customer_phone: quote.customer_phone,
        customer_email: quote.customer_email,
        scheduled_for: quote.event_at,
        notes: quote.notes,
        subtotal: Number(quote.subtotal ?? 0),
        discount: Number(quote.discount ?? 0),
        delivery_fee: Number(quote.delivery_fee ?? 0),
        total: Number(quote.total ?? 0),
        deposit_amount: split.deposit,
        balance_due: split.balance,
        quote_id: quote.id,
      })
      .select("id")
      .maybeSingle();
    if (error || !order) return { ok: false, message: error?.message ?? "Não foi possível criar o pedido." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((quote as any).quote_items ?? []) as Record<string, unknown>[];
    if (items.length > 0) {
      await supabaseAdmin.from("order_items").insert(
        items.map((item) => {
          const customization = (item["customization"] ?? {}) as Record<string, string>;
          const description = describeCustomization(
            Object.keys(customization).map((key) => ({
              id: key,
              label: key,
              type: "text" as const,
              required: false,
              options: [],
            })),
            customization,
          );
          return {
            order_id: order.id,
            store_id: quote.store_id,
            product_id: (item["product_id"] as string | null) ?? null,
            product_name: String(item["name"] ?? "Item"),
            quantity: Number(item["quantity"] ?? 1),
            unit_price: Number(item["unit_price"] ?? 0),
            total: Number(item["total"] ?? 0),
            notes: [description, item["notes"] ?? ""].filter(Boolean).join(" • ") || null,
          };
        }),
      );
    }

    await supabaseAdmin.from("order_checklist_items").insert(
      DEFAULT_CHECKLIST.map((title, index) => ({
        store_id: quote.store_id,
        order_id: order.id,
        title,
        position: index,
      })),
    );

    await supabaseAdmin
      .from("quotes")
      .update({ status: "converted", order_id: order.id })
      .eq("id", quote.id);

    return {
      ok: true,
      orderId: order.id,
      message: `Pedido ${code} criado. Sinal de ${split.percent}% e saldo na entrega registrados.`,
    };
  });

/* ---------- Sinal pago ---------- */

export const markDepositPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<QuoteActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, deposit_amount")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado." };
    await assertStaff(context as unknown as Ctx, order.store_id);

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ deposit_paid_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Sinal registrado como recebido." };
  });

/* ---------- Página pública da encomenda ---------- */

export interface PublicOrder {
  found: boolean;
  code: string;
  storeName: string;
  customerName: string;
  status: string;
  scheduledFor: string | null;
  total: number;
  depositAmount: number;
  balanceDue: number;
  depositPaid: boolean;
  balanceConfirmed: boolean;
  progress: { done: number; total: number; percent: number; status: string };
  steps: { title: string; done: boolean }[];
  attachments: { id: string; title: string; kind: string; status: string; url: string | null }[];
}

const emptyOrder: PublicOrder = {
  found: false,
  code: "",
  storeName: "",
  customerName: "",
  status: "",
  scheduledFor: null,
  total: 0,
  depositAmount: 0,
  balanceDue: 0,
  depositPaid: false,
  balanceConfirmed: false,
  progress: { done: 0, total: 0, percent: 0, status: "sem_ficha" },
  steps: [],
  attachments: [],
};

export const getPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().trim().min(8).max(80) }).parse(data))
  .handler(async ({ data }): Promise<PublicOrder> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checklistProgress } = await import("@/lib/encomendas");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, store_id, code, customer_name, status, scheduled_for, total, deposit_amount, balance_due, deposit_paid_at, balance_confirmed_at, store:stores(name)",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    if (!order) return emptyOrder;

    const [{ data: steps }, { data: files }] = await Promise.all([
      supabaseAdmin
        .from("order_checklist_items")
        .select("title, done")
        .eq("order_id", order.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("order_attachments")
        .select("id, title, kind, status, file_path")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
    ]);

    const attachments = await Promise.all(
      (files ?? []).map(async (file) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("store-images")
          .createSignedUrl(file.file_path, 60 * 60);
        return {
          id: file.id,
          title: file.title ?? "Arquivo",
          kind: file.kind,
          status: file.status,
          url: signed?.signedUrl ?? null,
        };
      }),
    );

    const progress = checklistProgress(steps ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (order as any).store as { name: string } | null;

    return {
      found: true,
      code: order.code,
      storeName: store?.name ?? "Loja",
      customerName: order.customer_name,
      status: order.status,
      scheduledFor: order.scheduled_for,
      total: Number(order.total ?? 0),
      depositAmount: Number(order.deposit_amount ?? 0),
      balanceDue: Number(order.balance_due ?? 0),
      depositPaid: Boolean(order.deposit_paid_at),
      balanceConfirmed: Boolean(order.balance_confirmed_at),
      progress,
      steps: (steps ?? []).map((step) => ({ title: step.title, done: step.done })),
      attachments,
    };
  });

/** O cliente avisa que pagou o saldo — a loja confere depois. */
export const confirmBalancePayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().trim().min(8).max(80), note: z.string().trim().max(200).optional() }).parse(data),
  )
  .handler(async ({ data }): Promise<QuoteActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeText } = await import("@/lib/security.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, code, customer_name, balance_due, balance_confirmed_at")
      .eq("public_token", data.token)
      .maybeSingle();
    if (!order) return { ok: false, message: "Encomenda não encontrada." };
    if (order.balance_confirmed_at) return { ok: true, message: "Pagamento já avisado. Obrigado!" };

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ balance_confirmed_at: now })
      .eq("id", order.id);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: order.store_id,
      action: "encomenda.saldo_confirmado_cliente",
      entity: "orders",
      entity_id: order.id,
      metadata: {
        valor: Number(order.balance_due ?? 0),
        observacao: data.note ? sanitizeText(data.note, 200) : null,
      },
    });

    await supabaseAdmin.from("notifications").insert({
      store_id: order.store_id,
      order_id: order.id,
      event: "encomenda.saldo_confirmado",
      title: `Saldo avisado no pedido ${order.code}`,
      body: `${order.customer_name} informou o pagamento do saldo. Confira e dê baixa.`,
      channel: "painel",
    });

    return { ok: true, message: "Obrigado! A loja vai conferir o pagamento." };
  });

/** O cliente aprova ou pede ajuste na prova de produção. */
export const reviewAttachmentByCustomer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().trim().min(8).max(80),
        attachmentId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<QuoteActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeText } = await import("@/lib/security.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, code")
      .eq("public_token", data.token)
      .maybeSingle();
    if (!order) return { ok: false, message: "Encomenda não encontrada." };

    const { error } = await supabaseAdmin
      .from("order_attachments")
      .update({
        status: data.approve ? "approved" : "rejected",
        review_note: data.note ? sanitizeText(data.note, 300) : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.attachmentId)
      .eq("order_id", order.id);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("notifications").insert({
      store_id: order.store_id,
      order_id: order.id,
      event: "encomenda.prova_avaliada",
      title: `Prova ${data.approve ? "aprovada" : "recusada"} no pedido ${order.code}`,
      body: data.note ?? (data.approve ? "O cliente aprovou a prova de produção." : "O cliente pediu ajustes."),
      channel: "painel",
    });

    return { ok: true, message: data.approve ? "Prova aprovada. Obrigado!" : "Pedido de ajuste enviado à loja." };
  });

/* ---------- Reprogramação de capacidade ---------- */

export const rescheduleOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), scheduledFor: z.string().trim().min(10).max(40) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<QuoteActionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildDayLoad, checkDayCapacity } = await import("@/lib/encomendas");
    const { parseProduction } = await import("@/lib/producao");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, code, scheduled_for, order_items(quantity)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Encomenda não encontrada." };
    await assertStaff(context as unknown as Ctx, order.store_id);

    const desired = new Date(data.scheduledFor);
    if (Number.isNaN(desired.getTime())) return { ok: false, message: "Data inválida." };

    const { data: settingsRow } = await supabaseAdmin
      .from("production_settings")
      .select("*")
      .eq("store_id", order.store_id)
      .maybeSingle();
    const settings = parseProduction(settingsRow);

    const { data: others } = await supabaseAdmin
      .from("orders")
      .select("id, scheduled_for, order_items(quantity)")
      .eq("store_id", order.store_id)
      .not("scheduled_for", "is", null)
      .not("status", "in", "(cancelled,rejected)")
      .neq("id", order.id);

    const load = buildDayLoad(
      (others ?? []).map((row: { scheduled_for: string | null; order_items?: { quantity: number }[] }) => ({
        scheduled_for: row.scheduled_for,
        items: (row.order_items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
      })),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsCount = ((order as any).order_items ?? []).reduce(
      (sum: number, item: { quantity: number }) => sum + Number(item.quantity ?? 0),
      0,
    );

    const capacity = checkDayCapacity(desired, itemsCount || 1, load, settings.dailyMaxOrders, settings.dailyMaxItems);
    if (!capacity.ok) return { ok: false, message: capacity.reason };

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ scheduled_for: desired.toISOString(), delay_alert_at: null })
      .eq("id", order.id);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: order.store_id,
      user_id: context.userId,
      action: "encomenda.reprogramada",
      entity: "orders",
      entity_id: order.id,
      metadata: { de: order.scheduled_for, para: desired.toISOString() },
    });

    return { ok: true, message: `Encomenda ${order.code} reprogramada.` };
  });

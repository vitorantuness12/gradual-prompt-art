import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Operações do PDV que exigem confiança: preço vem do banco (nunca do
 * navegador), o pagamento é validado no servidor, o estoque é baixado e cada
 * forma de pagamento vira uma transação e uma movimentação de caixa.
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
  if (data !== true) throw new Error("Você não tem acesso ao caixa desta loja.");
}

async function hasPosPermission(context: Ctx, storeId: string, area: string): Promise<boolean> {
  const { data } = await context.supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: context.userId,
    _area: area,
  });
  return data === true;
}

/* ---------------- Turno de caixa ---------------- */

export const openCashSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        terminal: z.string().trim().min(1).max(40).default("Caixa 1"),
        openingBalance: z.number().min(0).max(1_000_000),
        notes: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; sessionId?: string }> => {
    await assertStaff(context as unknown as Ctx, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: open } = await supabaseAdmin
      .from("cash_sessions")
      .select("id")
      .eq("store_id", data.storeId)
      .eq("terminal", data.terminal)
      .eq("status", "open")
      .maybeSingle();
    if (open) return { ok: false, message: `Já existe um caixa aberto em ${data.terminal}.` };

    const { data: session, error } = await supabaseAdmin
      .from("cash_sessions")
      .insert({
        store_id: data.storeId,
        opened_by: context.userId,
        terminal: data.terminal,
        opening_balance: data.openingBalance,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error || !session) return { ok: false, message: error?.message ?? "Não foi possível abrir o caixa." };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: "pos.session_opened",
      entity: "cash_sessions",
      entity_id: session.id,
      metadata: { terminal: data.terminal, opening_balance: data.openingBalance },
    });

    return { ok: true, message: "Caixa aberto.", sessionId: session.id };
  });

export const closeCashSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        countedBalance: z.number().min(0).max(1_000_000),
        justification: z.string().trim().max(400).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; difference?: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("cash_sessions")
      .select("id, store_id, status, opening_balance")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false, message: "Turno não encontrado." };
    if (session.status === "closed") return { ok: false, message: "Este turno já foi fechado." };

    await assertStaff(context as unknown as Ctx, session.store_id);
    if (!(await hasPosPermission(context as unknown as Ctx, session.store_id, "pos_close"))) {
      return { ok: false, message: "Você não tem permissão para fechar o caixa." };
    }

    const { data: movements } = await supabaseAdmin
      .from("cash_movements")
      .select("kind, method, amount")
      .eq("session_id", session.id);

    const { expectedCashBalance, cashDifference } = await import("@/lib/pdv");
    const expected = expectedCashBalance(Number(session.opening_balance), movements ?? []);
    const difference = cashDifference(data.countedBalance, expected);

    if (Math.abs(difference) > 0.009 && !(data.justification ?? "").trim()) {
      return { ok: false, message: "Há divergência no caixa. Escreva uma justificativa para fechar." };
    }

    const { error } = await supabaseAdmin
      .from("cash_sessions")
      .update({
        status: "closed",
        closed_by: context.userId,
        closed_at: new Date().toISOString(),
        expected_balance: expected,
        counted_balance: data.countedBalance,
        difference,
        justification: data.justification?.trim() || null,
      })
      .eq("id", session.id);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: session.store_id,
      user_id: context.userId,
      action: "pos.session_closed",
      entity: "cash_sessions",
      entity_id: session.id,
      metadata: { expected, counted: data.countedBalance, difference },
    });

    return { ok: true, message: "Caixa fechado.", difference };
  });

export const registerCashMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        kind: z.enum(["cash_in", "cash_out", "withdrawal", "supply"]),
        method: z.enum(["cash", "pix", "debit", "credit", "voucher", "online", "on_delivery"]).default("cash"),
        amount: z.number().positive().max(1_000_000),
        reason: z.string().trim().min(3).max(300),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("cash_sessions")
      .select("id, store_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false, message: "Turno não encontrado." };
    if (session.status !== "open") return { ok: false, message: "O caixa já está fechado." };

    await assertStaff(context as unknown as Ctx, session.store_id);
    if (
      (data.kind === "withdrawal" || data.kind === "cash_out") &&
      !(await hasPosPermission(context as unknown as Ctx, session.store_id, "pos_withdrawal"))
    ) {
      return { ok: false, message: "Você não tem permissão para registrar sangria ou saída." };
    }

    const { error } = await supabaseAdmin.from("cash_movements").insert({
      store_id: session.store_id,
      session_id: session.id,
      kind: data.kind,
      method: data.method,
      amount: data.amount,
      reason: data.reason,
      created_by: context.userId,
    });
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: session.store_id,
      user_id: context.userId,
      action: `pos.${data.kind}`,
      entity: "cash_movements",
      metadata: { amount: data.amount, reason: data.reason },
    });

    return { ok: true, message: "Movimentação registrada." };
  });

/* ---------------- Venda ---------------- */

const saleInput = z.object({
  storeId: z.string().uuid(),
  sessionId: z.string().uuid(),
  fulfillment: z.enum(["counter", "pickup", "delivery", "dine_in"]),
  terminal: z.string().trim().max(40).optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().max(120).default("Consumidor"),
  customerPhone: z.string().trim().max(30).optional(),
  tableNumber: z.string().trim().max(20).optional(),
  tableSessionId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(400).optional(),
  discount: z.number().min(0).max(1_000_000).default(0),
  discountReason: z.string().trim().max(200).optional(),
  couponCode: z.string().trim().max(40).optional(),
  cashbackUsed: z.number().min(0).max(1_000_000).default(0),
  fee: z.number().min(0).max(100_000).default(0),
  /** Manda o pedido para o monitor de preparo em vez de concluir na hora. */
  sendToKds: z.boolean().default(false),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().min(0.001).max(9999),
        /** Peso vendido quando o item é fracionado (kg, L...). */
        weightKg: z.number().min(0.001).max(9999).optional(),
        /** Registro da receita para itens controlados. */
        prescriptionInfo: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(200).optional(),
        /** Desconto em reais aplicado na linha inteira. */
        discount: z.number().min(0).max(1_000_000).default(0),
        options: z
          .array(z.object({ name: z.string().trim().min(1).max(80), price: z.number().min(0).max(100_000) }))
          .max(20)
          .default([]),
      }),
    )
    .min(1)
    .max(100),
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "pix", "debit", "credit", "voucher", "online", "on_delivery"]),
        amount: z.number().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(6),
});

export interface PosSaleResult {
  ok: boolean;
  message: string;
  orderId?: string;
  code?: string;
  total?: number;
  change?: number;
  loyaltyPoints?: number;
  cashbackEarned?: number;
  printJobs?: number;
  sentToKds?: boolean;
}

export const registerPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saleInput.parse(data))
  .handler(async ({ data, context }): Promise<PosSaleResult> => {
    await assertStaff(context as unknown as Ctx, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeText } = await import("@/lib/security.server");
    const { validateSplitPayments } = await import("@/lib/pdv");
    const { saleTotals, emptySaleDraft } = await import("@/lib/pos-sale");
    const { groupItemsByStation, templateForStation, buildStationTicket, STATION_LABEL } = await import("@/lib/salao");

    const { data: session } = await supabaseAdmin
      .from("cash_sessions")
      .select("id, store_id, status, terminal")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session || session.store_id !== data.storeId) return { ok: false, message: "Turno inválido." };
    if (session.status !== "open") return { ok: false, message: "Abra o caixa antes de vender." };

    const totalItemDiscount = data.items.reduce((sum, item) => sum + item.discount, 0);
    if ((data.discount > 0 || totalItemDiscount > 0) && !(await hasPosPermission(context as unknown as Ctx, data.storeId, "pos_discount"))) {
      return { ok: false, message: "Você não tem permissão para aplicar desconto." };
    }

    // Preço sempre do banco: o navegador não define quanto o cliente paga.
    const productIds = [...new Set(data.items.map((item) => item.productId))];
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, name, price, promo_price, track_stock, stock_quantity, prep_station, is_active, is_available, image_url, sold_by_weight, unit_label, requires_prescription")
      .eq("store_id", data.storeId)
      .in("id", productIds);

    const catalog = new Map((products ?? []).map((product) => [product.id, product]));
    // Estoque exigido considerando linhas repetidas do mesmo produto.
    const required = new Map<string, number>();
    for (const item of data.items) {
      required.set(item.productId, (required.get(item.productId) ?? 0) + item.quantity);
    }

    const draft = emptySaleDraft("servidor");
    const lines = [] as {
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      total: number;
      notes: string | null;
      prepStation: string | null;
      weightKg: number | null;
      prescriptionInfo: string | null;
    }[];

    for (const item of data.items) {
      const product = catalog.get(item.productId);
      if (!product || !product.is_active || product.is_available === false) {
        return { ok: false, message: "Um dos itens não está mais disponível." };
      }
      if (product.track_stock && product.stock_quantity < (required.get(item.productId) ?? 0)) {
        return { ok: false, message: `Estoque insuficiente para ${product.name}.` };
      }
      if (product.requires_prescription && !item.prescriptionInfo) {
        return { ok: false, message: `${product.name} é item controlado: registre a receita.` };
      }
      const basePrice = Number(product.promo_price ?? 0) > 0 ? Number(product.promo_price) : Number(product.price);
      const extrasText = item.options.map((option) => sanitizeText(option.name, 80)).join(", ");
      draft.lines.push({
        lineId: `${item.productId}-${draft.lines.length}`,
        productId: item.productId,
        name: product.name,
        imageUrl: product.image_url ?? null,
        unitPrice: basePrice,
        quantity: item.quantity,
        options: item.options.map((option) => ({ name: sanitizeText(option.name, 80), price: option.price })),
        notes: item.notes ? sanitizeText(item.notes, 200) : "",
        discount: item.discount,
        soldByWeight: Boolean(product.sold_by_weight),
        unitLabel: product.unit_label ?? "un",
      });
      const unitPrice = basePrice + item.options.reduce((sum, option) => sum + option.price, 0);
      const gross = Math.round(unitPrice * item.quantity * 100) / 100;
      lines.push({
        productId: product.id,
        name: extrasText ? `${product.name} (${extrasText})` : product.name,
        quantity: item.quantity,
        unitPrice,
        total: Math.round(Math.max(gross - item.discount, 0) * 100) / 100,
        notes: item.notes ? sanitizeText(item.notes, 200) : null,
        prepStation: product.prep_station ?? null,
        weightKg: product.sold_by_weight ? item.weightKg ?? item.quantity : null,
        prescriptionInfo: item.prescriptionInfo ? sanitizeText(item.prescriptionInfo, 200) : null,
      });
    }

    draft.discount = data.discount;
    draft.fee = data.fee;
    draft.cashbackUsed = data.cashbackUsed;
    const totals = saleTotals(draft);

    // Cashback só pode ser usado até o saldo real do cliente.
    if (totals.cashbackUsed > 0) {
      if (!data.customerId) return { ok: false, message: "Selecione o cliente para usar cashback." };
      const { data: account } = await supabaseAdmin
        .from("loyalty_accounts")
        .select("cashback_balance")
        .eq("store_id", data.storeId)
        .eq("customer_id", data.customerId)
        .maybeSingle();
      if (Number(account?.cashback_balance ?? 0) + 0.009 < totals.cashbackUsed) {
        return { ok: false, message: "Saldo de cashback insuficiente para este cliente." };
      }
    }

    const split = validateSplitPayments(
      data.payments.map((payment, index) => ({ id: String(index), method: payment.method, amount: payment.amount })),
      totals.total,
    );
    if (!split.ok) return { ok: false, message: split.message };

    const status = data.sendToKds ? "confirmed" : "completed";
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        store_id: data.storeId,
        customer_id: data.customerId ?? null,
        customer_name: sanitizeText(data.customerName || "Consumidor", 120),
        customer_phone: data.customerPhone?.trim() || null,
        type: data.fulfillment,
        channel: data.fulfillment === "dine_in" ? "mesa" : "pdv",
        table_number: data.fulfillment === "dine_in" ? (data.tableNumber?.trim() ?? null) : null,
        table_session_id: data.tableSessionId ?? null,
        status,
        subtotal: totals.subtotal,
        delivery_fee: totals.fee,
        discount: totals.discount,
        cashback_used: totals.cashbackUsed,
        coupon_code: data.couponCode?.trim() || null,
        total: totals.total,
        payment_method: data.payments.length > 1 ? "split" : data.payments[0]!.method,
        // Recebimento na entrega ainda não entrou: o pedido fica pendente.
        payment_status: data.payments.some((payment) => payment.method === "on_delivery") ? "pending" : "paid",
        notes:
          [
            data.notes ? sanitizeText(data.notes, 300) : null,
            data.discountReason ? `Desconto: ${sanitizeText(data.discountReason, 150)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
      })
      .select("id, code")
      .single();
    if (orderError || !order) return { ok: false, message: orderError?.message ?? "Não foi possível registrar a venda." };

    await supabaseAdmin.from("order_items").insert(
      lines.map((line) => ({
        order_id: order.id,
        store_id: data.storeId,
        product_id: line.productId,
        product_name: line.name,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        total: line.total,
        notes: line.notes,
        prep_station: line.prepStation,
        weight_kg: line.weightKg,
        prescription_info: line.prescriptionInfo,
        // Venda de balcão já sai preparada; o que vai ao KDS começa pendente.
        prep_status: data.sendToKds ? "pending" : "ready",
      })),
    );

    // Cada forma de pagamento vira uma transação e uma movimentação de caixa.
    const cashTotal = data.payments
      .filter((payment) => payment.method === "cash")
      .reduce((sum, payment) => sum + payment.amount, 0);

    for (const payment of data.payments) {
      const isCash = payment.method === "cash";
      // O troco sai do dinheiro: registramos o líquido recebido em espécie.
      const netAmount = isCash
        ? Math.round((payment.amount - (cashTotal > 0 ? (split.change * payment.amount) / cashTotal : 0)) * 100) / 100
        : payment.amount;

      await supabaseAdmin.from("payments").insert({
        store_id: data.storeId,
        order_id: order.id,
        method: payment.method,
        status: "paid",
        amount: payment.amount,
        provider: "pos",
        paid_at: new Date().toISOString(),
      });

      await supabaseAdmin.from("cash_movements").insert({
        store_id: data.storeId,
        session_id: session.id,
        order_id: order.id,
        kind: "sale",
        method: payment.method,
        amount: netAmount,
        reason: `Venda ${order.code}`,
        created_by: context.userId,
      });
    }

    // Estoque
    for (const [productId, quantity] of required) {
      const product = catalog.get(productId);
      if (!product?.track_stock) continue;
      await supabaseAdmin
        .from("products")
        .update({ stock_quantity: product.stock_quantity - quantity })
        .eq("id", productId);
      // Baixa por lote (FEFO): o que vence primeiro sai primeiro.
      let batchId: string | null = null;
      const { data: batches } = await supabaseAdmin
        .from("product_batches")
        .select("id, quantity, expires_at")
        .eq("store_id", data.storeId)
        .eq("product_id", productId)
        .gt("quantity", 0)
        .order("expires_at", { ascending: true, nullsFirst: false });

      let remaining = quantity;
      for (const batch of batches ?? []) {
        if (remaining <= 0) break;
        const take = Math.min(Number(batch.quantity), remaining);
        await supabaseAdmin
          .from("product_batches")
          .update({ quantity: Number(batch.quantity) - take })
          .eq("id", batch.id);
        remaining = Math.round((remaining - take) * 1000) / 1000;
        batchId = batchId ?? batch.id;
      }

      await supabaseAdmin.from("inventory_movements").insert({
        store_id: data.storeId,
        product_id: productId,
        batch_id: batchId,
        movement_type: "out",
        quantity,
        reason: `Venda PDV ${order.code}`,
        created_by: context.userId,
      });
    }

    /* ----- Fidelidade: pontos, cashback ganho e cashback consumido ----- */
    let loyaltyPoints = 0;
    let cashbackEarned = 0;
    if (data.customerId) {
      const { data: loyalty } = await supabaseAdmin
        .from("loyalty_settings")
        .select("is_enabled, points_per_currency, cashback_percent, min_order_value, points_expiration_days")
        .eq("store_id", data.storeId)
        .maybeSingle();

      if (loyalty?.is_enabled && totals.total >= Number(loyalty.min_order_value ?? 0)) {
        loyaltyPoints = Math.floor(totals.total * Number(loyalty.points_per_currency ?? 0));
        cashbackEarned = Math.round(((totals.total * Number(loyalty.cashback_percent ?? 0)) / 100) * 100) / 100;
      }

      if (loyaltyPoints > 0 || cashbackEarned > 0 || totals.cashbackUsed > 0) {
        const { data: account } = await supabaseAdmin
          .from("loyalty_accounts")
          .select("id, points_balance, points_earned, points_redeemed, cashback_balance, orders_count, total_spent")
          .eq("store_id", data.storeId)
          .eq("customer_id", data.customerId)
          .maybeSingle();

        const current = account ?? null;
        const payload = {
          points_balance: Number(current?.points_balance ?? 0) + loyaltyPoints,
          points_earned: Number(current?.points_earned ?? 0) + loyaltyPoints,
          cashback_balance:
            Math.round((Number(current?.cashback_balance ?? 0) + cashbackEarned - totals.cashbackUsed) * 100) / 100,
          orders_count: Number(current?.orders_count ?? 0) + 1,
          total_spent: Math.round((Number(current?.total_spent ?? 0) + totals.total) * 100) / 100,
          last_order_at: new Date().toISOString(),
        };

        if (current) {
          await supabaseAdmin.from("loyalty_accounts").update(payload).eq("id", current.id);
        } else {
          await supabaseAdmin
            .from("loyalty_accounts")
            .insert({ store_id: data.storeId, customer_id: data.customerId, ...payload });
        }

        const expiresAt =
          loyalty?.points_expiration_days && loyalty.points_expiration_days > 0
            ? new Date(Date.now() + loyalty.points_expiration_days * 86_400_000).toISOString()
            : null;

        if (loyaltyPoints > 0 || cashbackEarned > 0) {
          await supabaseAdmin.from("loyalty_transactions").insert({
            store_id: data.storeId,
            customer_id: data.customerId,
            order_id: order.id,
            kind: "earn",
            points: loyaltyPoints,
            cashback_amount: cashbackEarned,
            description: `Venda no PDV ${order.code}`,
            created_by: context.userId,
            expires_at: expiresAt,
          });
        }
        if (totals.cashbackUsed > 0) {
          await supabaseAdmin.from("loyalty_transactions").insert({
            store_id: data.storeId,
            customer_id: data.customerId,
            order_id: order.id,
            kind: "redeem",
            points: 0,
            cashback_amount: -totals.cashbackUsed,
            description: `Cashback usado na venda ${order.code}`,
            created_by: context.userId,
          });
        }
      }
    }

    /* ----- Impressão: cupom do caixa e vias por setor ----- */
    let printJobs = 0;
    const { data: printSettings } = await supabaseAdmin
      .from("print_settings")
      .select("auto_print, stations")
      .eq("store_id", data.storeId)
      .maybeSingle();
    const { data: store } = await supabaseAdmin.from("stores").select("name").eq("id", data.storeId).maybeSingle();

    if (printSettings?.auto_print !== false) {
      const groups = groupItemsByStation(
        lines.map((line) => ({
          product_name: line.name,
          quantity: line.quantity,
          notes: line.notes,
          prep_station: line.prepStation,
        })),
      );
      for (const group of groups) {
        const content = buildStationTicket({
          station: group.station,
          storeName: store?.name ?? "Loja",
          orderCode: order.code,
          tableLabel: data.tableNumber || null,
          items: group.items,
          notes: data.notes ?? null,
        });
        const { error } = await supabaseAdmin.from("print_jobs").insert({
          store_id: data.storeId,
          order_id: order.id,
          session_id: data.tableSessionId ?? null,
          station: group.station,
          template: templateForStation(group.station),
          title: `${STATION_LABEL[group.station] ?? group.station} · Pedido ${order.code}`,
          content,
          status: "pending",
          created_by: context.userId,
        });
        if (!error) printJobs += 1;
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: "pos.sale",
      entity: "orders",
      entity_id: order.id,
      metadata: {
        total: totals.total,
        discount: totals.discount,
        cashback_used: totals.cashbackUsed,
        methods: data.payments.map((p) => p.method),
        terminal: data.terminal ?? session.terminal,
        sent_to_kds: data.sendToKds,
      },
    });

    return {
      ok: true,
      message: "Venda registrada.",
      orderId: order.id,
      code: order.code,
      total: totals.total,
      change: split.change,
      loyaltyPoints,
      cashbackEarned,
      printJobs,
      sentToKds: data.sendToKds,
    };
  });


export const cancelPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), sessionId: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, store_id, code, total, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Venda não encontrada." };

    await assertStaff(context as unknown as Ctx, order.store_id);
    if (!(await hasPosPermission(context as unknown as Ctx, order.store_id, "pos_cancel"))) {
      return { ok: false, message: "Você não tem permissão para cancelar vendas." };
    }
    if (order.status === "cancelled") return { ok: false, message: "Esta venda já foi cancelada." };

    await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", cancel_reason: data.reason, payment_status: "refunded" })
      .eq("id", order.id);

    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("id, method, amount")
      .eq("order_id", order.id);

    for (const payment of payments ?? []) {
      await supabaseAdmin
        .from("payments")
        .update({ status: "refunded", refunded_amount: payment.amount, refunded_at: new Date().toISOString() })
        .eq("id", payment.id);
      await supabaseAdmin.from("cash_movements").insert({
        store_id: order.store_id,
        session_id: data.sessionId,
        order_id: order.id,
        kind: "refund",
        method: payment.method,
        amount: payment.amount,
        reason: `Cancelamento ${order.code}: ${data.reason}`,
        created_by: context.userId,
      });
    }

    // Devolve o estoque dos itens controlados.
    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", order.id);
    for (const item of items ?? []) {
      if (!item.product_id) continue;
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("track_stock, stock_quantity")
        .eq("id", item.product_id)
        .maybeSingle();
      if (!product?.track_stock) continue;
      await supabaseAdmin
        .from("products")
        .update({ stock_quantity: product.stock_quantity + item.quantity })
        .eq("id", item.product_id);
      await supabaseAdmin.from("inventory_movements").insert({
        store_id: order.store_id,
        product_id: item.product_id,
        movement_type: "in",
        quantity: item.quantity,
        reason: `Cancelamento PDV ${order.code}`,
        created_by: context.userId,
      });
    }

    await supabaseAdmin.from("audit_logs").insert({
      store_id: order.store_id,
      user_id: context.userId,
      action: "pos.sale_cancelled",
      entity: "orders",
      entity_id: order.id,
      metadata: { reason: data.reason, total: order.total },
    });

    return { ok: true, message: "Venda cancelada e estoque devolvido." };
  });

/* ---------------- Cobrança Pix da venda ---------------- */

export interface PosPixCharge {
  ok: boolean;
  message: string;
  payload?: string;
  demo?: boolean;
  expiresMinutes?: number;
}

export const posPixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        amount: z.number().positive().max(1_000_000),
        reference: z.string().trim().max(25).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<PosPixCharge> => {
    await assertStaff(context as unknown as Ctx, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildPixPayload } = await import("@/lib/pix");

    const { data: settings } = await supabaseAdmin
      .from("payment_settings")
      .select("pix_enabled, pix_key, pix_key_type, pix_holder_name, pix_city, pix_expires_minutes, is_sandbox")
      .eq("store_id", data.storeId)
      .maybeSingle();

    if (!settings?.pix_enabled || !settings.pix_key) {
      return {
        ok: false,
        demo: true,
        message: "Pix ainda não configurado. Em modo demonstração a cobrança é simulada.",
      };
    }

    const payload = buildPixPayload({
      key: settings.pix_key,
      keyType: (settings.pix_key_type ?? "random") as never,
      holderName: settings.pix_holder_name ?? "LOJISTA",
      city: settings.pix_city ?? "SAO PAULO",
      amount: Math.round(data.amount * 100) / 100,
      txid: (data.reference ?? `PDV${Date.now()}`).toUpperCase(),
    });

    return {
      ok: true,
      payload,
      demo: Boolean(settings.is_sandbox),
      expiresMinutes: settings.pix_expires_minutes ?? 30,
      message: settings.is_sandbox
        ? "Ambiente de testes: a transação é simulada."
        : "Cobrança Pix gerada. Confirme o recebimento antes de concluir.",
    };
  });

/* ---------------- Autorização de gerente ---------------- */

/**
 * Libera uma ação sensível (desconto acima do limite, cancelamento, sangria,
 * reabertura) com a credencial de um gerente ou proprietário. A senha é
 * validada pelo próprio serviço de autenticação e nunca fica armazenada.
 */
export const authorizeManagerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        email: z.string().trim().email().max(160),
        password: z.string().min(6).max(200),
        action: z.string().trim().min(2).max(60),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; managerName?: string }> => {
    await assertStaff(context as unknown as Ctx, data.storeId);
    const { createClient } = await import("@supabase/supabase-js");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const verifier = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data: signIn, error } = await verifier.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    await verifier.auth.signOut().catch(() => undefined);
    if (error || !signIn.user) return { ok: false, message: "E-mail ou senha do gerente inválidos." };

    const { data: membership } = await supabaseAdmin
      .from("store_members")
      .select("role")
      .eq("store_id", data.storeId)
      .eq("user_id", signIn.user.id)
      .maybeSingle();

    if (!membership || !["owner", "manager"].includes(membership.role)) {
      return { ok: false, message: "Esta pessoa não é gerente ou proprietária desta loja." };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", signIn.user.id)
      .maybeSingle();

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: "pos.manager_override",
      entity: "cash_sessions",
      metadata: { requested_action: data.action, authorized_by: signIn.user.id },
    });

    return { ok: true, message: "Ação autorizada pelo gerente.", managerName: profile?.full_name ?? data.email };
  });

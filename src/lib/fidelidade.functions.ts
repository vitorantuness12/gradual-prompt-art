import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SegmentConfig } from "@/lib/fidelidade";

/**
 * Funções de servidor do programa de fidelidade e do CRM.
 *
 * Nada aqui toma decisão automatizada com base em atributos sensíveis:
 * a segmentação usa apenas comportamento de compra (pedidos, valor, bairro
 * de entrega e marcadores criados pela própria loja) e o bloqueio é sempre
 * manual, com motivo, autor e data registrados.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertStaff(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("is_store_staff", { _store_id: storeId, _user_id: userId });
  if (data !== true) throw new Error("Sem permissão para esta loja.");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string, area: string) {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: area,
  });
  if (data !== true) throw new Error("Você não tem permissão para esta ação.");
}

function digits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/** ---------- Configuração geral ---------- */

const settingsInput = z.object({
  storeId: z.string().uuid(),
  isEnabled: z.boolean(),
  pointsPerCurrency: z.number().min(0).max(100),
  currencyPerPoint: z.number().min(0).max(100),
  cashbackPercent: z.number().min(0).max(100),
  cashbackExpirationDays: z.number().int().min(0).max(3650).default(90),
  cashbackMinOrder: z.number().min(0).default(0),
  cashbackMaxPercentUse: z.number().min(1).max(100).default(100),
  referralEnabled: z.boolean().default(false),
  referralCashbackReferrer: z.number().min(0).max(100000).default(0),
  referralCashbackReferred: z.number().min(0).max(100000).default(0),
  pointsExpirationDays: z.number().int().min(0).max(3650),
  minOrderValue: z.number().min(0),
  birthdayBonusPoints: z.number().int().min(0).max(100000),
  referralPoints: z.number().int().min(0).max(100000),
  referredPoints: z.number().int().min(0).max(100000),
  firstOrderPoints: z.number().int().min(0).max(100000),
  frequentOrdersThreshold: z.number().int().min(0).max(1000),
  frequentBonusPoints: z.number().int().min(0).max(100000),
  inactiveDays: z.number().int().min(0).max(3650),
  winbackPoints: z.number().int().min(0).max(100000),
  terms: z.string().trim().max(4000).optional(),
});

export const saveLoyaltySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "customers");
    const { error } = await context.supabase.from("loyalty_settings").upsert(
      {
        store_id: data.storeId,
        is_enabled: data.isEnabled,
        points_per_currency: data.pointsPerCurrency,
        currency_per_point: data.currencyPerPoint,
        cashback_percent: data.cashbackPercent,
        points_expiration_days: data.pointsExpirationDays,
        min_order_value: data.minOrderValue,
        birthday_bonus_points: data.birthdayBonusPoints,
        referral_points: data.referralPoints,
        referred_points: data.referredPoints,
        first_order_points: data.firstOrderPoints,
        frequent_orders_threshold: data.frequentOrdersThreshold,
        frequent_bonus_points: data.frequentBonusPoints,
        inactive_days: data.inactiveDays,
        winback_points: data.winbackPoints,
        terms: data.terms?.trim() || null,
      },
      { onConflict: "store_id" },
    );
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Programa de fidelidade atualizado." };
  });

/** ---------- Ajuste manual de pontos ---------- */

const adjustInput = z.object({
  storeId: z.string().uuid(),
  customerId: z.string().uuid(),
  points: z.number().int().min(-100000).max(100000),
  reason: z.string().trim().min(3).max(300),
});

export const adjustLoyaltyPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => adjustInput.parse(data))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; message: string; balance: number }> => {
      await assertPermission(context.supabase, data.storeId, context.userId, "customers");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sanitizeText } = await import("@/lib/security.server");

      const account = await ensureAccount(supabaseAdmin, data.storeId, data.customerId);
      const balance = account.points_balance + data.points;
      if (balance < 0)
        return {
          ok: false,
          message: "Saldo insuficiente para este ajuste.",
          balance: account.points_balance,
        };

      await supabaseAdmin
        .from("loyalty_accounts")
        .update({
          points_balance: balance,
          points_earned: account.points_earned + Math.max(0, data.points),
          points_redeemed: account.points_redeemed + Math.max(0, -data.points),
        })
        .eq("id", account.id);

      await supabaseAdmin.from("loyalty_transactions").insert({
        store_id: data.storeId,
        customer_id: data.customerId,
        kind: "adjust",
        points: data.points,
        description: sanitizeText(data.reason, 300),
        created_by: context.userId,
      });

      await syncTier(supabaseAdmin, data.storeId, data.customerId);
      return { ok: true, message: "Ajuste registrado no extrato.", balance };
    },
  );

/** ---------- Resgate de recompensa ---------- */

const redeemInput = z.object({
  storeId: z.string().uuid(),
  customerId: z.string().uuid(),
  rewardId: z.string().uuid(),
});

export const redeemReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => redeemInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; code?: string }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rewardAvailability, generateCode } = await import("@/lib/fidelidade");

    const { data: reward } = await supabaseAdmin
      .from("loyalty_rewards")
      .select("*")
      .eq("id", data.rewardId)
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!reward) return { ok: false, message: "Recompensa não encontrada." };

    const account = await ensureAccount(supabaseAdmin, data.storeId, data.customerId);
    const { count } = await supabaseAdmin
      .from("loyalty_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("store_id", data.storeId)
      .eq("customer_id", data.customerId)
      .eq("reward_id", data.rewardId);

    const check = rewardAvailability(reward, account.points_balance, count ?? 0);
    if (!check.available) return { ok: false, message: check.reason };

    const code = generateCode();
    const expiresAt = new Date(Date.now() + reward.valid_days * 86_400_000).toISOString();

    const { error } = await supabaseAdmin.from("loyalty_redemptions").insert({
      store_id: data.storeId,
      customer_id: data.customerId,
      reward_id: data.rewardId,
      points_spent: reward.points_cost,
      code,
      expires_at: expiresAt,
    });
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin
      .from("loyalty_accounts")
      .update({
        points_balance: account.points_balance - reward.points_cost,
        points_redeemed: account.points_redeemed + reward.points_cost,
      })
      .eq("id", account.id);

    if (reward.stock != null) {
      await supabaseAdmin
        .from("loyalty_rewards")
        .update({ stock: Math.max(0, reward.stock - 1) })
        .eq("id", reward.id);
    }

    if (reward.kind === "cashback") {
      await supabaseAdmin
        .from("loyalty_accounts")
        .update({
          cashback_balance: Number(account.cashback_balance) + Number(reward.discount_value),
        })
        .eq("id", account.id);
    }

    await supabaseAdmin.from("loyalty_transactions").insert({
      store_id: data.storeId,
      customer_id: data.customerId,
      kind: "redeem",
      points: -reward.points_cost,
      description: `Resgate: ${reward.name} (${code})`,
      created_by: context.userId,
      expires_at: expiresAt,
    });

    await syncTier(supabaseAdmin, data.storeId, data.customerId);
    return { ok: true, message: `Resgate criado. Código ${code}.`, code };
  });

/** ---------- Bloqueio de clientes ---------- */

const blockInput = z.object({
  storeId: z.string().uuid(),
  phone: z.string().trim().min(8).max(30),
  customerId: z.string().uuid().optional(),
  reason: z.string().trim().min(5).max(400),
  durationDays: z.number().int().min(0).max(3650).default(0),
});

export const blockCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => blockInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "customers");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeText } = await import("@/lib/security.server");

    const phone = digits(data.phone);
    if (phone.length < 8) return { ok: false, message: "Informe um telefone válido." };

    const expiresAt =
      data.durationDays > 0
        ? new Date(Date.now() + data.durationDays * 86_400_000).toISOString()
        : null;

    const { error } = await supabaseAdmin.from("customer_blocks").insert({
      store_id: data.storeId,
      phone,
      customer_id: data.customerId ?? null,
      reason: sanitizeText(data.reason, 400),
      blocked_by: context.userId,
      expires_at: expiresAt,
    });
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: "customer_blocked",
      entity: "customer_blocks",
      metadata: { phone, reason: sanitizeText(data.reason, 400), expires_at: expiresAt },
    });

    return { ok: true, message: "Cliente bloqueado. O histórico de pedidos foi preservado." };
  });

const unblockInput = z.object({
  storeId: z.string().uuid(),
  blockId: z.string().uuid(),
  reason: z.string().trim().min(3).max(400),
});

export const unblockCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => unblockInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "customers");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeText } = await import("@/lib/security.server");

    const { error } = await supabaseAdmin
      .from("customer_blocks")
      .update({
        is_active: false,
        unblocked_at: new Date().toISOString(),
        unblocked_by: context.userId,
        unblock_reason: sanitizeText(data.reason, 400),
      })
      .eq("id", data.blockId)
      .eq("store_id", data.storeId);
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: "customer_unblocked",
      entity: "customer_blocks",
      entity_id: data.blockId,
      metadata: { reason: sanitizeText(data.reason, 400) },
    });

    return { ok: true, message: "Bloqueio revisado e removido." };
  });

/** ---------- Campanhas segmentadas ---------- */

const runCampaignInput = z.object({
  storeId: z.string().uuid(),
  campaignId: z.string().uuid(),
  /** Quando verdadeiro apenas calcula o público, sem disparar nada. */
  preview: z.boolean().default(false),
});

export interface CampaignRunResult {
  ok: boolean;
  message: string;
  audience: number;
  sent: number;
  skipped: number;
  reasons: Record<string, number>;
}

export const runCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => runCampaignInput.parse(data))
  .handler(async ({ data, context }): Promise<CampaignRunResult> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "customers");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { matchesSegment, respectsFrequencyCap } = await import("@/lib/fidelidade");
    const { renderTemplate } = await import("@/lib/messaging/templates");
    const { getChannelAdapter } = await import("@/lib/messaging/adapters.server");

    const empty: CampaignRunResult = {
      ok: false,
      message: "",
      audience: 0,
      sent: 0,
      skipped: 0,
      reasons: {},
    };

    const { data: campaign } = await supabaseAdmin
      .from("crm_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!campaign) return { ...empty, message: "Campanha não encontrada." };

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id, name, slug")
      .eq("id", data.storeId)
      .maybeSingle();

    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone, email, district, tags")
      .eq("store_id", data.storeId)
      .limit(2000);

    const { data: accounts } = await supabaseAdmin
      .from("loyalty_accounts")
      .select("customer_id, orders_count, total_spent, last_order_at, created_at")
      .eq("store_id", data.storeId);

    const accountByCustomer = new Map((accounts ?? []).map((row) => [row.customer_id, row]));

    const { data: blocks } = await supabaseAdmin
      .from("customer_blocks")
      .select("phone, is_active, expires_at")
      .eq("store_id", data.storeId)
      .eq("is_active", true);
    const blockedPhones = new Set((blocks ?? []).map((row) => digits(row.phone)));

    const { data: consents } = await supabaseAdmin
      .from("contact_consents")
      .select("contact, channel, opted_in")
      .eq("store_id", data.storeId);
    const optedOut = new Set(
      (consents ?? [])
        .filter((row) => row.opted_in === false)
        .map((row) => `${row.channel}:${row.contact}`),
    );

    const since = new Date(
      Date.now() - Math.max(1, campaign.frequency_cap_days) * 86_400_000,
    ).toISOString();
    const { data: recentSends } = await supabaseAdmin
      .from("crm_campaign_sends")
      .select("customer_id, sent_at")
      .eq("store_id", data.storeId)
      .gte("sent_at", since)
      .order("sent_at", { ascending: false });
    const lastSendByCustomer = new Map<string, string>();
    for (const row of recentSends ?? []) {
      if (row.customer_id && !lastSendByCustomer.has(row.customer_id)) {
        lastSendByCustomer.set(row.customer_id, row.sent_at);
      }
    }

    const config = (campaign.segment_config ?? {}) as SegmentConfig;
    const reasons: Record<string, number> = {};
    const bump = (key: string) => {
      reasons[key] = (reasons[key] ?? 0) + 1;
    };

    const audience = (customers ?? []).filter((customer) => {
      const account = accountByCustomer.get(customer.id);
      return matchesSegment(campaign.segment, config, {
        id: customer.id,
        ordersCount: account?.orders_count ?? 0,
        totalSpent: Number(account?.total_spent ?? 0),
        lastOrderAt: account?.last_order_at ?? null,
        firstOrderAt: account?.created_at ?? null,
        district: customer.district,
        tags: customer.tags ?? [],
      });
    });

    if (data.preview) {
      return {
        ok: true,
        message: `${audience.length} cliente(s) no público.`,
        audience: audience.length,
        sent: 0,
        skipped: 0,
        reasons,
      };
    }

    let sent = 0;
    let skipped = 0;
    const channels = campaign.channels.length > 0 ? campaign.channels : ["whatsapp"];

    for (const customer of audience.slice(0, 300)) {
      if (blockedPhones.has(digits(customer.phone))) {
        skipped += 1;
        bump("bloqueado");
        continue;
      }
      if (
        !respectsFrequencyCap(
          lastSendByCustomer.get(customer.id) ?? null,
          campaign.frequency_cap_days,
        )
      ) {
        skipped += 1;
        bump("limite de frequência");
        continue;
      }

      const body = renderTemplate(campaign.message_body, {
        cliente: customer.name,
        loja: store?.name ?? "",
        catalogo: store?.slug ? `https://oseupedido.com.br/${store.slug}` : "",
        link: store?.slug ? `https://oseupedido.com.br/${store.slug}` : "",
      });

      let deliveredForCustomer = false;

      for (const channel of channels) {
        const contact = channel === "email" ? customer.email : customer.phone;
        if (!contact) {
          bump("sem contato");
          continue;
        }
        if (optedOut.has(`${channel}:${contact}`)) {
          bump("opt-out");
          continue;
        }

        const { data: settings } = await supabaseAdmin
          .from("channel_settings")
          .select("*")
          .eq("store_id", data.storeId)
          .eq("channel", channel)
          .maybeSingle();

        let result: { ok: boolean; demo: boolean; externalId: string | null; error?: string } = {
          ok: true,
          demo: true,
          externalId: null,
        };
        if (settings) {
          const { data: credentials } = await supabaseAdmin
            .from("channel_credentials")
            .select("*")
            .eq("store_id", data.storeId)
            .eq("channel", channel)
            .maybeSingle();
          const adapter = getChannelAdapter(channel);
          result = await adapter.send(
            {
              channel,
              demoMode: settings.demo_mode,
              accountId: settings.account_id,
              phoneNumberId: settings.phone_number_id,
              displayNumber: settings.display_number,
              fromEmail: settings.from_email,
              botUsername: settings.bot_username,
            },
            {
              accessToken: credentials?.access_token ?? null,
              verifyToken: credentials?.verify_token ?? null,
              appSecret: credentials?.app_secret ?? null,
              extra: {},
            },
            contact,
            body,
          );
        }

        await supabaseAdmin.from("crm_campaign_sends").insert({
          store_id: data.storeId,
          campaign_id: campaign.id,
          customer_id: customer.id,
          channel,
          contact,
          status: result.ok ? (result.demo ? "simulado" : "enviado") : "falhou",
          reason: result.error ?? null,
          body,
        });

        await supabaseAdmin.from("message_logs").insert({
          store_id: data.storeId,
          channel,
          contact,
          direction: "outbound",
          event: "campanha",
          level: result.ok ? "info" : "error",
          error: result.error ?? null,
          payload: { campaign: campaign.name },
        });

        if (result.ok) deliveredForCustomer = true;
      }

      if (deliveredForCustomer) {
        sent += 1;
        if (campaign.bonus_points > 0) {
          const account = await ensureAccount(supabaseAdmin, data.storeId, customer.id);
          await supabaseAdmin
            .from("loyalty_accounts")
            .update({
              points_balance: account.points_balance + campaign.bonus_points,
              points_earned: account.points_earned + campaign.bonus_points,
            })
            .eq("id", account.id);
          await supabaseAdmin.from("loyalty_transactions").insert({
            store_id: data.storeId,
            customer_id: customer.id,
            kind: "bonus",
            points: campaign.bonus_points,
            description: `Campanha: ${campaign.name}`,
          });
        }
      } else {
        skipped += 1;
      }
    }

    await supabaseAdmin
      .from("crm_campaigns")
      .update({
        last_run_at: new Date().toISOString(),
        sent_count: campaign.sent_count + sent,
        skipped_count: campaign.skipped_count + skipped,
        status: "sent",
      })
      .eq("id", campaign.id);

    return {
      ok: true,
      message: `Campanha disparada para ${sent} cliente(s). ${skipped} ignorado(s) por consentimento, bloqueio ou limite.`,
      audience: audience.length,
      sent,
      skipped,
      reasons,
    };
  });

/** ---------- Registro de pontos de um pedido (loja pública) ---------- */

const awardInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  orderCode: z.string().trim().min(3).max(30),
  phone: z.string().trim().max(30).default(""),
});

export const awardOrderLoyalty = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => awardInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; points: number; message: string }> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed)
      return { ok: false, points: 0, message: "Muitas tentativas. Tente novamente em instantes." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { calculateOrderPoints, resolveTier } = await import("@/lib/fidelidade");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return { ok: false, points: 0, message: "Loja não encontrada." };

    const { data: settings } = await supabaseAdmin
      .from("loyalty_settings")
      .select("*")
      .eq("store_id", store.id)
      .maybeSingle();
    if (!settings || !settings.is_enabled)
      return { ok: false, points: 0, message: "Programa inativo." };

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, total, type, customer_name, customer_phone, customer_email, customer_id, address, created_at, cashback_used",
      )
      .eq("store_id", store.id)
      .eq("code", data.orderCode)
      .maybeSingle();
    if (!order) return { ok: false, points: 0, message: "Pedido não encontrado." };
    if (digits(order.customer_phone) !== digits(data.phone)) {
      return { ok: false, points: 0, message: "Pedido não confere com o telefone informado." };
    }

    // Idempotência: não pontua o mesmo pedido duas vezes.
    const { count: already } = await supabaseAdmin
      .from("loyalty_transactions")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .eq("order_id", order.id);
    if ((already ?? 0) > 0)
      return { ok: true, points: 0, message: "Pontos deste pedido já foram creditados." };

    // Cliente
    let customerId = order.customer_id;
    if (!customerId) {
      const { data: existing } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("store_id", store.id)
        .eq("phone", order.customer_phone ?? "")
        .maybeSingle();
      if (existing) {
        customerId = existing.id;
      } else {
        const { data: created } = await supabaseAdmin
          .from("customers")
          .insert({
            store_id: store.id,
            name: order.customer_name,
            phone: order.customer_phone,
            email: order.customer_email,
          })
          .select("id")
          .maybeSingle();
        customerId = created?.id ?? null;
      }
      if (customerId)
        await supabaseAdmin.from("orders").update({ customer_id: customerId }).eq("id", order.id);
    }
    if (!customerId)
      return { ok: false, points: 0, message: "Não foi possível identificar o cliente." };

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("birth_date, district")
      .eq("id", customerId)
      .maybeSingle();

    const account = await ensureAccount(supabaseAdmin, store.id, customerId);

    const { data: rules } = await supabaseAdmin
      .from("loyalty_rules")
      .select("*")
      .eq("store_id", store.id)
      .eq("is_active", true);

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_id, total, products(category_id)")
      .eq("order_id", order.id);

    const { data: tiers } = await supabaseAdmin
      .from("loyalty_tiers")
      .select("*")
      .eq("store_id", store.id);
    const tier = resolveTier(tiers ?? [], account.points_balance);

    const address = (order.address ?? {}) as { district?: string };
    const daysSinceLastOrder = account.last_order_at
      ? Math.floor((Date.now() - new Date(account.last_order_at).getTime()) / 86_400_000)
      : null;

    const result = calculateOrderPoints(
      settings,
      rules ?? [],
      {
        total: Number(order.total),
        subtotal: Number(order.total),
        type: order.type,
        channel: "loja",
        district: address.district ?? customer?.district ?? null,
        items: (items ?? []).map((item) => ({
          productId: item.product_id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: (item as any).products?.category_id ?? null,
          total: Number(item.total),
        })),
        previousOrders: account.orders_count,
        daysSinceLastOrder,
        birthMonth: customer?.birth_date ? new Date(customer.birth_date).getUTCMonth() + 1 : null,
      },
      Number(tier?.points_multiplier ?? 1),
    );

    const expiresAt =
      settings.points_expiration_days > 0
        ? new Date(Date.now() + settings.points_expiration_days * 86_400_000).toISOString()
        : null;

    if (result.total > 0) {
      await supabaseAdmin.from("loyalty_transactions").insert({
        store_id: store.id,
        customer_id: customerId,
        kind: "earn",
        points: result.total,
        cashback_amount: 0,
        order_id: order.id,
        description: result.lines.map((line) => line.label).join(" · "),
        expires_at: expiresAt,
      });
    }

    await supabaseAdmin
      .from("loyalty_accounts")
      .update({
        points_balance: account.points_balance + result.total,
        points_earned: account.points_earned + result.total,
        orders_count: account.orders_count + 1,
        total_spent: Number(account.total_spent) + Number(order.total),
        last_order_at: order.created_at,
      })
      .eq("id", account.id);

    // Cashback em R$: debita o que foi usado no pedido, credita o novo saldo
    // com validade e paga as duas pontas da indicação (uma única vez).
    const { settleOrderCashback } = await import("@/lib/cashback.server");
    const cashback = await settleOrderCashback(supabaseAdmin, {
      storeId: store.id,
      customerId,
      orderId: order.id,
      orderTotal: Number(order.total),
      cashbackUsed: Number(order.cashback_used ?? 0),
    });

    await syncTier(supabaseAdmin, store.id, customerId);
    await updateMissions(supabaseAdmin, store.id, customerId, Number(order.total));

    const parts = [
      result.total > 0 ? `${result.total} ponto(s)` : "",
      cashback.earned > 0 ? `R$ ${cashback.earned.toFixed(2)} de cashback` : "",
      cashback.referral > 0 ? `R$ ${cashback.referral.toFixed(2)} de bônus da indicação` : "",
    ].filter(Boolean);

    return {
      ok: true,
      points: result.total,
      message:
        parts.length > 0
          ? `Você ganhou ${parts.join(" e ")} neste pedido.`
          : "Pedido registrado no programa de fidelidade.",
    };
  });

/** ---------- Consulta pública do cliente ---------- */

const statusInput = z.object({
  storeSlug: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(8).max(30),
});

export interface PublicLoyaltyStatus {
  enabled: boolean;
  blocked: boolean;
  points: number;
  cashback: number;
  pointsValue: number;
  tier: { name: string; color: string; benefits: string | null } | null;
  nextTier: { name: string; missing: number } | null;
  progress: number;
  terms: string | null;
  statement: { date: string; label: string; points: number }[];
  rewards: {
    id: string;
    name: string;
    description: string | null;
    cost: number;
    available: boolean;
    reason: string;
  }[];
  missions: {
    id: string;
    title: string;
    description: string | null;
    goal: number;
    progress: number;
    percent: number;
    reward: number;
  }[];
  redemptions: { code: string; reward: string; status: string; expiresAt: string | null }[];
}

const emptyStatus: PublicLoyaltyStatus = {
  enabled: false,
  blocked: false,
  points: 0,
  cashback: 0,
  pointsValue: 0,
  tier: null,
  nextTier: null,
  progress: 0,
  terms: null,
  statement: [],
  rewards: [],
  missions: [],
  redemptions: [],
};

export const publicLoyaltyStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data }): Promise<PublicLoyaltyStatus> => {
    const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
    const limit = await consumeRateLimit("tracking", clientIdentifier(getRequest()?.headers));
    if (!limit.allowed) return emptyStatus;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      resolveTier,
      nextTier: findNextTier,
      tierProgress,
      rewardAvailability,
      missionProgressPercent,
      pointsToCurrency,
      TRANSACTION_LABEL,
    } = await import("@/lib/fidelidade");

    const phone = digits(data.phone);
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return emptyStatus;

    const { data: blocked } = await supabaseAdmin.rpc("is_customer_blocked", {
      _store_id: store.id,
      _phone: phone,
    });

    const { data: settings } = await supabaseAdmin
      .from("loyalty_settings")
      .select("*")
      .eq("store_id", store.id)
      .maybeSingle();
    if (!settings || !settings.is_enabled) return { ...emptyStatus, blocked: blocked === true };

    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id, phone")
      .eq("store_id", store.id)
      .limit(4000);
    const customer = (customers ?? []).find((row) => digits(row.phone) === phone);
    if (!customer) {
      return { ...emptyStatus, enabled: true, blocked: blocked === true, terms: settings.terms };
    }

    const account = await ensureAccount(supabaseAdmin, store.id, customer.id);
    const [
      { data: tiers },
      { data: transactions },
      { data: rewards },
      { data: missions },
      { data: progress },
      { data: redemptions },
    ] = await Promise.all([
      supabaseAdmin.from("loyalty_tiers").select("*").eq("store_id", store.id).order("min_points"),
      supabaseAdmin
        .from("loyalty_transactions")
        .select("created_at, kind, points, description")
        .eq("store_id", store.id)
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("loyalty_rewards")
        .select("*")
        .eq("store_id", store.id)
        .eq("is_active", true),
      supabaseAdmin
        .from("loyalty_missions")
        .select("*")
        .eq("store_id", store.id)
        .eq("is_active", true),
      supabaseAdmin
        .from("loyalty_mission_progress")
        .select("*")
        .eq("store_id", store.id)
        .eq("customer_id", customer.id),
      supabaseAdmin
        .from("loyalty_redemptions")
        .select("code, status, expires_at, loyalty_rewards(name)")
        .eq("store_id", store.id)
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const tier = resolveTier(tiers ?? [], account.points_balance);
    const upcoming = findNextTier(tiers ?? [], account.points_balance);

    const { data: myRedemptions } = await supabaseAdmin
      .from("loyalty_redemptions")
      .select("reward_id")
      .eq("store_id", store.id)
      .eq("customer_id", customer.id);
    const countByReward = new Map<string, number>();
    for (const row of myRedemptions ?? []) {
      if (row.reward_id)
        countByReward.set(row.reward_id, (countByReward.get(row.reward_id) ?? 0) + 1);
    }

    return {
      enabled: true,
      blocked: blocked === true,
      points: account.points_balance,
      cashback: Number(account.cashback_balance),
      pointsValue: pointsToCurrency(account.points_balance, Number(settings.currency_per_point)),
      tier: tier ? { name: tier.name, color: tier.color, benefits: tier.benefits } : null,
      nextTier: upcoming
        ? { name: upcoming.name, missing: upcoming.min_points - account.points_balance }
        : null,
      progress: tierProgress(tiers ?? [], account.points_balance),
      terms: settings.terms,
      statement: (transactions ?? []).map((row) => ({
        date: row.created_at,
        label: row.description || TRANSACTION_LABEL[row.kind] || row.kind,
        points: row.points,
      })),
      rewards: (rewards ?? []).map((reward) => {
        const check = rewardAvailability(
          reward,
          account.points_balance,
          countByReward.get(reward.id) ?? 0,
        );
        return {
          id: reward.id,
          name: reward.name,
          description: reward.description,
          cost: reward.points_cost,
          available: check.available,
          reason: check.reason,
        };
      }),
      missions: (missions ?? []).map((mission) => {
        const current = (progress ?? []).find((row) => row.mission_id === mission.id);
        const value = Number(current?.progress ?? 0);
        return {
          id: mission.id,
          title: mission.title,
          description: mission.description,
          goal: Number(mission.goal_value),
          progress: value,
          percent: missionProgressPercent(Number(mission.goal_value), value),
          reward: mission.reward_points,
        };
      }),
      redemptions: (redemptions ?? []).map((row) => ({
        code: row.code,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reward: (row as any).loyalty_rewards?.name ?? "Recompensa",
        status: row.status,
        expiresAt: row.expires_at,
      })),
    };
  });

/** ---------- Helpers internos ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAccount(supabaseAdmin: any, storeId: string, customerId: string) {
  const { data: existing } = await supabaseAdmin
    .from("loyalty_accounts")
    .select("*")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing) return existing;

  const referral = `IND${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { data: created } = await supabaseAdmin
    .from("loyalty_accounts")
    .insert({ store_id: storeId, customer_id: customerId, referral_code: referral })
    .select("*")
    .maybeSingle();
  return created;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTier(supabaseAdmin: any, storeId: string, customerId: string) {
  const { resolveTier } = await import("@/lib/fidelidade");
  const [{ data: tiers }, { data: account }] = await Promise.all([
    supabaseAdmin.from("loyalty_tiers").select("*").eq("store_id", storeId),
    supabaseAdmin
      .from("loyalty_accounts")
      .select("id, points_earned")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .maybeSingle(),
  ]);
  if (!account) return;
  const tier = resolveTier(tiers ?? [], account.points_earned);
  await supabaseAdmin
    .from("loyalty_accounts")
    .update({ tier_id: tier?.id ?? null })
    .eq("id", account.id);
}

async function updateMissions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,

  storeId: string,
  customerId: string,
  orderTotal: number,
) {
  const now = new Date().toISOString();
  const { data: missions } = await supabaseAdmin
    .from("loyalty_missions")
    .select("*")
    .eq("store_id", storeId)
    .eq("is_active", true);

  for (const mission of missions ?? []) {
    if (mission.starts_at && mission.starts_at > now) continue;
    if (mission.ends_at && mission.ends_at < now) continue;

    const { data: current } = await supabaseAdmin
      .from("loyalty_mission_progress")
      .select("*")
      .eq("mission_id", mission.id)
      .eq("customer_id", customerId)
      .maybeSingle();

    const increment = mission.goal_kind === "spend" ? orderTotal : 1;
    const progress = Number(current?.progress ?? 0) + increment;
    const completed = progress >= Number(mission.goal_value);
    const alreadyRewarded = current?.rewarded === true;

    if (current) {
      await supabaseAdmin
        .from("loyalty_mission_progress")
        .update({
          progress,
          completed_at: completed ? (current.completed_at ?? now) : null,
          rewarded: alreadyRewarded || (completed && mission.reward_points > 0),
        })
        .eq("id", current.id);
    } else {
      await supabaseAdmin.from("loyalty_mission_progress").insert({
        store_id: storeId,
        mission_id: mission.id,
        customer_id: customerId,
        progress,
        completed_at: completed ? now : null,
        rewarded: completed && mission.reward_points > 0,
      });
    }

    if (completed && !alreadyRewarded && mission.reward_points > 0) {
      const account = await ensureAccount(supabaseAdmin, storeId, customerId);
      await supabaseAdmin
        .from("loyalty_accounts")
        .update({
          points_balance: account.points_balance + mission.reward_points,
          points_earned: account.points_earned + mission.reward_points,
        })
        .eq("id", account.id);
      await supabaseAdmin.from("loyalty_transactions").insert({
        store_id: storeId,
        customer_id: customerId,
        kind: "bonus",
        points: mission.reward_points,
        description: `Missão concluída: ${mission.title}`,
      });
    }
  }
}

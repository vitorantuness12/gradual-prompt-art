/**
 * Camada de servidor do cashback em R$ e do "indique e ganhe".
 *
 * Regras concentradas aqui para que o checkout, a área do cliente e o
 * fechamento do pedido usem exatamente o mesmo cálculo:
 * - o saldo vive em `loyalty_accounts.cashback_balance`, com UMA validade
 *   (`cashback_expires_at`) renovada a cada crédito;
 * - saldo vencido é zerado no primeiro acesso (não fica saldo fantasma);
 * - o crédito da indicação só sai depois do pedido concluído do indicado,
 *   e apenas uma vez por cliente (`referral_rewarded_at`).
 */
import {
  cashbackEarned,
  effectiveCashback,
  normalizeReferralCode,
  referralCodeFor,
  referralRewards,
  renewExpiry,
  toCents,
} from "@/lib/cashback";
import type { CashbackStatus, ApplyReferralResult } from "@/lib/cashback.functions";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

function digits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

const EMPTY: CashbackStatus = {
  enabled: false,
  balance: 0,
  expiresAt: null,
  maxPercentUse: 100,
  earnPercent: 0,
  minOrder: 0,
  referralCode: null,
  referralCount: 0,
  referralEnabled: false,
  referralRewards: { referrer: 0, referred: 0 },
  referredAlready: false,
};

async function storeBySlug(admin: Admin, slug: string) {
  const { data } = await admin
    .from("stores")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

async function customerByPhone(admin: Admin, storeId: string, phone: string) {
  if (phone.length < 8) return null;
  const { data: rows } = await admin
    .from("customers")
    .select("id, phone, name")
    .eq("store_id", storeId)
    .limit(4000);
  return (rows ?? []).find((row) => digits(row.phone).endsWith(phone.slice(-10))) ?? null;
}

/** Garante conta de fidelidade com código de indicação único por loja. */
export async function ensureCashbackAccount(admin: Admin, storeId: string, customerId: string) {
  const { data: existing } = await admin
    .from("loyalty_accounts")
    .select("*")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing) {
    if (existing.referral_code) return existing;
    const { data: updated } = await admin
      .from("loyalty_accounts")
      .update({ referral_code: referralCodeFor(customerId) })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    return updated ?? existing;
  }

  const { data: created } = await admin
    .from("loyalty_accounts")
    .insert({
      store_id: storeId,
      customer_id: customerId,
      referral_code: referralCodeFor(customerId),
    })
    .select("*")
    .maybeSingle();
  return created;
}

/** Zera saldo vencido, devolvendo o saldo utilizável. */
async function settleExpired(
  admin: Admin,
  account: { id: string; cashback_balance: number | string; cashback_expires_at: string | null },
): Promise<number> {
  const usable = effectiveCashback(account.cashback_balance, account.cashback_expires_at);
  if (usable === 0 && Number(account.cashback_balance) > 0) {
    await admin
      .from("loyalty_accounts")
      .update({ cashback_balance: 0, cashback_expires_at: null })
      .eq("id", account.id);
  }
  return usable;
}

/** Saldo, validade e dados de indicação do cliente identificado pelo telefone. */
export async function loadCashbackAccount(
  admin: Admin,
  storeSlug: string,
  phone: string,
): Promise<CashbackStatus> {
  const store = await storeBySlug(admin, storeSlug);
  if (!store) return EMPTY;

  const { data: settings } = await admin
    .from("loyalty_settings")
    .select("*")
    .eq("store_id", store.id)
    .maybeSingle();
  if (!settings || !settings.is_enabled) return EMPTY;

  const rewards = referralRewards(settings);
  const base: CashbackStatus = {
    ...EMPTY,
    enabled: true,
    maxPercentUse: Number(settings.cashback_max_percent_use ?? 100),
    earnPercent: Number(settings.cashback_percent ?? 0),
    minOrder: Number(settings.cashback_min_order ?? 0),
    referralEnabled: Boolean(settings.referral_enabled),
    referralRewards: rewards,
  };

  const customer = await customerByPhone(admin, store.id, phone);
  if (!customer) return base;

  const account = await ensureCashbackAccount(admin, store.id, customer.id);
  if (!account) return base;

  const balance = await settleExpired(admin, account);

  return {
    ...base,
    balance,
    expiresAt: balance > 0 ? account.cashback_expires_at : null,
    referralCode: account.referral_code,
    referralCount: Number(account.referral_count ?? 0),
    referredAlready: Boolean(account.referred_by),
  };
}

/** Credita cashback e renova a validade do saldo. */
export async function creditCashback(
  admin: Admin,
  params: {
    storeId: string;
    customerId: string;
    amount: number;
    expirationDays: number;
    description: string;
    orderId?: string | null;
  },
): Promise<number> {
  const amount = toCents(params.amount);
  if (amount <= 0) return 0;

  const account = await ensureCashbackAccount(admin, params.storeId, params.customerId);
  if (!account) return 0;

  const current = effectiveCashback(account.cashback_balance, account.cashback_expires_at);
  const expiresAt = renewExpiry(params.expirationDays);

  await admin
    .from("loyalty_accounts")
    .update({ cashback_balance: toCents(current + amount), cashback_expires_at: expiresAt })
    .eq("id", account.id);

  await admin.from("loyalty_transactions").insert({
    store_id: params.storeId,
    customer_id: params.customerId,
    kind: "cashback",
    points: 0,
    cashback_amount: amount,
    order_id: params.orderId ?? null,
    description: params.description,
    expires_at: expiresAt,
  });

  return amount;
}

/** Debita o cashback usado no pedido, sem deixar saldo negativo. */
export async function debitCashback(
  admin: Admin,
  params: {
    storeId: string;
    customerId: string;
    amount: number;
    orderId?: string | null;
  },
): Promise<number> {
  const requested = toCents(params.amount);
  if (requested <= 0) return 0;

  const account = await ensureCashbackAccount(admin, params.storeId, params.customerId);
  if (!account) return 0;

  const available = await settleExpired(admin, account);
  const used = Math.min(available, requested);
  if (used <= 0) return 0;

  await admin
    .from("loyalty_accounts")
    .update({ cashback_balance: toCents(available - used) })
    .eq("id", account.id);

  await admin.from("loyalty_transactions").insert({
    store_id: params.storeId,
    customer_id: params.customerId,
    kind: "redeem",
    points: 0,
    cashback_amount: -used,
    order_id: params.orderId ?? null,
    description: "Cashback usado no pedido",
  });

  return used;
}

/** Vincula o cliente ao código de indicação (crédito só na conversão). */
export async function linkReferral(
  admin: Admin,
  storeSlug: string,
  phone: string,
  rawCode: string,
): Promise<ApplyReferralResult> {
  const code = normalizeReferralCode(rawCode);
  const store = await storeBySlug(admin, storeSlug);
  if (!store) return { ok: false, message: "Loja não encontrada.", reward: 0 };

  const { data: settings } = await admin
    .from("loyalty_settings")
    .select("*")
    .eq("store_id", store.id)
    .maybeSingle();
  if (!settings || !settings.is_enabled || !settings.referral_enabled) {
    return { ok: false, message: "Esta loja não está com o indique e ganhe ativo.", reward: 0 };
  }

  const customer = await customerByPhone(admin, store.id, phone);
  if (!customer) {
    return {
      ok: false,
      message: "Confirme seu telefone antes de aplicar o código de indicação.",
      reward: 0,
    };
  }

  const { data: referrer } = await admin
    .from("loyalty_accounts")
    .select("id, customer_id")
    .eq("store_id", store.id)
    .eq("referral_code", code)
    .maybeSingle();
  if (!referrer) return { ok: false, message: "Código de indicação não encontrado.", reward: 0 };
  if (referrer.customer_id === customer.id) {
    return { ok: false, message: "Você não pode usar o seu próprio código.", reward: 0 };
  }

  const account = await ensureCashbackAccount(admin, store.id, customer.id);
  if (!account) return { ok: false, message: "Não foi possível registrar a indicação.", reward: 0 };
  if (account.referred_by) {
    return { ok: false, message: "Você já usou um código de indicação nesta loja.", reward: 0 };
  }
  if (Number(account.orders_count ?? 0) > 0) {
    return {
      ok: false,
      message: "O código de indicação vale apenas para o primeiro pedido.",
      reward: 0,
    };
  }

  const { error } = await admin
    .from("loyalty_accounts")
    .update({ referred_by: referrer.customer_id })
    .eq("id", account.id);
  if (error) return { ok: false, message: "Não foi possível registrar a indicação.", reward: 0 };

  const rewards = referralRewards(settings);
  return {
    ok: true,
    message:
      rewards.referred > 0
        ? "Indicação aplicada! O crédito entra na sua conta quando o pedido for concluído."
        : "Indicação registrada.",
    reward: rewards.referred,
  };
}

/**
 * Fecha o ciclo do pedido: debita o cashback usado, credita o cashback do
 * pedido e paga os dois lados da indicação na primeira conversão.
 */
export async function settleOrderCashback(
  admin: Admin,
  params: {
    storeId: string;
    customerId: string;
    orderId: string;
    orderTotal: number;
    cashbackUsed: number;
  },
): Promise<{ earned: number; used: number; referral: number }> {
  const { data: settings } = await admin
    .from("loyalty_settings")
    .select("*")
    .eq("store_id", params.storeId)
    .maybeSingle();
  if (!settings || !settings.is_enabled) return { earned: 0, used: 0, referral: 0 };

  const used = await debitCashback(admin, {
    storeId: params.storeId,
    customerId: params.customerId,
    amount: params.cashbackUsed,
    orderId: params.orderId,
  });

  const expirationDays = Number(settings.cashback_expiration_days ?? 0);
  const earned = await creditCashback(admin, {
    storeId: params.storeId,
    customerId: params.customerId,
    amount: cashbackEarned(
      params.orderTotal,
      settings.cashback_percent,
      settings.cashback_min_order,
    ),
    expirationDays,
    description: "Cashback do pedido",
    orderId: params.orderId,
  });

  const referral = await settleReferral(admin, {
    storeId: params.storeId,
    customerId: params.customerId,
    orderId: params.orderId,
    expirationDays,
    settings,
  });

  return { earned, used, referral };
}

async function settleReferral(
  admin: Admin,
  params: {
    storeId: string;
    customerId: string;
    orderId: string;
    expirationDays: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings: any;
  },
): Promise<number> {
  const rewards = referralRewards(params.settings);
  if (rewards.referrer <= 0 && rewards.referred <= 0) return 0;

  const account = await ensureCashbackAccount(admin, params.storeId, params.customerId);
  if (!account?.referred_by || account.referral_rewarded_at) return 0;

  // Marca antes de creditar: se algo falhar depois, o pior caso é não pagar
  // duas vezes (nunca pagar em dobro).
  const { data: claimed } = await admin
    .from("loyalty_accounts")
    .update({ referral_rewarded_at: new Date().toISOString() })
    .eq("id", account.id)
    .is("referral_rewarded_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return 0;

  await creditCashback(admin, {
    storeId: params.storeId,
    customerId: params.customerId,
    amount: rewards.referred,
    expirationDays: params.expirationDays,
    description: "Bônus por usar código de indicação",
    orderId: params.orderId,
  });

  const referrerAccount = await ensureCashbackAccount(
    admin,
    params.storeId,
    account.referred_by as string,
  );
  if (referrerAccount) {
    await creditCashback(admin, {
      storeId: params.storeId,
      customerId: account.referred_by as string,
      amount: rewards.referrer,
      expirationDays: params.expirationDays,
      description: "Bônus por indicar um amigo",
      orderId: params.orderId,
    });
    await admin
      .from("loyalty_accounts")
      .update({ referral_count: Number(referrerAccount.referral_count ?? 0) + 1 })
      .eq("id", referrerAccount.id);
  }

  return rewards.referred;
}

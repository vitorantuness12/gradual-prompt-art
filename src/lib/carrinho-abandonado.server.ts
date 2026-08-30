/**
 * Camada de servidor da recuperação de carrinho abandonado.
 *
 * Regras concentradas aqui (nada roda no navegador):
 * - um carrinho por loja + telefone, sempre normalizado em E.164;
 * - o link de retomada usa um token opaco, sem expor telefone nem ids;
 * - o lembrete só sai pelo WhatsApp da própria loja, respeitando o
 *   consentimento promocional já registrado (`accept_marketing`);
 * - no máximo um lembrete por carrinho, dentro de uma janela de 48h.
 */
import {
  ABANDONED_CART_MAX_AGE_HOURS,
  ABANDONED_CART_MAX_REMINDERS,
  cartSubtotal,
  clampDelayMinutes,
  recoveryLink,
  reminderMessage,
  sanitizeItems,
  type AbandonedCartAddress,
  type AbandonedCartItem,
  type AbandonedCartRecovery,
} from "@/lib/carrinho-abandonado";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export interface SaveCartInput {
  storeId: string;
  phoneE164: string;
  customerId?: string | null;
  customerName?: string | null;
  items: unknown;
  notes?: string | null;
  address?: AbandonedCartAddress | null;
  couponCode?: string | null;
}

/**
 * Grava (ou atualiza) o carrinho do cliente identificado.
 * Carrinho vazio remove o registro: não faz sentido lembrar de nada.
 */
export async function saveAbandonedCart(admin: Admin, input: SaveCartInput): Promise<{ ok: boolean }> {
  const items = sanitizeItems(input.items);

  if (items.length === 0) {
    await admin
      .from("abandoned_carts")
      .delete()
      .eq("store_id", input.storeId)
      .eq("phone_e164", input.phoneE164)
      .is("recovered_at", null);
    return { ok: true };
  }

  const { data: existing } = await admin
    .from("abandoned_carts")
    .select("id, recovered_at")
    .eq("store_id", input.storeId)
    .eq("phone_e164", input.phoneE164)
    .maybeSingle();

  const payload = {
    store_id: input.storeId,
    phone_e164: input.phoneE164,
    customer_id: input.customerId ?? null,
    customer_name: input.customerName?.slice(0, 120) ?? null,
    items: items as never,
    subtotal: cartSubtotal(items),
    notes: input.notes?.slice(0, 500) ?? null,
    address: (input.address ?? null) as never,
    coupon_code: input.couponCode?.slice(0, 40) ?? null,
    last_activity_at: new Date().toISOString(),
  };

  if (existing) {
    // Voltou a mexer no carrinho: o ciclo de lembrete reinicia.
    const { error } = await admin
      .from("abandoned_carts")
      .update({ ...payload, recovered_at: null, recovered_order_id: null, reminder_count: 0 })
      .eq("id", existing.id);
    return { ok: !error };
  }

  const { error } = await admin.from("abandoned_carts").insert(payload);
  return { ok: !error };
}

/** Marca o carrinho como convertido quando o pedido é enviado. */
export async function markCartRecovered(
  admin: Admin,
  input: { storeId: string; phoneE164: string; orderId?: string | null },
): Promise<void> {
  await admin
    .from("abandoned_carts")
    .update({ recovered_at: new Date().toISOString(), recovered_order_id: input.orderId ?? null })
    .eq("store_id", input.storeId)
    .eq("phone_e164", input.phoneE164)
    .is("recovered_at", null);
}

/** Lê um carrinho pelo token do link de retomada. */
export async function loadCartByToken(admin: Admin, token: string): Promise<AbandonedCartRecovery> {
  const empty: AbandonedCartRecovery = {
    ok: false,
    message: "Este link de retomada não é mais válido.",
    storeSlug: null,
    storeId: null,
    storeName: null,
    customerName: null,
    couponCode: null,
    items: [],
  };

  if (!/^[a-zA-Z0-9]{16,64}$/.test(token)) return empty;

  const { data } = await admin
    .from("abandoned_carts")
    .select("id, store_id, items, coupon_code, customer_name, recovered_at, last_activity_at, store:stores(slug, name)")
    .eq("token", token)
    .maybeSingle();

  if (!data) return empty;

  const ageHours = (Date.now() - new Date(data.last_activity_at).getTime()) / 3_600_000;
  if (ageHours > ABANDONED_CART_MAX_AGE_HOURS) {
    return { ...empty, message: "Este carrinho expirou. Monte o pedido novamente, é rápido." };
  }

  const items = sanitizeItems(data.items);
  if (items.length === 0) return empty;

  const store = data.store as { slug: string; name: string } | null;
  return {
    ok: true,
    message: "Carrinho recuperado.",
    storeSlug: store?.slug ?? null,
    storeId: data.store_id,
    storeName: store?.name ?? null,
    customerName: data.customer_name,
    couponCode: data.coupon_code,
    items,
  };
}

export interface ReminderRunResult {
  checked: number;
  sent: number;
  skipped: number;
}

interface StoreReminderConfig {
  enabled: boolean;
  delayMinutes: number;
  coupon: string | null;
}

async function loadStoreConfig(
  admin: Admin,
  cache: Map<string, StoreReminderConfig>,
  storeId: string,
): Promise<StoreReminderConfig> {
  const cached = cache.get(storeId);
  if (cached) return cached;

  const { data } = await admin
    .from("store_checkout_settings")
    .select("abandoned_cart_enabled, abandoned_cart_delay_minutes, abandoned_cart_coupon_code")
    .eq("store_id", storeId)
    .maybeSingle();

  const config: StoreReminderConfig = {
    enabled: data?.abandoned_cart_enabled ?? true,
    delayMinutes: clampDelayMinutes(data?.abandoned_cart_delay_minutes),
    coupon: data?.abandoned_cart_coupon_code?.trim() || null,
  };
  cache.set(storeId, config);
  return config;
}

/**
 * Rotina agendada: envia um lembrete por WhatsApp para os carrinhos parados
 * há mais tempo que o configurado pela loja e ainda não convertidos.
 */
export async function runAbandonedCartReminders(
  admin: Admin,
  options: { baseUrl: string; limit?: number },
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { checked: 0, sent: 0, skipped: 0 };

  const oldest = new Date(Date.now() - ABANDONED_CART_MAX_AGE_HOURS * 3_600_000).toISOString();
  const newest = new Date(Date.now() - 10 * 60_000).toISOString();

  const { data: carts } = await admin
    .from("abandoned_carts")
    .select("id, store_id, phone_e164, customer_id, customer_name, items, token, coupon_code, reminder_count, last_activity_at, store:stores(name, slug)")
    .is("recovered_at", null)
    .lt("reminder_count", ABANDONED_CART_MAX_REMINDERS)
    .gte("last_activity_at", oldest)
    .lte("last_activity_at", newest)
    .order("last_activity_at", { ascending: true })
    .limit(options.limit ?? 100);

  if (!carts || carts.length === 0) return result;

  const configCache = new Map<string, StoreReminderConfig>();
  const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");

  for (const cart of carts) {
    result.checked += 1;
    const config = await loadStoreConfig(admin, configCache, cart.store_id);
    if (!config.enabled) {
      result.skipped += 1;
      continue;
    }

    const waitedMinutes = (Date.now() - new Date(cart.last_activity_at).getTime()) / 60_000;
    if (waitedMinutes < config.delayMinutes) {
      result.skipped += 1;
      continue;
    }

    const items: AbandonedCartItem[] = sanitizeItems(cart.items);
    const store = cart.store as { name: string; slug: string } | null;
    if (items.length === 0 || !store) {
      result.skipped += 1;
      continue;
    }

    const coupon = cart.coupon_code?.trim() || config.coupon;
    const link = recoveryLink(options.baseUrl, store.slug, cart.token, coupon);
    const body = reminderMessage({
      firstName: (cart.customer_name ?? "").trim().split(" ")[0] ?? "",
      storeName: store.name,
      itemNames: items.map((item) => item.name),
      link,
      coupon,
    });

    try {
      const outcome = await sendWhatsappMessage(admin, {
        storeId: cart.store_id,
        phone: cart.phone_e164,
        body,
        // Lembrete promocional: só sai com consentimento de marketing registrado.
        messageType: "marketing",
        templateKey: "carrinho_abandonado",
        customerId: cart.customer_id,
      });
      if (outcome.ok) result.sent += 1;
      else result.skipped += 1;
    } catch (error) {
      console.error("[carrinho-abandonado] falha no lembrete", error);
      result.skipped += 1;
      continue;
    }

    await admin
      .from("abandoned_carts")
      .update({
        reminder_count: (cart.reminder_count ?? 0) + 1,
        reminder_sent_at: new Date().toISOString(),
        coupon_code: coupon,
      })
      .eq("id", cart.id);
  }

  return result;
}

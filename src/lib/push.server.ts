import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Conteúdo entregue ao aparelho. */
export interface PushContent {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  urgent?: boolean;
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function vapid() {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:contato@oseupedido.com.br";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/** Envia para um aparelho. Devolve `gone` quando a inscrição expirou. */
async function deliver(row: StoredSubscription, content: PushContent) {
  const keys = vapid();
  if (!keys) return { ok: false, gone: false, reason: "vapid_missing" as const };

  const subscription: PushSubscription = {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };

  try {
    const payload = await buildPushPayload(
      {
        data: { ...content } as Record<string, string | boolean | undefined>,
        options: { ttl: 60 * 60, urgency: content.urgent ? "high" : "normal" },
      },
      subscription,
      keys,
    );
    const response = await fetch(row.endpoint, payload as unknown as RequestInit);
    if (response.status === 404 || response.status === 410) {
      return { ok: false, gone: true, reason: "expired" as const };
    }
    if (!response.ok) return { ok: false, gone: false, reason: `http_${response.status}` };
    return { ok: true, gone: false, reason: "sent" as const };
  } catch (error) {
    return { ok: false, gone: false, reason: (error as Error).message };
  }
}

interface CampaignRow {
  id: string;
  store_id: string;
  title: string;
  body: string;
  audience_type: string;
  audience_config: { inactiveDays?: number } | null;
  schedule_type: string;
  recurrence: { days?: number[]; time?: string } | null;
  frequency_cap_hours: number;
  next_run_at: string | null;
}

interface CustomerSubscriptionLink {
  customer_id: string | null;
  subscription_id: string;
  customer: {
    id: string;
    birth_date: string | null;
    created_at: string;
    marketing_opt_in: boolean;
  } | null;
  subscription: StoredSubscription | null;
}

export function nextRecurringRun(
  recurrence: CampaignRow["recurrence"],
  from = new Date(),
): string | null {
  const days = recurrence?.days ?? [];
  const match = /^(\d{2}):(\d{2})$/.exec(recurrence?.time ?? "");
  if (!days.length || !match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(from);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    candidate.setUTCHours(hour, minute, 0, 0);
    if (days.includes(candidate.getUTCDay()) && candidate.getTime() > from.getTime()) {
      return candidate.toISOString();
    }
  }
  return null;
}

export function matchesCampaignAudience(
  campaign: CampaignRow,
  customer: NonNullable<CustomerSubscriptionLink["customer"]>,
  orders: { customer_id: string | null; created_at: string }[],
  abandonedCustomers: Set<string>,
  now: Date,
) {
  const customerOrders = orders.filter((order) => order.customer_id === customer.id);
  const lastOrder = customerOrders[0]?.created_at;
  const daysSince = lastOrder
    ? (now.getTime() - new Date(lastOrder).getTime()) / 86_400_000
    : Number.POSITIVE_INFINITY;
  switch (campaign.audience_type) {
    case "new":
      return now.getTime() - new Date(customer.created_at).getTime() <= 30 * 86_400_000;
    case "active":
      return daysSince <= 90;
    case "recurring":
      return customerOrders.length >= 2;
    case "inactive":
      return daysSince >= (campaign.audience_config?.inactiveDays ?? 60);
    case "birthday": {
      if (!customer.birth_date) return false;
      const birth = new Date(`${customer.birth_date}T00:00:00Z`);
      return birth.getUTCMonth() === now.getUTCMonth() && birth.getUTCDate() === now.getUTCDate();
    }
    case "abandoned_cart":
      return abandonedCustomers.has(customer.id);
    case "post_purchase":
      return daysSince <= 1;
    default:
      return true;
  }
}

/** Processa campanhas vencidas em lotes, com consentimento e deduplicação por execução. */
export async function dispatchPushCampaigns(client: SupabaseClient, limit = 20) {
  const now = new Date();
  const { data, error } = await client
    .from("push_campaigns")
    .select(
      "id, store_id, title, body, audience_type, audience_config, schedule_type, recurrence, frequency_cap_hours, next_run_at",
    )
    .eq("status", "scheduled")
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);
  if (error) return { processed: 0, sent: 0, failed: 0, removed: 0, error: error.message };

  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (const rawCampaign of data ?? []) {
    const campaign = rawCampaign as CampaignRow;
    const campaignStartedSent = sent;
    const campaignStartedFailed = failed;
    const campaignStartedRemoved = removed;
    const { data: claimed } = await client
      .from("push_campaigns")
      .update({ status: "sending", last_run_at: now.toISOString() })
      .eq("id", campaign.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const [{ data: rawLinks }, { data: orders }, { data: carts }, { data: store }] =
      await Promise.all([
        client
          .from("push_subscription_stores")
          .select(
            "customer_id, subscription_id, customer:customers(id, birth_date, created_at, marketing_opt_in), subscription:push_subscriptions(id, endpoint, p256dh, auth)",
          )
          .eq("store_id", campaign.store_id)
          .eq("is_active", true)
          .not("consented_at", "is", null)
          .limit(1000),
        client
          .from("orders")
          .select("customer_id, created_at")
          .eq("store_id", campaign.store_id)
          .not("customer_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(5000),
        client
          .from("abandoned_carts")
          .select("customer_id")
          .eq("store_id", campaign.store_id)
          .not("customer_id", "is", null)
          .gte("updated_at", new Date(now.getTime() - 7 * 86_400_000).toISOString())
          .limit(2000),
        client.from("stores").select("slug").eq("id", campaign.store_id).maybeSingle(),
      ]);
    const links = (rawLinks ?? []) as unknown as CustomerSubscriptionLink[];
    const orderRows = (orders ?? []) as { customer_id: string | null; created_at: string }[];
    const abandoned = new Set(
      (carts ?? []).map((cart) => cart.customer_id).filter((id): id is string => Boolean(id)),
    );
    const runKey = campaign.next_run_at ?? now.toISOString();

    for (const link of links) {
      if (!link.customer?.marketing_opt_in || !link.subscription) continue;
      if (!matchesCampaignAudience(campaign, link.customer, orderRows, abandoned, now)) continue;
      const cutoff = new Date(
        now.getTime() - campaign.frequency_cap_hours * 3_600_000,
      ).toISOString();
      const { count: recent } = await client
        .from("push_campaign_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("store_id", campaign.store_id)
        .eq("customer_id", link.customer.id)
        .eq("status", "sent")
        .gte("sent_at", cutoff);
      if ((recent ?? 0) > 0) continue;
      const { data: deliveryRow } = await client
        .from("push_campaign_deliveries")
        .upsert(
          {
            campaign_id: campaign.id,
            store_id: campaign.store_id,
            subscription_id: link.subscription_id,
            customer_id: link.customer.id,
            run_key: runKey,
            status: "pending",
          },
          { onConflict: "campaign_id,subscription_id,run_key", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (!deliveryRow) continue;
      const result = await deliver(link.subscription, {
        title: campaign.title,
        body: campaign.body,
        url: store?.slug ? `/${store.slug}` : "/",
        tag: `campaign-${campaign.id}`,
      });
      const status = result.ok ? "sent" : result.gone ? "expired" : "failed";
      await client
        .from("push_campaign_deliveries")
        .update({
          status,
          error: result.ok ? null : result.reason,
          sent_at: result.ok ? new Date().toISOString() : null,
        })
        .eq("id", deliveryRow.id);
      if (result.ok) sent += 1;
      else if (result.gone) {
        removed += 1;
        await client.from("push_subscriptions").delete().eq("id", link.subscription_id);
      } else failed += 1;
    }

    const nextRun =
      campaign.schedule_type === "recurring" || campaign.schedule_type === "automatic"
        ? campaign.schedule_type === "automatic"
          ? new Date(now.getTime() + 86_400_000).toISOString()
          : nextRecurringRun(campaign.recurrence, now)
        : null;
    await client
      .from("push_campaigns")
      .update({
        status: nextRun ? "scheduled" : "sent",
        next_run_at: nextRun,
        sent_count: sent - campaignStartedSent,
        failed_count: failed - campaignStartedFailed,
        removed_count: removed - campaignStartedRemoved,
      })
      .eq("id", campaign.id);
  }
  return { processed: data?.length ?? 0, sent, failed, removed };
}

interface SendOptions {
  storeId?: string | null;
  userIds?: string[];
  audience?: string;
}

/** Dispara uma notificação para os aparelhos de uma loja e/ou de usuários. */
export async function sendPush(
  client: SupabaseClient,
  target: SendOptions,
  content: PushContent,
): Promise<{ sent: number; failed: number; removed: number }> {
  let query = client.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (target.userIds?.length) query = query.in("user_id", target.userIds);
  else if (target.storeId) query = query.eq("store_id", target.storeId);
  else return { sent: 0, failed: 0, removed: 0 };
  if (target.audience) query = query.eq("audience", target.audience);

  const { data } = await query;
  const rows = (data ?? []) as StoredSubscription[];
  if (rows.length === 0) return { sent: 0, failed: 0, removed: 0 };

  const results = await Promise.all(rows.map((row) => deliver(row, content)));

  const expired = rows.filter((_, index) => results[index]?.gone).map((row) => row.id);
  if (expired.length) await client.from("push_subscriptions").delete().in("id", expired);

  const alive = rows.filter((_, index) => results[index]?.ok).map((row) => row.id);
  if (alive.length) {
    await client
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", alive);
  }

  return {
    sent: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok && !item.gone).length,
    removed: expired.length,
  };
}

/** Eventos que não valem uma notificação no celular. */
const SILENT_EVENTS = new Set(["order_status_changed"]);

/**
 * Rotina agendada: envia por push as notificações internas recentes
 * que ainda não foram entregues aos aparelhos da loja.
 */
export async function dispatchPendingPush(client: SupabaseClient, limit = 100) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("notifications")
    .select("id, store_id, order_id, event, title, body")
    .is("push_sent_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return { processed: 0, sent: 0, error: error.message };

  const rows = data ?? [];
  let sent = 0;

  for (const row of rows) {
    if (!SILENT_EVENTS.has(row.event)) {
      const result = await sendPush(
        client,
        { storeId: row.store_id, audience: "lojista" },
        {
          title: row.title,
          body: row.body ?? undefined,
          url: row.order_id ? "/painel/pedidos" : "/painel",
          tag: row.event,
          urgent: row.event === "order_created",
        },
      );
      sent += result.sent;
    }
    await client
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return { processed: rows.length, sent };
}

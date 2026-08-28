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

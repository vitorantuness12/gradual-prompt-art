import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PushCampaignSummary } from "@/lib/push-campaigns";

const storeInput = z.object({ storeId: z.string().uuid() });
const campaignInput = z.object({
  id: z.string().uuid().optional(),
  storeId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(240),
  audienceType: z.enum([
    "all",
    "new",
    "active",
    "recurring",
    "inactive",
    "birthday",
    "abandoned_cart",
    "post_purchase",
  ]),
  inactiveDays: z.number().int().min(7).max(365).default(60),
  scheduleType: z.enum(["now", "scheduled", "recurring", "automatic"]),
  scheduledAt: z.string().datetime().nullable(),
  recurrenceDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  recurrenceTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("10:00"),
  frequencyCapHours: z.number().int().min(1).max(720).default(24),
  action: z.enum(["draft", "schedule", "send_now"]),
});

async function assertPermission(
  context: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string },
  storeId: string,
) {
  const { data, error } = await context.supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: context.userId,
    _area: "customers",
  });
  if (error || !data)
    throw new Error("Você não tem permissão para gerenciar notificações desta loja.");
}

function mapCampaign(row: Record<string, unknown>): PushCampaignSummary {
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    title: String(row["title"]),
    body: String(row["body"]),
    audienceType: row["audience_type"] as PushCampaignSummary["audienceType"],
    audienceConfig: (row["audience_config"] ?? {}) as { inactiveDays?: number },
    scheduleType: row["schedule_type"] as PushCampaignSummary["scheduleType"],
    scheduledAt: (row["scheduled_at"] as string | null) ?? null,
    recurrence: (row["recurrence"] ?? {}) as { days?: number[]; time?: string },
    status: row["status"] as PushCampaignSummary["status"],
    nextRunAt: (row["next_run_at"] as string | null) ?? null,
    sentCount: Number(row["sent_count"] ?? 0),
    failedCount: Number(row["failed_count"] ?? 0),
    removedCount: Number(row["removed_count"] ?? 0),
    createdAt: String(row["created_at"]),
  };
}

export const getPushCampaignOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => storeInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context, data.storeId);
    const [{ data: campaigns, error }, { count: subscribers }] = await Promise.all([
      context.supabase
        .from("push_campaigns")
        .select("*")
        .eq("store_id", data.storeId)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("push_subscription_stores")
        .select("id", { count: "exact", head: true })
        .eq("store_id", data.storeId)
        .eq("is_active", true)
        .not("consented_at", "is", null),
    ]);
    if (error) throw new Error("Não foi possível carregar as campanhas.");
    const rows = (campaigns ?? []).map((row) => mapCampaign(row as Record<string, unknown>));
    return {
      campaigns: rows,
      subscribers: subscribers ?? 0,
      scheduled: rows.filter((row) => row.status === "scheduled").length,
      sent: rows.reduce((total, row) => total + row.sentCount, 0),
      failed: rows.reduce((total, row) => total + row.failedCount, 0),
    };
  });

export const savePushCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => campaignInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context, data.storeId);
    if (data.scheduleType === "scheduled" && !data.scheduledAt)
      throw new Error("Escolha a data e a hora do envio.");
    if (data.scheduleType === "recurring" && data.recurrenceDays.length === 0)
      throw new Error("Escolha ao menos um dia da semana.");

    const now = new Date().toISOString();
    const shouldSchedule = data.action !== "draft";
    const nextRunAt = data.action === "send_now" ? now : data.scheduledAt;
    const values = {
      store_id: data.storeId,
      created_by: context.userId,
      name: data.name,
      title: data.title,
      body: data.body,
      audience_type: data.audienceType,
      audience_config: { inactiveDays: data.inactiveDays },
      schedule_type: data.scheduleType,
      scheduled_at: data.scheduledAt,
      recurrence: { days: data.recurrenceDays, time: data.recurrenceTime },
      automatic_event: data.scheduleType === "automatic" ? data.audienceType : null,
      frequency_cap_hours: data.frequencyCapHours,
      status: shouldSchedule ? "scheduled" : "draft",
      next_run_at: shouldSchedule ? (nextRunAt ?? now) : null,
    };
    const query = data.id
      ? context.supabase
          .from("push_campaigns")
          .update(values)
          .eq("id", data.id)
          .eq("store_id", data.storeId)
      : context.supabase.from("push_campaigns").insert(values);
    const { data: row, error } = await query.select("id").single();
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("audit_logs")
      .insert({
        store_id: data.storeId,
        user_id: context.userId,
        action: data.id ? "push_campaign.updated" : "push_campaign.created",
        entity: "push_campaigns",
        entity_id: row.id,
        metadata: { status: values.status, schedule_type: data.scheduleType },
      });
    if (data.action === "send_now") {
      const { dispatchPushCampaigns } = await import("@/lib/push.server");
      await dispatchPushCampaigns(supabaseAdmin, 20);
    }
    return { id: row.id, status: values.status };
  });

const actionInput = z.object({
  storeId: z.string().uuid(),
  campaignId: z.string().uuid(),
  action: z.enum(["pause", "resume", "cancel", "duplicate"]),
});
export const updatePushCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => actionInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context, data.storeId);
    const { data: campaign, error } = await context.supabase
      .from("push_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .eq("store_id", data.storeId)
      .single();
    if (error || !campaign) throw new Error("Campanha não encontrada.");
    if (data.action === "duplicate") {
      const { id: _id, created_at: _created, updated_at: _updated, ...copy } = campaign;
      const { error: insertError } = await context.supabase
        .from("push_campaigns")
        .insert({
          ...copy,
          name: `${campaign.name} — cópia`.slice(0, 80),
          created_by: context.userId,
          status: "draft",
          next_run_at: null,
          last_run_at: null,
          sent_count: 0,
          failed_count: 0,
          removed_count: 0,
        });
      if (insertError) throw new Error(insertError.message);
    } else {
      const status =
        data.action === "pause" ? "paused" : data.action === "cancel" ? "cancelled" : "scheduled";
      const { error: updateError } = await context.supabase
        .from("push_campaigns")
        .update({
          status,
          next_run_at: data.action === "resume" ? new Date().toISOString() : campaign.next_run_at,
        })
        .eq("id", data.campaignId);
      if (updateError) throw new Error(updateError.message);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("audit_logs")
      .insert({
        store_id: data.storeId,
        user_id: context.userId,
        action: `push_campaign.${data.action}`,
        entity: "push_campaigns",
        entity_id: data.campaignId,
        metadata: {},
      });
    return { ok: true };
  });

export const sendCustomerPushTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        title: z.string().trim().min(2).max(80),
        body: z.string().trim().min(2).max(240),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context, data.storeId);
    const { sendPush } = await import("@/lib/push.server");
    return sendPush(
      context.supabase,
      { userIds: [context.userId] },
      {
        title: data.title,
        body: data.body,
        url: "/painel/notificacoes",
        tag: "push-campaign-test",
      },
    );
  });

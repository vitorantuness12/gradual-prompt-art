import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildDailySummaryText,
  clampHour,
  computeGoalsProgress,
  goalsKey,
  readGoals,
  type GoalsOverview,
} from "@/lib/metas";

/** Metas da loja: leitura do progresso, gravação e envio manual do resumo. */

const storeInput = z.object({ storeId: z.string().uuid() });

const digits = (value: string) => value.replace(/\D/g, "");

export const getGoalsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<GoalsOverview> => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: userId,
    });
    if (staff !== true) throw new Error("Sem permissão para esta loja.");

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [{ data: goalsRow }, { data: orders }, { data: store }, { data: channel }] = await Promise.all([
      supabase.from("store_goals").select("*").eq("store_id", data.storeId).maybeSingle(),
      supabase
        .from("orders")
        .select("created_at, total, status")
        .eq("store_id", data.storeId)
        .gte("created_at", monthStart.toISOString())
        .limit(5000),
      supabase.from("stores").select("name").eq("id", data.storeId).maybeSingle(),
      supabase
        .from("channel_settings")
        .select("is_active")
        .eq("store_id", data.storeId)
        .eq("channel", "whatsapp")
        .maybeSingle(),
    ]);

    const goals = readGoals(goalsRow);

    return {
      goals,
      progress: computeGoalsProgress(orders ?? [], goals),
      storeName: store?.name ?? "sua loja",
      channelReady: Boolean(channel?.is_active),
    };
  });

const saveInput = storeInput.extend({
  monthlyRevenueGoal: z.coerce.number().min(0).max(100_000_000),
  dailyRevenueGoal: z.coerce.number().min(0).max(10_000_000),
  monthlyOrdersGoal: z.coerce.number().min(0).max(1_000_000),
  ticketGoal: z.coerce.number().min(0).max(1_000_000),
  dailySummaryEnabled: z.boolean(),
  summaryHour: z.coerce.number().min(0).max(23),
  summaryWhatsapp: z.string().trim().max(30).default(""),
});

export const saveGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: userId,
    });
    if (staff !== true) throw new Error("Sem permissão para esta loja.");

    const phone = digits(data.summaryWhatsapp);
    if (data.dailySummaryEnabled && phone.length < 10) {
      throw new Error("Informe um WhatsApp válido com DDD para receber o resumo.");
    }

    const { error } = await supabase.from("store_goals").upsert(
      {
        store_id: data.storeId,
        monthly_revenue_goal: data.monthlyRevenueGoal,
        daily_revenue_goal: data.dailyRevenueGoal,
        monthly_orders_goal: Math.round(data.monthlyOrdersGoal),
        ticket_goal: data.ticketGoal,
        daily_summary_enabled: data.dailySummaryEnabled,
        summary_hour: clampHour(data.summaryHour),
        summary_whatsapp: phone || null,
      },
      { onConflict: "store_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia o resumo agora, para o lojista conferir como a mensagem chega. */
export const sendGoalsSummaryNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; preview: string }> => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: userId,
    });
    if (staff !== true) throw new Error("Sem permissão para esta loja.");

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [{ data: goalsRow }, { data: orders }, { data: store }] = await Promise.all([
      supabase.from("store_goals").select("*").eq("store_id", data.storeId).maybeSingle(),
      supabase
        .from("orders")
        .select("created_at, total, status")
        .eq("store_id", data.storeId)
        .gte("created_at", monthStart.toISOString())
        .limit(5000),
      supabase.from("stores").select("name").eq("id", data.storeId).maybeSingle(),
    ]);

    const goals = readGoals(goalsRow);
    const progress = computeGoalsProgress(orders ?? [], goals);
    const text = buildDailySummaryText(store?.name ?? "sua loja", progress, goals);

    if (!goals.summaryWhatsapp) {
      return { ok: false, message: "Cadastre o WhatsApp que vai receber o resumo.", preview: text };
    }

    const { sendMessage } = await import("@/lib/automacoes.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sent = await sendMessage(supabaseAdmin, data.storeId, "whatsapp", goals.summaryWhatsapp, text);

    return {
      ok: sent,
      message: sent
        ? "Resumo enviado no WhatsApp."
        : "Conecte o WhatsApp da loja para enviar o resumo automático.",
      preview: text,
    };
  });

export { goalsKey };

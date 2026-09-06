import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { sendMessage } from "@/lib/automacoes.server";
import { buildDailySummaryText, computeGoalsProgress, readGoals } from "@/lib/metas";

type Admin = SupabaseClient<Database>;

export interface DailySummaryResult {
  ok: boolean;
  stores: number;
  sent: number;
  skipped: number;
}

/**
 * Envia o resumo diário de vendas para as lojas que ativaram o recurso.
 *
 * A rotina roda de hora em hora: só dispara para as lojas cujo horário
 * escolhido é a hora atual (fuso de Brasília) e que ainda não receberam o
 * resumo hoje — assim nenhum lojista recebe mensagem duplicada.
 */
export async function runDailyGoalSummaries(admin: Admin): Promise<DailySummaryResult> {
  const now = new Date();
  // -3h: horário de Brasília, sem depender de biblioteca de fuso.
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const currentHour = local.getUTCHours();
  const todayKey = local.toISOString().slice(0, 10);

  const { data: rows, error } = await admin
    .from("store_goals")
    .select("*")
    .eq("daily_summary_enabled", true)
    .eq("summary_hour", currentHour)
    .limit(500);

  if (error) return { ok: false, stores: 0, sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    const goals = readGoals(row);
    if (!goals.summaryWhatsapp) {
      skipped += 1;
      continue;
    }

    // Já enviado hoje? Não repete.
    const lastLocal = goals.lastSummaryAt
      ? new Date(new Date(goals.lastSummaryAt).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null;
    if (lastLocal === todayKey) {
      skipped += 1;
      continue;
    }

    const monthStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
    const [{ data: orders }, { data: store }] = await Promise.all([
      admin
        .from("orders")
        .select("created_at, total, status")
        .eq("store_id", row.store_id)
        .gte("created_at", monthStart.toISOString())
        .limit(5000),
      admin.from("stores").select("name").eq("id", row.store_id).maybeSingle(),
    ]);

    const progress = computeGoalsProgress(orders ?? [], goals, local);
    const text = buildDailySummaryText(store?.name ?? "sua loja", progress, goals);

    const delivered = await sendMessage(admin, row.store_id, "whatsapp", goals.summaryWhatsapp, text);
    if (delivered) {
      sent += 1;
      await admin
        .from("store_goals")
        .update({ last_summary_at: now.toISOString() })
        .eq("store_id", row.store_id);
    } else {
      skipped += 1;
    }
  }

  return { ok: true, stores: rows?.length ?? 0, sent, skipped };
}

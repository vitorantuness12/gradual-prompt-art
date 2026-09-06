import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada do resumo diário de vendas no WhatsApp do lojista.
 *
 * Roda de hora em hora (pg_cron). Mesmas duas proteções das outras rotinas:
 * autenticação do agendador (ou token interno em `cron_tokens`) e reserva
 * atômica via `claim_cron_run`, para nenhum lojista receber a mensagem duas
 * vezes se a chamada se repetir.
 */
const CRON_NAME = "metas_resumo_diario";
/** Janela mínima entre execuções reais (metade do intervalo do agendador). */
const MIN_INTERVAL_SECONDS = 1800;

export const Route = createFileRoute("/api/public/metas/resumo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const denied = await authenticateCronRequest(request);
        if (denied) {
          const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
          const { data: row } = token
            ? await supabaseAdmin.from("cron_tokens").select("token").eq("name", CRON_NAME).maybeSingle()
            : { data: null };
          if (!token || !row || row.token !== token) return denied;
        }

        const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_cron_run", {
          _name: CRON_NAME,
          _min_interval_seconds: MIN_INTERVAL_SECONDS,
        });

        if (claimError) {
          return new Response(JSON.stringify({ ok: false, error: claimError.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        if (claimed !== true) {
          return new Response(JSON.stringify({ ok: true, skipped: "already_ran" }), {
            headers: { "content-type": "application/json" },
          });
        }

        const { runDailyGoalSummaries } = await import("@/lib/metas.server");
        const result = await runDailyGoalSummaries(supabaseAdmin);

        await supabaseAdmin
          .from("cron_tokens")
          .update({ last_result: result as unknown as Record<string, unknown> })
          .eq("name", CRON_NAME);

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

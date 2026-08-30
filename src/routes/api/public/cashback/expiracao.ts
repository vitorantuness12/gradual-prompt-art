import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada que avisa por WhatsApp quem tem cashback perto de vencer.
 *
 * Mesmo par de proteções da rotina de carrinho abandonado: autenticação do
 * agendador (ou token interno em `cron_tokens`) e `claim_cron_run` como
 * controle de idempotência, para o cliente nunca receber dois avisos.
 */
const CRON_NAME = "cashback_expiracao";
/** Uma execução real a cada 6 horas, no máximo. */
const MIN_INTERVAL_SECONDS = 21_600;

export const Route = createFileRoute("/api/public/cashback/expiracao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const denied = await authenticateCronRequest(request);
        if (denied) {
          const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
          const { data: row } = token
            ? await supabaseAdmin
                .from("cron_tokens")
                .select("token")
                .eq("name", CRON_NAME)
                .maybeSingle()
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

        const { runCashbackExpiryReminders } = await import("@/lib/cashback.server");
        const baseUrl = process.env["PUBLIC_SITE_URL"] ?? new URL(request.url).origin;
        const result = await runCashbackExpiryReminders(supabaseAdmin, { baseUrl });

        await supabaseAdmin
          .from("cron_tokens")
          .update({ last_result: result as never })
          .eq("name", CRON_NAME);

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

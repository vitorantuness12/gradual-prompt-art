import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada das automações de marketing (aniversário, cliente inativo,
 * pós-compra).
 *
 * Proteções:
 * 1. autenticação — credencial do agendador da plataforma OU o token interno
 *    registrado em `cron_tokens` (é o que o pg_cron envia);
 * 2. idempotência — `claim_cron_run` reserva a execução, então repetir a
 *    chamada não gera mensagem duplicada para o cliente.
 */
const CRON_NAME = "automacoes_marketing";
/** Uma execução real a cada 6 horas, no máximo. */
const MIN_INTERVAL_SECONDS = 21_600;

export const Route = createFileRoute("/api/public/crm/automacoes")({
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

        const { runMarketingAutomations } = await import("@/lib/automacoes.server");
        const result = await runMarketingAutomations(supabaseAdmin);

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

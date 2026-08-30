import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada que gera os pedidos recorrentes das assinaturas de produtos.
 *
 * Mesmas proteções das outras rotinas: autenticação do agendador (ou token
 * interno em `cron_tokens`) e `claim_cron_run` como controle de idempotência,
 * para nunca gerar dois pedidos do mesmo ciclo.
 */
const CRON_NAME = "assinaturas_pedidos";
/** Uma execução real por hora, no máximo. */
const MIN_INTERVAL_SECONDS = 3_600;

export const Route = createFileRoute("/api/public/assinaturas/pedidos")({
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

        const { runRecurringOrders } = await import("@/lib/assinaturas.server");
        const result = await runRecurringOrders(supabaseAdmin);

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

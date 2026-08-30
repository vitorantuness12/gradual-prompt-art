import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada de recuperação de carrinho abandonado.
 *
 * Roda a cada 10 minutos (pg_cron). Duas proteções:
 * 1. autenticação — credencial do agendador da plataforma OU o token interno
 *    registrado em `cron_tokens` (é isso que o pg_cron envia);
 * 2. idempotência — `claim_cron_run` reserva a execução no banco de forma
 *    atômica. Chamadas repetidas dentro da janela mínima não disparam nada,
 *    então nenhum cliente recebe WhatsApp duplicado se o agendador repetir
 *    a requisição ou se duas instâncias subirem ao mesmo tempo.
 */
const CRON_NAME = "carrinho_abandonado";
/** Janela mínima entre execuções reais (metade do intervalo do agendador). */
const MIN_INTERVAL_SECONDS = 300;

export const Route = createFileRoute("/api/public/carrinho/lembretes")({
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

        // Reserva a execução: se outra chamada já rodou agora, sai em silêncio.
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

        const { runAbandonedCartReminders } = await import("@/lib/carrinho-abandonado.server");
        const baseUrl = process.env["PUBLIC_SITE_URL"] ?? new URL(request.url).origin;
        const result = await runAbandonedCartReminders(supabaseAdmin, { baseUrl });

        // Guarda o resultado para o lojista/suporte conseguirem auditar a rodada.
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

import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada que entrega por push as notificações internas recentes
 * para os aparelhos cadastrados de cada loja.
 */
export const Route = createFileRoute("/api/public/notificacoes/push")({
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
                .eq("name", "notificacoes_push")
                .maybeSingle()
            : { data: null };
          if (!token || !row || row.token !== token) return denied;
        }

        const { dispatchPendingPush } = await import("@/lib/push.server");
        const result = await dispatchPendingPush(supabaseAdmin);

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

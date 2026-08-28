import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada das encomendas: lembra o cliente de aprovar o orçamento
 * antes da data de corte e de pagar o saldo antes da entrega.
 */
export const Route = createFileRoute("/api/public/encomendas/lembretes")({
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
                .eq("name", "encomendas_lembretes")
                .maybeSingle()
            : { data: null };
          if (!token || !row || row.token !== token) return denied;
        }

        const { runOrderReminders } = await import("@/lib/encomendas.server");
        const result = await runOrderReminders(supabaseAdmin, { baseUrl: new URL(request.url).origin });

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

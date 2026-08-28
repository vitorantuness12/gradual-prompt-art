import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Rotina agendada da cobrança recorrente das assinaturas de clientes. */
export const Route = createFileRoute("/api/public/assinaturas/cobrancas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runSubscriptionBilling } = await import("@/lib/digitais.server");
        const result = await runSubscriptionBilling(supabaseAdmin);

        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      },
    },
  },
});

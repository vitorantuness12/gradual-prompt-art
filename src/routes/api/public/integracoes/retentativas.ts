import { createFileRoute } from "@tanstack/react-router";

/**
 * Fila de retentativas das integrações.
 * Chamada por agendador externo com o segredo de cron; nunca é pública.
 */
export const Route = createFileRoute("/api/public/integracoes/retentativas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { processRetryQueue } = await import("@/lib/integrations/connectors.server");
        const result = await processRetryQueue();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});

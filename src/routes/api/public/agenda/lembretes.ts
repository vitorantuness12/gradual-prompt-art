import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada de lembretes de horário (24h e 2h antes).
 * Aceita a credencial do agendador da plataforma ou o token interno
 * usado pela verificação periódica do banco.
 */
export const Route = createFileRoute("/api/public/agenda/lembretes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const denied = await authenticateCronRequest(request);
        if (denied) {
          const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
          const { data: row } = token
            ? await supabaseAdmin.from("cron_tokens").select("token").eq("name", "agenda_lembretes").maybeSingle()
            : { data: null };
          if (!token || !row || row.token !== token) return denied;
        }

        const { runAppointmentReminders } = await import("@/lib/agenda.server");
        const baseUrl = new URL(request.url).origin;
        const result = await runAppointmentReminders(supabaseAdmin, { baseUrl });

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

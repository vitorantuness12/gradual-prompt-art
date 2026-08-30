import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Rotina agendada de recuperação de carrinho abandonado.
 *
 * Só executa com a credencial do agendador da plataforma (ou o token interno
 * registrado em `cron_tokens`), porque dispara mensagens de WhatsApp.
 */
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
                .eq("name", "carrinho_abandonado")
                .maybeSingle()
            : { data: null };
          if (!token || !row || row.token !== token) return denied;
        }

        const { runAbandonedCartReminders } = await import("@/lib/carrinho-abandonado.server");
        const baseUrl = process.env["PUBLIC_SITE_URL"] ?? new URL(request.url).origin;
        const result = await runAbandonedCartReminders(supabaseAdmin, { baseUrl });

        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

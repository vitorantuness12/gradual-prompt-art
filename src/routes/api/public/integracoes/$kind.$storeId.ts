import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de entrada da central de integrações.
 *
 * 1. Limita rajadas por IP.
 * 2. Confere a assinatura do provedor antes de ler qualquer dado.
 * 3. Grava o evento com chave única (conector + id externo): repetição é
 *    descartada com 200 para o provedor não reenviar eternamente.
 * 4. Falhas de processamento entram na fila de retentativas.
 */
export const Route = createFileRoute("/api/public/integracoes/$kind/$storeId")({
  server: {
    handlers: {
      // Verificação de assinatura de webhook usada pela Meta (WhatsApp).
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token || !challenge) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: credentials } = await supabaseAdmin
          .from("integration_credentials")
          .select("extra")
          .eq("store_id", params.storeId)
          .eq("kind", params.kind)
          .maybeSingle();
        const expected = String(
          (credentials?.extra as { verifyToken?: string } | null)?.verifyToken ?? "",
        );
        if (!expected || expected !== token) return new Response("Token inválido", { status: 401 });
        return new Response(challenge, { headers: { "content-type": "text/plain" } });
      },

      POST: async ({ request, params }) => {
        const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
        const limit = await consumeRateLimit(
          "webhook",
          `integracoes:${clientIdentifier(request.headers)}`,
        );
        if (!limit.allowed) {
          return new Response("Muitas requisições", {
            status: 429,
            headers: { "retry-after": String(limit.retryAfterSeconds) },
          });
        }

        const { getConnector } = await import("@/lib/integrations/connectors.server");
        const connector = getConnector(params.kind);
        if (!connector) return new Response("Conector desconhecido", { status: 404 });

        const rawBody = await request.text();
        if (rawBody.length > 512_000) return new Response("Payload muito grande", { status: 413 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: integration } = await supabaseAdmin
          .from("store_integrations")
          .select("id, is_enabled, store_id")
          .eq("store_id", params.storeId)
          .eq("kind", params.kind)
          .maybeSingle();
        if (!integration || !integration.is_enabled) {
          return new Response("Integração desativada", { status: 404 });
        }

        const { data: credentialsRow } = await supabaseAdmin
          .from("integration_credentials")
          .select("*")
          .eq("store_id", params.storeId)
          .eq("kind", params.kind)
          .maybeSingle();

        const credentials = {
          apiKey: credentialsRow?.api_key ?? null,
          apiSecret: credentialsRow?.api_secret ?? null,
          accessToken: credentialsRow?.access_token ?? null,
          refreshToken: credentialsRow?.refresh_token ?? null,
          webhookSecret: credentialsRow?.webhook_secret ?? null,
          extra: (credentialsRow?.extra ?? {}) as Record<string, unknown>,
        };

        const valid = await connector.verifySignature(request.headers, rawBody, credentials);
        if (!valid) return new Response("Assinatura inválida", { status: 401 });

        const event = connector.parseEvent(rawBody, request.headers);

        // Idempotência: a chave única (kind, external_id) impede reprocessar.
        const { data: stored, error: insertError } = await supabaseAdmin
          .from("integration_events")
          .insert({
            store_id: params.storeId,
            kind: params.kind,
            direction: "inbound",
            event_type: event.eventType,
            external_id: event.externalId,
            payload: event.payload as never,
            status: "received",
          })
          .select("id")
          .maybeSingle();

        if (insertError) {
          if (insertError.code === "23505") return new Response("ok (duplicado)", { status: 200 });
          return new Response("Falha ao registrar evento", { status: 500 });
        }

        await supabaseAdmin
          .from("store_integrations")
          .update({
            last_event_at: new Date().toISOString(),
            last_event_kind: event.eventType,
            status: "connected",
            last_error: null,
          })
          .eq("id", integration.id);

        // O processamento específico de cada conector roda aqui; qualquer
        // erro vira retentativa em vez de perder o evento.
        try {
          const { processIntegrationEvent } = await import("@/lib/integrations/processors.server");
          await processIntegrationEvent(params.kind, params.storeId, event);
          if (stored) {
            await supabaseAdmin
              .from("integration_events")
              .update({ status: "processed", processed_at: new Date().toISOString() })
              .eq("id", stored.id);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha no processamento.";
          const { nextRetryDelay } = await import("@/lib/integrations/catalog");
          const delay = nextRetryDelay(1) ?? 60;
          if (stored) {
            await supabaseAdmin
              .from("integration_events")
              .update({
                status: "retrying",
                attempts: 1,
                error: message.slice(0, 400),
                next_retry_at: new Date(Date.now() + delay * 1000).toISOString(),
              })
              .eq("id", stored.id);
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

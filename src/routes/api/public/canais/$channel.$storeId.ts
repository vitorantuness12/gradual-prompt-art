import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook oficial dos canais de atendimento (WhatsApp Business Cloud API e Telegram).
 *
 * - GET: verificação do webhook exigida pela Meta (hub.challenge).
 * - POST: recebe mensagens. Cada evento é registrado com chave única
 *   (canal + id) para nunca ser processado duas vezes; áudio só é aceito
 *   quando a loja tiver transcrição configurada.
 */
export const Route = createFileRoute("/api/public/canais/$channel/$storeId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token)
          return new Response("Requisição inválida", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: credentials } = await supabaseAdmin
          .from("channel_credentials")
          .select("verify_token")
          .eq("store_id", params.storeId)
          .eq("channel", params.channel)
          .maybeSingle();

        if (!credentials?.verify_token || credentials.verify_token !== token) {
          return new Response("Token de verificação inválido", { status: 403 });
        }
        return new Response(challenge ?? "", { status: 200 });
      },

      POST: async ({ request, params }) => {
        const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
        const rateLimit = await consumeRateLimit(
          "webhook",
          `canais:${params.storeId}:${clientIdentifier(request.headers)}`,
        );
        if (!rateLimit.allowed) {
          return new Response("Muitas requisições", {
            status: 429,
            headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
          });
        }

        const rawBody = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getChannelAdapter } = await import("@/lib/messaging/adapters.server");
        const { isOptOutMessage, isWithinBusinessHours, parseBusinessHours, renderTemplate } =
          await import("@/lib/messaging/templates");

        const { data: settings } = await supabaseAdmin
          .from("channel_settings")
          .select("*")
          .eq("store_id", params.storeId)
          .eq("channel", params.channel)
          .maybeSingle();
        if (!settings || !settings.is_enabled)
          return new Response("Canal indisponível", { status: 404 });

        const { data: credentials } = await supabaseAdmin
          .from("channel_credentials")
          .select("*")
          .eq("store_id", params.storeId)
          .eq("channel", params.channel)
          .maybeSingle();

        // Assinatura da Meta (quando o app secret estiver configurado).
        if (params.channel === "whatsapp" && credentials?.app_secret) {
          const signature = request.headers.get("x-hub-signature-256") ?? "";
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(credentials.app_secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
          );
          const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
          const expected = `sha256=${Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("")}`;
          if (signature !== expected) return new Response("Assinatura inválida", { status: 401 });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Payload inválido", { status: 400 });
        }

        const adapter = getChannelAdapter(params.channel);
        const inbound = adapter.parseWebhook(payload);
        const withinHours = isWithinBusinessHours(parseBusinessHours(settings.business_hours));

        for (const message of inbound) {
          // Idempotência por evento.
          const { error: dedupeError } = await supabaseAdmin.from("channel_webhook_events").insert({
            store_id: params.storeId,
            channel: params.channel,
            event_id: message.externalId,
            payload: payload as never,
          });
          if (dedupeError) continue;

          let text = message.text;

          // Áudio só é aceito quando existe serviço de transcrição configurado.
          if (!text && message.mediaType === "audio") {
            if (!settings.transcription_enabled) {
              await supabaseAdmin.from("message_logs").insert({
                store_id: params.storeId,
                channel: params.channel,
                direction: "inbound",
                event: "audio_ignored",
                level: "warn",
                contact: message.contact,
                error: "Transcrição de áudio não configurada.",
              });
              continue;
            }
            text = "[Áudio recebido — aguardando transcrição]";
          }

          // Conversa (cria se ainda não existir).
          const { data: existing } = await supabaseAdmin
            .from("conversations")
            .select("id, unread_count")
            .eq("store_id", params.storeId)
            .eq("channel", params.channel)
            .eq("contact", message.contact)
            .maybeSingle();

          let conversationId = existing?.id ?? null;
          if (!conversationId) {
            const { data: created } = await supabaseAdmin
              .from("conversations")
              .insert({
                store_id: params.storeId,
                channel: params.channel,
                contact: message.contact,
                contact_name: message.contactName,
                subject: "Atendimento",
                status: "open",
                last_message_at: new Date().toISOString(),
                unread_count: 1,
              })
              .select("id")
              .single();
            conversationId = created?.id ?? null;
          } else {
            await supabaseAdmin
              .from("conversations")
              .update({
                last_message_at: new Date().toISOString(),
                unread_count: (existing?.unread_count ?? 0) + 1,
              })
              .eq("id", conversationId);
          }
          if (!conversationId) continue;

          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            store_id: params.storeId,
            sender_type: "customer",
            body: text ?? "[mensagem sem texto]",
            direction: "inbound",
            channel: params.channel,
            external_id: message.externalId,
            status: "received",
            media_type: message.mediaType,
            transcript: message.mediaType === "audio" ? text : null,
          });

          await supabaseAdmin.from("message_logs").insert({
            store_id: params.storeId,
            channel: params.channel,
            direction: "inbound",
            event: "message_received",
            level: "info",
            contact: message.contact,
          });

          // Opt-out imediato quando o cliente pede para parar.
          if (text && isOptOutMessage(text)) {
            const now = new Date().toISOString();
            await supabaseAdmin.from("contact_consents").upsert(
              {
                store_id: params.storeId,
                channel: params.channel,
                contact: message.contact,
                opted_in: false,
                opted_out_at: now,
                source: "mensagem do cliente",
              },
              { onConflict: "store_id,channel,contact" },
            );
            continue;
          }

          // Resposta automática de saudação ou de fora do horário.
          const templateKey = withinHours ? "greeting" : "away";
          const { data: template } = await supabaseAdmin
            .from("message_templates")
            .select("body")
            .eq("store_id", params.storeId)
            .eq("key", templateKey)
            .eq("is_active", true)
            .maybeSingle();

          if (template) {
            const { data: store } = await supabaseAdmin
              .from("stores")
              .select("name, slug")
              .eq("id", params.storeId)
              .maybeSingle();
            const body = renderTemplate(template.body, {
              cliente: message.contactName ?? "",
              loja: store?.name ?? "",
              catalogo: store?.slug ? `https://oseupedido.com.br/${store.slug}` : "",
            });

            const result = await adapter.send(
              {
                channel: params.channel,
                demoMode: settings.demo_mode,
                accountId: settings.account_id,
                phoneNumberId: settings.phone_number_id,
                displayNumber: settings.display_number,
                fromEmail: settings.from_email,
                botUsername: settings.bot_username,
              },
              {
                accessToken: credentials?.access_token ?? null,
                verifyToken: credentials?.verify_token ?? null,
                appSecret: credentials?.app_secret ?? null,
                extra: {},
              },
              message.contact,
              body,
            );

            await supabaseAdmin.from("messages").insert({
              conversation_id: conversationId,
              store_id: params.storeId,
              sender_type: "system",
              body,
              direction: "outbound",
              channel: params.channel,
              status: result.ok ? "sent" : "failed",
              error: result.error ?? null,
              external_id: result.externalId,
              template_key: templateKey,
              is_demo: result.demo,
            });

            await supabaseAdmin.from("message_logs").insert({
              store_id: params.storeId,
              channel: params.channel,
              direction: "outbound",
              event: `auto_${templateKey}`,
              level: result.ok ? "info" : "error",
              contact: message.contact,
              error: result.error ?? null,
            });
          }

          await supabaseAdmin
            .from("channel_webhook_events")
            .update({ processed_at: new Date().toISOString() })
            .eq("channel", params.channel)
            .eq("event_id", message.externalId);
        }

        return Response.json({ received: true });
      },
    },
  },
});

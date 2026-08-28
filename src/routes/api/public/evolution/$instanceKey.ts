import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da Evolution API, por instância.
 *
 * A URL contém uma chave opaca da instância (nunca o token) e o corpo só é
 * aceito com o segredo configurado pela plataforma. Cada evento é gravado com
 * chave de deduplicação, então reprocessar o mesmo evento não duplica nada.
 */
export const Route = createFileRoute("/api/public/evolution/$instanceKey")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
        const rate = await consumeRateLimit(
          "webhook",
          `evolution:${params.instanceKey}:${clientIdentifier(request.headers)}`,
        );
        if (!rate.allowed) {
          return new Response("Muitas requisições", {
            status: 429,
            headers: { "retry-after": String(rate.retryAfterSeconds) },
          });
        }

        const rawBody = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadGlobalSettings } = await import("@/lib/whatsapp/send.server");

        const { data: instance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("*")
          .eq("instance_key", params.instanceKey)
          .maybeSingle();
        if (!instance) return new Response("Instância desconhecida", { status: 404 });

        const settings = await loadGlobalSettings(supabaseAdmin);
        const { data: credentials } = await supabaseAdmin
          .from("whatsapp_instance_credentials")
          .select("webhook_secret")
          .eq("instance_id", instance.id)
          .maybeSingle();

        const expected = credentials?.webhook_secret ?? settings?.webhook_secret ?? null;
        if (expected) {
          const header =
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
            request.headers.get("x-webhook-secret") ??
            "";
          if (header !== expected) return new Response("Não autorizado", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return new Response("Payload inválido", { status: 400 });
        }

        const eventType = String(payload["event"] ?? "unknown");
        const data = (payload["data"] ?? {}) as Record<string, unknown>;
        const eventId =
          ((data["key"] as { id?: string } | undefined)?.id ??
            (data["id"] as string | undefined) ??
            `${eventType}:${payload["date_time"] ?? Date.now()}`) + "";
        const dedupeKey = `${instance.id}:${eventType}:${eventId}`;

        const { error: dedupeError } = await supabaseAdmin.from("whatsapp_webhook_events").insert({
          store_id: instance.store_id,
          instance_id: instance.id,
          event_type: eventType,
          dedupe_key: dedupeKey,
          payload: payload as never,
          status: "pending",
        });
        // Evento repetido: já foi (ou está sendo) processado.
        if (dedupeError) return Response.json({ received: true, duplicated: true });

        async function finish(status: string, error: string | null) {
          await supabaseAdmin
            .from("whatsapp_webhook_events")
            .update({
              status,
              error,
              attempts: 1,
              processed_at: new Date().toISOString(),
              next_retry_at: status === "failed" ? new Date(Date.now() + 5 * 60_000).toISOString() : null,
            })
            .eq("dedupe_key", dedupeKey);
        }

        try {
          await supabaseAdmin
            .from("whatsapp_instances")
            .update({ last_event_at: new Date().toISOString() })
            .eq("id", instance.id);

          switch (eventType) {
            case "connection.update": {
              const state = String(data["state"] ?? data["status"] ?? "").toLowerCase();
              const mapped = ["open", "connecting", "close"].includes(state) ? state : "error";
              const now = new Date().toISOString();
              await supabaseAdmin
                .from("whatsapp_instances")
                .update({
                  status: mapped,
                  last_sync_at: now,
                  ...(mapped === "open" ? { connected_at: now, last_error: null, qr_expires_at: null } : {}),
                  ...(mapped === "close" ? { disconnected_at: now } : {}),
                })
                .eq("id", instance.id);
              await supabaseAdmin.from("whatsapp_connection_events").insert({
                store_id: instance.store_id,
                instance_id: instance.id,
                status: mapped,
                previous_status: instance.status,
                detail: "Evento da Evolution API",
              });
              break;
            }

            case "qrcode.updated": {
              await supabaseAdmin
                .from("whatsapp_instances")
                .update({ status: "connecting", qr_expires_at: new Date(Date.now() + 60_000).toISOString() })
                .eq("id", instance.id);
              break;
            }

            case "messages.upsert": {
              const key = (data["key"] ?? {}) as { remoteJid?: string; fromMe?: boolean; id?: string };
              if (key.fromMe) break;
              const jid = key.remoteJid ?? "";
              if (jid.endsWith("@g.us")) break; // grupos não entram na caixa de entrada
              const contact = jid.split("@")[0] ?? "";
              if (!contact) break;

              const message = (data["message"] ?? {}) as Record<string, unknown>;
              const text =
                (message["conversation"] as string | undefined) ??
                ((message["extendedTextMessage"] as { text?: string } | undefined)?.text ?? null);
              const pushName = (data["pushName"] as string | undefined) ?? null;

              const { data: existing } = await supabaseAdmin
                .from("conversations")
                .select("id, unread_count")
                .eq("store_id", instance.store_id)
                .eq("channel", "whatsapp")
                .eq("contact", contact)
                .maybeSingle();

              let conversationId = existing?.id ?? null;
              if (!conversationId) {
                const { data: created } = await supabaseAdmin
                  .from("conversations")
                  .insert({
                    store_id: instance.store_id,
                    channel: "whatsapp",
                    contact,
                    contact_name: pushName,
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
              if (!conversationId) break;

              await supabaseAdmin.from("messages").insert({
                conversation_id: conversationId,
                store_id: instance.store_id,
                sender_type: "customer",
                body: text ?? "[mensagem sem texto]",
                direction: "inbound",
                channel: "whatsapp",
                external_id: key.id ?? null,
                status: "received",
              });

              // Opt-out de promoções por palavra-chave.
              if (text && /^\s*(sair|parar|stop|descadastrar)\s*$/i.test(text)) {
                await supabaseAdmin.from("whatsapp_customer_preferences").upsert(
                  {
                    store_id: instance.store_id,
                    phone: contact,
                    accept_marketing: false,
                    opted_out_at: new Date().toISOString(),
                    source: "mensagem do cliente",
                  },
                  { onConflict: "store_id,phone" },
                );
              }
              break;
            }

            case "messages.update":
            case "send.message": {
              const status = String(data["status"] ?? "").toLowerCase();
              if (status.includes("error") || status === "failed") {
                await supabaseAdmin.from("whatsapp_delivery_attempts").insert({
                  store_id: instance.store_id,
                  attempt: 1,
                  status: "failed",
                  error: "Falha de envio informada pelo provedor.",
                });
              }
              break;
            }

            default:
              break;
          }

          await finish("processed", null);
        } catch (error) {
          await finish("failed", error instanceof Error ? error.message.slice(0, 200) : "Erro ao processar evento.");
        }

        return Response.json({ received: true });
      },

      GET: async () => Response.json({ ok: true }),
    },
  },
});

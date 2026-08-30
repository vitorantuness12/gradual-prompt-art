import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de pagamentos — seguro e idempotente.
 *
 * 1. A assinatura do provedor é conferida antes de qualquer leitura de dados.
 * 2. Cada evento é gravado em `payment_webhook_events` com chave única
 *    (provedor + id do evento); um evento repetido é descartado.
 * 3. Só então a transação e o pedido são atualizados.
 */
export const Route = createFileRoute("/api/public/pagamentos/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { clientIdentifier, consumeRateLimit } = await import("@/lib/security.server");
        const rateLimit = await consumeRateLimit(
          "webhook",
          `pagamentos:${clientIdentifier(request.headers)}`,
        );
        if (!rateLimit.allowed) {
          return new Response("Muitas requisições", {
            status: 429,
            headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
          });
        }

        const rawBody = await request.text();
        const { getGateway } = await import("@/lib/payments/gateway.server");
        const gateway = getGateway(params.provider);

        if (gateway.id === "manual") {
          return new Response("Provedor não suporta webhook", { status: 404 });
        }

        const valid = await gateway.verifyWebhook(request.headers, rawBody);
        if (!valid) return new Response("Assinatura inválida", { status: 401 });

        let event;
        try {
          event = await gateway.parseWebhook(rawBody);
        } catch {
          return new Response("Payload inválido", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotência: a chave única bloqueia o reprocessamento.
        const { error: dedupeError } = await supabaseAdmin.from("payment_webhook_events").insert({
          provider: gateway.id,
          event_id: event.eventId,
          event_type: event.kind,
          payload: JSON.parse(rawBody) as never,
        });
        if (dedupeError) {
          return Response.json({ received: true, duplicated: true });
        }

        if (!event.externalId || event.kind === "unknown") {
          return Response.json({ received: true, ignored: true });
        }

        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("id, order_id, amount")
          .eq("provider", gateway.id)
          .eq("external_id", event.externalId)
          .maybeSingle();

        if (!payment) return Response.json({ received: true, unmatched: true });

        const now = new Date().toISOString();
        const updates: Record<string, unknown> = { fee_amount: event.feeAmount ?? 0 };

        let orderPaymentStatus: "pending" | "paid" | "refunded" | "failed" = "pending";

        if (event.kind === "paid") {
          updates["status"] = "paid";
          updates["paid_at"] = now;
          updates["net_amount"] = Number(payment.amount) - Number(event.feeAmount ?? 0);
          orderPaymentStatus = "paid";
        } else if (event.kind === "failed") {
          updates["status"] = "failed";
          updates["last_error"] = "Pagamento recusado pelo provedor.";
          orderPaymentStatus = "failed";
        } else if (event.kind === "expired") {
          updates["status"] = "failed";
          updates["last_error"] = "Cobrança expirada.";
          orderPaymentStatus = "failed";
        } else if (event.kind === "refunded") {
          updates["status"] = "refunded";
          updates["refunded_amount"] = event.refundedAmount ?? payment.amount;
          updates["refunded_at"] = now;
          orderPaymentStatus = "refunded";
        }

        await supabaseAdmin
          .from("payments")
          .update(updates as never)
          .eq("id", payment.id);
        if (payment.order_id) {
          await supabaseAdmin
            .from("orders")
            .update({ payment_status: orderPaymentStatus })
            .eq("id", payment.order_id);

          // Produto digital: acesso liberado só agora, com o valor pago conferido.
          if (orderPaymentStatus === "paid") {
            const { releaseDigitalForOrder } = await import("@/lib/checkout-especializado.server");
            await releaseDigitalForOrder(supabaseAdmin, payment.order_id, Number(payment.amount));
          }
        }
        await supabaseAdmin
          .from("payment_webhook_events")
          .update({ processed_at: now, payment_id: payment.id })
          .eq("provider", gateway.id)
          .eq("event_id", event.eventId);

        return Response.json({ received: true });
      },
    },
  },
});

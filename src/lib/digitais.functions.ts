import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Página pública do link de entrega digital. */
export const getDigitalDelivery = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadDelivery } = await import("@/lib/digitais.server");
    return loadDelivery(supabaseAdmin, data.token);
  });

/** Consome um download do link (valida validade, limite e revogação). */
export const downloadDigitalDelivery = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consumeDownload } = await import("@/lib/digitais.server");
    return consumeDownload(supabaseAdmin, data.token);
  });

/** Roda a cobrança recorrente das assinaturas vencidas da loja. */
export const runStoreSubscriptionBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: context.userId,
    });
    if (!allowed) throw new Error("Sem permissão nesta loja.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runSubscriptionBilling } = await import("@/lib/digitais.server");
    return runSubscriptionBilling(supabaseAdmin, { storeId: data.storeId });
  });

/** Registra reembolso, cancelamento ou chargeback com todos os efeitos. */
export const registerStoreRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      storeId: string;
      kind: "refund" | "cancellation" | "chargeback";
      method: "money" | "credit";
      amount: number;
      reason?: string;
      orderId?: string;
      subscriptionId?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: context.userId,
    });
    if (!allowed) throw new Error("Sem permissão nesta loja.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { registerRefund } = await import("@/lib/digitais.server");
    return registerRefund(supabaseAdmin, {
      storeId: data.storeId,
      kind: data.kind,
      method: data.method,
      amount: data.amount,
      reason: data.reason ?? null,
      orderId: data.orderId ?? null,
      subscriptionId: data.subscriptionId ?? null,
      userId: context.userId,
    });
  });

/** Reenvia por e-mail o link de entrega e os próximos passos. */
export const sendDeliveryEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string; deliveryId: string; baseUrl: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: context.userId,
    });
    if (!allowed) throw new Error("Sem permissão nesta loja.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyDeliveryReleased } = await import("@/lib/digitais.server");
    return notifyDeliveryReleased(supabaseAdmin, data.deliveryId, data.baseUrl);
  });

/** Avisa o assinante que a assinatura foi ativada. */
export const sendSubscriptionEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string; subscriptionId: string; kind: "activated" | "charged" | "reactivated" }) => input)
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: context.userId,
    });
    if (!allowed) throw new Error("Sem permissão nesta loja.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifySubscription } = await import("@/lib/digitais.server");
    await notifySubscription(supabaseAdmin, data.subscriptionId, data.kind);
    return { ok: true };
  });

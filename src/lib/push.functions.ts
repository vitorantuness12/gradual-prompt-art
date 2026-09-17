import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Chave pública VAPID usada pelo navegador para criar a inscrição. */
export const getPushPublicKey = createServerFn({ method: "GET" }).handler(async () => ({
  publicKey: process.env["VAPID_PUBLIC_KEY"] ?? null,
}));

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(10),
  auth: z.string().min(4),
  storeId: z.string().uuid().nullable().optional(),
  audience: z.enum(["lojista", "entregador", "cliente"]).default("lojista"),
  userAgent: z.string().max(400).optional(),
});

const customerPreferenceSchema = z.object({
  storeSlug: z.string().regex(/^[a-z0-9-]{1,80}$/),
});

/** Consulta o aceite de push do cliente para uma loja, sem expor dados do aparelho. */
export const getCustomerPushPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => customerPreferenceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: store, error: storeError } = await context.supabase
      .from("stores")
      .select("id")
      .eq("slug", data.storeSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (storeError || !store) throw new Error("Loja não encontrada.");

    const [{ data: customer }, { data: links }] = await Promise.all([
      context.supabase
        .from("customers")
        .select("id, marketing_opt_in")
        .eq("store_id", store.id)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("push_subscription_stores")
        .select("is_active, subscription:push_subscriptions(endpoint)")
        .eq("store_id", store.id)
        .eq("user_id", context.userId)
        .eq("is_active", true)
        .limit(1),
    ]);
    const link = links?.[0];
    const subscription = link?.subscription as { endpoint?: string } | null;
    return {
      storeId: store.id,
      customerId: customer?.id ?? null,
      marketingOptIn: customer?.marketing_opt_in ?? false,
      active: Boolean(link?.is_active),
      endpoint: subscription?.endpoint ?? "",
    };
  });

/** Registra (ou atualiza) o aparelho do usuário logado. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => subscriptionSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (data.audience === "cliente" && !data.storeId) {
      throw new Error("Escolha uma loja para ativar as notificações.");
    }
    if (data.storeId) {
      if (data.audience === "cliente") {
        const { data: customer } = await context.supabase
          .from("customers")
          .select("id, marketing_opt_in")
          .eq("store_id", data.storeId)
          .eq("user_id", context.userId)
          .maybeSingle();
        if (!customer?.marketing_opt_in) {
          throw new Error("Ative o recebimento de novidades nos seus dados primeiro.");
        }
      } else {
        const { data: allowed } = await context.supabase.rpc("is_store_member", {
          _store_id: data.storeId,
          _user_id: context.userId,
        });
        if (!allowed) throw new Error("Você não pertence a esta loja.");
      }
    }

    const { data: subscription, error } = await context.supabase
      .from("push_subscriptions")
      .upsert(
      {
        user_id: context.userId,
        store_id: data.storeId ?? null,
        audience: data.audience,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.audience === "cliente" && data.storeId) {
      const { data: customer } = await context.supabase
        .from("customers")
        .select("id")
        .eq("store_id", data.storeId)
        .eq("user_id", context.userId)
        .maybeSingle();
      const { error: linkError } = await context.supabase
        .from("push_subscription_stores")
        .upsert(
          {
            subscription_id: subscription.id,
            store_id: data.storeId,
            customer_id: customer?.id ?? null,
            user_id: context.userId,
            consented_at: new Date().toISOString(),
            revoked_at: null,
            is_active: true,
          },
          { onConflict: "subscription_id,store_id" },
        );
      if (linkError) throw new Error(linkError.message);
    }
    return { ok: true };
  });

/** Remove o aparelho quando o usuário desativa as notificações. */
export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        endpoint: z.string().url(),
        storeId: z.string().uuid().optional(),
        audience: z.enum(["lojista", "entregador", "cliente"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.audience === "cliente" && data.storeId) {
      const { data: subscription } = await context.supabase
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", data.endpoint)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (subscription) {
        const { error } = await context.supabase
          .from("push_subscription_stores")
          .update({ is_active: false, revoked_at: new Date().toISOString() })
          .eq("subscription_id", subscription.id)
          .eq("store_id", data.storeId)
          .eq("user_id", context.userId);
        if (error) throw new Error(error.message);
      }
      return { ok: true };
    }
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia uma notificação de teste para os aparelhos do próprio usuário. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPush } = await import("@/lib/push.server");
    return sendPush(
      context.supabase,
      { userIds: [context.userId] },
      {
        title: "Notificação de teste",
        body: "Tudo certo! Você vai receber os avisos da sua loja por aqui.",
        url: "/painel",
        tag: "teste",
      },
    );
  });

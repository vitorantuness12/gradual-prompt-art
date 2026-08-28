import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Funções de servidor do módulo de atendimento.
 * Tokens de canal nunca voltam para o navegador: apenas indicadores
 * (configurado / últimos 4 dígitos) são devolvidos.
 */

const channelEnum = z.enum(["whatsapp", "telegram", "email"]);

/** ---------- Credenciais ---------- */

const credentialsInput = z.object({
  storeId: z.string().uuid(),
  channel: channelEnum,
  accessToken: z.string().trim().max(500).optional(),
  verifyToken: z.string().trim().max(200).optional(),
  appSecret: z.string().trim().max(200).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertStaff(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("is_store_staff", { _store_id: storeId, _user_id: userId });
  if (data !== true) throw new Error("Sem permissão para esta loja.");
}

export const saveChannelCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => credentialsInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; tokenHint: string | null }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("channel_credentials")
      .select("id, access_token, verify_token, app_secret")
      .eq("store_id", data.storeId)
      .eq("channel", data.channel)
      .maybeSingle();

    const accessToken = data.accessToken?.trim() || existing?.access_token || null;
    const verifyToken = data.verifyToken?.trim() || existing?.verify_token || null;
    const appSecret = data.appSecret?.trim() || existing?.app_secret || null;

    const payload = {
      store_id: data.storeId,
      channel: data.channel,
      access_token: accessToken,
      verify_token: verifyToken,
      app_secret: appSecret,
    };

    if (existing) {
      await supabaseAdmin.from("channel_credentials").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("channel_credentials").insert(payload);
    }

    const tokenHint = accessToken ? `••••••••${accessToken.slice(-4)}` : null;
    await supabaseAdmin
      .from("channel_settings")
      .update({ has_token: Boolean(accessToken), has_verify_token: Boolean(verifyToken), token_hint: tokenHint })
      .eq("store_id", data.storeId)
      .eq("channel", data.channel);

    return { ok: true, message: "Credenciais guardadas com segurança.", tokenHint };
  });

/** ---------- Teste de conexão ---------- */

const testInput = z.object({ storeId: z.string().uuid(), channel: channelEnum });

export const testChannelConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getChannelAdapter } = await import("@/lib/messaging/adapters.server");

    const [{ data: settings }, { data: credentials }] = await Promise.all([
      supabaseAdmin
        .from("channel_settings")
        .select("*")
        .eq("store_id", data.storeId)
        .eq("channel", data.channel)
        .maybeSingle(),
      supabaseAdmin
        .from("channel_credentials")
        .select("*")
        .eq("store_id", data.storeId)
        .eq("channel", data.channel)
        .maybeSingle(),
    ]);

    if (!settings) return { ok: false, message: "Configure o canal antes de testar." };
    if (settings.demo_mode) {
      return { ok: true, message: "Modo demonstração ativo: as mensagens são simuladas, sem envio real." };
    }

    const adapter = getChannelAdapter(data.channel);
    const result = await adapter.test(
      {
        channel: data.channel,
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
    );

    await supabaseAdmin
      .from("channel_settings")
      .update({ last_test_at: new Date().toISOString(), last_test_ok: result.ok, last_test_message: result.message })
      .eq("id", settings.id);

    await supabaseAdmin.from("message_logs").insert({
      store_id: data.storeId,
      channel: data.channel,
      event: "connection_test",
      level: result.ok ? "info" : "error",
      error: result.ok ? null : result.message,
    });

    return result;
  });

/** ---------- Envio de mensagem ---------- */

const sendInput = z.object({
  storeId: z.string().uuid(),
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  templateKey: z.string().trim().max(40).optional(),
});

export const sendChannelMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; demo: boolean; message: string }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getChannelAdapter } = await import("@/lib/messaging/adapters.server");
    const { isWithinBusinessHours, parseBusinessHours } = await import("@/lib/messaging/templates");

    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("id, channel, contact, store_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation || conversation.store_id !== data.storeId) {
      return { ok: false, demo: false, message: "Conversa não encontrada." };
    }

    const channel = conversation.channel ?? "chat";
    const contact = conversation.contact ?? "";

    // Consentimento / opt-out
    if (contact) {
      const { data: consent } = await supabaseAdmin
        .from("contact_consents")
        .select("opted_in")
        .eq("store_id", data.storeId)
        .eq("channel", channel)
        .eq("contact", contact)
        .maybeSingle();
      if (consent && consent.opted_in === false) {
        return { ok: false, demo: false, message: "Este contato pediu para não receber mensagens." };
      }
    }

    const { data: settings } = await supabaseAdmin
      .from("channel_settings")
      .select("*")
      .eq("store_id", data.storeId)
      .eq("channel", channel)
      .maybeSingle();

    // Prevenção de spam: limite por hora e por contato.
    if (settings && contact) {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count } = await supabaseAdmin
        .from("message_logs")
        .select("id", { count: "exact", head: true })
        .eq("store_id", data.storeId)
        .eq("contact", contact)
        .eq("direction", "outbound")
        .gte("created_at", since);
      if ((count ?? 0) >= settings.max_messages_per_hour) {
        return { ok: false, demo: false, message: "Limite de mensagens por hora atingido para este contato." };
      }
    }

    const outsideHours = settings ? !isWithinBusinessHours(parseBusinessHours(settings.business_hours)) : false;

    let result: { ok: boolean; demo: boolean; externalId: string | null; error?: string } = {
      ok: true,
      demo: true,
      externalId: null,
    };
    if (channel !== "chat" && settings) {
      const { data: credentials } = await supabaseAdmin
        .from("channel_credentials")
        .select("*")
        .eq("store_id", data.storeId)
        .eq("channel", channel)
        .maybeSingle();
      const adapter = getChannelAdapter(channel);
      result = await adapter.send(
        {
          channel,
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
        contact,
        data.body,
      );
    }

    const { data: message } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        store_id: data.storeId,
        sender_type: "store",
        sender_id: context.userId,
        body: data.body,
        direction: "outbound",
        channel,
        status: result.ok ? "sent" : "failed",
        error: result.error ?? null,
        external_id: result.externalId,
        template_key: data.templateKey ?? null,
        is_demo: result.demo,
      })
      .select("id")
      .single();

    await supabaseAdmin.from("message_logs").insert({
      store_id: data.storeId,
      channel,
      direction: "outbound",
      event: data.templateKey ?? "manual_message",
      level: result.ok ? "info" : "error",
      contact: contact || null,
      message_id: message?.id ?? null,
      error: result.error ?? null,
      payload: { demo: result.demo, outsideHours },
    });

    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return {
      ok: result.ok,
      demo: result.demo,
      message: result.ok
        ? result.demo
          ? "Mensagem registrada em modo demonstração."
          : "Mensagem enviada."
        : (result.error ?? "Falha no envio."),
    };
  });

/** ---------- Assistente de IA ---------- */

const aiInput = z.object({
  storeId: z.string().uuid(),
  conversationId: z.string().uuid(),
  question: z.string().trim().min(2).max(600),
});

export const askStoreAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => aiInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; answer: string; handoff: boolean }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { ok: false, answer: "O assistente de IA ainda não está disponível nesta loja.", handoff: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // O assistente só enxerga dados desta loja.
    const [{ data: store }, { data: products }, { data: orders }] = await Promise.all([
      supabaseAdmin.from("stores").select("name, slug, delivery_fee, min_order_value").eq("id", data.storeId).maybeSingle(),
      supabaseAdmin
        .from("products")
        .select("name, price, promo_price, is_available, description")
        .eq("store_id", data.storeId)
        .eq("is_active", true)
        .limit(60),
      supabaseAdmin
        .from("orders")
        .select("code, status, total, created_at")
        .eq("store_id", data.storeId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const contextText = [
      `Loja: ${store?.name ?? ""} (oseupedido.com.br/${store?.slug ?? ""})`,
      `Taxa de entrega padrão: R$ ${Number(store?.delivery_fee ?? 0).toFixed(2)}`,
      "Catálogo:",
      ...(products ?? []).map(
        (item) =>
          `- ${item.name}: R$ ${Number(item.promo_price ?? item.price).toFixed(2)}${item.is_available ? "" : " (indisponível)"}`,
      ),
      "Pedidos recentes:",
      ...(orders ?? []).map((item) => `- ${item.code}: ${item.status} · R$ ${Number(item.total).toFixed(2)}`),
    ].join("\n");

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "Você é o assistente de atendimento desta loja. Responda em português do Brasil, curto e cordial. " +
                "Use SOMENTE as informações do contexto. Se a resposta não estiver no contexto, diga que vai transferir " +
                "para um atendente humano e finalize com [TRANSFERIR].\n\n" +
                contextText,
            },
            { role: "user", content: data.question },
          ],
        }),
      });

      if (response.status === 429) {
        return { ok: false, answer: "Muitas perguntas em sequência. Tente de novo em instantes.", handoff: true };
      }
      if (!response.ok) {
        return { ok: false, answer: "Não consegui responder agora. Um atendente vai assumir.", handoff: true };
      }

      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const handoff = raw.includes("[TRANSFERIR]");

      await supabaseAdmin.from("message_logs").insert({
        store_id: data.storeId,
        channel: "chat",
        direction: "outbound",
        event: "ai_assistant",
        level: "info",
        payload: { handoff },
      });

      return { ok: true, answer: raw.replace("[TRANSFERIR]", "").trim(), handoff };
    } catch {
      return { ok: false, answer: "Assistente indisponível. Transferindo para atendente humano.", handoff: true };
    }
  });

/** ---------- Consentimento ---------- */

const consentInput = z.object({
  storeId: z.string().uuid(),
  channel: z.string().trim().min(2).max(20),
  contact: z.string().trim().min(3).max(120),
  optedIn: z.boolean(),
  source: z.string().trim().max(60).optional(),
});

export const setContactConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => consentInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin.from("contact_consents").upsert(
      {
        store_id: data.storeId,
        channel: data.channel,
        contact: data.contact,
        opted_in: data.optedIn,
        opted_in_at: data.optedIn ? now : null,
        opted_out_at: data.optedIn ? null : now,
        source: data.source ?? "painel",
      },
      { onConflict: "store_id,channel,contact" },
    );
    return { ok: true };
  });

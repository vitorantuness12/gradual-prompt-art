import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readAutomationConfig, renderAutomationMessage } from "@/lib/automacoes";
import { normalizeCouponCode, recipeFor, type MarketingOverview } from "@/lib/marketing";

/**
 * Central de marketing automática.
 *
 * Toda função exige permissão da equipe na área "promocoes" da loja, checada
 * com o cliente do próprio usuário (RLS) antes de qualquer escrita com o
 * cliente privilegiado.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: "promocoes",
  });
  if (data !== true) throw new Error("Você não tem permissão para o marketing desta loja.");
}

const MARKETING_EVENTS = ["birthday", "inactive", "post_purchase"] as const;

const storeInput = z.object({ storeId: z.string().uuid() });

/** Situação das receitas, resultados dos últimos 30 dias e público de hoje. */
export const getMarketingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<MarketingOverview> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [rulesRes, logsRes, customersRes, accountsRes, couponsRes, channelRes] = await Promise.all([
      supabaseAdmin.from("automation_rules").select("*").eq("store_id", data.storeId),
      supabaseAdmin
        .from("message_logs")
        .select("event, level")
        .eq("store_id", data.storeId)
        .gte("created_at", since)
        .limit(5000),
      supabaseAdmin
        .from("customers")
        .select("id, birth_date")
        .eq("store_id", data.storeId)
        .limit(5000),
      supabaseAdmin.from("loyalty_accounts").select("customer_id, last_order_at").eq("store_id", data.storeId),
      supabaseAdmin
        .from("promotions")
        .select("code, discount_type, discount_value")
        .eq("store_id", data.storeId)
        .eq("is_active", true)
        .limit(50),
      supabaseAdmin
        .from("channel_settings")
        .select("channel")
        .eq("store_id", data.storeId)
        .eq("channel", "whatsapp")
        .maybeSingle(),
    ]);

    const rules = (rulesRes.data ?? []).filter((row) =>
      (MARKETING_EVENTS as readonly string[]).includes(row.event),
    );

    const stats = MARKETING_EVENTS.map((event) => {
      const rows = (logsRes.data ?? []).filter((row) => row.event === event);
      return {
        event,
        sent: rows.filter((row) => row.level !== "error").length,
        failed: rows.filter((row) => row.level === "error").length,
      };
    });

    // Prévia do público: quantos clientes a receita alcançaria hoje.
    const today = new Date();
    const lastOrderBy = new Map((accountsRes.data ?? []).map((row) => [row.customer_id, row.last_order_at]));
    const audience: Record<string, number> = { birthday: 0, inactive: 0, post_purchase: 0 };

    for (const customer of customersRes.data ?? []) {
      if (customer.birth_date) {
        const birth = new Date(customer.birth_date);
        if (birth.getUTCMonth() === today.getUTCMonth() && birth.getUTCDate() === today.getUTCDate()) {
          audience["birthday"] = (audience["birthday"] ?? 0) + 1;
        }
      }
      const last = lastOrderBy.get(customer.id);
      if (last) {
        const elapsedDays = (Date.now() - new Date(String(last)).getTime()) / 86_400_000;
        const configuredDays =
          readAutomationConfig(rules.find((row) => row.event === "inactive")?.config).inactiveDays ?? 30;
        if (elapsedDays >= configuredDays) audience["inactive"] = (audience["inactive"] ?? 0) + 1;
        if (elapsedDays <= 1) audience["post_purchase"] = (audience["post_purchase"] ?? 0) + 1;
      }
    }

    return {
      rules: MARKETING_EVENTS.map((event) => {
        const row = rules.find((item) => item.event === event);
        const config = readAutomationConfig(row?.config);
        return {
          event,
          id: row?.id ?? null,
          isActive: row?.is_active ?? false,
          channel: row?.channel ?? "whatsapp",
          message: config.message ?? "",
          couponCode: config.couponCode ?? null,
          inactiveDays: config.inactiveDays ?? null,
          delayMinutes: row?.delay_minutes ?? 0,
          lastRunAt: row?.updated_at ?? null,
        };
      }),
      stats,
      audience,
      coupons: (couponsRes.data ?? []).map((row) => ({
        code: row.code,
        discountType: row.discount_type,
        discountValue: Number(row.discount_value ?? 0),
      })),
      channelReady: Boolean(channelRes.data),
    };
  });

const saveInput = z.object({
  storeId: z.string().uuid(),
  event: z.enum(MARKETING_EVENTS),
  isActive: z.boolean(),
  channel: z.enum(["whatsapp", "email"]),
  message: z.string().trim().min(10).max(1000),
  couponCode: z.string().trim().max(20).optional(),
  discountPercent: z.number().min(0).max(90).optional(),
  inactiveDays: z.number().int().min(1).max(365).optional(),
  delayMinutes: z.number().int().min(0).max(10_080).optional(),
});

/**
 * Liga/desliga e salva uma receita. Quando há cupom informado, cria o cupom
 * na loja caso ainda não exista (nunca sobrescreve um cupom existente).
 */
export const saveMarketingRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; couponCreated?: boolean }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const recipe = recipeFor(data.event);
    if (!recipe) return { ok: false, message: "Receita desconhecida." };

    const code = data.couponCode ? normalizeCouponCode(data.couponCode) : "";
    let couponCreated = false;

    if (code) {
      const { data: existing } = await supabaseAdmin
        .from("promotions")
        .select("id")
        .eq("store_id", data.storeId)
        .eq("code", code)
        .maybeSingle();

      if (!existing) {
        const percent = data.discountPercent && data.discountPercent > 0 ? data.discountPercent : 10;
        const { error } = await supabaseAdmin.from("promotions").insert({
          store_id: data.storeId,
          code,
          description: `Cupom automático — ${recipe.title}`,
          campaign: `marketing:${data.event}`,
          discount_type: "percent",
          discount_value: percent,
          is_active: true,
        });
        if (error) return { ok: false, message: `Não foi possível criar o cupom: ${error.message}` };
        couponCreated = true;
      }
    }

    const payload = {
      store_id: data.storeId,
      event: data.event,
      name: recipe.title,
      channel: data.channel,
      template_key: `marketing_${data.event}`,
      is_active: data.isActive,
      delay_minutes: data.delayMinutes ?? recipe.delayMinutes,
      respect_business_hours: true,
      config: {
        message: data.message,
        couponCode: code || null,
        inactiveDays: data.inactiveDays ?? recipe.inactiveDays ?? null,
        requireConsent: true,
      },
    };

    const { data: existingRule } = await supabaseAdmin
      .from("automation_rules")
      .select("id")
      .eq("store_id", data.storeId)
      .eq("event", data.event)
      .maybeSingle();

    const { error } = existingRule?.id
      ? await supabaseAdmin.from("automation_rules").update(payload).eq("id", existingRule.id)
      : await supabaseAdmin.from("automation_rules").insert(payload);
    if (error) return { ok: false, message: `Não foi possível salvar: ${error.message}` };

    return {
      ok: true,
      couponCreated,
      message: data.isActive
        ? `${recipe.title} ativada.${couponCreated ? ` Cupom ${code} criado.` : ""}`
        : `${recipe.title} desativada.`,
    };
  });

const testInput = z.object({
  storeId: z.string().uuid(),
  event: z.enum(MARKETING_EVENTS),
  channel: z.enum(["whatsapp", "email"]),
  contact: z.string().trim().min(5).max(120),
  message: z.string().trim().min(10).max(1000),
  couponCode: z.string().trim().max(20).optional(),
});

/** Manda a mensagem de teste para o contato informado pelo lojista. */
export const sendMarketingTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage } = await import("@/lib/automacoes.server");

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("name")
      .eq("id", data.storeId)
      .maybeSingle();

    const body = renderAutomationMessage(data.message, {
      cliente: "Cliente Teste",
      loja: store?.name ?? "sua loja",
      cupom: data.couponCode ? normalizeCouponCode(data.couponCode) : "CUPOM",
    });

    const ok = await sendMessage(supabaseAdmin, data.storeId, data.channel, data.contact, body);

    await supabaseAdmin.from("message_logs").insert({
      store_id: data.storeId,
      channel: data.channel,
      contact: data.contact,
      event: `${data.event}_test`,
      direction: "out",
      level: ok ? "info" : "error",
      payload: { body },
    });

    return ok
      ? { ok: true, message: "Mensagem de teste enviada." }
      : {
          ok: false,
          message:
            data.channel === "whatsapp"
              ? "O WhatsApp da loja ainda não está conectado ou recusou o envio."
              : "O e-mail da loja ainda não está configurado.",
        };
  });

/** Roda as automações agora (o lojista não precisa esperar o horário do dia). */
export const runMarketingNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runMarketingAutomations } = await import("@/lib/automacoes.server");

    const result = await runMarketingAutomations(supabaseAdmin, data.storeId);
    return {
      ok: true,
      message: `Envio concluído: ${result.sent} mensagem(ns) enviada(s), ${result.skipped} pulada(s).`,
    };
  });

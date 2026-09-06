import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { getChannelAdapter } from "@/lib/messaging/adapters.server";
import { readAutomationConfig, renderAutomationMessage } from "@/lib/automacoes";

type Admin = SupabaseClient<Database>;

export interface AutomationRunResult {
  ok: boolean;
  rules: number;
  sent: number;
  skipped: number;
  byEvent: Record<string, number>;
}

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

/** Envia a mensagem pelo canal configurado; sem credencial, apenas registra. */
async function sendMessage(
  admin: Admin,
  storeId: string,
  channel: string,
  contact: string,
  body: string,
): Promise<boolean> {
  const { data: settings } = await admin
    .from("channel_settings")
    .select("*")
    .eq("store_id", storeId)
    .eq("channel", channel)
    .maybeSingle();
  if (!settings) return false;

  const { data: credentials } = await admin
    .from("channel_credentials")
    .select("*")
    .eq("store_id", storeId)
    .eq("channel", channel)
    .maybeSingle();

  try {
    const adapter = getChannelAdapter(channel);
    const result = await adapter.send(
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
      body,
    );
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Rotina diária das automações de marketing (aniversário, inativo, pós-compra).
 *
 * Proteções: só clientes com consentimento, nunca bloqueados, e no máximo um
 * envio por cliente/regra por dia (registrado em `message_logs`).
 */
export async function runMarketingAutomations(admin: Admin): Promise<AutomationRunResult> {
  const result: AutomationRunResult = { ok: true, rules: 0, sent: 0, skipped: 0, byEvent: {} };

  const { data: rules } = await admin
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .in("event", ["birthday", "inactive", "post_purchase"]);

  result.rules = rules?.length ?? 0;
  if (!rules?.length) return result;

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  for (const rule of rules) {
    const config = readAutomationConfig(rule.config);
    const message = config.message?.trim();
    if (!message) continue;

    const { data: store } = await admin
      .from("stores")
      .select("id, name, slug")
      .eq("id", rule.store_id)
      .maybeSingle();
    if (!store) continue;

    const { data: customers } = await admin
      .from("customers")
      .select("id, name, phone, email, birth_date, created_at")
      .eq("store_id", rule.store_id)
      .limit(2000);

    const { data: accounts } = await admin
      .from("loyalty_accounts")
      .select("customer_id, last_order_at")
      .eq("store_id", rule.store_id);
    const lastOrderBy = new Map((accounts ?? []).map((row) => [row.customer_id, row.last_order_at]));

    const { data: blocks } = await admin
      .from("customer_blocks")
      .select("phone")
      .eq("store_id", rule.store_id)
      .eq("is_active", true);
    const blocked = new Set((blocks ?? []).map((row) => digits(row.phone)));

    const { data: consents } = await admin
      .from("contact_consents")
      .select("contact, channel, opted_in")
      .eq("store_id", rule.store_id);
    const optedOut = new Set(
      (consents ?? [])
        .filter((row) => row.opted_in === false)
        .map((row) => `${row.channel}:${row.contact}`),
    );

    const { data: sentToday } = await admin
      .from("message_logs")
      .select("contact")
      .eq("store_id", rule.store_id)
      .eq("template_key", rule.event)
      .gte("created_at", dayStart);
    const alreadyToday = new Set((sentToday ?? []).map((row) => row.contact));

    const inactiveDays = config.inactiveDays ?? 30;
    const cutoff = Date.now() - inactiveDays * 86_400_000;

    for (const customer of customers ?? []) {
      const contact = rule.channel === "email" ? customer.email : customer.phone;
      if (!contact || alreadyToday.has(contact)) continue;
      if (rule.channel !== "email" && blocked.has(digits(customer.phone))) continue;
      if (optedOut.has(`${rule.channel}:${contact}`)) continue;

      let matches = false;
      if (rule.event === "birthday" && customer.birth_date) {
        const birth = new Date(customer.birth_date);
        matches =
          birth.getUTCMonth() === today.getUTCMonth() && birth.getUTCDate() === today.getUTCDate();
      } else if (rule.event === "inactive") {
        const last = lastOrderBy.get(customer.id);
        matches = Boolean(last) && new Date(String(last)).getTime() < cutoff;
      } else if (rule.event === "post_purchase") {
        const last = lastOrderBy.get(customer.id);
        if (last) {
          const elapsed = Date.now() - new Date(last).getTime();
          const delay = Math.max(0, rule.delay_minutes) * 60_000;
          matches = elapsed >= delay && elapsed <= delay + 86_400_000;
        }
      }
      if (!matches) continue;

      const body = renderAutomationMessage(message, {
        cliente: customer.name ?? "",
        loja: store.name ?? "",
        cupom: config.couponCode ?? "",
      });

      const ok = await sendMessage(admin, rule.store_id, rule.channel, contact, body);
      if (ok) {
        result.sent += 1;
        result.byEvent[rule.event] = (result.byEvent[rule.event] ?? 0) + 1;
      } else {
        result.skipped += 1;
      }

      await admin.from("message_logs").insert({
        store_id: rule.store_id,
        channel: rule.channel,
        contact,
        template_key: rule.event,
        body,
        status: ok ? "sent" : "failed",
      });
    }

    await admin
      .from("automation_rules")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", rule.id);
  }

  return result;
}

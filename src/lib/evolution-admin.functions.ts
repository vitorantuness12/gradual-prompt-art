import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Configuração global da Evolution API — exclusiva do superadmin.
 * A API key e o secret do webhook nunca voltam para o navegador: apenas dicas
 * com os últimos caracteres.
 */

export interface EvolutionAdminView {
  baseUrl: string;
  environment: string;
  webhookBaseUrl: string;
  integration: string;
  events: string[];
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  isEnabled: boolean;
  apiKeyHint: string | null;
  webhookSecretHint: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
  detectedVersion: string | null;
  instancesActive: number;
  storesConnected: number;
  logs: { id: string; event: string; status: string; created_at: string; error: string | null }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (data !== true) throw new Error("Acesso restrito à administração da plataforma.");
}

function hint(value: string | null | undefined): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}

export const getEvolutionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvolutionAdminView> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin.from("evolution_global_settings").select("*").limit(1).maybeSingle();
    const [{ count: instancesActive }, { count: storesConnected }, { data: logs }] = await Promise.all([
      supabaseAdmin.from("whatsapp_instances").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("whatsapp_instances")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabaseAdmin
        .from("whatsapp_connection_events")
        .select("id, status, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    return {
      baseUrl: row?.base_url ?? "",
      environment: row?.environment ?? "production",
      webhookBaseUrl: row?.webhook_base_url ?? "",
      integration: row?.integration ?? "WHATSAPP-BAILEYS",
      events: Array.isArray(row?.events) ? (row?.events as string[]) : [],
      timeoutMs: row?.timeout_ms ?? 15000,
      maxRetries: row?.max_retries ?? 3,
      retryDelayMs: row?.retry_delay_ms ?? 2000,
      isEnabled: row?.is_enabled ?? false,
      apiKeyHint: row?.api_key_hint ?? hint(row?.api_key ?? null),
      webhookSecretHint: row?.webhook_secret_hint ?? hint(row?.webhook_secret ?? null),
      lastCheckAt: row?.last_check_at ?? null,
      lastCheckOk: row?.last_check_ok ?? null,
      lastCheckMessage: row?.last_check_message ?? null,
      detectedVersion: row?.detected_version ?? null,
      instancesActive: instancesActive ?? 0,
      storesConnected: storesConnected ?? 0,
      logs: (logs ?? []).map((item) => ({
        id: item.id,
        event: item.status,
        status: item.status,
        created_at: item.created_at,
        error: item.detail,
      })),
    };
  });

const saveInput = z.object({
  baseUrl: z.string().trim().max(300),
  apiKey: z.string().trim().max(300).optional(),
  environment: z.enum(["production", "sandbox"]),
  webhookBaseUrl: z.string().trim().max(300),
  webhookSecret: z.string().trim().max(300).optional(),
  integration: z.string().trim().max(60),
  events: z.array(z.string().trim().max(60)).max(40),
  timeoutMs: z.number().int().min(3000).max(60000),
  maxRetries: z.number().int().min(1).max(5),
  retryDelayMs: z.number().int().min(500).max(30000),
  isEnabled: z.boolean(),
});

export const saveEvolutionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin.from("evolution_global_settings").select("*").limit(1).maybeSingle();
    const apiKey = data.apiKey?.trim() || existing?.api_key || null;
    const webhookSecret = data.webhookSecret?.trim() || existing?.webhook_secret || null;

    const payload = {
      base_url: data.baseUrl || null,
      api_key: apiKey,
      api_key_hint: hint(apiKey),
      environment: data.environment,
      webhook_base_url: data.webhookBaseUrl || null,
      webhook_secret: webhookSecret,
      webhook_secret_hint: hint(webhookSecret),
      integration: data.integration || "WHATSAPP-BAILEYS",
      events: data.events as never,
      timeout_ms: data.timeoutMs,
      max_retries: data.maxRetries,
      retry_delay_ms: data.retryDelayMs,
      is_enabled: data.isEnabled,
    };

    if (existing) {
      await supabaseAdmin.from("evolution_global_settings").update(payload).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("evolution_global_settings").insert(payload);
    }

    return { ok: true, message: "Configuração salva com segurança." };
  });

export const testEvolutionConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string; version: string | null }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkApi } = await import("@/lib/whatsapp/evolution.server");
    const { loadGlobalSettings } = await import("@/lib/whatsapp/send.server");

    const settings = await loadGlobalSettings(supabaseAdmin);
    if (!settings || !settings.base_url || !settings.api_key) {
      return { ok: false, message: "Cadastre a URL base e a API key antes de testar.", version: null };
    }

    const result = await checkApi(settings);
    await supabaseAdmin
      .from("evolution_global_settings")
      .update({
        last_check_at: new Date().toISOString(),
        last_check_ok: result.ok,
        last_check_message: result.message,
        detected_version: result.version,
      })
      .eq("id", settings.id);

    return result;
  });

export const clearEvolutionCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ field: z.enum(["api_key", "webhook_secret"]) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("evolution_global_settings").select("id").limit(1).maybeSingle();
    if (!existing) return { ok: true };
    const patch =
      data.field === "api_key"
        ? { api_key: null, api_key_hint: null }
        : { webhook_secret: null, webhook_secret_hint: null };
    await supabaseAdmin.from("evolution_global_settings").update(patch).eq("id", existing.id);
    return { ok: true };
  });

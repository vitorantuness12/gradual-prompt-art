import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PlatformIntegrationView } from "@/lib/platform-integrations.server";

/** Lista as integrações globais com segredos mascarados. */
export const listPlatformIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformIntegrationView[]> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (isAdmin !== true) throw new Error("Acesso restrito à administração da plataforma.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { toView } = await import("@/lib/platform-integrations.server");

    const [{ data: rows }, { data: stores }] = await Promise.all([
      supabaseAdmin.from("platform_integrations").select("*"),
      supabaseAdmin.from("store_integrations").select("kind").eq("is_enabled", true),
    ]);

    const usage = new Map<string, number>();
    for (const row of stores ?? []) usage.set(row.kind, (usage.get(row.kind) ?? 0) + 1);

    return (rows ?? []).map((row) => toView(row, usage.get(row.kind) ?? 0));
  });

const saveInput = z.object({
  kind: z.string().trim().min(2).max(40),
  provider: z.string().trim().min(2).max(40),
  label: z.string().trim().min(2).max(120),
  isEnabled: z.boolean(),
  values: z.record(z.string(), z.string().max(2000)).default({}),
});

/** Cria ou atualiza a configuração de um provedor global. */
export const savePlatformIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; status: string }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (isAdmin !== true) throw new Error("Acesso restrito à administração da plataforma.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mergeConfig } = await import("@/lib/platform-integrations.server");

    const { data: existing } = await supabaseAdmin
      .from("platform_integrations")
      .select("*")
      .eq("kind", data.kind)
      .eq("provider", data.provider)
      .maybeSingle();

    const merged = mergeConfig(data.provider, existing?.config, data.values);
    const status = merged.missing.length > 0 ? "not_configured" : data.isEnabled ? "configured" : "not_configured";

    const payload = {
      kind: data.kind,
      provider: data.provider,
      label: data.label,
      is_enabled: data.isEnabled && merged.missing.length === 0,
      config: merged.config as unknown as Record<string, never>,
      has_secret: merged.hasSecret,
      status,
    };

    const { error } = existing
      ? await supabaseAdmin.from("platform_integrations").update(payload).eq("id", existing.id)
      : await supabaseAdmin.from("platform_integrations").insert(payload);
    if (error) throw new Error(error.message);

    return {
      ok: merged.missing.length === 0,
      status,
      message:
        merged.missing.length > 0
          ? `Salvo, mas faltam campos obrigatórios: ${merged.missing.join(", ")}.`
          : "Integração salva.",
    };
  });

const toggleInput = z.object({
  kind: z.string().trim().min(2).max(40),
  provider: z.string().trim().min(2).max(40),
  label: z.string().trim().min(2).max(120),
  isEnabled: z.boolean(),
});

/** Liga ou desliga o provedor sem abrir o formulário. */
export const togglePlatformIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (isAdmin !== true) throw new Error("Acesso restrito à administração da plataforma.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mergeConfig } = await import("@/lib/platform-integrations.server");

    const { data: existing } = await supabaseAdmin
      .from("platform_integrations")
      .select("*")
      .eq("kind", data.kind)
      .eq("provider", data.provider)
      .maybeSingle();

    const merged = mergeConfig(data.provider, existing?.config, {});
    if (data.isEnabled && merged.missing.length > 0) {
      return { ok: false, message: `Configure antes de ativar: ${merged.missing.join(", ")}.` };
    }

    if (existing) {
      await supabaseAdmin
        .from("platform_integrations")
        .update({ is_enabled: data.isEnabled, status: data.isEnabled ? "configured" : "not_configured" })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("platform_integrations").insert({
        kind: data.kind,
        provider: data.provider,
        label: data.label,
        is_enabled: data.isEnabled,
        status: data.isEnabled ? "configured" : "not_configured",
      });
    }

    return { ok: true, message: data.isEnabled ? "Integração ativada." : "Integração desativada." };
  });

const testInput = z.object({
  kind: z.string().trim().min(2).max(40),
  provider: z.string().trim().min(2).max(40),
});

/** Testa as credenciais salvas e registra o resultado no status. */
export const testPlatformIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; live: boolean }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (isAdmin !== true) throw new Error("Acesso restrito à administração da plataforma.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { testProvider } = await import("@/lib/platform-integrations.server");

    const { data: existing } = await supabaseAdmin
      .from("platform_integrations")
      .select("*")
      .eq("kind", data.kind)
      .eq("provider", data.provider)
      .maybeSingle();

    if (!existing) return { ok: false, message: "Configure a integração antes de testar.", live: false };

    const result = await testProvider(data.provider, existing.config);
    await supabaseAdmin
      .from("platform_integrations")
      .update({ status: result.ok ? (result.live ? "connected" : "configured") : "error" })
      .eq("id", existing.id);

    return result;
  });

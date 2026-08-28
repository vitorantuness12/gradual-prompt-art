import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Funções de servidor da central de integrações e da API pública.
 *
 * Regra de ouro: nenhum segredo volta para o navegador. O painel recebe
 * apenas indicadores (configurado / últimos dígitos) e o valor completo de
 * uma chave de API aparece uma única vez, no momento da criação.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: "settings",
  });
  if (data !== true) throw new Error("Você não tem permissão para configurar integrações.");
}

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}

/** ---------- Salvar / ativar conector ---------- */

const saveInput = z.object({
  storeId: z.string().uuid(),
  kind: z.string().trim().min(2).max(40),
  provider: z.string().trim().max(40).optional(),
  isEnabled: z.boolean(),
  isSandbox: z.boolean().default(true),
  apiKey: z.string().trim().max(500).optional(),
  apiSecret: z.string().trim().max(500).optional(),
  accessToken: z.string().trim().max(2000).optional(),
  webhookSecret: z.string().trim().max(500).optional(),
  extra: z.string().trim().max(300).optional(),
  verifyToken: z.string().trim().max(200).optional(),
});

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CONNECTOR_BY_KIND } = await import("@/lib/integrations/catalog");

    const connector = CONNECTOR_BY_KIND[data.kind];
    if (!connector) return { ok: false, message: "Conector desconhecido." };

    const { data: existing } = await supabaseAdmin
      .from("integration_credentials")
      .select("*")
      .eq("store_id", data.storeId)
      .eq("kind", data.kind)
      .maybeSingle();

    // Campos em branco preservam o valor já salvo (o painel nunca recebe o segredo).
    const credentials = {
      store_id: data.storeId,
      kind: data.kind,
      provider: data.provider ?? connector.providers[0]?.key ?? null,
      api_key: data.apiKey?.trim() || existing?.api_key || null,
      api_secret: data.apiSecret?.trim() || existing?.api_secret || null,
      access_token: data.accessToken?.trim() || existing?.access_token || null,
      webhook_secret: data.webhookSecret?.trim() || existing?.webhook_secret || null,
      extra: {
        ...((existing?.extra as Record<string, unknown>) ?? {}),
        ...(data.extra ? { value: data.extra, phoneNumberId: data.extra } : {}),
        ...(data.verifyToken ? { verifyToken: data.verifyToken } : {}),
      },
    };

    if (existing) {
      await supabaseAdmin.from("integration_credentials").update(credentials).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("integration_credentials").insert(credentials);
    }

    const hasSecret = Boolean(
      credentials.api_key || credentials.access_token || credentials.api_secret,
    );

    await supabaseAdmin.from("store_integrations").upsert(
      {
        store_id: data.storeId,
        kind: data.kind,
        provider: credentials.provider,
        label: connector.label,
        is_enabled: data.isEnabled,
        is_sandbox: data.isSandbox,
        has_secret: hasSecret,
        status: !data.isEnabled ? "not_configured" : hasSecret ? "connected" : "demo",
      },
      { onConflict: "store_id,kind" },
    );

    return { ok: true, message: "Integração salva." };
  });

/** ---------- Testar conexão ---------- */

const testInput = z.object({ storeId: z.string().uuid(), kind: z.string().trim().min(2).max(40) });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; demo: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getConnector } = await import("@/lib/integrations/connectors.server");

    const connector = getConnector(data.kind);
    if (!connector) return { ok: false, demo: false, message: "Conector sem teste automático." };

    const { data: integration } = await supabaseAdmin
      .from("store_integrations")
      .select("id, is_sandbox")
      .eq("store_id", data.storeId)
      .eq("kind", data.kind)
      .maybeSingle();

    const { data: row } = await supabaseAdmin
      .from("integration_credentials")
      .select("*")
      .eq("store_id", data.storeId)
      .eq("kind", data.kind)
      .maybeSingle();

    const result = await connector.test(
      {
        apiKey: row?.api_key ?? null,
        apiSecret: row?.api_secret ?? null,
        accessToken: row?.access_token ?? null,
        refreshToken: row?.refresh_token ?? null,
        webhookSecret: row?.webhook_secret ?? null,
        extra: (row?.extra ?? {}) as Record<string, unknown>,
      },
      integration?.is_sandbox ?? true,
    );

    if (integration) {
      await supabaseAdmin
        .from("store_integrations")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: result.ok,
          status: result.ok ? (result.demo ? "demo" : "connected") : "error",
          last_error: result.ok ? null : result.message,
        })
        .eq("id", integration.id);
    }

    await supabaseAdmin.from("integration_events").insert({
      store_id: data.storeId,
      kind: data.kind,
      direction: "outbound",
      event_type: "teste_conexao",
      status: result.ok ? "processed" : "failed",
      error: result.ok ? null : result.message,
      payload: { demo: result.demo } as never,
    });

    return result;
  });

/** ---------- Situação dos conectores (com segredos mascarados) ---------- */

const statusInput = z.object({ storeId: z.string().uuid() });

export interface IntegrationStatus {
  kind: string;
  provider: string | null;
  isEnabled: boolean;
  isSandbox: boolean;
  status: string;
  hasSecret: boolean;
  lastEventAt: string | null;
  lastEventKind: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  /** Somente indicadores: nunca o valor real. */
  hints: Record<string, string | null>;
}

export const integrationStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data, context }): Promise<IntegrationStatus[]> => {
    const { data: allowed } = await context.supabase.rpc("is_store_staff", {
      _store_id: data.storeId,
      _user_id: context.userId,
    });
    if (allowed !== true) throw new Error("Sem permissão para esta loja.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: integrations }, { data: credentials }] = await Promise.all([
      supabaseAdmin.from("store_integrations").select("*").eq("store_id", data.storeId),
      supabaseAdmin.from("integration_credentials").select("*").eq("store_id", data.storeId),
    ]);

    const credentialByKind = new Map((credentials ?? []).map((row) => [row.kind, row]));

    return (integrations ?? []).map((row) => {
      const credential = credentialByKind.get(row.kind);
      return {
        kind: row.kind,
        provider: row.provider,
        isEnabled: row.is_enabled,
        isSandbox: row.is_sandbox,
        status: row.status,
        hasSecret: row.has_secret,
        lastEventAt: row.last_event_at,
        lastEventKind: row.last_event_kind,
        lastTestAt: row.last_test_at,
        lastTestOk: row.last_test_ok,
        lastError: row.last_error,
        hints: {
          apiKey: mask(credential?.api_key),
          apiSecret: mask(credential?.api_secret),
          accessToken: mask(credential?.access_token),
          webhookSecret: mask(credential?.webhook_secret),
          extra: String((credential?.extra as { value?: string } | undefined)?.value ?? "") || null,
        },
      };
    });
  });

/** ---------- Webhooks de saída ---------- */

const endpointInput = z.object({
  storeId: z.string().uuid(),
  url: z
    .string()
    .trim()
    .url()
    .max(400)
    .refine((value) => value.startsWith("https://"), "Use um endereço https."),
  description: z.string().trim().max(200).optional(),
  events: z.array(z.string().trim().max(60)).max(20).default([]),
});

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => endpointInput.parse(data))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; message: string; secret?: string }> => {
      await assertPermission(context.supabase, data.storeId, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { randomBytes } = await import("node:crypto");

      const secret = `whsec_${randomBytes(24).toString("hex")}`;
      const { error } = await supabaseAdmin.from("webhook_endpoints").insert({
        store_id: data.storeId,
        url: data.url,
        description: data.description ?? null,
        events: data.events,
        secret,
      });
      if (error) return { ok: false, message: error.message };
      return {
        ok: true,
        message: "Webhook cadastrado. Guarde o segredo: ele não será mostrado de novo.",
        secret,
      };
    },
  );

const endpointToggleInput = z.object({
  storeId: z.string().uuid(),
  endpointId: z.string().uuid(),
  isActive: z.boolean().optional(),
  remove: z.boolean().default(false),
});

export const updateWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => endpointToggleInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.remove) {
      await supabaseAdmin
        .from("webhook_endpoints")
        .delete()
        .eq("id", data.endpointId)
        .eq("store_id", data.storeId);
      return { ok: true, message: "Webhook removido." };
    }

    await supabaseAdmin
      .from("webhook_endpoints")
      .update({ is_active: data.isActive ?? true })
      .eq("id", data.endpointId)
      .eq("store_id", data.storeId);
    return { ok: true, message: "Webhook atualizado." };
  });

const retryInput = z.object({ storeId: z.string().uuid(), deliveryId: z.string().uuid() });

export const retryWebhookDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => retryInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: delivery } = await supabaseAdmin
      .from("webhook_deliveries")
      .select("id")
      .eq("id", data.deliveryId)
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!delivery) return { ok: false, message: "Entrega não encontrada." };

    const { attemptDelivery } = await import("@/lib/integrations/connectors.server");
    const ok = await attemptDelivery(delivery.id);
    return {
      ok,
      message: ok ? "Entrega concluída." : "Ainda sem sucesso. A retentativa foi reagendada.",
    };
  });

const sendTestInput = z.object({ storeId: z.string().uuid() });

export const sendTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendTestInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { dispatchWebhook } = await import("@/lib/integrations/connectors.server");
    const result = await dispatchWebhook({
      event: "pedido.criado",
      storeId: data.storeId,
      data: { teste: true, enviado_em: new Date().toISOString() },
    });
    return {
      ok: result.queued > 0,
      message:
        result.queued > 0
          ? `Evento de teste enviado para ${result.queued} endpoint(s).`
          : "Nenhum endpoint ativo assina este evento.",
    };
  });

/** ---------- Chaves da API ---------- */

const keyInput = z.object({
  storeId: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  scopes: z.array(z.string().trim().max(40)).min(1).max(20),
  rateLimitPerMinute: z.number().int().min(10).max(1000).default(120),
  expiresInDays: z.number().int().min(0).max(3650).default(0),
  sandbox: z.boolean().default(false),
});

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => keyInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; key?: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateApiKey } = await import("@/lib/api/keys.server");

    const generated = await generateApiKey(data.sandbox);
    const { error } = await supabaseAdmin.from("api_keys").insert({
      store_id: data.storeId,
      name: data.name,
      prefix: generated.prefix,
      key_hash: generated.hash,
      scopes: data.scopes,
      rate_limit_per_minute: data.rateLimitPerMinute,
      expires_at:
        data.expiresInDays > 0
          ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString()
          : null,
      created_by: context.userId,
    });
    if (error) return { ok: false, message: error.message };

    return {
      ok: true,
      message: "Chave criada. Copie agora: ela não será mostrada novamente.",
      key: generated.value,
    };
  });

const rotateInput = z.object({ storeId: z.string().uuid(), keyId: z.string().uuid() });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rotateInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; key?: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateApiKey } = await import("@/lib/api/keys.server");

    const { data: current } = await supabaseAdmin
      .from("api_keys")
      .select("*")
      .eq("id", data.keyId)
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!current) return { ok: false, message: "Chave não encontrada." };

    const generated = await generateApiKey(current.prefix.startsWith("sp_test"));
    const { error } = await supabaseAdmin.from("api_keys").insert({
      store_id: data.storeId,
      name: `${current.name} (rotacionada)`,
      prefix: generated.prefix,
      key_hash: generated.hash,
      scopes: current.scopes,
      rate_limit_per_minute: current.rate_limit_per_minute,
      expires_at: current.expires_at,
      created_by: context.userId,
      rotated_from: current.id,
    });
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin
      .from("api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", current.id);

    return {
      ok: true,
      message: "Chave rotacionada. A anterior foi revogada.",
      key: generated.value,
    };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rotateInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", data.keyId)
      .eq("store_id", data.storeId);
    return { ok: true, message: "Chave revogada." };
  });

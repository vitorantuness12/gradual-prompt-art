import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskPhone } from "@/lib/whatsapp/eventos";

/** Monta o endereço legível a partir do JSON guardado no pedido. */
function formatAddress(address: unknown): string {
  const value = (address ?? {}) as Record<string, unknown>;
  return [value["street"], value["number"], value["district"], value["city"]]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ");
}

/**
 * Funções de servidor do WhatsApp da loja.
 * Nenhum token, API key ou URL técnica é devolvido ao navegador.
 */

export interface WhatsappStatusView {
  configured: boolean;
  globalEnabled: boolean;
  hasInstance: boolean;
  instanceName: string | null;
  status: string;
  phone: string | null;
  profileName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  qrExpiresAt: string | null;
  sentToday: number;
  failedToday: number;
  automationsActive: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertStaff(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase.rpc("is_store_staff", { _store_id: storeId, _user_id: userId });
  if (data !== true) throw new Error("Você não tem permissão nesta loja.");
}

const storeInput = z.object({ storeId: z.string().uuid() });

async function buildStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  storeId: string,
): Promise<WhatsappStatusView> {
  const { loadGlobalSettings, loadStoreInstance } = await import("@/lib/whatsapp/send.server");
  const settings = await loadGlobalSettings(admin);
  const instance = await loadStoreInstance(admin, storeId);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [{ count: sentToday }, { count: failedToday }, { count: automations }] = await Promise.all([
    admin
      .from("whatsapp_message_logs")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "sent")
      .gte("created_at", dayStart.toISOString()),
    admin
      .from("whatsapp_message_logs")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "failed")
      .gte("created_at", dayStart.toISOString()),
    admin
      .from("whatsapp_automation_rules")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("is_active", true),
  ]);

  return {
    configured: Boolean(settings?.base_url && settings?.api_key),
    globalEnabled: Boolean(settings?.is_enabled),
    hasInstance: Boolean(instance),
    instanceName: instance?.instance_name ?? null,
    status: instance?.status ?? "close",
    phone: instance?.phone_number ? maskPhone(instance.phone_number) : null,
    profileName: instance?.profile_name ?? null,
    connectedAt: instance?.connected_at ?? null,
    lastSyncAt: instance?.last_sync_at ?? null,
    lastEventAt: instance?.last_event_at ?? null,
    lastError: instance?.last_error ?? null,
    qrExpiresAt: instance?.qr_expires_at ?? null,
    sentToday: sentToday ?? 0,
    failedToday: failedToday ?? 0,
    automationsActive: automations ?? 0,
  };
}

/** Status da conexão da loja (usado no card e no polling controlado). */
export const getWhatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<WhatsappStatusView> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { connectionState } = await import("@/lib/whatsapp/evolution.server");
    const { loadGlobalSettings, loadStoreInstance } = await import("@/lib/whatsapp/send.server");

    const settings = await loadGlobalSettings(supabaseAdmin);
    const instance = await loadStoreInstance(supabaseAdmin, data.storeId);

    if (settings?.is_enabled && instance) {
      const state = await connectionState(settings, instance.instance_name);
      const remote = (state.data as { instance?: { state?: string } } | null)?.instance?.state ?? null;
      if (remote && remote !== instance.status) {
        await supabaseAdmin
          .from("whatsapp_instances")
          .update({
            status: remote,
            last_sync_at: new Date().toISOString(),
            connected_at: remote === "open" ? new Date().toISOString() : instance.connected_at,
          })
          .eq("id", instance.id);
        await supabaseAdmin.from("whatsapp_connection_events").insert({
          store_id: data.storeId,
          instance_id: instance.id,
          status: remote,
          previous_status: instance.status,
          detail: "Sincronizado pelo painel",
        });
      } else if (remote) {
        await supabaseAdmin
          .from("whatsapp_instances")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", instance.id);
      }
    }

    return buildStatus(supabaseAdmin, data.storeId);
  });

export interface ConnectResult {
  ok: boolean;
  message: string;
  status: string;
  qrCode: string | null;
  qrExpiresAt: string | null;
}

/** Cria a instância (se preciso), configura o webhook e devolve o QR Code. */
export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<ConnectResult> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const evolution = await import("@/lib/whatsapp/evolution.server");
    const { loadGlobalSettings, loadStoreInstance } = await import("@/lib/whatsapp/send.server");

    const settings = await loadGlobalSettings(supabaseAdmin);
    if (!settings || !settings.base_url || !settings.api_key) {
      return { ok: false, message: "A integração de WhatsApp ainda não foi configurada pela plataforma.", status: "error", qrCode: null, qrExpiresAt: null };
    }
    if (!settings.is_enabled) {
      return { ok: false, message: "A integração de WhatsApp está desativada pela plataforma.", status: "error", qrCode: null, qrExpiresAt: null };
    }
    if (!settings.webhook_base_url) {
      return { ok: false, message: "Webhook não configurado pela plataforma. Fale com o suporte.", status: "error", qrCode: null, qrExpiresAt: null };
    }

    let instance = await loadStoreInstance(supabaseAdmin, data.storeId);

    if (!instance) {
      const instanceName = evolution.instanceNameFor(data.storeId);
      const { data: created, error } = await supabaseAdmin
        .from("whatsapp_instances")
        .insert({
          store_id: data.storeId,
          owner_user_id: context.userId,
          instance_name: instanceName,
          status: "connecting",
        })
        .select("*")
        .single();
      if (error || !created) {
        return { ok: false, message: "Não foi possível preparar a instância desta loja.", status: "error", qrCode: null, qrExpiresAt: null };
      }
      instance = created;

      const webhookUrl = evolution.webhookUrlFor(settings, created.instance_key);
      const result = await evolution.createInstance(settings, instanceName, webhookUrl);

      if (!result.ok && result.status !== 409 && result.status !== 403) {
        await supabaseAdmin.from("whatsapp_instances").delete().eq("id", created.id);
        return { ok: false, message: result.error ?? "Falha ao criar a instância.", status: "error", qrCode: null, qrExpiresAt: null };
      }

      const payload = result.data as
        | { instance?: { instanceId?: string }; hash?: string | { apikey?: string }; qrcode?: { base64?: string } }
        | null;
      const token = typeof payload?.hash === "string" ? payload.hash : (payload?.hash?.apikey ?? null);

      await supabaseAdmin
        .from("whatsapp_instances")
        .update({
          external_instance_id: payload?.instance?.instanceId ?? null,
          webhook_url: webhookUrl,
        })
        .eq("id", created.id);
      await supabaseAdmin.from("whatsapp_instance_credentials").insert({
        instance_id: created.id,
        store_id: data.storeId,
        token,
        webhook_secret: settings.webhook_secret,
      });
      if (result.status === 409) await evolution.setWebhook(settings, instanceName, webhookUrl);
    } else {
      const webhookUrl = evolution.webhookUrlFor(settings, instance.instance_key);
      if (instance.webhook_url !== webhookUrl) {
        await evolution.setWebhook(settings, instance.instance_name, webhookUrl);
        await supabaseAdmin.from("whatsapp_instances").update({ webhook_url: webhookUrl }).eq("id", instance.id);
      }
    }

    // Já conectado? Não mostra QR Code.
    const state = await evolution.connectionState(settings, instance.instance_name);
    const remote = (state.data as { instance?: { state?: string } } | null)?.instance?.state ?? null;
    if (remote === "open") {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "open", connected_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), last_error: null })
        .eq("id", instance.id);
      return { ok: true, message: "WhatsApp já está conectado.", status: "open", qrCode: null, qrExpiresAt: null };
    }

    const connect = await evolution.connectInstance(settings, instance.instance_name);
    if (!connect.ok) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "error", last_error: connect.error ?? null })
        .eq("id", instance.id);
      return { ok: false, message: connect.error ?? "Não foi possível gerar o QR Code.", status: "error", qrCode: null, qrExpiresAt: null };
    }

    const qr = (connect.data as { base64?: string; code?: string } | null)?.base64 ?? null;
    const expiresAt = new Date(Date.now() * 1 + 60_000).toISOString();
    await supabaseAdmin
      .from("whatsapp_instances")
      .update({ status: "connecting", qr_expires_at: expiresAt, last_error: null, last_sync_at: new Date().toISOString() })
      .eq("id", instance.id);
    await supabaseAdmin.from("whatsapp_connection_events").insert({
      store_id: data.storeId,
      instance_id: instance.id,
      status: "connecting",
      detail: "QR Code gerado",
    });

    return {
      ok: true,
      message: "Leia o QR Code com o WhatsApp do celular.",
      status: "connecting",
      qrCode: qr,
      qrExpiresAt: expiresAt,
    };
  });

/** Desconecta o número mantendo a instância e as automações. */
export const logoutWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logoutInstance } = await import("@/lib/whatsapp/evolution.server");
    const { loadGlobalSettings, loadStoreInstance } = await import("@/lib/whatsapp/send.server");

    const settings = await loadGlobalSettings(supabaseAdmin);
    const instance = await loadStoreInstance(supabaseAdmin, data.storeId);
    if (!settings || !instance) return { ok: false, message: "Esta loja não tem WhatsApp conectado." };

    await logoutInstance(settings, instance.instance_name);
    await supabaseAdmin
      .from("whatsapp_instances")
      .update({ status: "close", disconnected_at: new Date().toISOString(), phone_number: null, profile_name: null })
      .eq("id", instance.id);
    await supabaseAdmin.from("whatsapp_connection_events").insert({
      store_id: data.storeId,
      instance_id: instance.id,
      status: "close",
      previous_status: instance.status,
      detail: "Desconectado pelo lojista",
    });
    return { ok: true, message: "Número desconectado. As automações ficam guardadas." };
  });

/** Remove a instância por completo (permite recriar do zero). */
export const deleteWhatsappInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteInstance } = await import("@/lib/whatsapp/evolution.server");
    const { loadGlobalSettings, loadStoreInstance } = await import("@/lib/whatsapp/send.server");

    const settings = await loadGlobalSettings(supabaseAdmin);
    const instance = await loadStoreInstance(supabaseAdmin, data.storeId);
    if (!instance) return { ok: false, message: "Nenhuma instância para excluir." };
    if (settings) {
      await deleteInstance(settings, instance.instance_name);
    }
    await supabaseAdmin.from("whatsapp_instances").delete().eq("id", instance.id);
    return { ok: true, message: "Instância excluída. Você pode conectar novamente." };
  });

/** ---------- Automações ---------- */

export interface AutomationView {
  id: string;
  name: string;
  triggerEvent: string;
  isActive: boolean;
  category: string;
  messageBody: string;
  audience: string;
  orderType: string | null;
  sendFrom: string | null;
  sendTo: string | null;
  maxPerDay: number;
  lastRunAt: string | null;
  runCount: number;
}

export const listWhatsappAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<AutomationView[]> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { data: rows } = await context.supabase
      .from("whatsapp_automation_rules")
      .select("*")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: true });

    return (rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      triggerEvent: row.trigger_event,
      isActive: row.is_active,
      category: row.category,
      messageBody: row.message_body,
      audience: row.audience,
      orderType: row.order_type,
      sendFrom: row.send_from,
      sendTo: row.send_to,
      maxPerDay: row.max_per_day,
      lastRunAt: row.last_run_at,
      runCount: row.run_count,
    }));
  });

const automationInput = z.object({
  storeId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  triggerEvent: z.string().trim().min(2).max(60),
  isActive: z.boolean(),
  category: z.enum(["transactional", "support", "marketing"]),
  messageBody: z.string().trim().min(4).max(2000),
  audience: z.string().trim().max(40).default("all"),
  orderType: z.string().trim().max(20).nullable().optional(),
  sendFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  sendTo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  maxPerDay: z.number().int().min(1).max(5000),
});

export const saveWhatsappAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => automationInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const payload = {
      store_id: data.storeId,
      name: data.name,
      trigger_event: data.triggerEvent,
      is_active: data.isActive,
      category: data.category,
      message_body: data.messageBody,
      audience: data.audience,
      order_type: data.orderType ?? null,
      send_from: data.sendFrom ?? null,
      send_to: data.sendTo ?? null,
      max_per_day: data.maxPerDay,
    };

    const query = data.id
      ? context.supabase.from("whatsapp_automation_rules").update(payload).eq("id", data.id).eq("store_id", data.storeId)
      : context.supabase.from("whatsapp_automation_rules").insert(payload);
    const { error } = await query;
    if (error) return { ok: false, message: "Não foi possível salvar a automação." };
    return { ok: true, message: data.id ? "Automação atualizada." : "Automação criada." };
  });

export const deleteWhatsappAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ storeId: z.string().uuid(), id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    await context.supabase
      .from("whatsapp_automation_rules")
      .delete()
      .eq("id", data.id)
      .eq("store_id", data.storeId);
    return { ok: true };
  });

/** Envio manual/teste a partir do painel. */
export const sendWhatsappTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        phone: z.string().trim().min(10).max(20),
        body: z.string().trim().min(2).max(1000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");
    const outcome = await sendWhatsappMessage(supabaseAdmin, {
      storeId: data.storeId,
      phone: data.phone,
      body: data.body,
      messageType: "support",
      templateKey: "teste_manual",
    });
    return { ok: outcome.ok, message: outcome.message };
  });

/** Dispara um evento de automação (usado pelo painel ao mudar o pedido). */
export const dispatchWhatsappOrderEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ storeId: z.string().uuid(), orderId: z.string().uuid(), event: z.string().trim().max(60) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; executed: number }> => {
    await assertStaff(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchAutomation } = await import("@/lib/whatsapp/send.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!order?.customer_phone) return { ok: false, executed: 0 };

    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("name, slug")
      .eq("id", data.storeId)
      .maybeSingle();

    const result = await dispatchAutomation(supabaseAdmin, {
      storeId: data.storeId,
      event: data.event,
      phone: order.customer_phone,
      orderId: order.id,
      orderType: order.type,
      vars: {
        nome_cliente: order.customer_name ?? "",
        nome_loja: store?.name ?? "",
        numero_pedido: order.code ?? "",
        valor_total: `R$ ${Number(order.total ?? 0).toFixed(2).replace(".", ",")}`,
        status_pedido: order.status ?? "",
        link_acompanhamento: store?.slug ? `https://oseupedido.com.br/${store.slug}/acompanhar?pedido=${order.code}` : "",
        endereco_entrega: formatAddress(order.address),
        data_agendada: order.scheduled_for ? new Date(order.scheduled_for).toLocaleDateString("pt-BR") : "",
        horario_agendado: order.scheduled_for
          ? new Date(order.scheduled_for).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "",
      },
    });
    return { ok: true, executed: result.executed };
  });

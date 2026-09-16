import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Funções da área superadministrativa.
 * Todas verificam o papel super_admin com o cliente do próprio usuário
 * antes de carregar o cliente privilegiado.
 */

async function assertSuperAdmin(context: { supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (data !== true) throw new Error("Acesso restrito à administração da plataforma.");
}

export interface PlatformOverview {
  stores: number;
  activeStores: number;
  users: number;
  orders: number;
  ordersMonth: number;
  revenue: number;
  revenueMonth: number;
  mrr: number;
  subscriptionsByStatus: Record<string, number>;
  planDistribution: { plan: string; count: number }[];
  activationRate: number;
  churnRate: number;
  openTickets: number;
  openIncidents: number;
  pendingPrivacyRequests: number;
  overdueInvoices: number;
  failedPayments: number;
  fiscalErrors: number;
  failedWebhooks: number;
  failedMessages: number;
  connectedWhatsapp: number;
  configuredIntegrations: number;
  storesWithoutSubscription: number;
  publishedStores: number;
}

export const getPlatformOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOverview> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const iso = monthStart.toISOString();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
    const [stores, profiles, orders, ordersMonth, subs, tickets, incidents, paidOrders, privacy, overdueInvoices, failedPayments, fiscalErrors, failedWebhooks, failedMessages, whatsapp, integrations] = await Promise.all([
      supabaseAdmin.from("stores").select("id, is_active, is_published, created_at"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).gte("created_at", iso),
      supabaseAdmin.from("store_subscriptions").select("status, created_at, canceled_at, plan:plans(key, name, price_month)"),
      supabaseAdmin.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "pending"]),
      supabaseAdmin.from("platform_incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("orders").select("total, created_at").eq("payment_status", "paid"),
      supabaseAdmin.from("data_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress", "processing"]),
      supabaseAdmin.from("subscription_invoices").select("id", { count: "exact", head: true }).eq("status", "open").lt("due_at", new Date().toISOString()),
      supabaseAdmin.from("payments").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", thirtyDaysAgo),
      supabaseAdmin.from("fiscal_invoices").select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", thirtyDaysAgo),
      supabaseAdmin.from("webhook_deliveries").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", thirtyDaysAgo),
      supabaseAdmin.from("whatsapp_delivery_attempts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", thirtyDaysAgo),
      supabaseAdmin.from("whatsapp_instances").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("platform_integrations").select("id", { count: "exact", head: true }).eq("is_enabled", true),
    ]);

    const storeRows = stores.data ?? [];
    const subRows = (subs.data ?? []) as {
      status: string;
      canceled_at: string | null;
      plan: { key: string; name: string; price_month: number } | null;
    }[];

    const subscriptionsByStatus: Record<string, number> = {};
    const planCounts = new Map<string, number>();
    let mrr = 0;
    for (const row of subRows) {
      subscriptionsByStatus[row.status] = (subscriptionsByStatus[row.status] ?? 0) + 1;
      const name = row.plan?.name ?? "—";
      planCounts.set(name, (planCounts.get(name) ?? 0) + 1);
      if (row.status === "active") mrr += Number(row.plan?.price_month ?? 0);
    }

    const revenueRows = (paidOrders.data ?? []) as { total: number; created_at: string }[];
    const revenue = revenueRows.reduce((sum, row) => sum + Number(row.total), 0);
    const revenueMonth = revenueRows
      .filter((row) => row.created_at >= iso)
      .reduce((sum, row) => sum + Number(row.total), 0);

    const activated = storeRows.filter((store) => store.is_published).length;
    const canceled = subRows.filter((row) => row.status === "canceled" || row.status === "expired").length;

    return {
      stores: storeRows.length,
      activeStores: storeRows.filter((store) => store.is_active).length,
      users: profiles.count ?? 0,
      orders: orders.count ?? 0,
      ordersMonth: ordersMonth.count ?? 0,
      revenue,
      revenueMonth,
      mrr,
      subscriptionsByStatus,
      planDistribution: [...planCounts].map(([plan, count]) => ({ plan, count })),
      activationRate: storeRows.length ? Math.round((activated / storeRows.length) * 100) : 0,
      churnRate: subRows.length ? Math.round((canceled / subRows.length) * 100) : 0,
      openTickets: tickets.count ?? 0,
      openIncidents: incidents.count ?? 0,
      pendingPrivacyRequests: privacy.count ?? 0,
      overdueInvoices: overdueInvoices.count ?? 0,
      failedPayments: failedPayments.count ?? 0,
      fiscalErrors: fiscalErrors.count ?? 0,
      failedWebhooks: failedWebhooks.count ?? 0,
      failedMessages: failedMessages.count ?? 0,
      connectedWhatsapp: whatsapp.count ?? 0,
      configuredIntegrations: integrations.count ?? 0,
      storesWithoutSubscription: Math.max(0, storeRows.length - subRows.length),
      publishedStores: activated,
    };
  });

export interface AdminPrivacyRequest {
  id: string;
  kind: string;
  status: string;
  contact: string | null;
  note: string | null;
  storeId: string | null;
  storeName: string | null;
  createdAt: string;
  handledAt: string | null;
}

export const listAdminPrivacyRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ status: z.string().max(30).default("all"), page: z.number().int().min(1).max(1000).default(1) }).parse(data))
  .handler(async ({ data, context }): Promise<{ rows: AdminPrivacyRequest[]; total: number; page: number }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = 30;
    const from = (data.page - 1) * pageSize;
    let query = supabaseAdmin
      .from("data_requests")
      .select("id, kind, status, contact, note, store_id, created_at, handled_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, count, error } = await query;
    if (error) throw new Error("Não foi possível carregar as solicitações de privacidade.");
    const storeIds = [...new Set((rows ?? []).map((row) => row.store_id).filter((id): id is string => Boolean(id)))];
    const { data: stores } = storeIds.length
      ? await supabaseAdmin.from("stores").select("id, name").in("id", storeIds)
      : { data: [] as { id: string; name: string }[] };
    const names = new Map((stores ?? []).map((store) => [store.id, store.name]));
    return {
      rows: (rows ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        contact: row.contact,
        note: row.note,
        storeId: row.store_id,
        storeName: row.store_id ? names.get(row.store_id) ?? null : null,
        createdAt: row.created_at,
        handledAt: row.handled_at,
      })),
      total: count ?? 0,
      page: data.page,
    };
  });

export const updateAdminPrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    requestId: z.string().uuid(),
    status: z.enum(["pending", "in_progress", "done", "rejected"]),
    note: z.string().trim().max(600).optional(),
  }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const finished = data.status === "done" || data.status === "rejected";
    const { data: request, error } = await supabaseAdmin
      .from("data_requests")
      .update({ status: data.status, note: data.note, handled_by: context.userId, handled_at: finished ? new Date().toISOString() : null })
      .eq("id", data.requestId)
      .select("store_id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível atualizar a solicitação.");
    await supabaseAdmin.from("audit_logs").insert({
      store_id: request?.store_id ?? null,
      user_id: context.userId,
      action: "platform.privacy_request_updated",
      entity: "data_requests",
      entity_id: data.requestId,
      metadata: { status: data.status },
    });
    return { ok: true };
  });

export interface AdminHealthSnapshot {
  fiscal: { errors: number; pending: number };
  payments: { failed: number; pending: number };
  webhooks: { failed: number; retrying: number };
  whatsapp: { connected: number; total: number; failedMessages: number };
  integrations: { connected: number; errors: number; total: number };
}

export const getAdminHealthSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminHealthSnapshot> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
    const [fiscalErrors, fiscalPending, paymentFailed, paymentPending, webhookFailed, webhookRetrying, whatsappConnected, whatsappTotal, messageFailed, integrationConnected, integrationErrors, integrationTotal] = await Promise.all([
      supabaseAdmin.from("fiscal_invoices").select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", since),
      supabaseAdmin.from("fiscal_invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("payments").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
      supabaseAdmin.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("webhook_deliveries").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
      supabaseAdmin.from("webhook_deliveries").select("id", { count: "exact", head: true }).eq("status", "retrying"),
      supabaseAdmin.from("whatsapp_instances").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("whatsapp_instances").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("whatsapp_delivery_attempts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
      supabaseAdmin.from("platform_integrations").select("id", { count: "exact", head: true }).eq("status", "connected"),
      supabaseAdmin.from("platform_integrations").select("id", { count: "exact", head: true }).eq("status", "error"),
      supabaseAdmin.from("platform_integrations").select("id", { count: "exact", head: true }),
    ]);
    return {
      fiscal: { errors: fiscalErrors.count ?? 0, pending: fiscalPending.count ?? 0 },
      payments: { failed: paymentFailed.count ?? 0, pending: paymentPending.count ?? 0 },
      webhooks: { failed: webhookFailed.count ?? 0, retrying: webhookRetrying.count ?? 0 },
      whatsapp: { connected: whatsappConnected.count ?? 0, total: whatsappTotal.count ?? 0, failedMessages: messageFailed.count ?? 0 },
      integrations: { connected: integrationConnected.count ?? 0, errors: integrationErrors.count ?? 0, total: integrationTotal.count ?? 0 },
    };
  });

export interface PlatformUser {
  id: string;
  email: string | null;
  fullName: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  roles: string[];
  stores: number;
}

export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ search: z.string().trim().max(120).default("") }).parse(data))
  .handler(async ({ data, context }): Promise<PlatformUser[]> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const [{ data: profiles }, { data: roles }, { data: members }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("store_members").select("user_id"),
    ]);

    const names = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));
    const roleMap = new Map<string, string[]>();
    for (const row of roles ?? []) roleMap.set(row.user_id, [...(roleMap.get(row.user_id) ?? []), row.role]);
    const storeCount = new Map<string, number>();
    for (const row of members ?? []) storeCount.set(row.user_id, (storeCount.get(row.user_id) ?? 0) + 1);

    const term = data.search.toLowerCase();
    return (list?.users ?? [])
      .map((user) => ({
        id: user.id,
        email: user.email ?? null,
        fullName: names.get(user.id) ?? null,
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        roles: roleMap.get(user.id) ?? [],
        stores: storeCount.get(user.id) ?? 0,
      }))
      .filter((user) =>
        term ? `${user.email ?? ""} ${user.fullName ?? ""}`.toLowerCase().includes(term) : true,
      );
  });

export const setPlatformRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["super_admin"]), grant: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error && !error.message.includes("duplicate")) return { ok: false, message: error.message };
    } else {
      if (data.userId === context.userId) return { ok: false, message: "Você não pode remover o próprio acesso." };
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) return { ok: false, message: error.message };
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: data.grant ? "platform.role_granted" : "platform.role_revoked",
      entity: "user_roles",
      entity_id: data.userId,
      metadata: { role: data.role },
    });

    return { ok: true, message: data.grant ? "Acesso concedido." : "Acesso removido." };
  });

export const startSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        reason: z.string().trim().min(10).max(400),
        consentReference: z.string().trim().min(3).max(200),
        minutes: z.number().int().min(5).max(240).default(30),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const expiresAt = new Date(Date.now() + data.minutes * 60_000).toISOString();
    const { error } = await supabaseAdmin.from("impersonation_sessions").insert({
      admin_id: context.userId,
      store_id: data.storeId,
      reason: data.reason,
      consent_reference: data.consentReference,
      expires_at: expiresAt,
    });
    if (error) return { ok: false, message: error.message };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: "support.impersonation_started",
      entity: "impersonation_sessions",
      metadata: { reason: data.reason, consent: data.consentReference, expires_at: expiresAt },
    });

    return { ok: true, message: `Acesso de suporte liberado até ${new Date(expiresAt).toLocaleTimeString("pt-BR")}.` };
  });

export const endSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("store_id")
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      store_id: session?.store_id ?? null,
      user_id: context.userId,
      action: "support.impersonation_ended",
      entity: "impersonation_sessions",
      entity_id: data.id,
      metadata: {},
    });
    return { ok: true };
  });

export const adminUpdateStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        isActive: z.boolean().optional(),
        planId: z.string().uuid().optional(),
        status: z.enum(["trialing", "active", "past_due", "canceled", "expired"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (typeof data.isActive === "boolean") {
      await supabaseAdmin.from("stores").update({ is_active: data.isActive }).eq("id", data.storeId);
    }
    if (data.planId || data.status) {
      await supabaseAdmin
        .from("store_subscriptions")
        .update({
          ...(data.planId ? { plan_id: data.planId } : {}),
          ...(data.status ? { status: data.status } : {}),
        })
        .eq("store_id", data.storeId);
    }

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: context.userId,
      action: "platform.store_updated",
      entity: "stores",
      entity_id: data.storeId,
      metadata: data as never,
    });

    return { ok: true, message: "Loja atualizada." };
  });

export const adminDeleteStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("stores").delete().eq("id", data.storeId);
    if (error) return { ok: false, message: error.message };
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "platform.store_deleted",
      entity: "stores",
      entity_id: data.storeId,
      metadata: {},
    });
    return { ok: true, message: "Loja removida." };
  });

export const adminListAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, entity, store_id, user_id, created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(60);
    return data ?? [];
  });

/** Cadastra uma loja pelo admin da plataforma (slug conferido no banco). */
export const adminCreateStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$/, "Endereço inválido: use letras, números e hífen."),
        segment: z.string().trim().min(2).max(40),
        checkoutType: z.enum(["agendamento", "loja"]).optional(),
        ownerEmail: z.string().trim().email().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; storeId?: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: available } = await supabaseAdmin.rpc("is_slug_available", { _slug: data.slug });
    if (available !== true) return { ok: false, message: "Este endereço já está em uso ou é reservado." };

    // O dono é opcional: quando informado, precisa já ter conta na plataforma.
    let ownerId: string | null = null;
    if (data.ownerEmail) {
      const wanted = data.ownerEmail.toLowerCase();
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = (users?.users ?? []).find((user) => (user.email ?? "").toLowerCase() === wanted);
      if (!found) return { ok: false, message: "Não encontrei uma conta com esse e-mail." };
      ownerId = found.id;
    }

    const { data: store, error } = await supabaseAdmin
      .from("stores")
      .insert({
        name: data.name,
        slug: data.slug,
        segment: data.segment,
        ...(data.checkoutType ? { checkout_type: data.checkoutType } : {}),
        ...(ownerId ? { owner_id: ownerId } : {}),
        is_active: true,
      })
      .select("id")
      .maybeSingle();
    if (error || !store) return { ok: false, message: "Não foi possível criar a loja." };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: store.id,
      user_id: (context as never as { userId: string }).userId,
      action: "admin.loja_criada",
      entity: "stores",
      entity_id: store.id,
      metadata: { slug: data.slug },
    });

    return { ok: true, message: "Loja criada.", storeId: store.id };
  });

/** Edita os dados básicos da loja e o modelo de checkout. */
export const adminEditStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        name: z.string().trim().min(2).max(80).optional(),
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$/)
          .optional(),
        segment: z.string().trim().min(2).max(40).optional(),
        checkoutType: z.enum(["agendamento", "loja"]).optional(),
        isPublished: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.slug) {
      const { data: available } = await supabaseAdmin.rpc("is_slug_available", {
        _slug: data.slug,
        _store_id: data.storeId,
      });
      if (available !== true) return { ok: false, message: "Este endereço já está em uso ou é reservado." };
    }

    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        ...(data.name ? { name: data.name } : {}),
        ...(data.slug ? { slug: data.slug } : {}),
        ...(data.segment ? { segment: data.segment } : {}),
        ...(data.checkoutType ? { checkout_type: data.checkoutType } : {}),
        ...(typeof data.isPublished === "boolean" ? { is_published: data.isPublished } : {}),
      })
      .eq("id", data.storeId);
    if (error) return { ok: false, message: "Não foi possível salvar a loja." };

    await supabaseAdmin.from("audit_logs").insert({
      store_id: data.storeId,
      user_id: (context as never as { userId: string }).userId,
      action: "admin.loja_editada",
      entity: "stores",
      entity_id: data.storeId,
      metadata: { slug: data.slug ?? null },
    });

    return { ok: true, message: "Loja atualizada." };
  });

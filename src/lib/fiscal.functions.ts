import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcFiscalBase, type FiscalConfig, type FiscalInvoiceRow, type FiscalOrderOption } from "@/lib/fiscal";

/**
 * Pontes RPC do módulo de Nota fiscal.
 *
 * Regras:
 * - só a equipe com permissão em "settings" configura o emissor;
 * - a credencial do emissor nunca volta para o navegador (só mascarada);
 * - toda emissão registra a nota em `fiscal_invoices`, com erro legível.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPermission(supabase: any, storeId: string, userId: string, area = "settings") {
  const { data } = await supabase.rpc("has_store_permission", {
    _store_id: storeId,
    _user_id: userId,
    _area: area,
  });
  if (data !== true) throw new Error("Você não tem permissão para usar a nota fiscal desta loja.");
}

function mask(value: string | null | undefined): string | null {
  return value ? `••••${value.slice(-4)}` : null;
}

const storeInput = z.object({ storeId: z.string().uuid() });

/** Configuração fiscal + situação da credencial do emissor. */
export const getFiscalConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<FiscalConfig> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [settings, credentials] = await Promise.all([
      supabaseAdmin.from("fiscal_settings").select("*").eq("store_id", data.storeId).maybeSingle(),
      supabaseAdmin
        .from("integration_credentials")
        .select("provider, api_key, extra")
        .eq("store_id", data.storeId)
        .eq("kind", "fiscal")
        .maybeSingle(),
    ]);

    const extra = (credentials.data?.extra ?? {}) as Record<string, unknown>;
    return {
      settings: settings.data ?? null,
      connection: {
        provider: credentials.data?.provider ?? settings.data?.provider ?? "manual",
        configured: Boolean(credentials.data?.api_key),
        companyId: typeof extra["company_id"] === "string" ? extra["company_id"] : null,
        maskedKey: mask(credentials.data?.api_key),
      },
    };
  });

const saveInput = z.object({
  storeId: z.string().uuid(),
  provider: z.enum(["manual", "focus_nfe", "nfe_io", "enotas"]),
  environment: z.enum(["homologacao", "producao"]),
  autoIssue: z.boolean(),
  cnpj: z.string().trim().max(20).optional(),
  municipalRegistration: z.string().trim().max(30).optional(),
  serviceCode: z.string().trim().max(30).optional(),
  cnae: z.string().trim().max(20).optional(),
  taxRegime: z.string().trim().max(40).optional(),
  taxPercent: z.number().min(0).max(100),
  defaultDescription: z.string().trim().max(400).optional(),
  legalName: z.string().trim().max(160).optional(),
  tradeName: z.string().trim().max(160).optional(),
  invoiceModel: z.string().trim().max(20).optional(),
  invoiceSeries: z.string().trim().max(10).optional(),
  nextInvoiceNumber: z.number().int().min(1).max(9_999_999).optional(),
  /** Vazio mantém a credencial já salva. */
  apiKey: z.string().trim().max(4000).optional(),
  companyId: z.string().trim().max(120).optional(),
  deductionPercent: z.number().min(0).max(100).optional(),
  includeShippingInBase: z.boolean().optional(),
  discountReducesBase: z.boolean().optional(),
  taxRetained: z.boolean().optional(),
});

/** Salva a configuração fiscal e, quando informada, a credencial do emissor. */
export const saveFiscalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const digits = (value: string | undefined) => (value ? value.replace(/\D/g, "") : null);

    const { error } = await supabaseAdmin.from("fiscal_settings").upsert(
      {
        store_id: data.storeId,
        provider: data.provider,
        environment: data.environment,
        auto_issue: data.autoIssue,
        cnpj: digits(data.cnpj),
        municipal_registration: data.municipalRegistration || null,
        service_code: data.serviceCode || null,
        cnae: data.cnae || null,
        tax_regime: data.taxRegime || null,
        tax_percent: data.taxPercent,
        default_description: data.defaultDescription || null,
        legal_name: data.legalName || null,
        trade_name: data.tradeName || null,
        invoice_model: data.invoiceModel || "nfse",
        invoice_series: data.invoiceSeries || "1",
        next_invoice_number: data.nextInvoiceNumber ?? 1,
        deduction_percent: data.deductionPercent ?? 0,
        include_shipping_in_base: data.includeShippingInBase ?? true,
        discount_reduces_base: data.discountReducesBase ?? true,
        tax_retained: data.taxRetained ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" },
    );
    if (error) return { ok: false, message: `Não foi possível salvar: ${error.message}` };

    if (data.provider === "manual") {
      await supabaseAdmin
        .from("integration_credentials")
        .delete()
        .eq("store_id", data.storeId)
        .eq("kind", "fiscal");
      return { ok: true, message: "Configuração salva. Nenhum emissor conectado." };
    }

    const { data: existing } = await supabaseAdmin
      .from("integration_credentials")
      .select("id, api_key, extra")
      .eq("store_id", data.storeId)
      .eq("kind", "fiscal")
      .maybeSingle();

    const apiKey = data.apiKey || existing?.api_key || null;
    if (!apiKey) return { ok: false, message: "Informe a credencial do emissor para conectar." };

    const previousExtra = (existing?.extra ?? {}) as Record<string, unknown>;
    const companyId = data.companyId || (typeof previousExtra["company_id"] === "string" ? previousExtra["company_id"] : null);

    const payload = {
      store_id: data.storeId,
      kind: "fiscal",
      provider: data.provider,
      api_key: apiKey,
      extra: { ...previousExtra, company_id: companyId },
      updated_at: new Date().toISOString(),
    };

    const saved = existing?.id
      ? await supabaseAdmin.from("integration_credentials").update(payload).eq("id", existing.id)
      : await supabaseAdmin.from("integration_credentials").insert(payload);
    if (saved.error) return { ok: false, message: `Credencial não salva: ${saved.error.message}` };

    return { ok: true, message: "Configuração e emissor salvos." };
  });

/** Testa a credencial sem emitir nota. */
export const testFiscalProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { testProvider } = await import("@/lib/fiscal.server");

    const [settings, credentials] = await Promise.all([
      supabaseAdmin.from("fiscal_settings").select("provider, environment").eq("store_id", data.storeId).maybeSingle(),
      supabaseAdmin
        .from("integration_credentials")
        .select("provider, api_key, extra")
        .eq("store_id", data.storeId)
        .eq("kind", "fiscal")
        .maybeSingle(),
    ]);

    const provider = credentials.data?.provider ?? settings.data?.provider ?? "manual";
    const extra = (credentials.data?.extra ?? {}) as Record<string, unknown>;
    return testProvider(
      provider,
      {
        apiKey: credentials.data?.api_key ?? null,
        companyId: typeof extra["company_id"] === "string" ? extra["company_id"] : null,
      },
      settings.data?.environment ?? "homologacao",
    );
  });

/** Notas da loja, mais recentes primeiro. */
export const listFiscalInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<FiscalInvoiceRow[]> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "orders");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("fiscal_invoices")
      .select("*")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false })
      .limit(200);
    return rows ?? [];
  });

/** Pedidos pagos dos últimos 90 dias, marcando quais já têm nota. */
export const listFiscalOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => storeInput.parse(data))
  .handler(async ({ data, context }): Promise<FiscalOrderOption[]> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "orders");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

    const [orders, invoices] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id, code, customer_name, total, created_at, payment_status")
        .eq("store_id", data.storeId)
        .eq("is_demo", false)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("fiscal_invoices").select("order_id, status").eq("store_id", data.storeId),
    ]);

    const byOrder = new Map<string, string>();
    for (const invoice of invoices.data ?? []) {
      if (invoice.order_id) byOrder.set(invoice.order_id, invoice.status);
    }

    return (orders.data ?? []).map((order) => ({
      id: order.id,
      code: order.code,
      customerName: order.customer_name,
      total: Number(order.total ?? 0),
      createdAt: order.created_at,
      paymentStatus: order.payment_status,
      invoiceStatus: byOrder.get(order.id) ?? null,
    }));
  });

const issueInput = z.object({
  storeId: z.string().uuid(),
  orderId: z.string().uuid(),
  customerName: z.string().trim().max(120).optional(),
  customerDocument: z.string().trim().max(20).optional(),
  description: z.string().trim().max(400).optional(),
});

/** Emite (ou reenvia) a nota de um pedido. */
export const issueFiscalInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => issueInput.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; invoiceId?: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "orders");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { issueWithProvider } = await import("@/lib/fiscal.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, code, customer_name, customer_email, total, subtotal, delivery_fee, discount, store_id")
      .eq("id", data.orderId)
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!order) return { ok: false, message: "Pedido não encontrado nesta loja." };

    const [settings, credentials, alreadyIssued] = await Promise.all([
      supabaseAdmin.from("fiscal_settings").select("*").eq("store_id", data.storeId).maybeSingle(),
      supabaseAdmin
        .from("integration_credentials")
        .select("provider, api_key, extra")
        .eq("store_id", data.storeId)
        .eq("kind", "fiscal")
        .maybeSingle(),
      supabaseAdmin
        .from("fiscal_invoices")
        .select("id, status")
        .eq("store_id", data.storeId)
        .eq("order_id", data.orderId)
        .in("status", ["issued", "pending"])
        .maybeSingle(),
    ]);

    if (alreadyIssued.data) {
      return {
        ok: false,
        message:
          alreadyIssued.data.status === "issued"
            ? "Este pedido já tem nota emitida."
            : "Já existe uma nota deste pedido em processamento.",
      };
    }

    const provider = credentials.data?.provider ?? settings.data?.provider ?? "manual";
    const environment = settings.data?.environment ?? "homologacao";
    const taxPercent = Number(settings.data?.tax_percent ?? 0);
    const amount = Number(order.total ?? 0);
    // Base de cálculo conforme os parâmetros da loja (frete, desconto e deduções).
    const breakdown = calcFiscalBase(
      {
        subtotal: Number(order.subtotal ?? 0),
        deliveryFee: Number(order.delivery_fee ?? 0),
        discount: Number(order.discount ?? 0),
        total: amount,
      },
      {
        includeShipping: settings.data?.include_shipping_in_base ?? true,
        discountReducesBase: settings.data?.discount_reduces_base ?? true,
        deductionPercent: Number(settings.data?.deduction_percent ?? 0),
        taxPercent,
      },
    );
    const description =
      data.description || settings.data?.default_description || `Pedido ${order.code ?? order.id.slice(0, 8)}`;

    // Numeração sequencial controlada pela loja (o emissor pode sobrescrever depois).
    const series = settings.data?.invoice_series ?? "1";
    const model = settings.data?.invoice_model ?? "nfse";
    const nextNumber = Number(settings.data?.next_invoice_number ?? 1);

    const { data: invoice, error: insertError } = await supabaseAdmin
      .from("fiscal_invoices")
      .insert({
        store_id: data.storeId,
        order_id: order.id,
        provider,
        model,
        series,
        number: String(nextNumber),
        amount,
        base_amount: breakdown.base,
        deduction_amount: breakdown.deduction,
        tax_amount: breakdown.tax,
        status: "pending",
        customer_name: data.customerName || order.customer_name,
        customer_document: data.customerDocument ? data.customerDocument.replace(/\D/g, "") : null,
        description,
      })
      .select("id")
      .single();
    if (insertError || !invoice) return { ok: false, message: `Não foi possível registrar a nota: ${insertError?.message}` };

    await supabaseAdmin
      .from("fiscal_settings")
      .update({ next_invoice_number: nextNumber + 1 })
      .eq("store_id", data.storeId);

    const extra = (credentials.data?.extra ?? {}) as Record<string, unknown>;
    const result = await issueWithProvider(
      provider,
      {
        apiKey: credentials.data?.api_key ?? null,
        companyId: typeof extra["company_id"] === "string" ? extra["company_id"] : null,
      },
      {
        reference: invoice.id,
        amount: breakdown.base,
        taxPercent,
        deductionAmount: breakdown.deduction,
        taxRetained: settings.data?.tax_retained ?? false,
        description,
        serviceCode: settings.data?.service_code ?? null,
        cnae: settings.data?.cnae ?? null,
        customerName: data.customerName || order.customer_name,
        customerDocument: data.customerDocument ? data.customerDocument.replace(/\D/g, "") : null,
        customerEmail: order.customer_email,
        environment,
      },
    );

    await supabaseAdmin
      .from("fiscal_invoices")
      .update({
        status: result.ok ? result.status : "error",
        external_id: result.externalId,
        number: result.number,
        pdf_url: result.pdfUrl,
        xml_url: result.xmlUrl,
        access_key: result.accessKey ?? null,
        verification_code: result.verificationCode ?? null,
        error_message: result.ok ? null : result.message,
        issued_at: result.status === "issued" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    return { ok: result.ok, message: result.message, invoiceId: invoice.id };
  });

/** Consulta no emissor a situação de uma nota pendente. */
export const refreshFiscalInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ storeId: z.string().uuid(), invoiceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertPermission(context.supabase, data.storeId, context.userId, "orders");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkWithProvider } = await import("@/lib/fiscal.server");

    const [invoice, settings, credentials] = await Promise.all([
      supabaseAdmin
        .from("fiscal_invoices")
        .select("id, provider, external_id")
        .eq("id", data.invoiceId)
        .eq("store_id", data.storeId)
        .maybeSingle(),
      supabaseAdmin.from("fiscal_settings").select("environment").eq("store_id", data.storeId).maybeSingle(),
      supabaseAdmin
        .from("integration_credentials")
        .select("api_key, extra")
        .eq("store_id", data.storeId)
        .eq("kind", "fiscal")
        .maybeSingle(),
    ]);

    if (!invoice.data) return { ok: false, message: "Nota não encontrada." };
    if (!invoice.data.external_id) return { ok: false, message: "Esta nota não foi enviada a um emissor." };

    const extra = (credentials.data?.extra ?? {}) as Record<string, unknown>;
    const result = await checkWithProvider(
      invoice.data.provider ?? "manual",
      {
        apiKey: credentials.data?.api_key ?? null,
        companyId: typeof extra["company_id"] === "string" ? extra["company_id"] : null,
      },
      invoice.data.external_id,
      settings.data?.environment ?? "homologacao",
    );

    await supabaseAdmin
      .from("fiscal_invoices")
      .update({
        status: result.ok ? result.status : "error",
        number: result.number,
        pdf_url: result.pdfUrl,
        xml_url: result.xmlUrl,
        access_key: result.accessKey ?? null,
        verification_code: result.verificationCode ?? null,
        error_message: result.ok ? null : result.message,
        issued_at: result.status === "issued" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.data.id);

    return { ok: result.ok, message: result.message };
  });

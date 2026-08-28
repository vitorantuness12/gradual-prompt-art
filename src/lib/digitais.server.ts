/**
 * Entrega digital protegida, cobrança recorrente das assinaturas de clientes
 * e emissão da nota fiscal de serviço. Roda só no servidor.
 */
import {
  DEFAULT_LINK_DAYS,
  DELIVERY_BLOCK_LABEL,
  REFUND_KIND_LABEL,
  affiliateCommission,
  deliveryAccess,
  expiryFrom,
  nextChargeDate,
  serviceTax,
  shouldRevokeAccess,
  statusAfterCharge,
  type DeliveryBlockReason,
  type RefundKind,
} from "@/lib/digitais";
import {
  defaultTemplate,
  renderDigitalTemplate,
  templateKey,
  type DigitalChannel,
  type DigitalMessageEvent,
  type DigitalVars,
} from "@/lib/digitais-templates";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export interface DeliveryView {
  ok: boolean;
  message: string;
  productName: string;
  storeName: string;
  storeSlug: string;
  instructions: string | null;
  expiresAt: string | null;
  remaining: number;
  maxDownloads: number;
  paid: boolean;
}

async function loadRow(admin: Admin, token: string) {
  const { data } = await admin
    .from("digital_deliveries")
    .select(
      "id, store_id, product_id, order_id, expires_at, revoked_at, download_count, max_downloads, released_at, product:products(name, digital_url, digital_file_path, digital_instructions), store:stores(name, slug), order:orders(payment_status)",
    )
    .eq("access_token", token)
    .maybeSingle();
  return data as
    | (Record<string, unknown> & {
        id: string;
        store_id: string;
        expires_at: string | null;
        revoked_at: string | null;
        download_count: number;
        max_downloads: number;
        released_at: string | null;
        product: { name: string; digital_url: string | null; digital_file_path: string | null; digital_instructions: string | null } | null;
        store: { name: string; slug: string } | null;
        order: { payment_status: string } | null;
      })
    | null;
}

function blockMessage(reason: DeliveryBlockReason): string {
  return reason ? DELIVERY_BLOCK_LABEL[reason] : "";
}

/** Dados exibidos na página pública do link de entrega. */
export async function loadDelivery(admin: Admin, token: string): Promise<DeliveryView> {
  const row = await loadRow(admin, token);
  if (!row) {
    return {
      ok: false,
      message: "Link inválido ou removido.",
      productName: "",
      storeName: "",
      storeSlug: "",
      instructions: null,
      expiresAt: null,
      remaining: 0,
      maxDownloads: 0,
      paid: false,
    };
  }

  const paid = !row.order || row.order.payment_status === "paid";
  const access = deliveryAccess(row);
  const reason: DeliveryBlockReason = !paid ? "pending" : access.reason;

  return {
    ok: paid && access.allowed,
    message: blockMessage(reason),
    productName: row.product?.name ?? "Produto digital",
    storeName: row.store?.name ?? "",
    storeSlug: row.store?.slug ?? "",
    instructions: row.product?.digital_instructions ?? null,
    expiresAt: row.expires_at,
    remaining: access.remaining,
    maxDownloads: row.max_downloads,
    paid,
  };
}

/** Consome um download: valida, registra o evento e devolve a URL do arquivo. */
export async function consumeDownload(
  admin: Admin,
  token: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ ok: boolean; url?: string; message: string; remaining: number }> {
  const row = await loadRow(admin, token);
  if (!row) return { ok: false, message: "Link inválido ou removido.", remaining: 0 };

  const paid = !row.order || row.order.payment_status === "paid";
  const access = deliveryAccess(row);
  if (!paid || !access.allowed) {
    return { ok: false, message: blockMessage(!paid ? "pending" : access.reason), remaining: access.remaining };
  }

  let url = row.product?.digital_url ?? null;
  if (!url && row.product?.digital_file_path) {
    const { data: signed } = await admin.storage
      .from("store-images")
      .createSignedUrl(row.product.digital_file_path, 60 * 10);
    url = signed?.signedUrl ?? null;
  }
  if (!url) return { ok: false, message: "A loja ainda não anexou o arquivo.", remaining: access.remaining };

  await admin
    .from("digital_deliveries")
    .update({ download_count: row.download_count + 1, last_download_at: new Date().toISOString() })
    .eq("id", row.id);

  await admin.from("digital_download_events").insert({
    store_id: row.store_id,
    delivery_id: row.id,
    ip: meta.ip ?? null,
    user_agent: meta.userAgent ?? null,
  });

  return { ok: true, url, message: "", remaining: Math.max(0, access.remaining - 1) };
}

export interface BillingResult {
  checked: number;
  charged: number;
  failed: number;
  reactivated: number;
}

/**
 * Cobrança recorrente: percorre as assinaturas vencidas, registra a cobrança,
 * avança o ciclo e marca inadimplência após as tentativas configuradas.
 * Sem provedor conectado a cobrança fica pendente para baixa manual.
 */
export async function runSubscriptionBilling(
  admin: Admin,
  options: { storeId?: string; now?: Date } = {},
): Promise<BillingResult> {
  const now = options.now ?? new Date();
  let query = admin
    .from("customer_subscriptions")
    .select("id, store_id, amount, period, status, failed_attempts, next_charge_at, customer_name, customer_email, product_id, cancel_at_period_end")
    .in("status", ["active", "past_due"])
    .lte("next_charge_at", now.toISOString())
    .limit(300);
  if (options.storeId) query = query.eq("store_id", options.storeId);

  const { data: due } = await query;
  const rows = due ?? [];
  const result: BillingResult = { checked: rows.length, charged: 0, failed: 0, reactivated: 0 };

  for (const row of rows) {
    if (row.cancel_at_period_end) {
      await admin
        .from("customer_subscriptions")
        .update({ status: "canceled", canceled_at: now.toISOString() })
        .eq("id", row.id);
      continue;
    }

    const { data: settings } = await admin
      .from("payment_settings")
      .select("provider, card_online_enabled, pix_enabled")
      .eq("store_id", row.store_id)
      .maybeSingle();
    const providerReady = Boolean(
      settings && settings.provider !== "manual" && (settings.card_online_enabled || settings.pix_enabled),
    );

    const attempt = (row.failed_attempts ?? 0) + 1;
    const paid = providerReady;
    const state = statusAfterCharge(paid, row.failed_attempts ?? 0);

    await admin.from("subscription_charges").insert({
      store_id: row.store_id,
      subscription_id: row.id,
      amount: Number(row.amount),
      status: paid ? "paid" : "pending",
      method: settings?.provider ?? "manual",
      attempt,
      error_message: paid ? null : "Nenhum provedor de cobrança automática conectado.",
    });

    const wasSuspended = row.status === "past_due";

    await admin
      .from("customer_subscriptions")
      .update({
        status: paid ? "active" : state.status,
        failed_attempts: paid ? 0 : state.failed_attempts,
        last_charge_at: now.toISOString(),
        last_error: paid ? null : "Cobrança pendente de confirmação.",
        next_charge_at: paid ? nextChargeDate(row.period, now) : nextChargeDate("week", now),
        current_period_end: paid ? nextChargeDate(row.period, now) : row.next_charge_at,
        canceled_at: state.status === "canceled" && !paid ? now.toISOString() : null,
        ...(paid && wasSuspended ? { reactivated_at: now.toISOString() } : {}),
      })
      .eq("id", row.id);

    if (paid) {
      result.charged += 1;
      await issueInvoiceIfConfigured(admin, {
        storeId: row.store_id,
        subscriptionId: row.id,
        amount: Number(row.amount),
        customerName: row.customer_name,
      });

      // Reativação automática: volta o acesso aos downloads e avisa o cliente.
      if (wasSuspended) {
        result.reactivated += 1;
        await setSubscriberAccess(admin, row.id, true);
        await admin.from("notifications").insert({
          store_id: row.store_id,
          event: "assinatura_reativada",
          title: `Assinatura reativada — ${row.customer_name}`,
          body: "A cobrança foi confirmada e o acesso ao conteúdo voltou a funcionar.",
          payload: { subscription_id: row.id },
        });
      }
      await notifySubscription(admin, row.id, wasSuspended ? "reactivated" : "charged");
    } else {
      result.failed += 1;
      // Inadimplência: suspende o acesso digital enquanto a cobrança não volta.
      if (state.status === "past_due" || state.status === "canceled") {
        await setSubscriberAccess(admin, row.id, false);
      }
      await notifySubscription(admin, row.id, state.status === "canceled" ? "canceled" : "past_due");
      await admin.from("notifications").insert({
        store_id: row.store_id,
        event: "assinatura_cobranca",
        title: `Cobrança pendente — ${row.customer_name}`,
        body: `Tentativa ${attempt} da assinatura recorrente ficou pendente.`,
        payload: { subscription_id: row.id },
      });
    }
  }


  return result;
}

/** Emite a NFS-e quando a loja tem emissão automática ligada. */
export async function issueInvoiceIfConfigured(
  admin: Admin,
  input: { storeId: string; orderId?: string; subscriptionId?: string; amount: number; customerName?: string | null; customerDocument?: string | null },
): Promise<{ issued: boolean }> {
  const { data: settings } = await admin
    .from("fiscal_settings")
    .select("auto_issue, tax_percent, default_description, provider")
    .eq("store_id", input.storeId)
    .maybeSingle();
  if (!settings?.auto_issue) return { issued: false };

  const manual = (settings.provider ?? "manual") === "manual";
  await admin.from("fiscal_invoices").insert({
    store_id: input.storeId,
    order_id: input.orderId ?? null,
    subscription_id: input.subscriptionId ?? null,
    amount: input.amount,
    tax_amount: serviceTax(input.amount, Number(settings.tax_percent ?? 0)),
    status: manual ? "pending" : "issued",
    customer_name: input.customerName ?? null,
    customer_document: input.customerDocument ?? null,
    description: settings.default_description ?? "Prestação de serviço digital",
    issued_at: manual ? null : new Date().toISOString(),
    error_message: manual ? "Emissor fiscal não conectado: nota registrada para emissão manual." : null,
  });
  return { issued: !manual };
}

/* ------------------------- Notificações por e-mail ------------------------ */

/** Envia um e-mail transacional pelo canal de e-mail configurado na loja. */
export async function sendStoreEmail(
  admin: Admin,
  storeId: string,
  input: { to: string | null; subject: string; body: string; event: string },
): Promise<{ ok: boolean; message: string }> {
  if (!input.to) return { ok: false, message: "Comprador sem e-mail." };

  const { data: settings } = await admin
    .from("channel_settings")
    .select("from_email, is_enabled, demo_mode")
    .eq("store_id", storeId)
    .eq("channel", "email")
    .maybeSingle();
  const { data: credentials } = await admin
    .from("channel_credentials")
    .select("access_token")
    .eq("store_id", storeId)
    .eq("channel", "email")
    .maybeSingle();

  const apiKey = credentials?.access_token ?? process.env["RESEND_API_KEY"] ?? null;
  const demo = !settings?.is_enabled || settings.demo_mode || !apiKey || !settings.from_email;

  let ok = demo;
  let error: string | null = demo ? "Canal de e-mail em modo demonstração." : null;

  if (!demo) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: settings!.from_email,
          to: [input.to],
          subject: input.subject,
          text: input.body,
        }),
      });
      const json = (await response.json()) as { message?: string };
      ok = response.ok;
      error = response.ok ? null : json.message ?? "Falha no envio.";
    } catch {
      ok = false;
      error = "Serviço de e-mail indisponível.";
    }
  }

  await admin.from("message_logs").insert({
    store_id: storeId,
    channel: "email",
    direction: "outbound",
    event: input.event,
    contact: input.to,
    level: ok ? "info" : "error",
    error,
    payload: { subject: input.subject, demo },
  });

  return { ok, message: error ?? "E-mail enviado." };
}

/** Carrega o modelo editável da loja, caindo no padrão quando não existir. */
export async function loadDigitalTemplate(
  admin: Admin,
  storeId: string,
  event: DigitalMessageEvent,
  channel: DigitalChannel,
): Promise<{ subject: string; body: string }> {
  const fallback = defaultTemplate(event, channel);
  const { data } = await admin
    .from("message_templates")
    .select("title, body, is_active")
    .eq("store_id", storeId)
    .eq("key", templateKey(event, channel))
    .maybeSingle();
  if (!data || !data.is_active) return { subject: fallback.subject, body: fallback.body };
  return { subject: data.title || fallback.subject, body: data.body || fallback.body };
}

/** Avisa o comprador com o link de entrega, validade e próximos passos. */
export async function notifyDeliveryReleased(
  admin: Admin,
  deliveryId: string,
  baseUrl: string,
): Promise<{ ok: boolean; message: string }> {
  const { data: row } = await admin
    .from("digital_deliveries")
    .select(
      "access_token, store_id, customer_email, expires_at, revoked_at, download_count, max_downloads, product:products(name, digital_instructions), store:stores(name), order:orders(customer_email, customer_name, customer_phone)",
    )
    .eq("id", deliveryId)
    .maybeSingle();
  if (!row) return { ok: false, message: "Entrega não encontrada." };

  const access = deliveryAccess(row);
  const vars: DigitalVars = {
    cliente: row.order?.customer_name ?? "tudo bem",
    produto: row.product?.name ?? "produto digital",
    validade: row.expires_at ? new Date(row.expires_at).toLocaleString("pt-BR") : "sem prazo",
    downloads: String(access.remaining),
    proximos_passos: row.product?.digital_instructions ?? "",
    link: `${baseUrl}/entrega/${row.access_token}`,
    loja: row.store?.name ?? "Sua loja",
    status: access.allowed ? "Liberado" : "Indisponível",
  };

  const email = await loadDigitalTemplate(admin, row.store_id, "entrega_digital", "email");
  const result = await sendStoreEmail(admin, row.store_id, {
    to: row.customer_email ?? row.order?.customer_email ?? null,
    subject: renderDigitalTemplate(email.subject, vars),
    body: renderDigitalTemplate(email.body, vars),
    event: "entrega_digital",
  });

  await sendDigitalWhatsapp(admin, row.store_id, row.order?.customer_phone ?? null, "entrega_digital", vars);

  return result;
}

/** Envia a versão WhatsApp do modelo, quando o cliente tem telefone. */
export async function sendDigitalWhatsapp(
  admin: Admin,
  storeId: string,
  phone: string | null,
  event: DigitalMessageEvent,
  vars: DigitalVars,
): Promise<{ ok: boolean; message: string }> {
  if (!phone) return { ok: false, message: "Cliente sem telefone." };
  const template = await loadDigitalTemplate(admin, storeId, event, "whatsapp");
  const body = renderDigitalTemplate(template.body, vars);
  if (!body) return { ok: false, message: "Modelo de WhatsApp vazio." };

  const { sendWhatsappMessage } = await import("@/lib/whatsapp/send.server");
  const outcome = await sendWhatsappMessage(admin, {
    storeId,
    phone,
    body,
    messageType: "transactional",
    templateKey: templateKey(event, "whatsapp"),
  });
  return { ok: outcome.ok, message: outcome.message };
}

/** Avisa o assinante por e-mail e WhatsApp sobre o estado da assinatura. */
export async function notifySubscription(
  admin: Admin,
  subscriptionId: string,
  kind: "activated" | "charged" | "reactivated" | "past_due" | "canceled",
  options: { baseUrl?: string } = {},
): Promise<void> {
  const { data: row } = await admin
    .from("customer_subscriptions")
    .select(
      "store_id, product_id, user_id, customer_name, customer_email, customer_phone, amount, next_charge_at, status, product:products(name), store:stores(name, slug)",
    )
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!row) return;

  // Entrega ligada à assinatura: usada para link e situação do download.
  let deliveryQuery = admin
    .from("digital_deliveries")
    .select("access_token, expires_at, revoked_at, download_count, max_downloads")
    .eq("store_id", row.store_id)
    .eq("product_id", row.product_id)
    .limit(1);
  deliveryQuery = row.user_id
    ? deliveryQuery.eq("user_id", row.user_id)
    : deliveryQuery.eq("customer_email", row.customer_email ?? "");
  const { data: delivery } = await deliveryQuery.maybeSingle();

  const access = delivery ? deliveryAccess(delivery) : null;
  const baseUrl = options.baseUrl ?? process.env["PUBLIC_BASE_URL"] ?? "https://oseupedido.com.br";

  const vars: DigitalVars = {
    cliente: row.customer_name,
    produto: row.product?.name ?? "assinatura",
    valor: Number(row.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    proxima_cobranca: row.next_charge_at ? new Date(row.next_charge_at).toLocaleDateString("pt-BR") : "—",
    validade: delivery?.expires_at ? new Date(delivery.expires_at).toLocaleString("pt-BR") : "sem prazo",
    downloads: access ? String(access.remaining) : "—",
    link: delivery ? `${baseUrl}/entrega/${delivery.access_token}` : `${baseUrl}/loja/${row.store?.slug ?? ""}`,
    loja: row.store?.name ?? "Sua loja",
    status: access ? (access.allowed ? "Liberado" : "Bloqueado") : "Sem arquivo vinculado",
  };

  const event = `assinatura_${kind}` as DigitalMessageEvent;
  const email = await loadDigitalTemplate(admin, row.store_id, event, "email");

  await sendStoreEmail(admin, row.store_id, {
    to: row.customer_email,
    subject: renderDigitalTemplate(email.subject, vars),
    body: renderDigitalTemplate(email.body, vars),
    event,
  });

  // WhatsApp nos momentos críticos: ativação, reativação e inadimplência.
  if (kind === "activated" || kind === "reactivated" || kind === "past_due" || kind === "canceled") {
    await sendDigitalWhatsapp(admin, row.store_id, row.customer_phone, event, vars);
  }
}


/* ------------------- Reativação e suspensão de acesso -------------------- */

/** Liga ou desliga o acesso às entregas digitais de um assinante. */
export async function setSubscriberAccess(
  admin: Admin,
  subscriptionId: string,
  active: boolean,
): Promise<number> {
  const { data: subscription } = await admin
    .from("customer_subscriptions")
    .select("store_id, product_id, user_id, customer_email")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!subscription) return 0;

  let query = admin
    .from("digital_deliveries")
    .select("id")
    .eq("store_id", subscription.store_id)
    .eq("product_id", subscription.product_id);
  query = subscription.user_id
    ? query.eq("user_id", subscription.user_id)
    : query.eq("customer_email", subscription.customer_email ?? "");

  const { data: rows } = await query;
  const ids = (rows ?? []).map((row) => row.id);
  if (ids.length === 0) return 0;

  await admin
    .from("digital_deliveries")
    .update(
      active
        ? { revoked_at: null, expires_at: expiryFrom(DEFAULT_LINK_DAYS), download_count: 0 }
        : { revoked_at: new Date().toISOString() },
    )
    .in("id", ids);

  return ids.length;
}

/* ------------------------ Reembolsos e chargebacks ----------------------- */

export interface RefundInput {
  storeId: string;
  kind: RefundKind;
  method: "money" | "credit";
  amount: number;
  reason?: string | null;
  orderId?: string | null;
  subscriptionId?: string | null;
  userId?: string | null;
}

/**
 * Aplica um reembolso, cancelamento ou chargeback de forma consistente:
 * baixa no pedido, crédito ao cliente, estorno da comissão do afiliado,
 * cancelamento da nota fiscal e corte do acesso digital quando for total.
 */
export async function registerRefund(admin: Admin, input: RefundInput) {
  const amount = Math.max(0, Number(input.amount));
  let orderTotal = 0;
  let customerName: string | null = null;
  let customerPhone: string | null = null;
  let affiliateCode: string | null = null;

  if (input.orderId) {
    const { data: order } = await admin
      .from("orders")
      .select("total, customer_name, customer_phone, customer_email, affiliate_code")
      .eq("id", input.orderId)
      .maybeSingle();
    orderTotal = Number(order?.total ?? 0);
    customerName = order?.customer_name ?? null;
    customerPhone = order?.customer_phone ?? null;
    affiliateCode = order?.affiliate_code ?? null;
  }

  if (input.subscriptionId) {
    const { data: subscription } = await admin
      .from("customer_subscriptions")
      .select("amount, customer_name, customer_phone")
      .eq("id", input.subscriptionId)
      .maybeSingle();
    orderTotal = orderTotal || Number(subscription?.amount ?? 0);
    customerName = customerName ?? subscription?.customer_name ?? null;
    customerPhone = customerPhone ?? subscription?.customer_phone ?? null;
  }

  // Crédito na loja quando a devolução não é em dinheiro.
  let creditId: string | null = null;
  if (input.method === "credit" && amount > 0) {
    const { data: credit } = await admin
      .from("customer_credits")
      .insert({
        store_id: input.storeId,
        customer_name: customerName,
        customer_phone: customerPhone,
        amount,
        balance: amount,
        origin: input.kind === "chargeback" ? "chargeback" : "refund",
        notes: input.reason ?? null,
      })
      .select("id")
      .single();
    creditId = credit?.id ?? null;
  }

  // Pedido: marca como estornado e cancela quando o valor é total.
  if (input.orderId) {
    const full = shouldRevokeAccess(input.kind, amount, orderTotal);
    await admin
      .from("orders")
      .update({
        payment_status: "refunded",
        ...(full ? { status: "cancelled", cancel_reason: input.reason ?? REFUND_KIND_LABEL[input.kind] } : {}),
      })
      .eq("id", input.orderId);
  }

  // Comissão do afiliado deixa de valer sobre o valor estornado.
  let commissionReversed = 0;
  if (affiliateCode) {
    const { data: affiliate } = await admin
      .from("store_affiliates")
      .select("commission_percent")
      .eq("store_id", input.storeId)
      .eq("code", affiliateCode)
      .maybeSingle();
    if (affiliate) commissionReversed = affiliateCommission(amount, Number(affiliate.commission_percent));
  }

  // Nota fiscal correspondente é cancelada.
  let invoiceId: string | null = null;
  if (input.orderId || input.subscriptionId) {
    let invoiceQuery = admin
      .from("fiscal_invoices")
      .select("id")
      .eq("store_id", input.storeId)
      .neq("status", "canceled")
      .limit(1);
    invoiceQuery = input.orderId
      ? invoiceQuery.eq("order_id", input.orderId)
      : invoiceQuery.eq("subscription_id", input.subscriptionId!);
    const { data: invoice } = await invoiceQuery.maybeSingle();
    if (invoice) {
      await admin
        .from("fiscal_invoices")
        .update({ status: "canceled", error_message: `Cancelada por ${REFUND_KIND_LABEL[input.kind].toLowerCase()}.` })
        .eq("id", invoice.id);
      invoiceId = invoice.id;
    }
  }

  // Assinatura cancelada e acesso digital revogado quando for o caso.
  const revoke = shouldRevokeAccess(input.kind, amount, orderTotal || amount);
  if (input.subscriptionId) {
    await admin
      .from("customer_subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_at_period_end: false })
      .eq("id", input.subscriptionId);
    if (revoke) await setSubscriberAccess(admin, input.subscriptionId, false);
    await notifySubscription(admin, input.subscriptionId, "canceled");
  }

  if (revoke && input.orderId) {
    await admin
      .from("digital_deliveries")
      .update({ revoked_at: new Date().toISOString() })
      .eq("order_id", input.orderId);
  }

  const { data: refund, error } = await admin
    .from("refunds")
    .insert({
      store_id: input.storeId,
      order_id: input.orderId ?? null,
      subscription_id: input.subscriptionId ?? null,
      kind: input.kind,
      method: input.method,
      amount,
      reason: input.reason ?? null,
      customer_name: customerName,
      credit_id: creditId,
      invoice_id: invoiceId,
      affiliate_code: affiliateCode,
      commission_reversed: commissionReversed,
      revoked_access: revoke,
      created_by: input.userId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await admin.from("notifications").insert({
    store_id: input.storeId,
    event: "reembolso",
    title: `${REFUND_KIND_LABEL[input.kind]} registrado`,
    body: `${customerName ?? "Cliente"} · ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    payload: { refund_id: refund.id },
  });

  return { id: refund.id, commissionReversed, revokedAccess: revoke, creditId };
}

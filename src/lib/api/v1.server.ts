/**
 * API pública versionada v1.
 *
 * Um único roteador atende todos os recursos. Cada rota declara o escopo
 * exigido; sem ele a chave recebe 403. Todas as consultas são filtradas
 * pela loja dona da chave — nunca por parâmetro enviado pelo cliente.
 */

import {
  apiError,
  apiJson,
  authenticateApiRequest,
  logApiRequest,
  pageParams,
  paginated,
  type ApiContext,
} from "./keys.server";
import { openApiDocument } from "./openapi";

type Handler = (input: {
  request: Request;
  url: URL;
  segments: string[];
  context: ApiContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}) => Promise<Response>;

interface Route {
  method: string;
  /** Primeiro segmento do caminho depois de /v1. */
  resource: string;
  scope: string;
  handler: Handler;
}

function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  url: URL,
  allowed: string[],
) {
  for (const field of allowed) {
    const value = url.searchParams.get(field);
    if (value) query = query.eq(field, value);
  }
  const since = url.searchParams.get("since");
  if (since) query = query.gte("created_at", since);
  const until = url.searchParams.get("until");
  if (until) query = query.lte("created_at", until);
  return query;
}

/** Listagem paginada e filtrada de uma tabela da loja. */
function listResource(table: string, columns: string, filters: string[]): Handler {
  return async ({ url, context, db }) => {
    const params = pageParams(url);
    let query = db
      .from(table)
      .select(columns, { count: "exact" })
      .eq("store_id", context.storeId)
      .order("created_at", { ascending: false })
      .range(params.from, params.to);
    query = applyFilters(query, url, filters);
    const { data, count, error } = await query;
    if (error) return apiError(400, "consulta_invalida", error.message);
    return paginated(data ?? [], count ?? null, params);
  };
}

const ROUTES: Route[] = [
  {
    method: "GET",
    resource: "lojas",
    scope: "lojas:ler",
    handler: async ({ context, db }) => {
      const { data, error } = await db
        .from("stores")
        .select(
          "id, slug, name, segment, description, phone, whatsapp, email, address_street, address_number, address_district, address_city, address_state, address_zip, opening_hours, delivery_fee, min_order_value, accepts_delivery, accepts_pickup, accepts_scheduling, accepts_dine_in, is_published, availability_status, timezone",
        )
        .eq("id", context.storeId)
        .maybeSingle();
      if (error) return apiError(400, "consulta_invalida", error.message);
      if (!data) return apiError(404, "nao_encontrado", "Loja não encontrada.");
      return apiJson({ data });
    },
  },
  {
    method: "GET",
    resource: "catalogo",
    scope: "catalogo:ler",
    handler: async ({ url, segments, context, db }) => {
      const sub = segments[1] ?? "produtos";
      const params = pageParams(url);
      if (sub === "categorias") {
        const { data, count, error } = await db
          .from("categories")
          .select("id, name, description, sort_order, is_active", { count: "exact" })
          .eq("store_id", context.storeId)
          .range(params.from, params.to);
        if (error) return apiError(400, "consulta_invalida", error.message);
        return paginated(data ?? [], count ?? null, params);
      }
      let query = db
        .from("products")
        .select(
          "id, name, description, price, promo_price, sku, barcode, stock_quantity, is_active, is_available, category_id, kind, sort_order",
          {
            count: "exact",
          },
        )
        .eq("store_id", context.storeId)
        .range(params.from, params.to);
      const search = url.searchParams.get("q");
      if (search) query = query.ilike("name", `%${search}%`);
      query = applyFilters(query, url, ["category_id", "kind", "is_active"]);
      const { data, count, error } = await query;
      if (error) return apiError(400, "consulta_invalida", error.message);
      return paginated(data ?? [], count ?? null, params);
    },
  },
  {
    method: "PATCH",
    resource: "catalogo",
    scope: "catalogo:escrever",
    handler: async ({ request, segments, context, db }) => {
      const productId = segments[2];
      if (segments[1] !== "produtos" || !productId) {
        return apiError(404, "nao_encontrado", "Use PATCH /v1/catalogo/produtos/{id}.");
      }
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return apiError(400, "corpo_invalido", "Envie um JSON válido.");
      const patch: Record<string, unknown> = {};
      for (const field of [
        "name",
        "description",
        "price",
        "stock_quantity",
        "is_active",
        "is_available",
        "sku",
        "barcode",
      ]) {
        if (field in body) patch[field] = body[field];
      }
      if (Object.keys(patch).length === 0)
        return apiError(400, "corpo_invalido", "Nenhum campo editável enviado.");
      const { data, error } = await db
        .from("products")
        .update(patch)
        .eq("id", productId)
        .eq("store_id", context.storeId)
        .select("id, name, price, stock_quantity, is_active")
        .maybeSingle();
      if (error) return apiError(400, "consulta_invalida", error.message);
      if (!data) return apiError(404, "nao_encontrado", "Produto não encontrado nesta loja.");
      return apiJson({ data });
    },
  },
  {
    method: "GET",
    resource: "clientes",
    scope: "clientes:ler",
    handler: listResource("customers", "id, name, phone, email, district, tags, created_at", [
      "district",
    ]),
  },
  {
    method: "GET",
    resource: "pedidos",
    scope: "pedidos:ler",
    handler: async ({ url, segments, context, db }) => {
      const orderId = segments[1];
      if (orderId) {
        const { data, error } = await db
          .from("orders")
          .select(
            "*, order_items(id, product_id, product_name, quantity, unit_price, total, notes)",
          )
          .eq("store_id", context.storeId)
          .or(`id.eq.${orderId},code.eq.${orderId}`)
          .maybeSingle();
        if (error) return apiError(400, "consulta_invalida", error.message);
        if (!data) return apiError(404, "nao_encontrado", "Pedido não encontrado.");
        return apiJson({ data });
      }
      const params = pageParams(url);
      let query = db
        .from("orders")
        .select(
          "id, code, status, type, payment_status, payment_method, customer_name, customer_phone, subtotal, delivery_fee, discount, total, created_at",
          { count: "exact" },
        )
        .eq("store_id", context.storeId)
        .order("created_at", { ascending: false })
        .range(params.from, params.to);
      query = applyFilters(query, url, ["status", "type", "payment_status"]);
      const { data, count, error } = await query;
      if (error) return apiError(400, "consulta_invalida", error.message);
      return paginated(data ?? [], count ?? null, params);
    },
  },
  {
    method: "PATCH",
    resource: "pedidos",
    scope: "pedidos:escrever",
    handler: async ({ request, segments, context, db }) => {
      const orderId = segments[1];
      if (!orderId) return apiError(404, "nao_encontrado", "Use PATCH /v1/pedidos/{id}.");
      const body = (await request.json().catch(() => null)) as {
        status?: string;
        cancel_reason?: string;
      } | null;
      if (!body?.status) return apiError(400, "corpo_invalido", "Informe o campo status.");
      const allowed = [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "completed",
        "rejected",
      ];
      if (!allowed.includes(body.status))
        return apiError(400, "status_invalido", `Status aceitos: ${allowed.join(", ")}.`);
      const { data, error } = await db
        .from("orders")
        .update({ status: body.status, cancel_reason: body.cancel_reason ?? null })
        .eq("id", orderId)
        .eq("store_id", context.storeId)
        .select("id, code, status")
        .maybeSingle();
      if (error) return apiError(400, "consulta_invalida", error.message);
      if (!data) return apiError(404, "nao_encontrado", "Pedido não encontrado nesta loja.");
      const { dispatchWebhook } = await import("@/lib/integrations/connectors.server");
      await dispatchWebhook({
        event: "pedido.status",
        storeId: context.storeId,
        data: data as Record<string, unknown>,
      });
      return apiJson({ data });
    },
  },
  {
    method: "GET",
    resource: "pagamentos",
    scope: "pagamentos:ler",
    handler: listResource(
      "payments",
      "id, order_id, provider, method, status, amount, external_id, created_at",
      ["status", "provider", "method"],
    ),
  },
  {
    method: "GET",
    resource: "entregas",
    scope: "entregas:ler",
    handler: listResource(
      "deliveries",
      "id, order_id, courier_id, delivery_person_id, status, fee, accepted_at, picked_up_at, delivered_at, created_at",
      ["status", "courier_id"],
    ),
  },
  {
    method: "GET",
    resource: "mesas",
    scope: "mesas:ler",
    handler: async ({ url, context, db }) => {
      const params = pageParams(url);
      const { data, count, error } = await db
        .from("dining_tables")
        .select("id, area_id, label, seats, shape, status, pos_x, pos_y, is_active", {
          count: "exact",
        })
        .eq("store_id", context.storeId)
        .range(params.from, params.to);
      if (error) return apiError(400, "consulta_invalida", error.message);
      return paginated(data ?? [], count ?? null, params);
    },
  },
  {
    method: "GET",
    resource: "estoque",
    scope: "estoque:ler",
    handler: async ({ url, segments, context, db }) => {
      const params = pageParams(url);
      if (segments[1] === "movimentos") {
        const { data, count, error } = await db
          .from("inventory_movements")
          .select("id, product_id, movement_type, quantity, reason, created_at", { count: "exact" })
          .eq("store_id", context.storeId)
          .order("created_at", { ascending: false })
          .range(params.from, params.to);
        if (error) return apiError(400, "consulta_invalida", error.message);
        return paginated(data ?? [], count ?? null, params);
      }
      const { data, count, error } = await db
        .from("products")
        .select("id, name, sku, barcode, stock_quantity, min_stock, track_stock", {
          count: "exact",
        })
        .eq("store_id", context.storeId)
        .range(params.from, params.to);
      if (error) return apiError(400, "consulta_invalida", error.message);
      return paginated(data ?? [], count ?? null, params);
    },
  },
  {
    method: "POST",
    resource: "estoque",
    scope: "estoque:escrever",
    handler: async ({ request, segments, context, db }) => {
      if (segments[1] !== "movimentos")
        return apiError(404, "nao_encontrado", "Use POST /v1/estoque/movimentos.");
      const body = (await request.json().catch(() => null)) as {
        product_id?: string;
        quantity?: number;
        reason?: string;
      } | null;
      if (!body?.product_id || typeof body.quantity !== "number") {
        return apiError(400, "corpo_invalido", "Informe product_id e quantity.");
      }
      const { data: product } = await db
        .from("products")
        .select("id, stock_quantity")
        .eq("id", body.product_id)
        .eq("store_id", context.storeId)
        .maybeSingle();
      if (!product) return apiError(404, "nao_encontrado", "Produto não encontrado nesta loja.");

      const { error } = await db.from("inventory_movements").insert({
        store_id: context.storeId,
        product_id: body.product_id,
        movement_type: body.quantity >= 0 ? "in" : "out",
        quantity: Math.abs(body.quantity),
        reason: (body.reason ?? "api").slice(0, 80),
      });
      if (error) return apiError(400, "consulta_invalida", error.message);

      const stock = Number(product.stock_quantity ?? 0) + body.quantity;
      await db.from("products").update({ stock_quantity: stock }).eq("id", product.id);
      return apiJson({ data: { product_id: product.id, stock } }, 201);
    },
  },
  {
    method: "GET",
    resource: "cupons",
    scope: "cupons:ler",
    handler: listResource(
      "promotions",
      "id, code, description, discount_type, discount_value, min_order_value, usage_limit, used_count, is_active, starts_at, ends_at, created_at",
      ["is_active"],
    ),
  },
  {
    method: "GET",
    resource: "webhooks",
    scope: "webhooks:gerenciar",
    handler: async ({ context, db }) => {
      const { data, error } = await db
        .from("webhook_endpoints")
        .select(
          "id, url, description, events, is_active, last_delivery_at, last_status, failure_count, created_at",
        )
        .eq("store_id", context.storeId);
      if (error) return apiError(400, "consulta_invalida", error.message);
      return apiJson({ data: data ?? [] });
    },
  },
  {
    method: "POST",
    resource: "webhooks",
    scope: "webhooks:gerenciar",
    handler: async ({ request, context, db }) => {
      const body = (await request.json().catch(() => null)) as {
        url?: string;
        events?: string[];
        description?: string;
      } | null;
      if (!body?.url || !/^https:\/\//.test(body.url)) {
        return apiError(400, "corpo_invalido", "Informe uma url https válida.");
      }
      const { randomBytes } = await import("node:crypto");
      const webhookSecret = `whsec_${randomBytes(24).toString("hex")}`;
      const { data, error } = await db
        .from("webhook_endpoints")
        .insert({
          store_id: context.storeId,
          url: body.url,
          description: body.description ?? null,
          events: body.events ?? [],
          secret: webhookSecret,
        })
        .select("id, url, events, is_active")
        .maybeSingle();
      if (error) return apiError(400, "consulta_invalida", error.message);
      // O segredo só é devolvido nesta resposta.
      return apiJson({ data: { ...data, secret: webhookSecret } }, 201);
    },
  },
  {
    method: "DELETE",
    resource: "webhooks",
    scope: "webhooks:gerenciar",
    handler: async ({ segments, context, db }) => {
      const id = segments[1];
      if (!id) return apiError(404, "nao_encontrado", "Use DELETE /v1/webhooks/{id}.");
      const { error } = await db
        .from("webhook_endpoints")
        .delete()
        .eq("id", id)
        .eq("store_id", context.storeId);
      if (error) return apiError(400, "consulta_invalida", error.message);
      return new Response(null, { status: 204 });
    },
  },
];

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-api-key",
  "access-control-max-age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

/** Ponto de entrada compartilhado pelas rotas /api/v1/* e /api/public/v1/*. */
export async function handleApiV1(request: Request, splat: string): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const segments = splat.split("/").filter(Boolean);

  if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

  // Documentação é pública: descreve a API, não expõe dados.
  if (segments[0] === "openapi.json" || segments[0] === "openapi") {
    return withCors(apiJson(openApiDocument(url.origin)));
  }

  const resource = segments[0] ?? "";
  if (!resource) {
    return withCors(
      apiJson({
        name: "API O Seu Pedido",
        version: "v1",
        documentation: `${url.origin}/api/public/v1/openapi.json`,
        resources: [...new Set(ROUTES.map((route) => route.resource))],
      }),
    );
  }

  const route = ROUTES.find((item) => item.resource === resource && item.method === request.method);
  if (!route) {
    const exists = ROUTES.some((item) => item.resource === resource);
    return withCors(
      exists
        ? apiError(
            405,
            "metodo_nao_permitido",
            `Método ${request.method} não disponível em /${resource}.`,
          )
        : apiError(404, "nao_encontrado", `Recurso /${resource} não existe na v1.`),
    );
  }

  const auth = await authenticateApiRequest(request, route.scope);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");

  if ("response" in auth) {
    await logApiRequest({
      storeId: null,
      keyId: null,
      method: request.method,
      path: url.pathname,
      status: auth.response.status,
      durationMs: Date.now() - started,
      ip,
    });
    return withCors(auth.response);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let response: Response;
  try {
    response = await route.handler({
      request,
      url,
      segments,
      context: auth.context,
      db: supabaseAdmin,
    });
  } catch (error) {
    console.error("[api-v1]", error);
    response = apiError(500, "erro_interno", "Não foi possível concluir a operação.");
  }

  await logApiRequest({
    storeId: auth.context.storeId,
    keyId: auth.context.keyId,
    method: request.method,
    path: url.pathname,
    status: response.status,
    durationMs: Date.now() - started,
    ip,
  });

  return withCors(response);
}

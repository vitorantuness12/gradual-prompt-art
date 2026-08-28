/**
 * Documento OpenAPI 3.1 da API pública v1.
 * Client-safe: descreve contratos, não contém segredos.
 */

interface JsonObject {
  [key: string]: unknown;
}

const pagination = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "per_page",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
  {
    name: "since",
    in: "query",
    description: "Data inicial (ISO 8601)",
    schema: { type: "string", format: "date-time" },
  },
  {
    name: "until",
    in: "query",
    description: "Data final (ISO 8601)",
    schema: { type: "string", format: "date-time" },
  },
];

function listResponse(description: string): JsonObject {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            data: { type: "array", items: { type: "object" } },
            meta: {
              type: "object",
              properties: {
                page: { type: "integer" },
                per_page: { type: "integer" },
                total: { type: "integer" },
                total_pages: { type: "integer" },
              },
            },
          },
        },
      },
    },
  };
}

const errorResponse = {
  description: "Erro",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: { code: { type: "string" }, message: { type: "string" } },
          },
        },
      },
    },
  },
};

export function openApiDocument(origin: string): JsonObject {
  const common = { 401: errorResponse, 403: errorResponse, 429: errorResponse };

  return {
    openapi: "3.1.0",
    info: {
      title: "API O Seu Pedido",
      version: "1.0.0",
      description:
        "API REST da plataforma O Seu Pedido. Autenticação por chave rotacionável com escopos, limite por minuto, paginação e filtros. Todos os dados são restritos à loja dona da chave.",
    },
    servers: [{ url: `${origin}/api/public/v1` }, { url: `${origin}/api/v1` }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description:
            "Envie a chave em Authorization: Bearer sp_live_... (ou no cabeçalho x-api-key).",
        },
      },
    },
    paths: {
      "/lojas": {
        get: {
          summary: "Dados da loja",
          security: [{ apiKey: ["lojas:ler"] }],
          responses: { 200: listResponse("Loja"), ...common },
        },
      },
      "/catalogo/produtos": {
        get: {
          summary: "Lista produtos",
          security: [{ apiKey: ["catalogo:ler"] }],
          parameters: [
            ...pagination,
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "is_active", in: "query", schema: { type: "boolean" } },
          ],
          responses: { 200: listResponse("Produtos"), ...common },
        },
      },
      "/catalogo/produtos/{id}": {
        patch: {
          summary: "Atualiza um produto",
          security: [{ apiKey: ["catalogo:escrever"] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    price: { type: "number" },
                    stock: { type: "number" },
                    is_active: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { 200: listResponse("Produto atualizado"), 404: errorResponse, ...common },
        },
      },
      "/catalogo/categorias": {
        get: {
          summary: "Lista categorias",
          security: [{ apiKey: ["catalogo:ler"] }],
          parameters: pagination,
          responses: { 200: listResponse("Categorias"), ...common },
        },
      },
      "/clientes": {
        get: {
          summary: "Lista clientes",
          security: [{ apiKey: ["clientes:ler"] }],
          parameters: [
            ...pagination,
            { name: "district", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: listResponse("Clientes"), ...common },
        },
      },
      "/pedidos": {
        get: {
          summary: "Lista pedidos",
          security: [{ apiKey: ["pedidos:ler"] }],
          parameters: [
            ...pagination,
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "payment_status", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: listResponse("Pedidos"), ...common },
        },
      },
      "/pedidos/{id}": {
        get: {
          summary: "Detalha um pedido (id ou código)",
          security: [{ apiKey: ["pedidos:ler"] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: listResponse("Pedido"), 404: errorResponse, ...common },
        },
        patch: {
          summary: "Atualiza a situação do pedido",
          security: [{ apiKey: ["pedidos:escrever"] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: { status: { type: "string" }, cancel_reason: { type: "string" } },
                },
              },
            },
          },
          responses: { 200: listResponse("Pedido atualizado"), 400: errorResponse, ...common },
        },
      },
      "/pagamentos": {
        get: {
          summary: "Lista pagamentos",
          security: [{ apiKey: ["pagamentos:ler"] }],
          parameters: [...pagination, { name: "status", in: "query", schema: { type: "string" } }],
          responses: { 200: listResponse("Pagamentos"), ...common },
        },
      },
      "/entregas": {
        get: {
          summary: "Lista entregas",
          security: [{ apiKey: ["entregas:ler"] }],
          parameters: [...pagination, { name: "status", in: "query", schema: { type: "string" } }],
          responses: { 200: listResponse("Entregas"), ...common },
        },
      },
      "/mesas": {
        get: {
          summary: "Lista mesas do salão",
          security: [{ apiKey: ["mesas:ler"] }],
          parameters: pagination,
          responses: { 200: listResponse("Mesas"), ...common },
        },
      },
      "/estoque": {
        get: {
          summary: "Posição de estoque",
          security: [{ apiKey: ["estoque:ler"] }],
          parameters: pagination,
          responses: { 200: listResponse("Estoque"), ...common },
        },
      },
      "/estoque/movimentos": {
        get: {
          summary: "Movimentações de estoque",
          security: [{ apiKey: ["estoque:ler"] }],
          parameters: pagination,
          responses: { 200: listResponse("Movimentações"), ...common },
        },
        post: {
          summary: "Lança uma movimentação de estoque",
          security: [{ apiKey: ["estoque:escrever"] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["product_id", "quantity"],
                  properties: {
                    product_id: { type: "string", format: "uuid" },
                    quantity: {
                      type: "number",
                      description: "Positivo para entrada, negativo para saída.",
                    },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: listResponse("Movimentação criada"), 404: errorResponse, ...common },
        },
      },
      "/cupons": {
        get: {
          summary: "Lista cupons",
          security: [{ apiKey: ["cupons:ler"] }],
          parameters: [
            ...pagination,
            { name: "is_active", in: "query", schema: { type: "boolean" } },
          ],
          responses: { 200: listResponse("Cupons"), ...common },
        },
      },
      "/webhooks": {
        get: {
          summary: "Lista webhooks de saída",
          security: [{ apiKey: ["webhooks:gerenciar"] }],
          responses: { 200: listResponse("Webhooks"), ...common },
        },
        post: {
          summary: "Cadastra um webhook assinado",
          description:
            "As entregas são assinadas em x-seupedido-signature no formato t=<timestamp>,v1=<HMAC-SHA256 de `${timestamp}.${corpo}`>. O segredo é devolvido apenas na criação.",
          security: [{ apiKey: ["webhooks:gerenciar"] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    description: { type: "string" },
                    events: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { 201: listResponse("Webhook criado"), 400: errorResponse, ...common },
        },
      },
      "/webhooks/{id}": {
        delete: {
          summary: "Remove um webhook",
          security: [{ apiKey: ["webhooks:gerenciar"] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { 204: { description: "Removido" }, ...common },
        },
      },
    },
  };
}

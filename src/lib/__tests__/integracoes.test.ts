import { describe, expect, it } from "vitest";

import {
  API_SCOPES,
  CONNECTORS,
  CONNECTOR_BY_KIND,
  OUTBOUND_EVENTS,
  RETRY_BACKOFF_SECONDS,
  nextRetryDelay,
  webhookUrl,
} from "@/lib/integrations/catalog";
import { openApiDocument } from "@/lib/api/openapi";

describe("catálogo de conectores", () => {
  it("cobre os conectores pedidos pela operação", () => {
    for (const kind of [
      "whatsapp",
      "mercadopago",
      "pagseguro",
      "asaas",
      "ifood",
      "hotmart",
      "maps",
      "fiscal",
      "email",
      "push",
      "analytics",
    ]) {
      expect(CONNECTOR_BY_KIND[kind], kind).toBeDefined();
    }
  });

  it("todo conector tem instruções e plano de contingência", () => {
    for (const connector of CONNECTORS) {
      expect(connector.instructions.length).toBeGreaterThan(0);
      expect(connector.fallback.length).toBeGreaterThan(0);
    }
  });

  it("conectores com webhook declaram eventos de entrada", () => {
    for (const connector of CONNECTORS.filter((item) => item.hasWebhook)) {
      expect(connector.inboundEvents.length, connector.kind).toBeGreaterThan(0);
    }
  });

  it("monta o endereço do webhook de entrada", () => {
    expect(webhookUrl("https://loja.com.br", "asaas", "abc")).toBe(
      "https://loja.com.br/api/public/integracoes/asaas/abc",
    );
  });
});

describe("fila de retentativas", () => {
  it("usa recuo exponencial crescente", () => {
    for (let index = 1; index < RETRY_BACKOFF_SECONDS.length; index += 1) {
      expect(RETRY_BACKOFF_SECONDS[index]!).toBeGreaterThan(RETRY_BACKOFF_SECONDS[index - 1]!);
    }
  });

  it("agenda as primeiras tentativas e para no limite", () => {
    expect(nextRetryDelay(0)).toBe(30);
    expect(nextRetryDelay(2)).toBe(600);
    expect(nextRetryDelay(RETRY_BACKOFF_SECONDS.length)).toBeNull();
  });
});

describe("documentação da API", () => {
  const document = openApiDocument("https://loja.com.br") as {
    paths: Record<string, Record<string, { security?: { apiKey: string[] }[] }>>;
    servers: { url: string }[];
  };

  it("publica os recursos essenciais", () => {
    for (const path of [
      "/lojas",
      "/catalogo/produtos",
      "/clientes",
      "/pedidos",
      "/pagamentos",
      "/entregas",
      "/mesas",
      "/estoque",
      "/cupons",
      "/webhooks",
    ]) {
      expect(document.paths[path], path).toBeDefined();
    }
  });

  it("aponta para a base pública versionada", () => {
    expect(document.servers[0]?.url).toBe("https://loja.com.br/api/public/v1");
  });

  it("só usa escopos declarados no catálogo", () => {
    const known = new Set<string>(API_SCOPES.map((scope) => scope.key));
    for (const operations of Object.values(document.paths)) {
      for (const operation of Object.values(operations)) {
        for (const scope of operation.security?.[0]?.apiKey ?? []) {
          expect(known.has(scope), scope).toBe(true);
        }
      }
    }
  });
});

describe("eventos de saída", () => {
  it("inclui os eventos de pedido e pagamento", () => {
    expect(OUTBOUND_EVENTS).toContain("pedido.criado");
    expect(OUTBOUND_EVENTS).toContain("pagamento.confirmado");
  });
});

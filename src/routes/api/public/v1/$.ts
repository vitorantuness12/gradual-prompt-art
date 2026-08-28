import { createFileRoute } from "@tanstack/react-router";

/**
 * API pública versionada — endereço canônico para chamadas externas.
 * Autenticação por chave de API com escopos; nunca depende da sessão do site.
 */
export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, params._splat ?? ""),
      POST: async ({ request, params }) => handle(request, params._splat ?? ""),
      PATCH: async ({ request, params }) => handle(request, params._splat ?? ""),
      DELETE: async ({ request, params }) => handle(request, params._splat ?? ""),
      OPTIONS: async ({ request, params }) => handle(request, params._splat ?? ""),
    },
  },
});

async function handle(request: Request, splat: string): Promise<Response> {
  const { handleApiV1 } = await import("@/lib/api/v1.server");
  return handleApiV1(request, splat);
}

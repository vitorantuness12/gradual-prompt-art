import { createFileRoute } from "@tanstack/react-router";

/**
 * Alias amigável /api/v1/* para o mesmo roteador da API pública.
 * Em sites publicados com acesso restrito, use /api/public/v1/*.
 */
export const Route = createFileRoute("/api/v1/$")({
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

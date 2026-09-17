import { createFileRoute } from "@tanstack/react-router";

import { getStorePwaBranding } from "@/lib/store-pwa.server";

export const Route = createFileRoute("/api/public/store-icon/$slug/$kind")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (params.kind !== "any" && params.kind !== "maskable") {
          return new Response("Tipo de ícone inválido.", { status: 400 });
        }

        const store = await getStorePwaBranding(params.slug);
        if (!store) return new Response("Loja não encontrada.", { status: 404 });

        const source =
          params.kind === "maskable"
            ? (store.maskableIcon ?? store.icon)
            : store.icon;
        if (!source) {
          return Response.redirect(new URL("/store-app-fallback.png", request.url), 302);
        }

        try {
          const image = await fetch(source, { redirect: "follow" });
          if (!image.ok || !image.body) throw new Error("Imagem indisponível");
          return new Response(image.body, {
            headers: {
              "content-type": image.headers.get("content-type") ?? "image/webp",
              "cache-control": "no-cache, must-revalidate",
            },
          });
        } catch {
          return Response.redirect(new URL("/store-app-fallback.png", request.url), 302);
        }
      },
    },
  },
});
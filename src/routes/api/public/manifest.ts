import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import type { Database } from "@/integrations/supabase/types";

interface ManifestBranding {
  pwa_icon_url: string | null;
  pwa_maskable_icon_url: string | null;
  pwa_splash_url: string | null;
}

export const Route = createFileRoute("/api/public/manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const panel = url.searchParams.get("painel") === "1";
        const branding = await getBranding();
        const icon = branding?.pwa_icon_url ?? "/app-icon-512.png";
        const maskableIcon = branding?.pwa_maskable_icon_url ?? "/app-icon-maskable-512.png";
        const splash = branding?.pwa_splash_url;

        const manifest = {
          name: panel ? "Painel Pedi Um" : "Pedi Um",
          short_name: panel ? "Meu Painel" : "Pedi Um",
          description: panel
            ? "Gerencie pedidos, catálogo e vendas da sua loja."
            : "Peça na sua loja favorita, acompanhe o pedido em tempo real e repita compras anteriores.",
          lang: "pt-BR",
          dir: "ltr",
          id: panel ? "/painel/" : "/",
          start_url: panel ? "/painel/pedidos?origem=app" : "/?origem=app",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#ffffff",
          theme_color: panel ? "#dc2626" : "#f97316",
          categories: ["food", "shopping", "business"],
          icons: [
            { src: icon, sizes: "512x512", purpose: "any" },
            { src: maskableIcon, sizes: "512x512", purpose: "maskable" },
          ],
          screenshots: splash
            ? [{ src: splash, sizes: "1080x1920", form_factor: "narrow", label: "Tela de abertura do Pedi Um" }]
            : undefined,
          shortcuts: panel
            ? [
                { name: "Pedidos", url: "/painel/pedidos?origem=app" },
                { name: "PDV / Caixa", url: "/pdv?origem=app" },
                { name: "Metas do dia", url: "/painel/metas?origem=app" },
              ]
            : [
                { name: "Acompanhar pedido", short_name: "Acompanhar", url: "/acompanhar?origem=app" },
                { name: "Meus pedidos recentes", short_name: "Pedidos", url: "/acompanhar?origem=app&aba=recentes" },
              ],
        };

        return Response.json(manifest, {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300, must-revalidate",
          },
        });
      },
    },
  },
});

async function getBranding(): Promise<ManifestBranding | null> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !publishableKey) return null;

  const client = createClient<Database>(supabaseUrl, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client
    .from("platform_branding")
    .select("pwa_icon_url, pwa_maskable_icon_url, pwa_splash_url")
    .eq("key", "default")
    .maybeSingle();
  return data;
}
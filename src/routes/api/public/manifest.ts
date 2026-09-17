import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import type { Database } from "@/integrations/supabase/types";
import { getStorePwaBranding } from "@/lib/store-pwa.server";

interface ManifestBranding {
  pwa_icon_url: string | null;
  pwa_maskable_icon_url: string | null;
}

export const Route = createFileRoute("/api/public/manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const panel = url.searchParams.get("painel") === "1";
        const storeSlug = url.searchParams.get("loja")?.trim() || null;
        const branding = await getBranding();
        const store = storeSlug ? await getStorePwaBranding(storeSlug) : null;
        if (storeSlug && !store) {
          return Response.json(
            { error: "Loja não encontrada ou indisponível." },
            {
              status: 404,
              headers: { "cache-control": "no-store, max-age=0" },
            },
          );
        }
        const storeName = store?.name ?? null;
        const icon = storeSlug
          ? `/api/public/store-icon/${encodeURIComponent(storeSlug)}/any`
          : (branding?.pwa_icon_url ?? "/pedium-app-icon-512.png");
        const maskableIcon = storeSlug
          ? `/api/public/store-icon/${encodeURIComponent(storeSlug)}/maskable`
          : (branding?.pwa_maskable_icon_url ?? "/pedium-app-icon-maskable-512.png");
        const icons = store
          ? [
              {
                src: icon,
                sizes: store.hasDedicatedIcon ? "512x512" : "any",
                purpose: "any",
              },
              ...(store.maskableIcon || store.hasDedicatedIcon
                ? [{ src: maskableIcon, sizes: "512x512", purpose: "maskable" }]
                : []),
            ]
          : [
              { src: icon, sizes: "512x512", purpose: "any" },
              { src: maskableIcon, sizes: "512x512", purpose: "maskable" },
            ];

        const manifest = {
          name: panel ? "Painel Pedi Um" : (storeName ?? "Pedi Um"),
          short_name: panel ? "Meu Painel" : (storeName ?? "Pedi Um"),
          description:
            panel || !storeSlug
              ? "Tudo pra vender. Tudo em um."
              : "Peça na sua loja favorita, acompanhe o pedido em tempo real e repita compras anteriores.",
          lang: "pt-BR",
          dir: "ltr",
          // O ID usa o UUID imutável para preservar a instalação se o slug da loja mudar.
          id: panel ? "/apps/lojista" : store ? `/apps/loja/${store.id}` : "/",
          start_url:
            panel || !storeSlug
              ? "/auth?modo=entrar&perfil=lojista&origem=app&redirect=%2Fpainel%2Fpedidos"
              : `/${storeSlug}?origem=app`,
          scope: storeSlug ? `/${storeSlug}` : "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#030303",
          theme_color: store?.primary ?? "#dc2626",
          categories: ["food", "shopping", "business"],
          icons,
          shortcuts: panel
            ? [
                {
                  name: "Pedidos",
                  url: "/auth?modo=entrar&perfil=lojista&origem=app&redirect=%2Fpainel%2Fpedidos",
                },
                {
                  name: "Financeiro",
                  url: "/auth?modo=entrar&perfil=lojista&origem=app&redirect=%2Fpainel%2Fpagamentos",
                },
                {
                  name: "Clientes",
                  url: "/auth?modo=entrar&perfil=lojista&origem=app&redirect=%2Fpainel%2Fclientes",
                },
              ]
            : storeSlug
              ? [
                  { name: "Abrir loja", short_name: "Loja", url: `/${storeSlug}?origem=app` },
                  {
                    name: "Acompanhar pedido",
                    short_name: "Pedidos",
                    url: `/${storeSlug}/acompanhar?origem=app`,
                  },
                  {
                    name: "Ver carrinho",
                    short_name: "Carrinho",
                    url: `/${storeSlug}/carrinho?origem=app`,
                  },
                ]
              : [
                  {
                    name: "Acompanhar pedido",
                    short_name: "Acompanhar",
                    url: "/acompanhar?origem=app",
                  },
                  {
                    name: "Meus pedidos recentes",
                    short_name: "Pedidos",
                    url: "/acompanhar?origem=app&aba=recentes",
                  },
                ],
        };

        return Response.json(manifest, {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "no-store, max-age=0",
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
    .select("pwa_icon_url, pwa_maskable_icon_url")
    .eq("key", "default")
    .maybeSingle();
  return data;
}


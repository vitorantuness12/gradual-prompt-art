import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import type { Database } from "@/integrations/supabase/types";

interface ManifestBranding {
  pwa_icon_url: string | null;
  pwa_maskable_icon_url: string | null;
}

interface StoreManifestBranding {
  id: string;
  name: string;
  primary: string | null;
  icon: string | null;
  maskableIcon: string | null;
}

export const Route = createFileRoute("/api/public/manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const panel = url.searchParams.get("painel") === "1";
        const storeSlug = url.searchParams.get("loja")?.trim() || null;
        const branding = await getBranding();
        const store = storeSlug ? await getStoreBranding(storeSlug) : null;
        const storeName = store?.name ?? null;
        const icon = store?.icon ?? branding?.pwa_icon_url ?? "/pedium-app-icon-512.png";
        const maskableIcon =
          store?.maskableIcon ??
          store?.icon ??
          branding?.pwa_maskable_icon_url ??
          "/pedium-app-icon-maskable-512.png";

        const manifest = {
          name: panel ? "Painel Pedi Um" : (storeName ?? "Pedi Um"),
          short_name: panel ? "Meu Painel" : (storeName ?? "Pedi Um"),
          description:
            panel || !storeSlug
              ? "Tudo pra vender. Tudo em um."
              : "Peça na sua loja favorita, acompanhe o pedido em tempo real e repita compras anteriores.",
          lang: "pt-BR",
          dir: "ltr",
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
          icons: [
            { src: icon, sizes: "512x512", purpose: "any" },
            { src: maskableIcon, sizes: "512x512", purpose: "maskable" },
          ],
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
    .select("pwa_icon_url, pwa_maskable_icon_url")
    .eq("key", "default")
    .maybeSingle();
  return data;
}

async function getStoreBranding(slug: string): Promise<StoreManifestBranding | null> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !publishableKey) return null;

  const client = createClient<Database>(supabaseUrl, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client
    .from("stores")
    .select("id, name, logo_url, store_themes(published_config)")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return null;
  const relation = Array.isArray(data.store_themes) ? data.store_themes[0] : data.store_themes;
  const published = relation?.published_config;
  const config =
    published && typeof published === "object" && !Array.isArray(published)
      ? (published as Record<string, unknown>)
      : {};
  const brandingValue = config["branding"];
  const colorsValue = config["colors"];
  const themeBranding =
    brandingValue && typeof brandingValue === "object" && !Array.isArray(brandingValue)
      ? (brandingValue as Record<string, unknown>)
      : {};
  const themeColors =
    colorsValue && typeof colorsValue === "object" && !Array.isArray(colorsValue)
      ? (colorsValue as Record<string, unknown>)
      : {};
  const pwaName =
    typeof themeBranding["pwaName"] === "string" ? themeBranding["pwaName"].trim() : "";
  return {
    id: data.id,
    name: pwaName || data.name,
    primary: typeof themeColors["primary"] === "string" ? themeColors["primary"] : null,
    icon:
      typeof themeBranding["pwaIconUrl"] === "string"
        ? themeBranding["pwaIconUrl"]
        : typeof themeBranding["logoUrl"] === "string"
          ? themeBranding["logoUrl"]
          : data.logo_url,
    maskableIcon:
      typeof themeBranding["pwaMaskableIconUrl"] === "string"
        ? themeBranding["pwaMaskableIconUrl"]
        : null,
  };
}

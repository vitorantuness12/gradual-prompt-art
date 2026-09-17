import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { AppLaunchSplash } from "@/components/brand/AppLaunchSplash";
import { ConnectionBanner } from "@/components/app/ConnectionBanner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPlatformBranding, platformBrandingQueryKey } from "@/lib/platform-branding";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível carregar esta página
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado do nosso lado. Tente novamente ou volte para o início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Pedi Um | Loja, Pedidos e Gestão" },
      {
        name: "description",
        content:
          "Loja online, pedidos, PDV, estoque, clientes e gestão em um só lugar. Tudo pra vender. Tudo em um.",
      },
      { property: "og:title", content: "Pedi Um — Tudo pra vender. Tudo em um." },
      {
        property: "og:description",
        content:
          "Loja online, pedidos, PDV, estoque e gestão em uma única plataforma para o seu negócio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:site_name", content: "Pedi Um" },
      { name: "twitter:title", content: "Pedi Um — Tudo pra vender. Tudo em um." },
      {
        name: "twitter:description",
        content:
          "Loja online, pedidos, PDV, estoque e gestão em uma única plataforma para o seu negócio.",
      },
      { name: "application-name", content: "Pedi Um" },
      { name: "theme-color", content: "#f97316" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Pedi Um" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#conteudo-principal"
          className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100]"
        >
          Ir para o conteúdo
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  /**
   * Sincroniza permissões (plano, módulos, papéis) assim que a sessão muda,
   * para a interface refletir os módulos liberados sem recarregar a página.
   */
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event === "SIGNED_OUT") return;
      void queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeBrandingHead />
      <AppLaunchSplash />
      <ConnectionBanner />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <div id="conteudo-principal">
        <Outlet />
      </div>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}

function RuntimeBrandingHead() {
  const { data } = useQuery({
    queryKey: platformBrandingQueryKey,
    queryFn: fetchPlatformBranding,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const firstPathSegment = window.location.pathname.split("/").filter(Boolean)[0];
    const isStoreRoute = Boolean(
      firstPathSegment &&
      !["auth", "painel", "admin", "acompanhar", "minha-conta"].includes(firstPathSegment),
    );
    if (isStoreRoute && firstPathSegment) {
      const controller = new AbortController();
      void fetch(`/api/public/manifest?loja=${encodeURIComponent(firstPathSegment)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<{
            name?: unknown;
            theme_color?: unknown;
            icons?: Array<{ src?: unknown; purpose?: unknown }>;
          }>;
        })
        .then((manifest) => {
          if (!manifest) return;
          const iconValue = manifest.icons?.find(
            (icon) => icon.purpose === "any" && typeof icon.src === "string" && icon.src.length > 0,
          )?.src;
          const appIcon = typeof iconValue === "string" ? iconValue : null;
          if (appIcon) {
            document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
              link.href = appIcon;
            });
            const appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
            if (appleTouchIcon) appleTouchIcon.href = appIcon;
          }
          if (typeof manifest.name === "string" && manifest.name.trim()) {
            document.querySelectorAll<HTMLMetaElement>(
              'meta[name="application-name"], meta[name="apple-mobile-web-app-title"]',
            ).forEach((meta) => {
              meta.content = manifest.name as string;
            });
          }
          if (typeof manifest.theme_color === "string" && manifest.theme_color) {
            const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
            if (themeColor) themeColor.content = manifest.theme_color;
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.error("Não foi possível carregar a identidade do aplicativo da loja.", error);
          }
        });
      return () => controller.abort();
    }
    if (data?.faviconUrl) {
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
        link.href = data.faviconUrl ?? "/pedium-favicon.png";
      });
    }
    const appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleTouchIcon && (data?.pwaIconUrl || data?.faviconUrl)) {
      appleTouchIcon.href = data.pwaIconUrl ?? data.faviconUrl ?? "/pedium-apple-touch-icon.png";
    }
    if (data?.appCoverUrl) {
      const entries = [
        { selector: 'meta[property="og:image"]', attribute: "property", key: "og:image" },
        { selector: 'meta[name="twitter:image"]', attribute: "name", key: "twitter:image" },
      ];
      entries.forEach(({ selector, attribute, key }) => {
        let meta = document.head.querySelector<HTMLMetaElement>(selector);
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute(attribute, key);
          document.head.appendChild(meta);
        }
        meta.content = data.appCoverUrl ?? "";
      });
    }
    return undefined;
  }, [data?.appCoverUrl, data?.faviconUrl, data?.pwaIconUrl]);

  return null;
}

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";

/**
 * Convite para instalar o aplicativo da loja (PWA).
 *
 * No Android/Chrome usamos o evento beforeinstallprompt; no iOS mostramos as
 * instruções de "Adicionar à Tela de Início". Some quando o app já está
 * instalado ou quando a pessoa dispensa o convite.
 */
export function InstallAppBanner({
  storeName,
  storeSlug,
}: {
  storeName?: string;
  storeSlug?: string;
}) {
  const { canInstall, installed, isIos, install } = usePwaInstall();
  const [storeManifestReady, setStoreManifestReady] = useState(false);
  const dismissKey = `pedium:instalar-loja:${storeSlug ?? "geral"}`;
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(dismissKey) === "1",
  );
  useEffect(() => {
    if (!storeSlug) {
      setStoreManifestReady(false);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/public/manifest?loja=${encodeURIComponent(storeSlug)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => setStoreManifestReady(response.ok))
      .catch(() => setStoreManifestReady(false));
    return () => controller.abort();
  }, [storeSlug]);

  const visible = storeManifestReady && !installed && !dismissed && (canInstall || isIos);

  if (!visible) return null;

  function dismiss() {
    window.localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-secondary/40 p-4">
      <div className="flex items-start gap-3">
        {isIos ? (
          <Share className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        ) : (
          <Download className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        )}
        <div>
          <p className="text-sm font-medium">
            Instale o app {storeName ? `da ${storeName}` : "de pedidos"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isIos
              ? "No iPhone: toque em Compartilhar e escolha Adicionar à Tela de Início."
              : "Acesse o catálogo, o carrinho e o acompanhamento direto da tela inicial do celular."}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {!isIos ? <Button onClick={() => void install()}>Instalar</Button> : null}
        <Button
          size="icon"
          variant="ghost"
          onClick={dismiss}
          aria-label="Dispensar convite de instalação"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

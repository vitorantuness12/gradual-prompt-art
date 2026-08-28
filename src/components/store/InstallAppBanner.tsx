import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Convite para instalar o aplicativo da loja (PWA).
 *
 * No Android/Chrome usamos o evento beforeinstallprompt; no iOS mostramos as
 * instruções de "Adicionar à Tela de Início". Some quando o app já está
 * instalado ou quando a pessoa dispensa o convite.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "seupedido:instalar-dispensado";

export function InstallAppBanner({ storeName }: { storeName?: string }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-secondary/40 p-4">
      <div className="flex items-start gap-3">
        {iosHint ? (
          <Share className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        ) : (
          <Download className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        )}
        <div>
          <p className="text-sm font-medium">
            Instale o app {storeName ? `da ${storeName}` : "de pedidos"}
          </p>
          <p className="text-sm text-muted-foreground">
            {iosHint
              ? "No iPhone: toque em Compartilhar e escolha Adicionar à Tela de Início."
              : "Acesse o catálogo, o carrinho e o acompanhamento direto da tela inicial do celular."}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {!iosHint ? (
          <Button size="sm" onClick={install}>
            Instalar
          </Button>
        ) : null}
        <Button
          size="sm"
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

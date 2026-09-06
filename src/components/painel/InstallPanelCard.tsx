import { Bell, Download, Share, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { NEW_ORDER_SOUND_KEY, playNewOrderChime } from "@/hooks/useNewOrderAlert";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Convida o lojista a instalar o painel no celular e liga o aviso sonoro de
 * pedido novo. O som fica guardado como preferência do aparelho.
 */
export function InstallPanelCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSoundOn(window.localStorage.getItem(NEW_ORDER_SOUND_KEY) !== "0");
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    setIosHint(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    const handler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function toggleSound(checked: boolean) {
    setSoundOn(checked);
    window.localStorage.setItem(NEW_ORDER_SOUND_KEY, checked ? "1" : "0");
    if (checked) {
      void playNewOrderChime();
      void Notification.requestPermission?.();
    }
  }

  async function install() {
    if (!promptEvent) {
      toast.info("Use o menu do navegador e escolha “Instalar aplicativo”.");
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="size-4" aria-hidden="true" />
          Aplicativo no celular
        </CardTitle>
        <CardDescription>
          Instale o painel na tela inicial e ouça um aviso sonoro sempre que um pedido novo entrar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 size-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Aviso sonoro de pedido novo</p>
              <p className="text-sm text-muted-foreground">
                Toca enquanto o painel estiver aberto, inclusive no celular.
              </p>
            </div>
          </div>
          <Switch checked={soundOn} onCheckedChange={toggleSound} aria-label="Aviso sonoro de pedido novo" />
        </div>

        {installed ? (
          <p className="text-sm text-muted-foreground">O aplicativo já está instalado neste aparelho.</p>
        ) : iosHint ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Share className="mt-0.5 size-4 text-primary" aria-hidden="true" />
            No iPhone: toque em Compartilhar e escolha “Adicionar à Tela de Início”.
          </p>
        ) : (
          <Button variant="outline" onClick={install}>
            <Download className="mr-2 size-4" aria-hidden="true" />
            Instalar no celular
          </Button>
        )}

        <Button variant="ghost" size="sm" onClick={() => void playNewOrderChime()}>
          Ouvir o aviso
        </Button>
      </CardContent>
    </Card>
  );
}

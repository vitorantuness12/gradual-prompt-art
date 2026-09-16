import { Bell, Download, Share, Smartphone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { NEW_ORDER_SOUND_KEY, playNewOrderChime } from "@/hooks/useNewOrderAlert";
import { fetchPlatformBranding, platformBrandingQueryKey } from "@/lib/platform-branding";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export function InstallPanelCard() {
  const { data: branding } = useQuery({ queryKey: platformBrandingQueryKey, queryFn: fetchPlatformBranding, staleTime: 5 * 60_000 });
  const { canInstall, installed, isIos: iosHint, install: promptInstall } = usePwaInstall();
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSoundOn(window.localStorage.getItem(NEW_ORDER_SOUND_KEY) !== "0");
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
    if (!canInstall) {
      toast.info("Use o menu do navegador e escolha “Instalar aplicativo”.");
      return;
    }
    await promptInstall();
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
        {branding?.appCoverUrl ? (
          <img
            src={branding.appCoverUrl}
            alt="Capa do aplicativo Pedi Um"
            className="aspect-video w-full rounded-md border border-border object-cover"
            loading="lazy"
          />
        ) : null}
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

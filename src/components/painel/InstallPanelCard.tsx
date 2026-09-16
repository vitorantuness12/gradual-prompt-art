import { Bell, Download, Share, Smartphone, Volume2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  NEW_ORDER_SOUND_KEY,
  NEW_ORDER_VOLUME_KEY,
  playNewOrderChime,
  refreshNewOrderAlertSound,
} from "@/hooks/useNewOrderAlert";
import { fetchPlatformBranding, platformBrandingQueryKey } from "@/lib/platform-branding";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export function InstallPanelCard() {
  const { data: branding } = useQuery({ queryKey: platformBrandingQueryKey, queryFn: fetchPlatformBranding, staleTime: 5 * 60_000 });
  const { canInstall, installed, isIos: iosHint, install: promptInstall } = usePwaInstall();
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(70);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSoundOn(window.localStorage.getItem(NEW_ORDER_SOUND_KEY) !== "0");
    const rawVolume = window.localStorage.getItem(NEW_ORDER_VOLUME_KEY);
    const storedVolume = rawVolume === null ? Number.NaN : Number(rawVolume);
    if (Number.isFinite(storedVolume)) setVolume(Math.min(100, Math.max(0, storedVolume)));
  }, []);

  function toggleSound(checked: boolean) {
    setSoundOn(checked);
    window.localStorage.setItem(NEW_ORDER_SOUND_KEY, checked ? "1" : "0");
    refreshNewOrderAlertSound();
    if (checked) {
      void playNewOrderChime();
      void Notification.requestPermission?.();
    }
  }

  function changeVolume(values: number[]) {
    const nextVolume = values[0] ?? 70;
    setVolume(nextVolume);
    window.localStorage.setItem(NEW_ORDER_VOLUME_KEY, String(nextVolume));
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
                Repete até o pedido ser aceito ou recusado.
              </p>
            </div>
          </div>
          <Switch checked={soundOn} onCheckedChange={toggleSound} aria-label="Aviso sonoro de pedido novo" />
        </div>

        <div className="space-y-3 rounded-xl border border-border/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Volume2 className="size-4 text-primary" aria-hidden="true" />
              Volume do aviso
            </p>
            <span className="text-sm tabular-nums text-muted-foreground">{volume}%</span>
          </div>
          <Slider
            value={[volume]}
            min={0}
            max={100}
            step={5}
            disabled={!soundOn}
            onValueChange={changeVolume}
            onValueCommit={() => void playNewOrderChime()}
            aria-label="Volume do aviso de pedido novo"
          />
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

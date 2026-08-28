import { useCallback, useEffect, useState } from "react";

/**
 * Modo de tela exclusiva do PDV e do KDS.
 *
 * - Marca o documento para que nenhum menu do painel apareche por cima.
 * - Oferece fullscreen real quando o navegador permite, mas continua
 *   funcionando normalmente quando a permissão é negada.
 * - Trata Esc como "pedido de saída": a confirmação é decidida por quem usa o
 *   hook, então nunca fecha uma venda por acidente.
 */
export interface ExclusiveShell {
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  toggleFullscreen: () => void;
  requestExit: () => void;
}

export function useExclusiveShell(options: { onRequestExit: () => void }): ExclusiveShell {
  const { onRequestExit } = options;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);

  // Marca o body: o layout do painel não é montado nestas rotas, mas a marca
  // garante que overlays globais e a rolagem de fundo fiquem desativados.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const { body, documentElement } = document;
    body.dataset["exclusiveShell"] = "true";
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    setFullscreenSupported(typeof documentElement.requestFullscreen === "function");
    return () => {
      delete body.dataset["exclusiveShell"];
      body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    handler();
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    const target = document.documentElement;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => setIsFullscreen(false));
      return;
    }
    if (typeof target.requestFullscreen !== "function") return;
    // Sem permissão o app segue igual, apenas sem tela cheia do navegador.
    void target.requestFullscreen().catch(() => setIsFullscreen(false));
  }, []);

  const requestExit = useCallback(() => {
    onRequestExit();
  }, [onRequestExit]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Se há um diálogo aberto, o Esc pertence a ele.
      const hasOverlay = document.querySelector("[data-slot='dialog-content'],[role='dialog'],[data-radix-popper-content-wrapper]");
      if (hasOverlay) return;
      event.preventDefault();
      onRequestExit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onRequestExit]);

  return { isFullscreen, fullscreenSupported, toggleFullscreen, requestExit };
}

/** Indicador simples de conexão, usado no topo do PDV e do KDS. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/** Relógio que atualiza a cada segundo (cronômetros do KDS e horário do topo). */
export function useTicker(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

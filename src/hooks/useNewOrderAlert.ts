import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/** Preferência de som guardada no aparelho do lojista. */
export const NEW_ORDER_SOUND_KEY = "seupedido:som-pedido-novo";

/**
 * Toca um aviso curto usando a própria API de áudio do navegador — assim não
 * dependemos de arquivo de som e o aviso funciona também com o app instalado.
 */
export async function playNewOrderChime(): Promise<void> {
  if (typeof window === "undefined") return;
  const AudioCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;

  try {
    const context = new AudioCtor();
    // Alguns navegadores só liberam o áudio depois de um toque na tela.
    if (context.state === "suspended") await context.resume();

    const start = context.currentTime;
    [880, 1180].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const from = start + index * 0.22;
      gain.gain.setValueAtTime(0.0001, from);
      gain.gain.exponentialRampToValueAtTime(0.25, from + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, from + 0.2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(from);
      oscillator.stop(from + 0.22);
    });

    window.setTimeout(() => void context.close(), 900);
  } catch {
    // Sem áudio disponível: o aviso visual já foi mostrado.
  }
}

function soundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NEW_ORDER_SOUND_KEY) !== "0";
}

/**
 * Avisa o lojista quando um pedido novo entra: som, aviso na tela e
 * notificação do sistema quando o painel está em segundo plano.
 */
export function useNewOrderAlert(storeId: string | undefined, onNewOrder?: () => void) {
  const callbackRef = useRef(onNewOrder);
  callbackRef.current = onNewOrder;

  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel(`novos-pedidos-${storeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const order = payload.new as { code?: string; customer_name?: string; total?: number };
          const label = order.code ? `Pedido #${order.code}` : "Pedido novo";

          toast.success(`${label} recebido`, {
            description: order.customer_name ? `Cliente: ${order.customer_name}` : undefined,
          });

          if (soundEnabled()) void playNewOrderChime();

          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            new Notification(`${label} recebido`, {
              body: order.customer_name ? `Cliente: ${order.customer_name}` : "Abra o painel para preparar.",
              icon: "/app-icon-192.png",
              tag: `pedido-${order.code ?? Date.now()}`,
            });
          }

          callbackRef.current?.();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId]);
}

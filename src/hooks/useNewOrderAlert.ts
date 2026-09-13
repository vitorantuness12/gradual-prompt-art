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

interface CommerceAlertCallbacks {
  onOrder?: () => void;
  onAppointment?: () => void;
  onNotification?: () => void;
}

function announce(title: string, description: string | undefined, tag: string) {
  toast.success(title, { description });
  if (soundEnabled()) void playNewOrderChime();

  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    document.visibilityState !== "visible"
  ) {
    new Notification(title, {
      body: description ?? "Abra o painel para conferir.",
      icon: "/app-icon-192.png",
      tag,
    });
  }
}

/** Avisa imediatamente sobre pedidos, encomendas e agendamentos novos. */
export function useNewOrderAlert(storeId: string | undefined, callbacks: CommerceAlertCallbacks = {}) {
  const callbackRef = useRef(callbacks);
  callbackRef.current = callbacks;

  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel(`movimentos-loja-${storeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const order = payload.new as {
            code?: string;
            customer_name?: string;
            channel?: string;
            scheduled_for?: string | null;
          };
          // O agendamento gera um pedido financeiro e, logo depois, a marcação.
          // O aviso específico vem do INSERT em appointments para não tocar duas vezes.
          if (order.channel === "checkout_agendamento") return;
          const isPreorder = order.channel === "encomenda" || Boolean(order.scheduled_for);
          const kind = isPreorder ? "Nova encomenda" : "Novo pedido";
          announce(
            order.code ? `${kind} #${order.code}` : kind,
            order.customer_name ? `Cliente: ${order.customer_name}` : undefined,
            `${isPreorder ? "encomenda" : "pedido"}-${order.code ?? Date.now()}`,
          );
          callbackRef.current.onOrder?.();
          callbackRef.current.onNotification?.();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const appointment = payload.new as { id?: string; customer_name?: string; starts_at?: string };
          const when = appointment.starts_at ? new Date(appointment.starts_at).toLocaleString("pt-BR") : undefined;
          announce(
            "Novo agendamento recebido",
            [appointment.customer_name, when].filter(Boolean).join(" · ") || undefined,
            `agendamento-${appointment.id ?? Date.now()}`,
          );
          callbackRef.current.onAppointment?.();
          callbackRef.current.onNotification?.();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId]);
}

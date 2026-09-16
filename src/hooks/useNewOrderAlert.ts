import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/** Preferência de som guardada no aparelho do lojista. */
export const NEW_ORDER_SOUND_KEY = "seupedido:som-pedido-novo";
export const NEW_ORDER_VOLUME_KEY = "seupedido:volume-pedido-novo";

const DEFAULT_VOLUME = 70;
const ALERT_INTERVAL_MS = 2_400;
const activeOrderAlerts = new Set<string>();
let audioContext: AudioContext | null = null;
let alertTimer: number | null = null;

function savedVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const stored = Number(window.localStorage.getItem(NEW_ORDER_VOLUME_KEY));
  return Number.isFinite(stored) ? Math.min(100, Math.max(0, stored)) : DEFAULT_VOLUME;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext ??= new AudioCtor();
  return audioContext;
}

async function playAlertPattern(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") await context.resume();
    const volume = savedVolume() / 100;
    const start = context.currentTime;
    [784, 988, 1175].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const from = start + index * 0.16;
      oscillator.type = index === 2 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, from);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.24), from + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, from + 0.14);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(from);
      oscillator.stop(from + 0.16);
    });
  } catch {
    // Sem áudio disponível: o aviso visual continua funcionando.
  }
}

/**
 * Toca um aviso curto usando a própria API de áudio do navegador — assim não
 * dependemos de arquivo de som e o aviso funciona também com o app instalado.
 */
export async function playNewOrderChime(): Promise<void> {
  await playAlertPattern();
}

function beginOrderAlert(orderId: string): void {
  activeOrderAlerts.add(orderId);
  if (!soundEnabled() || alertTimer !== null) return;
  void playAlertPattern();
  alertTimer = window.setInterval(() => void playAlertPattern(), ALERT_INTERVAL_MS);
}

export function acknowledgeNewOrderAlert(orderId?: string): void {
  if (orderId) activeOrderAlerts.delete(orderId);
  else activeOrderAlerts.clear();
  if (activeOrderAlerts.size > 0 || alertTimer === null) return;
  window.clearInterval(alertTimer);
  alertTimer = null;
}

export function refreshNewOrderAlertSound(): void {
  if (!soundEnabled()) acknowledgeNewOrderAlert();
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

function announce(title: string, description: string | undefined, tag: string, repeat = false) {
  toast.success(title, { description });
  if (soundEnabled()) {
    if (repeat) beginOrderAlert(tag);
    else void playNewOrderChime();
  }

  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    document.visibilityState !== "visible"
  ) {
    new Notification(title, {
      body: description ?? "Abra o painel para conferir.",
      icon: "/pedium-app-icon-192.png",
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
            id?: string;
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
            order.id ?? `${isPreorder ? "encomenda" : "pedido"}-${order.code ?? Date.now()}`,
            true,
          );
          callbackRef.current.onOrder?.();
          callbackRef.current.onNotification?.();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const order = payload.new as { id?: string; status?: string };
          if (order.id && ["confirmed", "rejected", "cancelled"].includes(order.status ?? "")) {
            acknowledgeNewOrderAlert(order.id);
          }
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
      acknowledgeNewOrderAlert();
      void supabase.removeChannel(channel);
    };
  }, [storeId]);
}

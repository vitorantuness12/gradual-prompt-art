/** Utilitários de notificação no celular (Web Push) no lado do navegador. */

export const PUSH_SW_PATH = "/push-sw.js";

export type PushAudience = "lojista" | "entregador" | "cliente";

export type PushStatus = "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

function bufferToBase64Url(buffer: ArrayBuffer | null) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration() {
  return navigator.serviceWorker.register(PUSH_SW_PATH, { scope: "/" });
}

export async function currentPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH);
  const subscription = await existing?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

export async function currentEndpoint() {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH);
  const subscription = await existing?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

export interface EnablePushResult {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

/** Pede permissão, registra o worker de mensagens e devolve as chaves do aparelho. */
export async function enablePush(publicKey: string): Promise<EnablePushResult> {
  if (!pushSupported()) throw new Error("Este navegador não suporta notificações.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão negada. Libere as notificações nas configurações do navegador.");
  }

  const reg = await registration();
  await navigator.serviceWorker.ready;

  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = subscription.toJSON() as { keys?: { p256dh?: string; auth?: string } };

  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? bufferToBase64Url(subscription.getKey("p256dh")),
    auth: json.keys?.auth ?? bufferToBase64Url(subscription.getKey("auth")),
    userAgent: navigator.userAgent.slice(0, 400),
  };
}

/** Cancela a inscrição no aparelho atual. */
export async function disablePush(): Promise<string | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH);
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

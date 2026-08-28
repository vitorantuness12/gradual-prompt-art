/* Service worker de mensagens (Web Push) do O Seu Pedido.
   Não faz cache de páginas nem de assets: existe apenas para receber
   notificações em segundo plano, com o app fechado. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "O Seu Pedido", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "O Seu Pedido";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/app-icon-192.png",
    badge: "/app-icon-192.png",
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    requireInteraction: payload.urgent === true,
    vibrate: [180, 80, 180],
    data: { url: payload.url || "/painel" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/painel";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});

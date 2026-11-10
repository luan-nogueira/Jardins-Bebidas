self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// Sem handler de "fetch" de propósito: o antigo só repassava tudo pra rede
// (fetch(e.request)), o que não cacheava nada e ainda obrigava o navegador
// a acordar o service worker a cada requisição — deixando navegação e
// carregamento mais lentos, principalmente no celular. Sem o handler, as
// requisições vão direto pra rede e o app continua instalável.

// Toque na notificação de "pedido pronto": abre (ou traz pra frente) o app
// do garçom já na mesa do pedido.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/garcom";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (new URL(j.url).pathname.startsWith("/garcom") && "focus" in j) {
          if ("navigate" in j) j.navigate(url).catch(() => {});
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// Push vindo do servidor (/api/push): "Mesa 5 — pedido pronto!". Chega
// mesmo com o app fechado e o celular bloqueado.
self.addEventListener("push", (e) => {
  let aviso = {};
  try {
    aviso = e.data ? e.data.json() : {};
  } catch {
    aviso = { corpo: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(aviso.titulo || "Pedido pronto!", {
      body: aviso.corpo || "",
      tag: aviso.tag || undefined,
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 120, 300, 120, 300],
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      data: { url: aviso.url || "/garcom" },
    }),
  );
});

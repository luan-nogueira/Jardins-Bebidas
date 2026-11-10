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

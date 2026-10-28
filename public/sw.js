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

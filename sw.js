// HSK Verdelago — Service Worker
// Estratégia: cache only para o "app shell" (HTML, ícones, manifest).
// NUNCA caching de chamadas a graph.microsoft.com nem a login.microsoftonline.com.
// Tudo o que envolva sessão/auth/dados passa direto à rede.

const CACHE_NAME = 'hsk-verdelago-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

// Domínios que NUNCA devem ser cacheados (auth + dados)
const NEVER_CACHE_HOSTS = [
  'graph.microsoft.com',
  'login.microsoftonline.com',
  'login.live.com',
  'login.microsoft.com',
  'sharepoint.com',
  'blueandgreencorp.sharepoint.com'
];

// Install: pré-cache do shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: limpa caches antigas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: estratégia "stale-while-revalidate" para o shell, bypass total para o resto
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass total: auth, Graph, SharePoint, websockets, métodos não-GET
  if (req.method !== 'GET') return;
  if (NEVER_CACHE_HOSTS.some(h => url.hostname.endsWith(h))) return;
  // Bypass para tudo que não seja same-origin (ex.: CDNs que não estão no shell)
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate: serve do cache enquanto atualiza em background
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then(resp => {
        // Só cacheia respostas OK
        if (resp.ok && resp.type === 'basic') cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      // Se há cache, serve já; senão, espera pela rede
      return cached || networkPromise || new Response('Offline', { status: 503 });
    })
  );
});

// Mensagem para forçar update do service worker quando há nova versão
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

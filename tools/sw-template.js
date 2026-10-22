/* Recursos do aplicativo somente. PDFs pessoais ficam em cache local separado. */
const SHELL = 'multiversao-shell-__VERSION__';
const ASSETS = __ASSETS__;
const ROOT = new URL('./', self.location.href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(ASSETS.map(async asset => {
      const url = new URL(asset, ROOT).href;
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) throw new Error(`Recurso offline indisponível: ${asset}`);
      // Algumas hospedagens redirecionam index.html para /. Uma Response
      // marcada como redirected não pode responder a certas navegações offline.
      const headers = new Headers(response.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');
      const normalized = new Response(await response.arrayBuffer(), {
        status: response.status, statusText: response.statusText, headers
      });
      await cache.put(url, normalized);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('multiversao-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin) return;
  if (url.pathname.includes('/__local__/')) {
    // Nunca disponibilizar dados pessoais via rotas de rede ou navegação.
    event.respondWith(new Response('Não disponível', { status: 404 }));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const existing = await cache.match(request);
    if (existing) return existing;
    if (request.mode === 'navigate') {
      try { return await fetch(request); }
      catch {
        return await cache.match(new URL('index.html', ROOT).href)
          || new Response('Abra o app uma vez com internet para preparar o uso offline.', { status: 503 });
      }
    }
    return fetch(request);
  })());
});

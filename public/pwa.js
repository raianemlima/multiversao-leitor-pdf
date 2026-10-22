const ROOT = new URL('.', import.meta.url);
const DOC_CACHE = 'multiversao-leitura-v1';
const localUrl = name => new URL(`__local__/${name}`, ROOT).href;
let installPrompt = null;
let localAccess = false;
let offlineReady = false;
let statusCallback = () => {};

export function isPreview() {
  try {
    return window.top !== window.self || location.hostname === 'sites.pplx.app';
  } catch { return true; }
}

export function pwaStatus() {
  return { preview: isPreview(), localAccess, offlineReady, canInstall: !!installPrompt };
}

function notify(message) {
  statusCallback({ ...pwaStatus(), message });
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  notify('Instalação disponível');
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  notify('App instalado');
});

export async function initializePwa(callback) {
  statusCallback = callback;
  if (isPreview()) {
    notify('Prévia: instalação no endereço próprio');
    return;
  }
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    notify('Instalação requer HTTPS e navegador compatível');
    return;
  }
  try {
    await caches.open(DOC_CACHE);
    localAccess = true;
    notify('Preparando recursos offline…');
    await navigator.serviceWorker.register(new URL('sw.js', ROOT), { scope: ROOT.pathname });
    const registration = await navigator.serviceWorker.ready;
    if (registration.active) {
      offlineReady = true;
      notify('Pronto para usar offline');
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      offlineReady = true;
      notify('Pronto para usar offline');
    });
  } catch {
    notify('Offline indisponível neste navegador');
  }
}

export async function installPwa() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  notify(offlineReady ? 'Pronto para usar offline' : 'Instalação solicitada');
  return true;
}

function metadata(state) {
  return {
    version: 1,
    key: state.document.fingerprints[0],
    name: state.fileName,
    size: state.fileSize,
    page: state.page,
    revision: state.revision || Date.now(),
    pages: [...state.pages.entries()].map(([page, value]) => [page, { items: value.items }]),
    savedAt: new Date().toISOString()
  };
}

export async function storeReading(state, includeOriginal = false) {
  if (!localAccess || !state.document || !state.originalBytes) return false;
  try {
    const cache = await caches.open(DOC_CACHE);
    const meta = JSON.parse(JSON.stringify(metadata(state)));
    const fileUrl = localUrl(`pdf-${meta.key}`);
    if (includeOriginal || !(await cache.match(fileUrl))) {
      await cache.put(fileUrl, new Response(state.originalBytes.slice(), { headers: { 'Content-Type': 'application/pdf' } }));
    }
    const currentResponse = await cache.match(localUrl('active.json'));
    if (currentResponse) {
      const current = await currentResponse.json();
      if ((current.revision || 0) > meta.revision) return true;
    }
    await cache.put(localUrl('active.json'), new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
    for (const request of await cache.keys()) {
      if (request.url !== fileUrl && request.url !== localUrl('active.json')) await cache.delete(request);
    }
    return true;
  } catch { return false; }
}

export async function getStoredReading(readBytes = false) {
  if (!localAccess) return null;
  try {
    const cache = await caches.open(DOC_CACHE);
    const response = await cache.match(localUrl('active.json'));
    if (!response) return null;
    const data = await response.json();
    if (data.version !== 1 || !data.key || !Array.isArray(data.pages)) return null;
    const file = await cache.match(localUrl(`pdf-${data.key}`));
    if (!file) return null;
    if (readBytes) data.bytes = new Uint8Array(await file.arrayBuffer());
    return data;
  } catch { return null; }
}

export async function clearStoredReading() {
  if (!localAccess) return;
  await caches.delete(DOC_CACHE);
}

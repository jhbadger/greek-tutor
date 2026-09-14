/// <reference lib="webworker" />
export {};

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const MANIFEST = self.__WB_MANIFEST;

// Cache name is derived from the precache manifest (which vite-plugin-pwa
// gives a content-hash "revision" for every file, including non-fingerprinted
// ones like index.html) so any change to any precached file -- code or copy
// -- changes this app's own built sw.js bytes, which is what makes the
// browser's native update check notice there is something new at all.
function manifestHash(): string {
  const str = MANIFEST.map((e) => `${e.url}:${e.revision ?? ''}`)
    .sort()
    .join('|');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

const CACHE_NAME = `greek-practice-${manifestHash()}`;
const NAV_CACHE_KEY = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        MANIFEST.map(async (entry) => {
          const res = await fetch(entry.url, { cache: 'reload' });
          if (res.ok) await cache.put(entry.url, res);
        }),
      );
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate());
    return;
  }

  event.respondWith(handleAsset(req));
});

// Cache-first, always -- a slow network hangs a fetch, it doesn't reject it,
// so a network-first navigation fallback pays that latency on every launch
// instead of only on deploy day.
async function handleNavigate(): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(NAV_CACHE_KEY);
  if (cached) return cached;
  try {
    return await fetch(NAV_CACHE_KEY);
  } catch {
    return new Response('Offline and nothing cached yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function handleAsset(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

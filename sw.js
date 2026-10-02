// BijliHisaab service worker — the electricity app should work during the
// load-shedding. App shell: cache-first; JSON data: stale-while-revalidate so
// fresh tariff rates arrive in the background without blocking.

const VERSION = 'bh-v0.4.0';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './fonts/notonastaliq-arabic.woff2',
  './fonts/spacegrotesk-latin.woff2',
  './js/main.js',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/version.js',
  './js/tariff.js',
  './js/insights.js',
  './js/tracker.js',
  './js/appliances.js',
  './js/i18n.js',
  './js/chart.js',
  './js/views/bill.js',
  './js/views/track.js',
  './js/views/plan.js',
  './js/views/learn.js',
  './js/views/settings.js',
  './icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './manifest.webmanifest',
  './data/discos.json',
  './data/appliances.json',
  './data/learn.json',
  './data/tariffs/exwapda/index.json',
  './data/tariffs/exwapda/2026-10.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let Google Fonts pass through

  const isData = url.pathname.includes('/data/');
  if (isData) {
    // stale-while-revalidate: serve cached rates instantly, refresh behind.
    e.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(e.request, { ignoreSearch: true });
        const fresh = fetch(e.request, { cache: 'no-cache' }).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fresh;
      }),
    );
    return;
  }

  // App shell: network-first so deploys reach users, cache fallback offline.
  // cache:'no-cache' revalidates with the server (304 when unchanged) instead
  // of trusting the HTTP cache's max-age, so new deploys are seen instantly.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

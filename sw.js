// Service Worker - 分享本本 PWA
// App shell: cache-first | Navigations: network-first + offline fallback
// Google Fonts: network-first + cache fallback | Third-party CDN: never intercept
const CACHE_VERSION = 'fenxiang-benben-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
  './favicon.ico'
];

// ---------- install ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ---------- activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---------- helpers ----------
function isGoogleFonts(url) {
  return (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );
}

function isNavigation(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' &&
      request.headers.get('accept') &&
      request.headers.get('accept').includes('text/html'))
  );
}

// ---------- fetch ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Third-party CDN (Tailwind / Alpine / Phosphor 等)：完全不攔截
  if (url.origin !== self.location.origin && !isGoogleFonts(url)) {
    return;
  }

  // 2) Google Fonts：network-first + cache fallback
  if (isGoogleFonts(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            event.waitUntil(
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy))
            );
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3) 導航請求：network-first，離線 fallback 到 cached index.html（避免白屏）
  if (isNavigation(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(
              caches.open(CACHE_VERSION).then((c) => {
                c.put('./index.html', copy);
                return c.put('./', res.clone()).catch(() => {});
              })
            );
          }
          return res;
        })
        .catch(() =>
          caches
            .match('./index.html')
            .then((r) => r || caches.match('./'))
            .then(
              (r) =>
                r ||
                new Response(
                  '<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>離線</h1><p>請連上網路後重新開啟。</p></body></html>',
                  { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                )
            )
        )
    );
    return;
  }

  // 4) 其他 same-origin GET（CSS / JS / icons / manifest）：cache-first + 背景更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            event.waitUntil(
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy))
            );
          }
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

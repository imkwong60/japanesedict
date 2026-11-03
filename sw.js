/* multi-calc Service Worker v2
 * 目標：首次載入後離線仍可完整使用（Tailwind / Lucide / Inter 字型）
 */

const CACHE_VERSION = 'v2';
const PRECACHE = `multi-calc-${CACHE_VERSION}`;          // multi-calc-v2
const CDN_CACHE = 'multi-calc-cdn-v1';
const FONT_CACHE = 'multi-calc-fonts-v1';

// 白名單：activate 時只保留呢啲
const WHITELIST = [PRECACHE, CDN_CACHE, FONT_CACHE];

// ─── 核心殼層（請確認實際 HTML 檔名）───────────────────────────
// 目前附件叫 index.html.html，SW 原本寫 multi-calculator.html
// 建議統一改名為 calculator.html 後，下面兩行都用 calculator.html
const HTML_FILE = './calculator.html';   // ← 確認實際檔名後改呢度
const ASSETS = [
  './',
  HTML_FILE,
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ─── 判斷 helpers ────────────────────────────────────────────
function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isFontCss(url) {
  return url.hostname === 'fonts.googleapis.com';
}

function isFontFile(url) {
  return url.hostname === 'fonts.gstatic.com';
}

function isTailwind(url) {
  return url.hostname === 'cdn.tailwindcss.com';
}

function isLucide(url) {
  return url.hostname === 'unpkg.com' && url.pathname.includes('/lucide');
}

function isCdn(url) {
  // 其他第三方 CDN（預留）
  return (
    url.hostname.endsWith('cdn.jsdelivr.net') ||
    url.hostname.endsWith('unpkg.com') ||
    url.hostname.endsWith('cdnjs.cloudflare.com') ||
    url.hostname === 'cdn.tailwindcss.com'
  );
}

function isApi(url) {
  // 預留：唔攔截任何 API
  return (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/rest/') ||
    url.pathname.includes('/auth/')
  );
}

// ─── 通用 cache helpers ──────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      // 只 cache 成功的 response
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // 離線且無 cache → 回簡單 503，避免 unhandled rejection
    return new Response('Offline and not cached', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('Offline and not cached', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// stale-while-revalidate：即刻回 cache，背景更新
async function staleWhileRevalidate(request, cacheName, fixedKey) {
  const cache = await caches.open(cacheName);
  // 用固定 key 可以避免 CDN URL 參數浮動導致 cache 失效
  const cacheKey = fixedKey || request;

  const cached = await cache.match(cacheKey);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // 有 cache 就即刻回，同時背景 revalidate
  if (cached) {
    fetchPromise.catch(() => {}); // 唔要 unhandled
    return cached;
  }

  // 無 cache 就等 network
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;

  return new Response('Offline and not cached', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain' }
  });
}

// ─── Install ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // addAll 其中一個失敗會整組 fail，所以逐個加比較穩
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (e) {
            console.warn('[SW] precache failed:', url, e);
          }
        })
      );
      // skipWaiting 包喺 waitUntil 入面（同 boardgame 一致）
      await self.skipWaiting();
    })()
  );
});

// ─── Activate：清走非白名單 cache ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !WHITELIST.includes(key))
          .map((key) => {
            console.log('[SW] deleting old cache:', key);
            return caches.delete(key);
          })
      );
      await self.clients.claim();
    })()
  );
});

// ─── Fetch 分派 ──────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. 非 GET → 完全唔攔截
  if (request.method !== 'GET') {
    return;
  }

  // 2. API 請求 → 唔攔截（預留）
  if (isApi(url)) {
    return;
  }

  // 3. 導航請求（離線 fallback 到 precache HTML）
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // 先試 network
          const networkResponse = await fetch(request);
          // 成功就更新 precache
          const cache = await caches.open(PRECACHE);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (err) {
          // 離線 → 回 precache 的 HTML
          const cache = await caches.open(PRECACHE);
          const cached =
            (await cache.match(HTML_FILE)) ||
            (await cache.match('./')) ||
            (await cache.match(request));
          if (cached) return cached;
          return new Response('Offline – please reconnect', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
      })()
    );
    return;
  }

  // 4. Google Fonts CSS → network-first
  if (isFontCss(url)) {
    event.respondWith(networkFirst(request, FONT_CACHE));
    return;
  }

  // 5. Google Fonts 字型檔 → cache-first（幾乎 immutable）
  if (isFontFile(url)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // 6. Tailwind CDN → stale-while-revalidate + 固定 key
  if (isTailwind(url)) {
    // 固定 key，避免 CDN 版本/參數變動
    const fixedKey = 'https://cdn.tailwindcss.com/';
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE, fixedKey));
    return;
  }

  // 7. Lucide CDN → stale-while-revalidate
  if (isLucide(url)) {
    // 建議之後改成固定版本後，呢度可以用更精確的 fixedKey
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
    return;
  }

  // 8. 其他 CDN → network-first + cache
  if (isCdn(url)) {
    event.respondWith(networkFirst(request, CDN_CACHE));
    return;
  }

  // 9. same-origin 靜態資源 → cache-first + 更新
  if (isSameOrigin(url)) {
    event.respondWith(cacheFirst(request, PRECACHE));
    return;
  }

  // 10. 其餘第三方 → network-first（有 cache 就 fallback）
  event.respondWith(networkFirst(request, CDN_CACHE));
});

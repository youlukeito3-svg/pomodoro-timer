/**
 * オフライン動作のための Service Worker。
 *
 * データはすべて localStorage にあるので、資産さえキャッシュできれば
 * 圏外でも記録・閲覧が続けられる。
 *
 * 方針:
 *   - ハッシュ付きの静的資産と Tesseract の実行資産 → キャッシュ優先（内容が変わらない）
 *   - HTML やその他 → ネットワーク優先、失敗したらキャッシュ
 */

const CACHE = "kintore-rpg-v1";

// 内容がURLで一意に決まるもの。取得できたら永続的に使い回してよい。
const IMMUTABLE = [/\/_next\/static\//, /\/tesseract\//, /\/icons\//];

self.addEventListener("install", (event) => {
  // 新しい版をすぐ有効にする
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // 参照系のみ扱う。外部ドメイン（Gemini API）は素通しする。
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const immutable = IMMUTABLE.some((pattern) => pattern.test(url.pathname));

  event.respondWith(
    immutable ? cacheFirst(request) : networkFirst(request),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;

    // ページ遷移がオフラインで失敗した場合は、キャッシュ済みのトップを返す
    if (request.mode === "navigate") {
      const fallback = await cache.match(new URL("./", self.registration.scope).href);
      if (fallback) return fallback;
    }
    throw err;
  }
}

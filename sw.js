const CACHE_PREFIX = "ai-value-chain-shell-" + encodeURIComponent(self.registration.scope) + "-";
const CACHE_NAME = CACHE_PREFIX + "v5";
const APP_SHELL = [
  "./", "./index.html", "./styles.css", "./data.js", "./app.js?v=20261003-security",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-512-maskable.png", "./icons/apple-touch-icon.png",
];
const SHELL_URLS = new Set(APP_SHELL.map((file) => new URL(file, self.registration.scope).href));

function cacheable(response) {
  return response.ok && !response.redirected && response.type !== "opaque" &&
    !/(?:no-store|private)/i.test(response.headers.get("cache-control") || "");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of SHELL_URLS) {
      const response = await fetch(url, { credentials: "omit", redirect: "error", cache: "reload" });
      if (!cacheable(response)) throw new Error("Application shell cannot be cached");
      await cache.put(url, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME &&
      (key.startsWith(CACHE_PREFIX) || /^ai-value-chain-shell-v\d+$/.test(key)))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // APIs, unrelated apps, authenticated requests and query variants bypass caches.
  if (request.method !== "GET" || request.headers.has("authorization") ||
      !SHELL_URLS.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { credentials: "omit", redirect: "error" });
      if (cacheable(response)) {
        event.waitUntil(cache.put(request, response.clone()));
      } else {
        event.waitUntil(cache.delete(request));
      }
      return response;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});

const CACHE_NAME = "gym-denik-cache-v3";

// Skutečně statické soubory (mění se málokdy) - ty je bezpečné cachovat agresivněji
const STATIC_ASSETS = [
  "./js/chart.umd.min.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return STATIC_ASSETS.some((asset) => url.pathname.endsWith(asset.replace("./", "/")));
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // HTML, CSS a JS stránek appky: vždy jen síť (žádné cachování), ať se změny projeví okamžitě.
  // Pokud síť selže (offline), zkusíme aspoň cache jako záchrannou síť.
  if (!isStaticAsset(url)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Skutečně statické soubory: cache-first, na pozadí obnovit
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

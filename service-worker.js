const CACHE_NAME = "gym-denik-app-shell-v4";
const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./workout.html",
  "./calisthenics.html",
  "./diary.html",
  "./duels.html",
  "./settings.html",
  "./backup.html",
  "./css/style.css",
  "./js/chart.umd.min.js",
  "./js/storage.js",
  "./js/home.js",
  "./js/workout.js",
  "./js/calisthenics.js",
  "./js/diary.js",
  "./js/duels.js",
  "./js/settings.js",
  "./js/backup.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/beer-off.png",
  "./icons/beer-on.png",
  "./icons/smoke-off.png",
  "./icons/smoke-on.png"
];

const APP_SHELL_PATHS = new Set(
  APP_SHELL_ASSETS.map((asset) => new URL(asset, self.location.href).pathname)
);
const OFFLINE_FALLBACK = new URL("./index.html", self.location.href).href;

function isAppShellAsset(url) {
  return APP_SHELL_PATHS.has(url.pathname);
}

function isCacheable(response) {
  return response && response.ok;
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    APP_SHELL_ASSETS.map(async (asset) => {
      const request = new Request(new URL(asset, self.location.href), { cache: "reload" });
      const response = await fetch(request);
      if (!isCacheable(response)) {
        throw new Error(`Unable to precache ${request.url}: ${response.status}`);
      }
      await cache.put(request, response);
    })
  );
}

async function updateAppShellAsset(request) {
  let response;
  try {
    response = await fetch(request, { cache: "no-store" });
  } catch {
    // An offline refresh keeps the already cached app shell available.
    return;
  }

  if (!isCacheable(response)) return;

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function handleNavigation(request) {
  let response;
  try {
    response = await fetch(request, { cache: "no-store" });
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(OFFLINE_FALLBACK))
    );
  }

  if (isCacheable(response)) {
    const url = new URL(request.url);
    if (isAppShellAsset(url) && !url.search) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
  }
  return response;
}

async function handleAppShellAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (isCacheable(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function refreshCachedAppShellAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) await updateAppShellAsset(request);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isAppShellAsset(url)) {
    event.respondWith(handleAppShellAsset(request));
    event.waitUntil(refreshCachedAppShellAsset(request));
  }
});

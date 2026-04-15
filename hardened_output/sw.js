
const CACHE = "window-quote-pro-v9";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./maskable-512.png",
  "./assets/css/styles.css",
  "./assets/js/config.js",
  "./assets/js/state.js",
  "./assets/js/helpers.js",
  "./assets/js/ui.js",
  "./assets/js/subscription.js",
  "./assets/js/settings.js",
  "./assets/js/quote.js",
  "./assets/js/share.js",
  "./assets/js/onboarding.js",
  "./assets/js/jobs-core.js",
  "./assets/js/jobs-render.js",
  "./assets/js/jobs-payments.js",
  "./assets/js/pro.js",
  "./assets/js/pro-logo.js",
  "./assets/js/app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (
    url.origin.includes("supabase.co") ||
    url.origin.includes("esm.sh") ||
    url.protocol === "chrome-extension:"
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});

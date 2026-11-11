/*
 * Service Worker – Offline-Kopie der Seite, ohne alte Versionen festzuhalten.
 * Network-first für alles: online kommt immer der neueste Stand vom Server (no-cache = beim Server
 * nachfragen), offline die zuletzt gespeicherte Version. Gespeichert wird je Pfad ohne Query
 * (die Seite hängt ?v=<Zeit> an, damit Browser nichts Altes verwenden).
 * Neue Version: CACHE erhöhen – sie übernimmt sofort, die Seite lädt einmal neu (js/pwa.js).
 */
const CACHE = "ironman27-v12";
const CORE = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/data.js", "js/strava-data.js", "js/garmin-data.js", "js/prediction.js", "js/z2.js", "js/flex.js", "js/gym.js",
  "js/calendar.js", "js/weekly.js", "js/freshness.js", "js/phases.js", "js/charts.js", "js/metrics.js", "js/native.js", "js/app.js", "js/pwa.js",
  "data/prediction-history.json", "data/z2-metrics.json", "data/hr-sources.json",
  "icons/icon.svg", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
];

// Schlüssel im Cache: Pfad ohne Query; „…/“ = „…/index.html“
function keyOf(url) {
  const u = new URL(url, self.registration.scope);
  return u.origin + (u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(CORE.map((path) =>
    fetch(new Request(new URL(path, self.registration.scope), { cache: "reload" }))
      .then((res) => (res.ok ? cache.put(keyOf(res.url || path), res) : null))
      .catch(() => null)))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ironman27-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || (req.cache === "only-if-cached" && req.mode !== "same-origin")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // fremde Seiten nicht anfassen
  const key = keyOf(req.url);
  const net = req.mode === "navigate"
    ? fetch(url.href, { cache: "no-cache", credentials: "same-origin" })
    : fetch(new Request(req, { cache: "no-cache" }));
  event.respondWith(net.then((res) => {
    if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return res;
  }).catch(() => caches.open(CACHE).then((cache) => cache.match(key)
    // offline: gespeicherte Version; bei Seitenaufrufen notfalls die Startseite
    .then((hit) => hit || (req.mode === "navigate" ? cache.match(keyOf("./")) : undefined))
    .then((hit) => hit || Response.error()))));
});

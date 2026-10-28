/* Semainier : service worker (hors-ligne)
   - la page et ses dépendances sont mises en cache après la première visite
   - stratégie « stale-while-revalidate » : réponse immédiate depuis le cache, mise à jour en arrière-plan
   - le cache est versionné : changer VERSION pour forcer le renouvellement */
const VERSION = "semainier-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("semainier-") && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* La page envoie la liste de ses ressources (HTML, scripts CDN, feuilles de style) à mettre en cache */
self.addEventListener("message", event => {
  const data = event.data;
  if (!data || data.type !== "precache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(VERSION).then(cache => Promise.all(
      data.urls.filter(u => typeof u === "string" && /^https?:/.test(u)).slice(0, 30).map(async u => {
        try {
          const same = new URL(u).origin === self.location.origin;
          await cache.add(same ? u : new Request(u, { mode: "no-cors" }));
        } catch (e) { /* ressource indisponible : on continue */ }
      })
    ))
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || !/^https?:/.test(req.url)) return;
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: false });
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => null);
      if (cached) { network.catch(() => {}); return cached; }
      const res = await network;
      if (res) return res;
      /* hors-ligne et jamais vu : pour une navigation, on retombe sur la page en cache */
      if (req.mode === "navigate") {
        const keys = await cache.keys();
        const page = keys.find(k => new URL(k.url).origin === self.location.origin && /\.html?$|\/$/.test(new URL(k.url).pathname));
        if (page) return cache.match(page);
      }
      return new Response("Hors-ligne", { status: 503, statusText: "Hors-ligne", headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })
  );
});

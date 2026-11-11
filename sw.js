/* Schul-Hub Service Worker: offline nutzbar, Push-Meldungen anzeigen.
   Seiten werden zuerst aus dem Netz geladen (damit Updates sofort ankommen), offline aus dem Zwischenspeicher. */
const CACHE = 'schulhub-v2';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // einzeln laden, damit eine fehlende Datei die Installation nicht verhindert
    await Promise.all(CORE.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Worker, Supabase, CDNs: immer direkt
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(CACHE)).put('index.html', r.clone());
        return r;
      } catch (x) {
        return (await caches.match('index.html')) || (await caches.match('./')) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }
  // übrige eigene Dateien: sofort aus dem Speicher, im Hintergrund aktualisieren
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Schul-Hub', {
    body: d.body || 'Neue Änderung im Supplierplan',
    tag: d.tag || 'schulhub',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); return; }
    await self.clients.openWindow(target);
  })());
});

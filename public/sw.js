/* Service worker de Spaceship Commander.
 * - /api/*: nunca se toca (siempre red; la app ya tiene su propia lógica offline con localStorage).
 * - Navegación y módulos de /js/: red primero, con la copia en caché como respaldo sin conexión.
 *   Los módulos van juntos: si unos salieran de la caché y otros de la red, se mezclarían versiones.
 * - Resto (iconos, fuentes de Google): stale-while-revalidate.
 * Los módulos no van en PRECACHE: la página manda la lista de los que ha cargado (ver index.html).
 * Sube CACHE si cambias la lista de PRECACHE. */
const CACHE = 'commander-v5';
const PRECACHE = ['/', '/tailwind.css', '/js/main.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

const ownModule = (u) => { try { const x = new URL(u, location.href); return x.origin === location.origin && x.pathname.startsWith('/js/'); } catch { return false; } };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La primera visita carga los módulos antes de que este service worker controle la
// página, así que no pasan por aquí: la página manda sus URL y se guardan las que falten.
self.addEventListener('message', e => {
  const urls = (Array.isArray(e.data?.cache) ? e.data.cache : []).filter(ownModule);
  if (!urls.length) return;
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(urls.map(u => c.match(u).then(hit => hit || c.add(u))))).catch(() => {}));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  if (ownModule(req.url)) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); }
        return res;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(async c => {
      const cached = await c.match(req);
      const net = fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

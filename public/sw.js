/* Service worker de Spaceship Commander.
 * - /api/*: nunca se toca (siempre red; la app ya tiene su propia lógica offline con localStorage).
 * - Navegación: red primero, con la copia en caché como respaldo sin conexión.
 * - Resto (iconos, fuentes de Google): stale-while-revalidate.
 * Sube CACHE si cambias la lista de PRECACHE. */
const CACHE = 'commander-v4';
const PRECACHE = ['/', '/tailwind.css', '/missions.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

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

/**
 * Spaceship Commander — Worker
 *
 * Sirve public/ como sitio estático y expone /api/* para cuentas y partidas.
 * El servidor solo almacena: la economía se sigue calculando en el cliente.
 *
 * El acceso es por clave: cadenas aleatorias que se generan con
 * `npm run invite "Nombre"` y de las que aquí solo vive su SHA-256.
 */

const SESSION_COOKIE = 'sc_sess';
const SESSION_DAYS = 90;
const MAX_SAVE_BYTES = 1_000_000;
const KEY_MIN = 10;
const KEY_MAX = 200;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      console.error('api error', err);
      return json({ error: 'internal' }, 500);
    }
  },
};

/* ---------- utilidades ---------- */

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });

const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256 = async (text) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// Secure solo bajo https: en http://localhost el navegador rechazaría la cookie.
function cookie(name, value, { maxAge, secure }) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) bits.push('Secure');
  bits.push(`Max-Age=${maxAge}`);
  return bits.join('; ');
}

const clearCookie = (name, secure) => cookie(name, '', { maxAge: 0, secure });

/* ---------- sesión ---------- */

async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return (
    (await env.DB.prepare(
      `SELECT u.id, u.name
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?`
    )
      .bind(await sha256(token), Date.now())
      .first()) ?? null
  );
}

// Devuelve el token en claro, que solo viaja a la cookie.
async function createSession(env, userId) {
  const now = Date.now();
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sha256(token),
      userId,
      now,
      now + SESSION_DAYS * 86400000
    ),
  ]);
  return token;
}

/* ---------- router ---------- */

async function handleApi(request, env, url) {
  const path = url.pathname;
  const secure = url.protocol === 'https:';

  if (path === '/api/health') return json({ ok: true });

  if (path === '/api/me' && request.method === 'GET') {
    return json({ user: await currentUser(request, env) });
  }

  if (path === '/api/auth/key' && request.method === 'POST') {
    return loginWithKey(request, env, secure);
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE, secure) });
  }

  if (path === '/api/state') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (request.method === 'GET') return getState(env, user);
    if (request.method === 'PUT') return putState(request, env, user);
    return json({ error: 'method_not_allowed' }, 405);
  }

  return json({ error: 'not_found' }, 404);
}

/* ---------- acceso por clave ---------- */

async function loginWithKey(request, env, secure) {
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';

  // Mismo error para «mal formada» y «no existe»: nada que deducir desde fuera.
  const reject = () => json({ error: 'invalid_key' }, 401);
  if (key.length < KEY_MIN || key.length > KEY_MAX) return reject();

  // La clave tiene 256 bits de entropía, así que no hay nada que adivinar por
  // fuerza bruta y un SHA-256 basta: no necesitamos un hash lento (que además
  // no cabría en los 10 ms de CPU del plan gratis de Workers).
  const user = await env.DB.prepare('SELECT id, name FROM users WHERE key_hash = ?')
    .bind(await sha256(key))
    .first();
  if (!user) return reject();

  const token = await createSession(env, user.id);
  return json(
    { user: { id: user.id, name: user.name } },
    200,
    { 'set-cookie': cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure }) }
  );
}

/* ---------- partida ---------- */

async function getState(env, user) {
  const row = await env.DB.prepare('SELECT data, rev, updated_at AS updatedAt FROM saves WHERE user_id = ?')
    .bind(user.id)
    .first();
  if (!row) return json({ rev: 0, data: null });
  return json({ rev: row.rev, updatedAt: row.updatedAt, data: JSON.parse(row.data) });
}

async function putState(request, env, user) {
  const body = await request.json().catch(() => null);
  const rev = Number(body?.rev);
  if (!body?.data || !Number.isInteger(rev) || rev < 0) return json({ error: 'bad_request' }, 400);
  if (body.data.app !== 'spaceship-commander') return json({ error: 'bad_envelope' }, 400);

  const payload = JSON.stringify(body.data);
  if (payload.length > MAX_SAVE_BYTES) return json({ error: 'too_large' }, 413);

  const now = Date.now();

  // Escritura condicionada a `rev`: una sola sentencia, así que dos
  // dispositivos compitiendo no pueden pisarse — el segundo falla y recibe 409.
  const res =
    rev === 0
      ? await env.DB.prepare(
          `INSERT INTO saves (user_id, data, rev, updated_at) VALUES (?, ?, 1, ?)
           ON CONFLICT(user_id) DO NOTHING`
        )
          .bind(user.id, payload, now)
          .run()
      : await env.DB.prepare('UPDATE saves SET data = ?, rev = rev + 1, updated_at = ? WHERE user_id = ? AND rev = ?')
          .bind(payload, now, user.id, rev)
          .run();

  if (res.meta.changes === 1) return json({ rev: rev + 1, updatedAt: now });

  const cur = await env.DB.prepare('SELECT data, rev, updated_at AS updatedAt FROM saves WHERE user_id = ?')
    .bind(user.id)
    .first();
  return json(
    { error: 'conflict', rev: cur.rev, updatedAt: cur.updatedAt, data: JSON.parse(cur.data) },
    409
  );
}

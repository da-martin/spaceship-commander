/**
 * Spaceship Commander — Worker
 *
 * Sirve public/ como sitio estático y expone /api/* para cuentas y partidas.
 * El servidor solo almacena: la economía se sigue calculando en el cliente.
 *
 * El acceso es por usuario y contraseña, con registro abierto. Las contraseñas
 * se guardan con PBKDF2 (src/password.js) y los intentos se limitan en D1 antes
 * de hashear nada, para que nadie pueda gastarnos la CPU.
 */

import { hashPassword, verifyPassword } from './password.js';

const SESSION_COOKIE = 'sc_sess';
const SESSION_DAYS = 90;
const MAX_SAVE_BYTES = 1_000_000;
const NAME_MIN = 3;
const NAME_MAX = 24;
const LEGACY_NAME_MAX = 60;          // los nombres que daba invite.mjs
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const MIN = 60_000;

// Intentos por ventana. Los registros cuentan aunque el nombre esté cogido: así
// tampoco se puede usar el registro para sondear qué nombres existen.
const LIMITS = {
  loginUser: { max: 10, window: 15 * MIN },
  loginIp: { max: 30, window: 15 * MIN },
  signupIp: { max: 10, window: 60 * MIN },
};

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
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.pass_hash IS NOT NULL AS hasPassword
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`
  )
    .bind(await sha256(token), Date.now())
    .first();
  return row ? { id: row.id, name: row.name, hasPassword: !!row.hasPassword } : null;
}

// Devuelve el token en claro, que solo viaja a la cookie.
async function createSession(env, userId) {
  const now = Date.now();
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM auth_throttle WHERE reset_at < ?').bind(now),
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

  if (path === '/api/auth/signup' && request.method === 'POST') {
    return signup(request, env, secure);
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    return login(request, env, secure);
  }

  if (path === '/api/auth/password' && request.method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'unauthorized' }, 401);
    return changePassword(request, env, user);
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

/* ---------- límite de intentos ---------- */

// En local no hay CF-Connecting-IP: todos los intentos cuentan como uno solo.
const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'local';

async function throttled(env, checks) {
  const { results } = await env.DB.prepare(
    `SELECT k, n FROM auth_throttle WHERE k IN (${checks.map(() => '?').join(', ')}) AND reset_at > ?`
  )
    .bind(...checks.map(([k]) => k), Date.now())
    .all();
  return checks.some(([k, { max }]) => (results.find((r) => r.k === k)?.n ?? 0) >= max);
}

// Si la ventana ya pasó, el contador vuelve a empezar en vez de acumular.
const bump = (env, k, { window }) =>
  env.DB.prepare(
    `INSERT INTO auth_throttle (k, n, reset_at) VALUES (?1, 1, ?2 + ?3)
     ON CONFLICT(k) DO UPDATE SET
       n        = CASE WHEN reset_at <= ?2 THEN 1 ELSE n + 1 END,
       reset_at = CASE WHEN reset_at <= ?2 THEN ?2 + ?3 ELSE reset_at END`
  ).bind(k, Date.now(), window);

const tooMany = () => json({ error: 'throttled' }, 429);

/* ---------- usuario y contraseña ---------- */

const readBody = (request) => request.json().catch(() => null);
const cleanName = (x) => (typeof x === 'string' ? x.normalize('NFC').trim().replace(/\s+/g, ' ') : '');
const str = (x) => (typeof x === 'string' ? x : '');
const goodPassword = (p) => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;
// Empieza por letra o número; luego también espacios, punto, guion y guion bajo.
const goodName = (n) => n.length >= NAME_MIN && n.length <= NAME_MAX && /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(n);

const withSession = async (env, user, secure, extra = {}, status = 200) =>
  json({ user, ...extra }, status, {
    'set-cookie': cookie(SESSION_COOKIE, await createSession(env, user.id), { maxAge: SESSION_DAYS * 86400, secure }),
  });

async function signup(request, env, secure) {
  const body = await readBody(request);
  const name = cleanName(body?.name);
  const password = str(body?.password);
  if (!goodName(name)) return json({ error: 'bad_name' }, 400);
  if (!goodPassword(password)) return json({ error: 'bad_password' }, 400);

  const ipKey = `signup:ip:${clientIp(request)}`;
  if (await throttled(env, [[ipKey, LIMITS.signupIp]])) return tooMany();
  await bump(env, ipKey, LIMITS.signupIp).run();

  // Antes de hashear: un nombre cogido no debe costar CPU.
  const taken = () => json({ error: 'name_taken' }, 409);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE name = ? COLLATE NOCASE').bind(name).first()) return taken();

  const user = { id: crypto.randomUUID(), name, hasPassword: true };
  try {
    // key_hash es NOT NULL UNIQUE desde la migración 0002. En una cuenta nueva
    // es el hash de una clave al azar que no se guarda: nadie puede usarla.
    await env.DB.prepare('INSERT INTO users (id, name, key_hash, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, name, await sha256(randomToken()), await hashPassword(password), Date.now())
      .run();
  } catch (err) {
    // Dos registros con el mismo nombre a la vez: el índice NOCASE para al segundo.
    if (/UNIQUE/i.test(String(err?.message))) return taken();
    throw err;
  }
  return withSession(env, user, secure, {}, 201);
}

async function login(request, env, secure) {
  const body = await readBody(request);
  const name = cleanName(body?.name);
  const password = str(body?.password);

  // Mismo error para «no existe» y «contraseña mal»: nada que deducir desde fuera.
  const reject = () => json({ error: 'invalid_login' }, 401);
  if (!name || name.length > LEGACY_NAME_MAX || !password || password.length > PASSWORD_MAX) return reject();

  const userKey = `login:user:${name.toLowerCase()}`;
  const ipKey = `login:ip:${clientIp(request)}`;
  if (await throttled(env, [[userKey, LIMITS.loginUser], [ipKey, LIMITS.loginIp]])) return tooMany();

  const row = await env.DB.prepare('SELECT id, name, key_hash, pass_hash FROM users WHERE name = ? COLLATE NOCASE')
    .bind(name)
    .first();

  let ok = false, stale = false, legacy = false;
  if (row?.pass_hash) ({ ok, stale } = await verifyPassword(password, row.pass_hash));
  // Cuenta de antes: su clave de acceso vale como contraseña hasta que elija
  // una. La clave tiene 256 bits de entropía, así que un SHA-256 basta.
  else if (row) ok = legacy = (await sha256(password)) === row.key_hash;

  if (!ok) {
    await env.DB.batch([bump(env, userKey, LIMITS.loginUser), bump(env, ipKey, LIMITS.loginIp)]);
    return reject();
  }

  const writes = [env.DB.prepare('DELETE FROM auth_throttle WHERE k = ?').bind(userKey)];
  if (stale) writes.push(env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(await hashPassword(password), row.id));
  await env.DB.batch(writes);

  return withSession(env, { id: row.id, name: row.name, hasPassword: !legacy }, secure, { needsPassword: legacy });
}

// Con contraseña ya puesta hay que dar la actual: una sesión robada no basta
// para quedarse con la cuenta. Al cambiarla se cierran las demás sesiones.
async function changePassword(request, env, user) {
  const body = await readBody(request);
  const password = str(body?.password);
  if (!goodPassword(password)) return json({ error: 'bad_password' }, 400);

  if (user.hasPassword) {
    const userKey = `login:user:${user.name.toLowerCase()}`;
    if (await throttled(env, [[userKey, LIMITS.loginUser]])) return tooMany();
    const row = await env.DB.prepare('SELECT pass_hash FROM users WHERE id = ?').bind(user.id).first();
    const current = str(body?.current);
    if (!current || current.length > PASSWORD_MAX || !(await verifyPassword(current, row.pass_hash)).ok) {
      await bump(env, userKey, LIMITS.loginUser).run();
      return json({ error: 'wrong_password' }, 401);
    }
  }

  const sessionId = await sha256(readCookie(request, SESSION_COOKIE));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(await hashPassword(password), user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(user.id, sessionId),
  ]);
  return json({ user: { ...user, hasPassword: true } });
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

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

import { alliance } from './alliance.js';
import { cleanName, json, readBody, str } from './lib/http.js';
import { bump, clientIp, MIN, throttled, tooMany } from './lib/throttle.js';
import { hashPassword, verifyPassword } from './password.js';

const SESSION_COOKIE = 'sc_sess';
const SESSION_DAYS = 90;
const MAX_SAVE_BYTES = 1_000_000;
const NAME_MIN = 3;
const NAME_MAX = 24;
const LEGACY_NAME_MAX = 60;          // los nombres que daba invite.mjs
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const CAL_MAX = 10;                  // calendarios por cuenta
const ICS_MAX_BYTES = 2_000_000;
const ICS_TIMEOUT_MS = 8_000;
const ICS_HEAD_BYTES = 16_000;       // tope de lo que se lee al dar de alta para validar y sacar el nombre
const TASKHERO_API = 'https://api.taskhero.app/api/v1';
const TH_TIMEOUT_MS = 10_000;
const TH_BODY_MAX = 4_000;           // complete y tracker-points llevan unos pocos campos

// Intentos por ventana. Los registros cuentan aunque el nombre esté cogido: así
// tampoco se puede usar el registro para sondear qué nombres existen.
const LIMITS = {
  loginUser: { max: 10, window: 15 * MIN },
  loginIp: { max: 30, window: 15 * MIN },
  signupIp: { max: 10, window: 60 * MIN },
  // Que nadie use el Worker como descargador de URLs ajenas.
  calAdd: { max: 20, window: 60 * MIN },
  calFetch: { max: 120, window: 60 * MIN },
  // cada página de la importación de TaskHero cuenta una
  thFetch: { max: 60, window: 60 * MIN },
  thLink: { max: 10, window: 60 * MIN },
  thSend: { max: 300, window: 60 * MIN },
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

  if (path === '/api/calendars' || path.startsWith('/api/calendars/')) {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'unauthorized' }, 401);
    return calendars(request, env, user, path);
  }

  if (path === '/api/alliance' || path.startsWith('/api/alliance/')) {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'unauthorized' }, 401);
    return alliance(request, env, user, url);
  }

  if (path.startsWith('/api/taskhero/')) {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'unauthorized' }, 401);
    return taskhero(request, env, user, url);
  }

  return json({ error: 'not_found' }, 404);
}

/* ---------- usuario y contraseña ---------- */

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

/* ---------- calendarios iCal ---------- */

// El Worker solo valida, guarda la URL y reenvía el .ics sin tocarlo: parsear
// aquí hasta 10 calendarios se pasaría de los 10 ms de CPU del plan gratis.
// El cuerpo pasa sin que lo toque JavaScript; el cliente parsea y convierte a su zona.

async function calendars(request, env, user, path) {
  const m = path.match(/^\/api\/calendars(?:\/([\w-]+)(\/ics)?)?$/);
  if (!m) return json({ error: 'not_found' }, 404);
  const [, id, ics] = m;

  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, name FROM calendars WHERE user_id = ? ORDER BY created_at'
    )
      .bind(user.id)
      .all();
    return json({ calendars: results });
  }
  if (!id && request.method === 'POST') return addCalendar(request, env, user);
  if (id && !ics && request.method === 'DELETE') {
    const res = await env.DB.prepare('DELETE FROM calendars WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    return res.meta.changes ? json({ ok: true }) : json({ error: 'not_found' }, 404);
  }
  if (id && ics && request.method === 'GET') return proxyCalendar(env, user, id);
  return json({ error: 'method_not_allowed' }, 405);
}

// webcal:// es https:// con otro nombre; http:// no se acepta.
function calUrl(raw) {
  const s = str(raw).trim().replace(/^webcals?:\/\//i, 'https://');
  if (!s || s.length > 2000) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

async function fetchIcs(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(ICS_TIMEOUT_MS),
    // Sin comprimir: si llega en gzip, el Worker lo descomprime y esa CPU
    // cuenta. El tamaño extra solo es tiempo de espera, que no tiene límite.
    headers: { accept: 'text/calendar, text/plain;q=0.5, */*;q=0.1', 'accept-encoding': 'identity' },
  });
  if (!r.ok || !r.body) throw new Error('upstream');
  if (Number(r.headers.get('content-length')) > ICS_MAX_BYTES) throw new Error('too_large');
  return r;
}

// Lo que va antes del primer evento basta para saber si es un calendario y
// cómo se llama: no hace falta seguir leyendo.
async function readHead(body) {
  const reader = body.getReader(), dec = new TextDecoder();
  let text = '';
  while (text.length < ICS_HEAD_BYTES && !text.includes('BEGIN:VEVENT')) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return text;
}

const icsText = (v) => v.replace(/\\([\\,;nN])/g, (_, c) => (c === 'n' || c === 'N' ? ' ' : c)).trim();

async function addCalendar(request, env, user) {
  const body = await readBody(request);
  const url = calUrl(body?.url);
  if (!url) return json({ error: 'bad_url' }, 400);

  const key = `cal:add:${user.id}`;
  if (await throttled(env, [[key, LIMITS.calAdd]])) return tooMany();
  await bump(env, key, LIMITS.calAdd).run();

  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM calendars WHERE user_id = ?').bind(user.id).first();
  if (n >= CAL_MAX) return json({ error: 'too_many' }, 409);
  if (await env.DB.prepare('SELECT 1 FROM calendars WHERE user_id = ? AND url = ?').bind(user.id, url).first()) {
    return json({ error: 'duplicate' }, 409);
  }

  let head;
  try {
    head = await readHead((await fetchIcs(url)).body);
  } catch (err) {
    return json({ error: err?.message === 'too_large' ? 'too_large' : 'upstream' }, 400);
  }
  if (!head.replace(/^﻿/, '').trimStart().startsWith('BEGIN:VCALENDAR')) return json({ error: 'not_ical' }, 400);

  const calName = head.match(/^X-WR-CALNAME[^:\r\n]*:(.*)$/m);
  const name = (calName && icsText(calName[1])) || new URL(url).hostname;
  const cal = { id: crypto.randomUUID(), name: name.slice(0, 80) };
  await env.DB.prepare('INSERT INTO calendars (id, user_id, name, url, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(cal.id, user.id, cal.name, url, Date.now())
    .run();
  return json({ calendar: cal }, 201);
}

async function proxyCalendar(env, user, id) {
  const row = await env.DB.prepare('SELECT url FROM calendars WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!row) return json({ error: 'not_found' }, 404);

  const key = `cal:fetch:${user.id}`;
  if (await throttled(env, [[key, LIMITS.calFetch]])) return tooMany();
  await bump(env, key, LIMITS.calFetch).run();

  let r;
  try {
    r = await fetchIcs(row.url);
  } catch (err) {
    return json({ error: err?.message === 'too_large' ? 'too_large' : 'upstream' }, 502);
  }
  // Tal cual, sin contar bytes: contarlos en JavaScript costaba CPU en cada
  // trozo. Google no manda Content-Length, así que el tope de 2 MB solo vale
  // cuando el servidor lo anuncia; el resto lo acota el corte a los 8 s. Solo
  // descarga quien conectó el calendario, con su propio límite por hora.
  return new Response(r.body, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/* ---------- TaskHero: importación y envíos ---------- */

// Paso directo, como los .ics: el navegador no puede llamar a TaskHero desde
// nuestro dominio (CORS), así que el Worker reenvía la petición y devuelve el
// cuerpo sin parsearlo. La paginación y las decisiones las lleva el cliente.
//
// La clave llega de dos formas: en la cabecera Authorization (importar sin
// conectar, no se guarda) o guardada en taskhero_links al conectar la cuenta.
// Los envíos (complete, uncomplete, tracker-points) solo usan la guardada.
// Nunca se registra ni se devuelve.
const TH_PARAMS = ['type', 'status', 'cursor', 'limit'];
const TH_AUTH = /^Bearer [\x21-\x7e]{8,300}$/;

const noTable = (err) => /no such table/i.test(String(err?.message));
const notReady = () => json({ error: 'not_ready' }, 503);

async function storedAuth(env, user) {
  const row = await env.DB.prepare('SELECT api_key FROM taskhero_links WHERE user_id = ?').bind(user.id).first();
  return row ? `Bearer ${row.api_key}` : null;
}

function thForward(path, auth, init = {}) {
  return fetch(`${TASKHERO_API}/${path}`, {
    ...init,
    headers: { authorization: auth, accept: 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(TH_TIMEOUT_MS),
  });
}

const passThrough = (r) =>
  new Response(r.body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

async function taskhero(request, env, user, url) {
  try {
    return await taskheroRoutes(request, env, user, url);
  } catch (err) {
    // Sin la migración 0005 solo falla esto; el resto de la app sigue igual.
    if (noTable(err)) return notReady();
    throw err;
  }
}

async function taskheroRoutes(request, env, user, url) {
  const path = url.pathname.slice('/api/taskhero/'.length);
  const method = request.method;

  if (path === 'link') {
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT 1 FROM taskhero_links WHERE user_id = ?').bind(user.id).first();
      return json({ connected: !!row });
    }
    if (method === 'PUT') return linkTaskhero(request, env, user);
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM taskhero_links WHERE user_id = ?').bind(user.id).run();
      return json({ connected: false });
    }
    return json({ error: 'method_not_allowed' }, 405);
  }

  const read = path.match(/^(tasks|lists)$/);
  const done = path.match(/^tasks\/([A-Za-z0-9_-]{1,128})\/(complete|uncomplete)$/);
  const points = path === 'tracker-points';
  if (!read && !done && !points) return json({ error: 'not_found' }, 404);

  if (read) {
    if (method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const given = request.headers.get('authorization');
    if (given && !TH_AUTH.test(given)) return json({ error: 'bad_key' }, 400);
    const auth = given || (await storedAuth(env, user));
    if (!auth) return json({ error: 'bad_key' }, 400);

    const key = `th:fetch:${user.id}`;
    if (await throttled(env, [[key, LIMITS.thFetch]])) return tooMany();
    await bump(env, key, LIMITS.thFetch).run();

    const q = new URLSearchParams();
    for (const k of TH_PARAMS) if (url.searchParams.has(k)) q.set(k, url.searchParams.get(k).slice(0, 500));
    try {
      return passThrough(await thForward(`${read[1]}${q.size ? `?${q}` : ''}`, auth));
    } catch {
      return json({ error: 'upstream' }, 502);
    }
  }

  if (method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (Number(request.headers.get('content-length')) > TH_BODY_MAX) return json({ error: 'too_large' }, 413);
  const body = await request.text();
  if (body.length > TH_BODY_MAX) return json({ error: 'too_large' }, 413);

  const auth = await storedAuth(env, user);
  if (!auth) return json({ error: 'not_linked' }, 409);

  const key = `th:send:${user.id}`;
  if (await throttled(env, [[key, LIMITS.thSend]])) return tooMany();
  await bump(env, key, LIMITS.thSend).run();

  const target = points ? 'tracker-points' : `tasks/${done[1]}/${done[2]}`;
  // uncomplete no lleva cuerpo; los otros dos, JSON tal cual lo manda el cliente
  const init = body ? { method: 'POST', body, headers: { 'content-type': 'application/json' } } : { method: 'POST' };
  try {
    return passThrough(await thForward(target, auth, init));
  } catch {
    return json({ error: 'upstream' }, 502);
  }
}

// Antes de guardar, la clave se prueba con /me: así una clave mala se nota al
// conectar y no en el primer envío.
async function linkTaskhero(request, env, user) {
  const body = await readBody(request);
  const apiKey = str(body?.key).trim();
  const auth = `Bearer ${apiKey}`;
  if (!TH_AUTH.test(auth)) return json({ error: 'bad_key' }, 400);

  const key = `th:link:${user.id}`;
  if (await throttled(env, [[key, LIMITS.thLink]])) return tooMany();
  await bump(env, key, LIMITS.thLink).run();

  let r;
  try {
    r = await thForward('me', auth);
  } catch {
    return json({ error: 'upstream' }, 502);
  }
  r.body?.cancel().catch(() => {});
  if (r.status === 401 || r.status === 403) return json({ error: 'bad_key' }, 400);
  if (!r.ok) return json({ error: 'upstream' }, 502);

  await env.DB.prepare(
    `INSERT INTO taskhero_links (user_id, api_key, created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET api_key = excluded.api_key, created_at = excluded.created_at`
  )
    .bind(user.id, apiKey, Date.now())
    .run();
  return json({ connected: true });
}

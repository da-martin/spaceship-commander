/* Límite de intentos por ventana, con contadores en D1 (tabla auth_throttle). */
import { json } from './http.js';

export const MIN = 60_000;

// En local no hay CF-Connecting-IP: todos los intentos cuentan como uno solo.
export const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'local';

export async function throttled(env, checks) {
  const { results } = await env.DB.prepare(
    `SELECT k, n FROM auth_throttle WHERE k IN (${checks.map(() => '?').join(', ')}) AND reset_at > ?`
  )
    .bind(...checks.map(([k]) => k), Date.now())
    .all();
  return checks.some(([k, { max }]) => (results.find((r) => r.k === k)?.n ?? 0) >= max);
}

// Si la ventana ya pasó, el contador vuelve a empezar en vez de acumular.
export const bump = (env, k, { window }) =>
  env.DB.prepare(
    `INSERT INTO auth_throttle (k, n, reset_at) VALUES (?1, 1, ?2 + ?3)
     ON CONFLICT(k) DO UPDATE SET
       n        = CASE WHEN reset_at <= ?2 THEN 1 ELSE n + 1 END,
       reset_at = CASE WHEN reset_at <= ?2 THEN ?2 + ?3 ELSE reset_at END`
  ).bind(k, Date.now(), window);

export const tooMany = () => json({ error: 'throttled' }, 429);

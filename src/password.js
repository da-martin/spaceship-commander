/**
 * Hash de contraseñas con PBKDF2-SHA256 de Web Crypto.
 *
 * Lo usan el Worker y scripts/reset-password.mjs: Web Crypto existe en los dos
 * entornos, así que el formato no puede divergir.
 *
 * Formato guardado: pbkdf2$<iteraciones>$<sal b64url>$<hash b64url>
 *
 * Las iteraciones no son las 600.000 que recomienda OWASP porque el plan gratis
 * de Workers da 10 ms de CPU por petición. Medido: ~0,11 µs por iteración, así
 * que 30.000 son ~3,3 ms y una petición puede hacer dos hashes (verificar la
 * contraseña actual y guardar la nueva) sin pasarse. Como las iteraciones
 * viajan dentro del hash, subirlas no rompe las contraseñas ya guardadas: se
 * rehashean al entrar.
 */

export const ITERATIONS = 30_000;

const enc = new TextEncoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(await derive(password, salt, ITERATIONS))}`;
}

// { ok, stale }: `stale` avisa de que el hash se hizo con menos iteraciones de
// las actuales y conviene guardarlo de nuevo ahora que tenemos la contraseña.
export async function verifyPassword(password, stored) {
  const [scheme, it, salt, hash] = String(stored).split('$');
  const iterations = Number(it);
  if (scheme !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) {
    return { ok: false, stale: false };
  }
  const want = unb64url(hash);
  const got = await derive(password, unb64url(salt), iterations);
  // Comparación en tiempo constante: recorre siempre todos los bytes.
  let diff = want.length ^ got.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
  return { ok: diff === 0, stale: iterations < ITERATIONS };
}

/* Respuestas JSON y lectura de cuerpos: lo que comparten todas las rutas. */

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });

export const readBody = (request) => request.json().catch(() => null);
export const str = (x) => (typeof x === 'string' ? x : '');
// Nombres de cuenta y de alianza: NFC, sin espacios de sobra.
export const cleanName = (x) => (typeof x === 'string' ? x.normalize('NFC').trim().replace(/\s+/g, ' ') : '');

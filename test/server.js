// El Worker contra una base SQLite en memoria con las migraciones de verdad.
// D1 es SQLite, así que el SQL es el mismo.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

// Lo justo de la API de D1 que usa el Worker.
// `skip`: migraciones que no se aplican, para probar el Worker antes de migrar.
export function d1(skip = []) {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) if (!skip.some((x) => f.startsWith(x))) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    exec: () => (/^\s*SELECT|\bRETURNING\b/i.test(sql) ? { results: db.prepare(sql).all(...args) } : { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    },
    raw: db,
  };
}

// Una base nueva y sus jugadores. `vars`: variables del Worker (TRAVEL_ON…).
export function server(vars = {}, skip = []) {
  const env = { DB: d1(skip), ...vars };
  let n = 0;
  // Una cuenta con la sesión ya abierta: registrarse de verdad cuesta un PBKDF2.
  function player(name) {
    const id = 'u' + ++n, token = 'tok-' + id;
    env.DB.raw.prepare('INSERT INTO users (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)').run(id, name, 'k-' + id, n);
    env.DB.raw.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(createHash('sha256').update(token).digest('hex'), id, 0, 8.64e15);
    const call = async (method, path, body) => {
      const r = await worker.fetch(new Request('https://x.test/api/alliance' + path, {
        method, headers: { cookie: 'sc_sess=' + token, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }), env);
      return { status: r.status, ...(await r.json()) };
    };
    return { id, name, get: (p = '') => call('GET', p), post: (p, b) => call('POST', p, b ?? {}) };
  }
  // El primero funda una alianza y mete en ella a los demás.
  async function allianceOf(founder, ...others) {
    const { alliance } = await founder.post('', { name: 'Los Valientes' });
    for (const o of others) {
      await founder.post('/invite', { userId: o.id });
      await o.post('/accept', { allianceId: alliance.id });
    }
    return alliance.id;
  }
  return { env, player, allianceOf };
}

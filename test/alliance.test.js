// Las rutas de /api/alliance contra una base SQLite en memoria con las
// migraciones de verdad. D1 es SQLite, así que el SQL es el mismo.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

// Lo justo de la API de D1 que usa el Worker.
function d1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    exec: () => (/^\s*SELECT/i.test(sql) ? { results: db.prepare(sql).all(...args) } : { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
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

let env, n;
beforeEach(() => { env = { DB: d1() }; n = 0; });

// Una cuenta con la sesión ya abierta: registrarse de verdad cuesta un PBKDF2.
function player(name) {
  const id = 'u' + ++n, token = 'tok-' + id;
  env.DB.raw.prepare('INSERT INTO users (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)').run(id, name, 'k-' + id, n);
  env.DB.raw.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), id, 0, Date.now() + 1e9);
  const call = async (method, path, body) => {
    const r = await worker.fetch(new Request('https://x.test/api/alliance' + path, {
      method, headers: { cookie: 'sc_sess=' + token, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }), env);
    return { status: r.status, ...(await r.json()) };
  };
  return { id, name, get: (p = '') => call('GET', p), post: (p, b) => call('POST', p, b ?? {}) };
}

// Ana funda una alianza y mete en ella a los demás.
async function allianceOf(founder, ...others) {
  const { alliance } = await founder.post('', { name: 'Los Valientes' });
  for (const o of others) {
    await founder.post('/invite', { userId: o.id });
    await o.post('/accept', { allianceId: alliance.id });
  }
  return alliance.id;
}
const names = (a) => a.members.map((m) => m.name);

test('sin sesión no hay alianza', async () => {
  const r = await worker.fetch(new Request('https://x.test/api/alliance'), env);
  assert.equal(r.status, 401);
});

test('crear: quien la crea es el fundador y único miembro', async () => {
  const ana = player('Ana');
  assert.deepEqual(await ana.get(), { status: 200, alliance: null, invites: [] });
  const r = await ana.post('', { name: '  Los   Valientes ' });
  assert.equal(r.status, 201);
  assert.equal(r.alliance.name, 'Los Valientes');
  assert.equal(r.alliance.founderId, ana.id);
  assert.deepEqual(names(r.alliance), ['Ana']);
});

test('crear: nombre inválido o ya en una alianza', async () => {
  const ana = player('Ana');
  assert.equal((await ana.post('', { name: 'ab' })).error, 'bad_name');
  assert.equal((await ana.post('', { name: 'x'.repeat(31) })).error, 'bad_name');
  await ana.post('', { name: 'Primera' });
  const r = await ana.post('', { name: 'Segunda' });
  assert.equal(r.status, 409);
  assert.equal(r.error, 'already_in_alliance');
  assert.equal((await ana.get()).alliance.name, 'Primera');
});

test('invitar y aceptar: el invitado entra y la invitación desaparece', async () => {
  const ana = player('Ana'), luis = player('Luis');
  const { alliance } = await ana.post('', { name: 'Los Valientes' });
  const inv = await ana.post('/invite', { userId: luis.id });
  assert.deepEqual(inv.alliance.invites.map((i) => [i.name, i.invitedBy]), [['Luis', 'Ana']]);

  const mine = await luis.get();
  assert.equal(mine.alliance, null);
  assert.deepEqual(mine.invites.map((i) => [i.name, i.invitedBy, i.members]), [['Los Valientes', 'Ana', 1]]);

  const r = await luis.post('/accept', { allianceId: alliance.id });
  assert.deepEqual(names(r.alliance), ['Ana', 'Luis']);
  assert.deepEqual((await ana.get()).alliance.invites, []);
});

test('rechazar y retirar una invitación', async () => {
  const ana = player('Ana'), luis = player('Luis'), eva = player('Eva');
  const { alliance } = await ana.post('', { name: 'Los Valientes' });
  await ana.post('/invite', { userId: luis.id });
  await ana.post('/invite', { userId: eva.id });
  assert.deepEqual((await luis.post('/decline', { allianceId: alliance.id })).invites, []);
  const r = await ana.post('/invite/cancel', { userId: eva.id });
  assert.deepEqual(r.alliance.invites, []);
  assert.equal((await eva.post('/accept', { allianceId: alliance.id })).error, 'no_invite');
});

test('no se entra sin invitación', async () => {
  const ana = player('Ana'), luis = player('Luis');
  const { alliance } = await ana.post('', { name: 'Los Valientes' });
  const r = await luis.post('/accept', { allianceId: alliance.id });
  assert.equal(r.status, 404);
  assert.equal((await luis.get()).alliance, null);
});

test('una sola alianza: no se invita a quien ya está en una, y al entrar se borran sus otras invitaciones', async () => {
  const ana = player('Ana'), luis = player('Luis'), eva = player('Eva');
  const a = (await ana.post('', { name: 'Alfa' })).alliance;
  const b = (await luis.post('', { name: 'Beta' })).alliance;
  assert.equal((await ana.post('/invite', { userId: luis.id })).error, 'already_in_alliance');

  await ana.post('/invite', { userId: eva.id });
  await luis.post('/invite', { userId: eva.id });
  assert.equal((await eva.get()).invites.length, 2);
  await eva.post('/accept', { allianceId: a.id });
  assert.deepEqual((await luis.get()).alliance.invites, []);
  assert.equal((await eva.post('/accept', { allianceId: b.id })).error, 'already_in_alliance');
});

test('máximo 5: con la alianza llena no se invita ni se entra', async () => {
  const ana = player('Ana'), late = player('Tarde'), extra = player('Extra');
  const rest = ['Bea', 'Cai', 'Dani'].map(player);
  const id = await allianceOf(ana, ...rest);
  await ana.post('/invite', { userId: late.id });      // invitado cuando aún cabía
  const fifth = player('Quinto');
  await ana.post('/invite', { userId: fifth.id });
  await fifth.post('/accept', { allianceId: id });
  assert.equal((await ana.get()).alliance.members.length, 5);

  assert.equal((await ana.post('/invite', { userId: extra.id })).error, 'full');
  const r = await late.post('/accept', { allianceId: id });
  assert.equal(r.status, 409);
  assert.equal(r.error, 'full');
  assert.equal((await ana.get()).alliance.members.length, 5);
});

test('cualquier miembro invita; solo el fundador expulsa y disuelve', async () => {
  const ana = player('Ana'), luis = player('Luis'), eva = player('Eva'), noa = player('Noa');
  await allianceOf(ana, luis, eva);
  assert.equal((await luis.post('/invite', { userId: noa.id })).status, 200);
  assert.equal((await luis.post('/kick', { userId: eva.id })).error, 'not_founder');
  assert.equal((await luis.post('/disband')).error, 'not_founder');
  assert.equal((await ana.post('/kick', { userId: ana.id })).error, 'bad_request');

  const r = await ana.post('/kick', { userId: eva.id });
  assert.deepEqual(names(r.alliance), ['Ana', 'Luis']);
  assert.equal((await eva.get()).alliance, null);
});

test('salir: si se va el fundador hereda el más antiguo', async () => {
  const ana = player('Ana'), luis = player('Luis'), eva = player('Eva');
  await allianceOf(ana, luis, eva);
  assert.equal((await ana.post('/leave')).alliance, null);
  const r = await eva.get();
  assert.equal(r.alliance.founderId, luis.id);
  assert.deepEqual(names(r.alliance), ['Luis', 'Eva']);
});

test('salir: un miembro normal no cambia al fundador', async () => {
  const ana = player('Ana'), luis = player('Luis');
  await allianceOf(ana, luis);
  await luis.post('/leave');
  const r = await ana.get();
  assert.equal(r.alliance.founderId, ana.id);
  assert.deepEqual(names(r.alliance), ['Ana']);
});

test('salir el último o disolver borra la alianza y sus invitaciones', async () => {
  const ana = player('Ana'), luis = player('Luis'), eva = player('Eva');
  await ana.post('', { name: 'Efímera' });
  await ana.post('/invite', { userId: luis.id });
  await ana.post('/leave');
  assert.deepEqual((await luis.get()).invites, []);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM alliances').get().n, 0);

  await allianceOf(ana, luis);
  await ana.post('/invite', { userId: eva.id });
  assert.equal((await ana.post('/disband')).alliance, null);
  assert.equal((await luis.get()).alliance, null);
  assert.deepEqual((await eva.get()).invites, []);
  assert.equal((await ana.post('/leave')).error, 'no_alliance');
});

test('buscar: por comienzo del nombre, mínimo 3 letras, sin uno mismo', async () => {
  const ana = player('Ana'), anabel = player('Anabel'), luis = player('Luisana');
  player('Anacleto'); player('Bea');
  await allianceOf(ana, anabel);
  assert.deepEqual((await ana.get('/search?q=an')).results, []);
  const r = await ana.get('/search?q=ANA');
  assert.deepEqual(r.results.map((u) => [u.name, u.status]), [['Anabel', 'member'], ['Anacleto', 'free']]);
  assert.deepEqual(Object.keys(r.results[0]).sort(), ['id', 'name', 'status']);

  await ana.post('/invite', { userId: luis.id });
  assert.equal((await ana.get('/search?q=luis')).results[0].status, 'invited');
  await luis.post('', { name: 'Otra' });
  assert.equal((await ana.get('/search?q=luis')).results[0].status, 'taken');
});

test('buscar: los comodines se buscan tal cual y hay tope de resultados y de intentos', async () => {
  const ana = player('Ana');
  for (let i = 0; i < 12; i++) player('Piloto' + i);
  assert.deepEqual((await ana.get('/search?q=%25%25%25')).results, []);
  assert.deepEqual((await ana.get('/search?q=Pil___')).results, []);
  assert.equal((await ana.get('/search?q=pilo')).results.length, 8);
  for (let i = 0; i < 117; i++) await ana.get('/search?q=pilo');
  assert.equal((await ana.get('/search?q=pilo')).status, 429);
});

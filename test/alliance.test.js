// Las rutas de /api/alliance contra una base SQLite en memoria con las
// migraciones de verdad. D1 es SQLite, así que el SQL es el mismo.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../src/index.js';
import { d1 } from './d1.js';

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

/* ---------- chat ---------- */

const texts = (r) => r.messages.map((m) => (m.kind === 'text' ? `${m.name}: ${m.body}` : `[${m.kind} ${m.name}${m.body ? ' ' + m.body : ''}]`));

test('chat: solo para miembros', async () => {
  const ana = player('Ana'), luis = player('Luis');
  await allianceOf(ana);
  assert.equal((await luis.get('/messages')).error, 'no_alliance');
  assert.equal((await luis.post('/messages', { body: 'hola' })).error, 'no_alliance');
  assert.deepEqual((await ana.get('/messages')).messages, []);
});

test('chat: enviar y leer en orden, con avisos de quien entra, sale o es expulsado', async () => {
  const ana = player('Ana'), luis = player('Luis'), eva = player('Eva');
  await allianceOf(ana, luis, eva);
  const sent = await ana.post('/messages', { body: '  ¡Vamos!\r\n\n\n\nHoy toca  ' });
  assert.equal(sent.status, 201);
  assert.equal(sent.message.body, '¡Vamos!\n\nHoy toca');
  await luis.post('/messages', { body: 'A por ello' });
  await ana.post('/kick', { userId: eva.id });
  await luis.post('/leave');
  assert.deepEqual(texts(await ana.get('/messages')), ['[join Luis]', '[join Eva]', 'Ana: ¡Vamos!\n\nHoy toca', 'Luis: A por ello', '[kick Eva]', '[leave Luis]']);
});

test('chat: vacío o demasiado largo no se guarda; 500 caracteres sí', async () => {
  const ana = player('Ana');
  await allianceOf(ana);
  assert.equal((await ana.post('/messages', { body: '   \n ' })).error, 'empty');
  assert.equal((await ana.post('/messages', {})).error, 'empty');
  assert.equal((await ana.post('/messages', { body: 'x'.repeat(501) })).error, 'too_long');
  assert.equal((await ana.post('/messages', { body: '🚀'.repeat(500) })).status, 201);
  assert.equal((await ana.get('/messages')).messages.length, 1);
});

test('chat: sin límite de frecuencia', async () => {
  const ana = player('Ana');
  await allianceOf(ana);
  for (let i = 0; i < 150; i++) assert.equal((await ana.post('/messages', { body: 'm' + i })).status, 201);
});

test('chat: «after» da solo lo nuevo; «before» pagina hacia atrás', async () => {
  const ana = player('Ana');
  await allianceOf(ana);
  const ids = [];
  for (let i = 1; i <= 130; i++) ids.push((await ana.post('/messages', { body: 'm' + i })).message.id);

  const last = await ana.get('/messages');
  assert.equal(last.messages.length, 100);
  assert.equal(last.more, true);
  assert.equal(last.messages[0].body, 'm31');
  assert.equal(last.messages.at(-1).body, 'm130');

  const older = await ana.get('/messages?before=' + last.messages[0].id);
  assert.deepEqual([older.messages.length, older.more, older.messages[0].body, older.messages.at(-1).body], [30, false, 'm1', 'm30']);

  assert.deepEqual((await ana.get('/messages?after=' + ids.at(-1))).messages, []);
  assert.deepEqual(texts(await ana.get('/messages?after=' + ids.at(-3))), ['Ana: m129', 'Ana: m130']);
});

test('chat: se conservan los últimos 500', async () => {
  const ana = player('Ana');
  await allianceOf(ana);
  for (let i = 1; i <= 505; i++) await ana.post('/messages', { body: 'm' + i });
  const rows = env.DB.raw.prepare('SELECT body FROM alliance_messages ORDER BY id').all();
  assert.equal(rows.length, 500);
  assert.equal(rows[0].body, 'm6');
});

test('chat: sin leer cuenta lo de los demás y se pone a cero al marcar leído', async () => {
  const ana = player('Ana'), luis = player('Luis');
  await allianceOf(ana, luis);
  assert.equal((await ana.get()).alliance.unread, 1);          // el aviso de que Luis ha entrado
  assert.equal((await luis.get()).alliance.unread, 0);         // tu propia entrada no cuenta
  await ana.post('/messages', { body: 'uno' });
  const { message } = await ana.post('/messages', { body: 'dos' });
  assert.equal((await ana.get()).alliance.unread, 1);          // lo que escribes tú, tampoco
  assert.equal((await luis.get()).alliance.unread, 2);

  await luis.post('/read', { id: message.id - 1 });
  assert.equal((await luis.get()).alliance.unread, 1);
  await luis.post('/read', { id: 999999 });                    // no pasa del último que existe
  assert.equal((await luis.get()).alliance.unread, 0);
  await luis.post('/read', { id: 1 });                         // ni retrocede
  assert.equal((await luis.get()).alliance.lastRead, message.id);
  await ana.post('/messages', { body: 'tres' });
  assert.equal((await luis.get()).alliance.unread, 1);
  assert.equal((await luis.post('/read', { id: 'x' })).error, 'bad_request');
});

test('chat: los mensajes son de la alianza; al disolverla desaparecen y otra no los ve', async () => {
  const ana = player('Ana'), luis = player('Luis');
  await allianceOf(ana);
  await ana.post('/messages', { body: 'secreto' });
  await luis.post('', { name: 'Otra' });
  assert.deepEqual((await luis.get('/messages')).messages, []);
  assert.deepEqual((await luis.get('/messages?after=0')).messages, []);
  await ana.post('/disband');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM alliance_messages').get().n, 0);
});

/* ---------- progreso e hitos ---------- */

const progressOf = async (viewer) => Object.fromEntries((await viewer.get()).alliance.members.map((m) => [m.name, m.progress]));

test('progreso: cada uno publica el suyo y lo ven los demás; solo día y porcentaje', async () => {
  const ana = player('Ana'), luis = player('Luis');
  await allianceOf(ana, luis);
  assert.deepEqual(await progressOf(luis), { Ana: null, Luis: null });
  assert.equal((await ana.post('/progress', { day: '2026-11-16', pct: 60 })).ok, true);
  await luis.post('/progress', { day: '2026-11-16', pct: null });       // hoy no tenía nada
  assert.deepEqual(await progressOf(luis), { Ana: { day: '2026-11-16', pct: 60 }, Luis: { day: '2026-11-16', pct: null } });
  const cols = env.DB.raw.prepare('PRAGMA table_info(alliance_members)').all().map((c) => c.name);
  assert.deepEqual(cols, ['user_id', 'alliance_id', 'joined_at', 'last_read_id', 'progress_day', 'progress_pct']);
});

test('progreso: dejar de compartir lo borra, y al salir de la alianza no queda', async () => {
  const ana = player('Ana'), luis = player('Luis');
  const id = await allianceOf(ana, luis);
  await luis.post('/progress', { day: '2026-11-16', pct: 100 });
  await luis.post('/progress', { day: null });
  assert.equal((await progressOf(ana)).Luis, null);
  await luis.post('/progress', { day: '2026-11-16', pct: 100 });
  await luis.post('/leave');
  await ana.post('/invite', { userId: luis.id });
  await luis.post('/accept', { allianceId: id });
  assert.equal((await progressOf(ana)).Luis, null);
});

test('progreso: datos inválidos o sin alianza', async () => {
  const ana = player('Ana'), luis = player('Luis');
  await allianceOf(ana);
  for (const bad of [{ day: 'hoy', pct: 5 }, { day: '2026-11-16', pct: 101 }, { day: '2026-11-16', pct: -1 }, { day: '2026-11-16', pct: 1.5 }, { day: '2026-11-16', pct: '50' }])
    assert.equal((await ana.post('/progress', bad)).error, 'bad_request', JSON.stringify(bad));
  assert.equal((await luis.post('/progress', { day: '2026-11-16', pct: 5 })).error, 'no_alliance');
});

test('hitos: el ascenso y la misión completada salen en el chat y cuentan como sin leer', async () => {
  const ana = player('Ana'), luis = player('Luis');
  await allianceOf(ana, luis);
  await luis.post('/read', { id: 999 }); await ana.post('/read', { id: 999 });
  assert.equal((await ana.post('/event', { kind: 'rank', rank: 2 })).posted, true);
  assert.equal((await ana.post('/event', { kind: 'mission', topic: ' Exploración ' })).posted, true);
  assert.deepEqual(texts(await luis.get('/messages')).slice(-2), ['[rank Ana 2]', '[mission Ana Exploración]']);
  assert.equal((await luis.get()).alliance.unread, 2);
  assert.equal((await ana.get()).alliance.unread, 0);
});

test('hitos: el mismo ascenso no se anuncia dos veces; las misiones sí se repiten', async () => {
  const ana = player('Ana');
  await allianceOf(ana);
  await ana.post('/event', { kind: 'rank', rank: 2 });
  assert.equal((await ana.post('/event', { kind: 'rank', rank: 2 })).posted, false);
  await ana.post('/event', { kind: 'rank', rank: 3 });
  await ana.post('/event', { kind: 'mission', topic: 'Rescate' });
  await ana.post('/event', { kind: 'mission', topic: 'Rescate' });
  assert.deepEqual(texts(await ana.get('/messages')), ['[rank Ana 2]', '[rank Ana 3]', '[mission Ana Rescate]', '[mission Ana Rescate]']);
});

test('hitos: datos inválidos o sin alianza', async () => {
  const ana = player('Ana'), luis = player('Luis');
  await allianceOf(ana);
  for (const bad of [{}, { kind: 'text', body: 'x' }, { kind: 'join' }, { kind: 'rank', rank: 0 }, { kind: 'rank', rank: '2' }, { kind: 'rank', rank: 100 }, { kind: 'mission' }, { kind: 'mission', topic: 'x'.repeat(41) }])
    assert.equal((await ana.post('/event', bad)).error, 'bad_request', JSON.stringify(bad));
  assert.equal((await luis.post('/event', { kind: 'rank', rank: 2 })).error, 'no_alliance');
  assert.deepEqual((await ana.get('/messages')).messages, []);
});

// Viajes de la alianza (docs/plan-viajes.md, fase 4): propuesta, votos y salida,
// contra una base SQLite en memoria con las migraciones de verdad.
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../src/index.js';
import { TRIP_VOTE_MS } from '../src/alliance.js';
import { d1 } from './d1.js';

let env, n;
beforeEach(() => {
  env = { DB: d1(), TRAVEL_ON: '1' }; n = 0;
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T10:00:00Z').getTime() });
});
afterEach(() => mock.timers.reset());

const DAY = 864e5;
function player(name) {
  const id = 'u' + ++n, token = 'tok-' + id;
  env.DB.raw.prepare('INSERT INTO users (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)').run(id, name, 'k-' + id, n);
  env.DB.raw.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), id, 0, Date.now() + 1e12);
  const call = async (method, path, body) => {
    const r = await worker.fetch(new Request('https://x.test/api/alliance' + path, {
      method, headers: { cookie: 'sc_sess=' + token, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }), env);
    return { status: r.status, ...(await r.json()) };
  };
  return { id, name, get: (p = '') => call('GET', p), post: (p, b) => call('POST', p, b ?? {}) };
}
async function allianceOf(founder, ...others) {
  const { alliance } = await founder.post('', { name: 'Los Valientes' });
  for (const o of others) {
    await founder.post('/invite', { userId: o.id });
    await o.post('/accept', { allianceId: alliance.id });
  }
  return alliance.id;
}
const chat = async (p) => (await p.get('/messages')).messages.filter((m) => m.kind.startsWith('trip'));
const names = (a) => a.members.map((m) => m.name);

test('con los viajes apagados no hay rutas de viaje y la foto es la de siempre', async () => {
  env.TRAVEL_ON = undefined;
  const ana = player('Ana');
  await allianceOf(ana);
  const r = await ana.get();
  assert.equal(r.alliance.system, undefined);
  assert.equal(r.alliance.trip, undefined);
  assert.equal((await ana.post('/trip', { to: 'zeta' })).status, 404);
});

test('la alianza nace en el Sistema Madre, o donde está quien la funda', async () => {
  const ana = player('Ana'), bea = player('Bea');
  assert.equal((await ana.post('', { name: 'Madre' })).alliance.system, 'madre');
  assert.equal((await bea.post('', { name: 'Lejos', system: 'zeta' })).alliance.system, 'zeta');
  const cai = player('Cai');
  assert.equal((await cai.post('', { name: 'Rara', system: 'atlantida' })).alliance.system, 'madre');
});

test('una alianza de uno zarpa al momento', async () => {
  const ana = player('Ana');
  await allianceOf(ana);
  const r = await ana.post('/trip', { to: 'zeta' });
  assert.equal(r.status, 201);
  assert.equal(r.alliance.system, 'zeta');
  const t = r.alliance.trip;
  assert.equal(t.status, 'sailing');
  assert.equal(t.from, 'madre');
  assert.equal(t.to, 'zeta');
  assert.equal(t.departedAt, Date.now());
  assert.equal(t.arrivesAt, Date.now() + 3 * DAY);
  assert.deepEqual((await chat(ana)).map((m) => [m.kind, m.body]), [['trip', 'zeta'], ['trip_go', 'zeta']]);
});

test('solo se propone un destino con ruta, y una sola propuesta a la vez', async () => {
  const ana = player('Ana'), bea = player('Bea');
  await allianceOf(ana, bea);
  assert.equal((await ana.post('/trip', { to: 'madre' })).error, 'bad_destination');
  assert.equal((await ana.post('/trip', { to: 'atlantida' })).error, 'bad_destination');
  const r = await ana.post('/trip', { to: 'canopo' });
  assert.equal(r.alliance.trip.status, 'open');
  assert.equal(r.alliance.trip.closesAt, Date.now() + TRIP_VOTE_MS);
  assert.deepEqual(r.alliance.trip.votes, [{ userId: ana.id, vote: 'yes' }]);
  assert.equal((await bea.post('/trip', { to: 'zeta' })).error, 'trip_busy');
});

test('si todos dicen que sí, zarpan en ese momento', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai');
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'umbral' });
  await bea.post('/trip/vote', { tripId: trip.id, vote: 'yes' });
  const r = await cai.post('/trip/vote', { tripId: trip.id, vote: 'yes' });
  assert.equal(r.alliance.trip.status, 'sailing');
  assert.equal(r.alliance.trip.arrivesAt - r.alliance.trip.departedAt, DAY);
  assert.deepEqual(names(r.alliance), ['Ana', 'Bea', 'Cai']);
});

test('si más de la mitad dice que no, se cancela; un empate no', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai'), dan = player('Dan');
  await allianceOf(ana, bea, cai, dan);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  await bea.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  let r = await cai.post('/trip/vote', { tripId: trip.id, vote: 'no' });   // 2 de 4: empate
  assert.equal(r.alliance.trip.status, 'open');
  r = await dan.post('/trip/vote', { tripId: trip.id, vote: 'no' });        // 3 de 4
  assert.equal(r.alliance.trip, null);
  assert.equal(r.alliance.system, 'madre');
  assert.deepEqual((await chat(ana)).map((m) => m.kind), ['trip', 'trip_cancel']);
  assert.equal((await ana.post('/trip', { to: 'zeta' })).status, 201);   // se puede proponer otro
});

test('el voto se puede cambiar mientras esté abierta', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai');
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  await bea.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  const r = await bea.post('/trip/vote', { tripId: trip.id, vote: 'yes' });
  assert.deepEqual(r.alliance.trip.votes.find((v) => v.userId === bea.id).vote, 'yes');
  assert.equal((await bea.post('/trip/vote', { tripId: trip.id, vote: 'quizá' })).error, 'bad_request');
  assert.equal((await bea.post('/trip/vote', { tripId: 'otro', vote: 'yes' })).error, 'no_trip');
});

test('a los 3 días zarpan los del sí; los demás se quedan y salen de la alianza', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai');
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await bea.post('/trip', { to: 'betelgeuse' });   // Bea propone
  await cai.post('/trip/vote', { tripId: trip.id, vote: 'no' });                  // Ana no vota
  mock.timers.tick(TRIP_VOTE_MS);
  const r = await bea.get();
  assert.equal(r.alliance.trip.status, 'sailing');
  assert.equal(r.alliance.trip.departedAt, trip.closesAt);
  assert.equal(r.alliance.system, 'betelgeuse');
  assert.deepEqual(names(r.alliance), ['Bea']);
  assert.equal(r.alliance.founderId, bea.id);   // Ana era la fundadora y se ha quedado
  assert.deepEqual(await ana.get(), { status: 200, alliance: null, invites: [] });
  const stays = (await chat(bea)).filter((m) => m.kind === 'trip_stay');
  assert.deepEqual(stays.map((m) => [m.userId, m.body]).sort(), [[ana.id, 'madre'], [cai.id, 'madre']]);
});

test('sin ningún sí al cumplirse el plazo, se cancela', async () => {
  const ana = player('Ana'), bea = player('Bea');
  await allianceOf(ana, bea);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  await ana.post('/trip/vote', { tripId: trip.id, vote: 'no' });   // 1 de 2: empate, sigue abierta
  mock.timers.tick(TRIP_VOTE_MS);
  const r = await ana.get();
  assert.equal(r.alliance.trip, null);
  assert.deepEqual(names(r.alliance), ['Ana', 'Bea']);
});

test('quien propone puede retirarla; los demás no', async () => {
  const ana = player('Ana'), bea = player('Bea');
  await allianceOf(ana, bea);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  assert.equal((await bea.post('/trip/withdraw', { tripId: trip.id })).error, 'not_proposer');
  const r = await ana.post('/trip/withdraw', { tripId: trip.id });
  assert.equal(r.alliance.trip, null);
  assert.deepEqual((await chat(bea)).map((m) => m.kind), ['trip', 'trip_withdraw']);
});

test('la invitación dice dónde está la alianza, y quien entra después vota y cuenta para la mayoría', async () => {
  const ana = player('Ana'), bea = player('Bea');
  const id = await allianceOf(ana);
  await ana.post('/invite', { userId: bea.id });
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });   // alianza de uno: zarpa al momento
  assert.equal(trip.status, 'sailing');
  mock.timers.tick(3 * DAY);
  const inv = await bea.get();
  assert.deepEqual(inv.invites.map((i) => [i.allianceId, i.system]), [[id, 'zeta']]);   // la invitación dice dónde está
  await bea.post('/accept', { allianceId: id });
  const back = await bea.post('/trip', { to: 'madre' });
  assert.equal(back.alliance.trip.status, 'open');   // Ana aún no ha votado
  const r = await ana.post('/trip/vote', { tripId: back.alliance.trip.id, vote: 'yes' });
  assert.equal(r.alliance.trip.status, 'sailing');
  assert.equal(r.alliance.trip.arrivesAt - r.alliance.trip.departedAt, 3 * DAY);   // volver dura lo que se tardó en ir
});

test('durante el salto no se propone otro; al llegar queda como último viaje', async () => {
  const ana = player('Ana');
  await allianceOf(ana);
  await ana.post('/trip', { to: 'canopo' });
  assert.equal((await ana.post('/trip', { to: 'madre' })).error, 'trip_busy');
  mock.timers.tick(4 * DAY);
  const r = await ana.get();
  assert.equal(r.alliance.trip.status, 'done');
  assert.equal(r.alliance.system, 'canopo');
  assert.equal((await ana.post('/trip', { to: 'madre' })).status, 201);
});

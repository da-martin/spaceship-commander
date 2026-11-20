// Viajes de la alianza en el servidor (docs/plan-viajes.md, fase 4):
// propuesta, votos, salida perezosa e hitos en el chat.
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_DAYS, jumpDays as serverDays } from '../src/alliance.js';
import { SYSTEMS, jumpDays } from '../public/js/systems.js';
import { server } from './server.js';

const DAY = 864e5, T0 = Date.parse('2026-11-20T10:00:00Z');
let player, allianceOf, env;
beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: T0 });
  ({ env, player, allianceOf } = server({ TRAVEL_ON: '1' }));
});
afterEach(() => mock.timers.reset());
const later = (ms) => mock.timers.tick(ms);

const names = (a) => a.members.map((m) => m.name).sort();
const chat = async (p) => (await p.get('/messages')).messages.filter((m) => m.kind.startsWith('trip_')).map((m) => `${m.kind}:${m.name ?? ''}:${m.body}`);

test('los días de salto del servidor son los del juego', () => {
  assert.deepEqual(Object.keys(SYSTEM_DAYS).sort(), Object.keys(SYSTEMS).sort());
  for (const a of Object.keys(SYSTEMS)) for (const b of Object.keys(SYSTEMS)) if (a !== b) assert.equal(serverDays(a, b), jumpDays(a, b), `${a} → ${b}`);
});

test('cerrados: sin TRAVEL_ON las rutas de viaje no existen', async () => {
  ({ player, allianceOf } = server());
  const ana = player('Ana');
  await allianceOf(ana);
  assert.equal((await ana.post('/trip', { to: 'zeta' })).status, 404);
  assert.equal((await ana.get()).alliance.trip, null);
});

test('sin la migración 0009 las alianzas siguen igual y los viajes responden «no preparado»', async () => {
  ({ player, allianceOf } = server({ TRAVEL_ON: '1' }, ['0009']));
  const ana = player('Ana'), bea = player('Bea');
  const r = await ana.post('', { name: 'Los Valientes', system: 'zeta' });
  assert.equal(r.status, 201);
  assert.equal(r.alliance.system, 'madre');
  assert.equal(r.alliance.trip, null);
  await ana.post('/invite', { userId: bea.id });
  assert.deepEqual((await bea.get()).invites.map((i) => [i.system, i.bound]), [['madre', null]]);
  assert.equal((await bea.post('/accept', { allianceId: r.alliance.id })).alliance.members.length, 2);
  assert.equal((await ana.post('/trip', { to: 'zeta' })).error, 'not_ready');
});

test('la alianza nace en el sistema de quien la funda; uno desconocido es el Sistema Madre', async () => {
  const ana = player('Ana'), bea = player('Bea');
  assert.equal((await ana.post('', { name: 'Los Valientes', system: 'canopo' })).alliance.system, 'canopo');
  assert.equal((await bea.post('', { name: 'Las Otras', system: 'narnia' })).alliance.system, 'madre');
});

test('alianza de uno: proponer es zarpar al momento', async () => {
  const ana = player('Ana');
  await allianceOf(ana);
  const r = await ana.post('/trip', { to: 'zeta' });
  assert.equal(r.status, 201);
  assert.equal(r.alliance.system, 'zeta');
  assert.equal(r.alliance.trip, null);
  assert.deepEqual(r.alliance.jump, { id: r.alliance.jump.id, from: 'madre', to: 'zeta', departedAt: T0, arrivesAt: T0 + 3 * DAY });
  assert.deepEqual(await chat(ana), ['trip_propose:Ana:zeta', 'trip_sail::zeta']);
});

test('proponer: solo destinos con ruta, una votación a la vez, nunca en pleno salto', async () => {
  const ana = player('Ana'), bea = player('Bea');
  await allianceOf(ana, bea);
  assert.equal((await ana.post('/trip', { to: 'madre' })).error, 'bad_destination');
  assert.equal((await ana.post('/trip', { to: 'narnia' })).error, 'bad_destination');
  const r = await ana.post('/trip', { to: 'umbral' });
  assert.equal(r.alliance.trip.to, 'umbral');
  assert.equal(r.alliance.trip.proposedBy, ana.id);
  assert.equal(r.alliance.trip.closesAt, T0 + 3 * DAY);
  assert.deepEqual(r.alliance.trip.votes, { [ana.id]: 'yes' });
  assert.equal((await bea.post('/trip', { to: 'zeta' })).error, 'trip_open');
  await bea.post('/trip/vote', { tripId: r.alliance.trip.id, vote: 'yes' });
  assert.equal((await bea.post('/trip', { to: 'madre' })).error, 'jumping');
  later(DAY);   // el Umbral está a 1 día: ya han llegado
  const back = await bea.post('/trip', { to: 'madre' });
  assert.equal(back.status, 201);
  assert.equal(back.alliance.trip.from, 'umbral');
  // desde un sistema que no es el Sistema Madre solo se vuelve a él
  assert.equal((await bea.post('/trip/withdraw')).status, 200);
  assert.equal((await bea.post('/trip', { to: 'zeta' })).error, 'bad_destination');
});

test('todos que sí: zarpan en ese momento', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai');
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'canopo' });
  later(3600e3);
  assert.equal((await bea.post('/trip/vote', { tripId: trip.id, vote: 'yes' })).alliance.trip.votes[bea.id], 'yes');
  const r = await cai.post('/trip/vote', { tripId: trip.id, vote: 'yes' });
  assert.equal(r.alliance.trip, null);
  assert.equal(r.alliance.system, 'canopo');
  assert.equal(r.alliance.jump.departedAt, T0 + 3600e3);
  assert.equal(r.alliance.jump.arrivesAt, T0 + 3600e3 + 4 * DAY);
  assert.deepEqual(names(r.alliance), ['Ana', 'Bea', 'Cai']);
});

test('más de la mitad que no: se cancela en ese momento; un empate no', async () => {
  const [ana, bea, cai, dan] = ['Ana', 'Bea', 'Cai', 'Dan'].map(player);
  await allianceOf(ana, bea, cai, dan);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  await bea.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  const tie = await cai.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  assert.equal(tie.alliance.trip.id, trip.id);   // 2 de 4: sigue abierta
  const r = await dan.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  assert.equal(r.alliance.trip, null);
  assert.equal(r.alliance.jump, null);
  assert.equal(r.alliance.system, 'madre');
  assert.deepEqual(await chat(ana), ['trip_propose:Ana:zeta', 'trip_cancel::zeta']);
});

test('se puede cambiar el voto mientras esté abierta, y solo en la votación que se ve', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai');
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  await bea.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  const r = await bea.post('/trip/vote', { tripId: trip.id, vote: 'yes' });
  assert.deepEqual(r.alliance.trip.votes, { [ana.id]: 'yes', [bea.id]: 'yes' });
  assert.equal((await cai.post('/trip/vote', { tripId: 'otra', vote: 'yes' })).error, 'no_trip');
  assert.equal((await cai.post('/trip/vote', { tripId: trip.id, vote: 'quizá' })).error, 'bad_request');
});

test('al cabo de 3 días zarpan los del sí; los demás se quedan y salen de la alianza', async () => {
  const [ana, bea, cai, dan] = ['Ana', 'Bea', 'Cai', 'Dan'].map(player);
  await allianceOf(ana, bea, cai, dan);
  const { alliance: { trip } } = await bea.post('/trip', { to: 'betelgeuse' });
  await ana.post('/trip/vote', { tripId: trip.id, vote: 'yes' });   // la fundadora va
  await cai.post('/trip/vote', { tripId: trip.id, vote: 'no' });    // Dan no vota
  later(3 * DAY - 1);
  assert.equal((await bea.get()).alliance.trip.id, trip.id);
  later(5 * DAY);   // nadie abrió la app al cerrar: se resuelve con la hora del cierre
  const r = await bea.get();
  assert.deepEqual(names(r.alliance), ['Ana', 'Bea']);
  assert.equal(r.alliance.founderId, ana.id);
  assert.equal(r.alliance.system, 'betelgeuse');
  assert.equal(r.alliance.jump.departedAt, T0 + 3 * DAY);
  assert.equal(r.alliance.jump.arrivesAt, T0 + 8 * DAY);
  for (const p of [cai, dan]) assert.equal((await p.get()).alliance, null);
  const kinds = (await chat(bea)).sort();
  assert.deepEqual(kinds, ['trip_propose:Bea:betelgeuse', 'trip_sail::betelgeuse', 'trip_stay:Cai:madre', 'trip_stay:Dan:madre']);
});

test('el fundador tiene la última palabra: si vota que no, se cancela al momento', async () => {
  const [ana, bea, cai] = ['Ana', 'Bea', 'Cai'].map(player);
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await bea.post('/trip', { to: 'zeta' });
  await cai.post('/trip/vote', { tripId: trip.id, vote: 'yes' });
  const r = await ana.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  assert.equal(r.alliance.trip, null);
  assert.equal(r.alliance.system, 'madre');
  assert.deepEqual(names(r.alliance), ['Ana', 'Bea', 'Cai']);
  assert.deepEqual(await chat(bea), ['trip_propose:Bea:zeta', 'trip_cancel:Ana:zeta']);
});

test('sin el voto del fundador, al cerrar se cancela y no sale nadie', async () => {
  const [ana, bea, cai] = ['Ana', 'Bea', 'Cai'].map(player);
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await bea.post('/trip', { to: 'zeta' });
  await cai.post('/trip/vote', { tripId: trip.id, vote: 'yes' });
  later(3 * DAY);
  const r = await bea.get();
  assert.equal(r.alliance.trip, null);
  assert.equal(r.alliance.jump, null);
  assert.deepEqual(names(r.alliance), ['Ana', 'Bea', 'Cai']);
  assert.deepEqual(await chat(bea), ['trip_propose:Bea:zeta', 'trip_cancel::zeta']);
});

test('si el fundador sale, la última palabra pasa a quien hereda el cargo', async () => {
  const [ana, bea, cai] = ['Ana', 'Bea', 'Cai'].map(player);
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await cai.post('/trip', { to: 'zeta' });
  await ana.post('/leave');   // hereda Bea
  const r = await bea.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  assert.equal(r.alliance.trip, null);
});

test('al cerrar sin ningún sí, se cancela', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai');
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  await ana.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  later(3 * DAY);
  const r = await bea.get();
  assert.equal(r.alliance.trip, null);
  assert.deepEqual(names(r.alliance), ['Ana', 'Bea', 'Cai']);
  assert.equal(r.alliance.system, 'madre');
});

test('quien entra con una votación abierta también vota y cuenta para la mayoría', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai');
  await allianceOf(ana, bea);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  await bea.post('/trip/vote', { tripId: trip.id, vote: 'no' });   // 1 de 2: empate
  const id = (await ana.get()).alliance.id;
  await ana.post('/invite', { userId: cai.id });
  const r = await cai.post('/accept', { allianceId: id });
  assert.equal(r.alliance.trip.id, trip.id);
  const yes = await cai.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  assert.equal(yes.alliance.trip, null);   // 2 de 3 dicen que no
});

test('quien sale no cuenta: sus votos dejan de valer', async () => {
  const ana = player('Ana'), bea = player('Bea'), cai = player('Cai');
  await allianceOf(ana, bea, cai);
  const { alliance: { trip } } = await ana.post('/trip', { to: 'zeta' });
  await bea.post('/trip/vote', { tripId: trip.id, vote: 'no' });
  await bea.post('/leave');
  const r = await cai.post('/trip/vote', { tripId: trip.id, vote: 'yes' });
  assert.equal(r.alliance.system, 'zeta');   // los dos que quedan dicen que sí
});

test('retirar: solo quien la propuso, y queda en el chat', async () => {
  const ana = player('Ana'), bea = player('Bea');
  await allianceOf(ana, bea);
  await ana.post('/trip', { to: 'zeta' });
  assert.equal((await bea.post('/trip/withdraw')).error, 'not_proposer');
  const r = await ana.post('/trip/withdraw');
  assert.equal(r.alliance.trip, null);
  assert.equal((await ana.post('/trip/withdraw')).error, 'no_trip');
  assert.deepEqual(await chat(bea), ['trip_propose:Ana:zeta', 'trip_withdraw:Ana:zeta']);
});

test('el último salto sigue en la foto después de llegar; la invitación dice dónde está la alianza', async () => {
  const ana = player('Ana'), bea = player('Bea');
  const id = await allianceOf(ana);
  const { alliance: { jump } } = await ana.post('/trip', { to: 'zeta' });
  await ana.post('/invite', { userId: bea.id });
  assert.deepEqual((await bea.get()).invites.map((i) => [i.system, i.bound]), [['zeta', 'zeta']]);
  later(3 * DAY);
  const r = await ana.get();
  assert.deepEqual(r.alliance.jump, jump);
  assert.equal(env.DB.raw.prepare('SELECT status FROM alliance_trips').get().status, 'done');
  assert.deepEqual((await bea.get()).invites.map((i) => [i.allianceId, i.system, i.bound]), [[id, 'zeta', null]]);
});

test('sin alianza no hay viaje', async () => {
  const ana = player('Ana');
  assert.equal((await ana.post('/trip', { to: 'zeta' })).error, 'no_alliance');
  assert.equal((await ana.post('/trip/vote', { tripId: 'x', vote: 'yes' })).error, 'no_alliance');
  assert.equal((await ana.post('/trip/withdraw')).error, 'no_alliance');
});

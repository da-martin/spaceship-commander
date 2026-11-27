// Rutas por etapas (docs/plan-misiones-rutas.md, fase D1): tramos, puntos de ruta y cartas.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LEG_KINDS, LEG_MATS, LEGS } from '../public/js/config.js';
import { contractFrom } from '../public/js/core/missions.js';
import { legCards, newRoute, pickLeg } from '../public/js/core/route.js';
import { addEffort, finishIfDone, onUndo } from '../public/js/core/ship.js';
import { normShip } from '../public/js/store.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

// misión media de 30 puntos aceptada hoy: tres tramos de 10
const accept = (over = {}) => contractFrom({ id: 'm1', kind: 'open', mid: 'esc-magnate', topic: 'Escolta', flavor: 'x', diff: 'normal', size: 'mid', window: 4, quota: 30,
  reward: { mc: 360, mats: {} }, urgent: false, postedOn: '2026-11-14', threat: 'pirates', ...over });
const go = (n) => addEffort(n, '2026-11-14', {}, { kind: 'task', diff: 'normal' });

test('tramos por tamaño: el primero directo y la cuota es su suma', () => {
  fresh();
  for (const [size, n] of Object.entries(LEGS)) {
    const quota = { short: 15, mid: 30, long: 60 }[size], r = newRoute({ size, quota });
    assert.equal(r.legs.length, n, size);
    assert.equal(r.legs[0].kind, 'direct');
    assert.ok(r.legs.slice(1).every((l) => l.kind === null));
    assert.equal(r.legs.reduce((a, l) => a + l.len, 0), quota, size);
  }
});

test('las misiones sin plazo traen ruta; los capítulos de historia y las urgentes, no', () => {
  fresh();
  assert.equal(accept().route.legs.length, 3);
  assert.equal(accept({ story: true }).route, undefined);
  assert.equal(contractFrom({ kind: 'run', days: 3, quota: 9, reward: { mc: 1 }, postedOn: '2026-11-14' }).route, undefined);
});

test('las cartas: Directo siempre y otras dos distintas', () => {
  fresh();
  for (let i = 0; i < 30; i++) {
    const c = legCards();
    assert.equal(c.length, 3); assert.equal(c[0], 'direct'); assert.equal(new Set(c).size, 3);
    assert.ok(c.every((k) => LEG_KINDS[k]));
  }
});

test('al acabar un tramo llega el punto de ruta, y lo que sobra ya cuenta para el siguiente', () => {
  const s = fresh();
  s.ship.contract = accept();
  go(8); assert.equal(s.ship.contract.route.pick, null);
  go(4);
  const r = s.ship.contract.route;
  assert.deepEqual([r.legs[0].done, r.at, r.pick.length], [true, 1, 3]);
  assert.equal(s.ship.contract.progress, 12);
  assert.ok(s.ship.log.some((e) => e.title === 'Tramo 1 de 3 completado'));
});

test('el atajo acorta el tramo y la misión, y el próximo impacto será fuerte', () => {
  const s = fresh();
  s.ship.contract = { ...accept(), heavy: false };
  go(10);
  s.ship.contract.route.pick = ['direct', 'short', 'mine'];
  assert.equal(pickLeg('short'), true);
  const c = s.ship.contract;
  assert.deepEqual([c.route.legs[1].len, c.quota, c.heavy, c.route.pick], [7, 27, true, null]);
  assert.equal(pickLeg('mine'), false);   // ya elegido
});

test('el yacimiento da sus materiales al completarse, una sola vez aunque se deshaga y se rehaga', () => {
  const s = fresh();
  s.ship.contract = accept();
  go(10);
  s.ship.contract.route.pick = ['direct', 'mine', 'station'];
  pickLeg('mine');   // 13 puntos: acaba en 23
  const g = {}; addEffort(13, '2026-11-14', g, {}); g.c = 'm1'; g.day = '2026-11-14'; g.ef = 13;
  const mats = () => Object.values(s.ship.contract.reward.mats).reduce((a, n) => a + n, 0);
  assert.equal(mats(), LEG_MATS);
  onUndo(g); addEffort(13, '2026-11-14', {}, {});
  assert.equal(mats(), LEG_MATS);
});

test('la estación repara el módulo más dañado y recarga el escudo', () => {
  const s = fresh({ modules: { comms: { lv: 1, cond: 50 }, bridge: { lv: 1, cond: 80 } } });
  s.ship.contract = { ...accept(), shield: { armed: false, readyOn: '2026-11-20' } };
  go(10);
  s.ship.contract.route.pick = ['direct', 'station', 'short'];
  pickLeg('station'); go(10);
  assert.equal(s.ship.modules.comms.cond, 60);
  assert.equal(s.ship.contract.shield.readyOn, '2026-11-14');
});

test('si no eliges, el tramo cuenta como directo; un avance grande cruza dos puntos de ruta', () => {
  const s = fresh();
  s.ship.contract = accept({ size: 'long', quota: 60 });   // cuatro tramos de 15
  go(31);
  const r = s.ship.contract.route;
  assert.deepEqual(r.legs.map((l) => l.kind), ['direct', 'direct', null, null]);
  assert.equal(r.at, 2);
  assert.equal(r.pick.length, 3);
});

test('un atajo que deja la misión cumplida la completa al elegirlo', () => {
  const s = fresh();
  s.ship.contract = accept({ size: 'short', quota: 15 });   // dos tramos de 7,5
  go(13);
  s.ship.contract.route.pick = ['direct', 'short', 'mine'];
  pickLeg('short');   // el segundo tramo pasa a 5: total 12,5
  assert.equal(finishIfDone(), true);
  assert.equal(s.ship.contract, null);
  assert.equal(s.cmd.stats.missions, 1);
});

test('las misiones sin ruta siguen como antes', () => {
  const s = fresh();
  const { route, ...old } = accept();
  s.ship.contract = old;
  go(12);
  assert.equal(s.ship.contract.progress, 12);
  assert.equal(s.ship.contract.route, undefined);
});

test('las partidas guardan la ruta y su cuota; una ruta rota se descarta', () => {
  fresh();
  const c = accept();
  c.route.legs[1] = { ...c.route.legs[1], kind: 'mine', len: 13 };
  const sh = normShip({ contract: c });
  assert.equal(sh.contract.route.legs[1].kind, 'mine');
  assert.equal(sh.contract.quota, 33);
  const broken = normShip({ contract: { ...accept(), route: { legs: [{ kind: 'direct', len: 0, base: 10 }, {}], at: 0 } } }).contract;
  assert.equal(broken.route, undefined);
  const picked = normShip({ contract: { ...accept(), route: { ...accept().route, at: 0, pick: ['direct', 'mine'] } } }).contract;
  assert.equal(picked.route.pick, null);   // el tramo 1 ya tiene tipo: no hay nada que elegir
});

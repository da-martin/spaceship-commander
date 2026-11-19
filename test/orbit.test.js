// Misiones sin plazo (docs/plan-viajes.md, fase 2): se hacen en órbita, sin
// salir del sistema, y terminan al reunir la cuota o al abandonarlas.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ORBIT_DAYS, ORBIT_P, OFFER_TTL, XP_CONTRACT } from '../public/js/config.js';
import { crewPayroll, returnHome } from '../public/js/core/crew.js';
import { agedMc, avgDaily, checkContractEnd, contractFrom, docked, freshOffer, genOffer, genOrbitOffer } from '../public/js/core/missions.js';
import { addEffort, onUndo } from '../public/js/core/ship.js';
import { normShip } from '../public/js/store.js';
import { MISSIONS } from '../public/js/missions.js';
import { addDays } from '../public/js/util.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

const orbit = (over = {}) => ({
  id: 'o1', kind: 'orbit', mid: 'exp-nebulosa', topic: 'Exploración', flavor: 'x', diff: 'normal', quota: 10, progress: 0,
  reward: { mc: 120, mats: { ale: 2 } }, urgent: false, postedOn: '2026-11-10',
  acceptedOn: '2026-11-10', acceptedAt: new Date('2026-11-10T10:00:00').getTime(), ...over,
});

test('por ahora no llegan misiones sin plazo al tablón', () => {
  fresh({ modules: { engines: { lv: 3, cond: 100 } } });
  assert.equal(ORBIT_P, 0);
  for (let i = 0; i < 200; i++) assert.equal(genOffer('2026-11-14').kind, 'run');
});

const ORBIT_IDS = new Set(MISSIONS.filter((m) => m.orbit).map((m) => m.id));

test('las misiones de órbita solo salen sin plazo, y las demás solo con plazo', () => {
  fresh({ modules: { engines: { lv: 3, cond: 100 } } });
  assert.ok(ORBIT_IDS.size >= 8);
  for (let i = 0; i < 200; i++) assert.ok(!ORBIT_IDS.has(genOffer('2026-11-14').mid));
  for (let i = 0; i < 30; i++) assert.ok(ORBIT_IDS.has(genOrbitOffer('2026-11-14').mid));
});

test('una oferta sin plazo: sin días, nunca urgente, con su cuota y su caducidad en el tablón', () => {
  fresh();
  for (let i = 0; i < 30; i++) {
    const o = genOrbitOffer('2026-11-14');
    assert.equal(o.kind, 'orbit');
    assert.equal(o.days, undefined);
    assert.equal(o.urgent, false);
    assert.ok(o.quota >= 2);
    assert.ok(o.quota >= Math.round(ORBIT_DAYS[0] * avgDaily() * 0.5) - 1);
    assert.ok(o.expiresOn >= addDays('2026-11-14', OFFER_TTL[0] - 1) && o.expiresOn <= addDays('2026-11-14', OFFER_TTL[1] - 1));
  }
});

test('la paga de una sin plazo no sube con la espera', () => {
  fresh();
  assert.equal(agedMc({ kind: 'orbit', reward: { mc: 100 }, postedOn: '2026-11-11' }), 100);
  assert.equal(agedMc({ kind: 'run', reward: { mc: 100 }, postedOn: '2026-11-11' }), 115);
});

test('una sin plazo no cuenta como misión fácil para el tablón', () => {
  fresh();
  const o = freshOffer([orbit({ diff: 'easy' })], '2026-11-14');
  assert.ok(['easy', 'normal'].includes(o.diff));
  assert.equal(o.urgent, false);
});

test('aceptar: con plazo vence en sus días; sin plazo no tiene fin', () => {
  fresh();
  const now = new Date();
  const run = contractFrom({ kind: 'run', days: 3, reward: { mc: 50 }, postedOn: '2026-11-14' }, now);
  assert.equal(run.endsOn, '2026-11-17');
  assert.equal(run.endsAt, new Date('2026-11-17T10:00:00').getTime());
  const orb = contractFrom(orbit({ acceptedOn: undefined, acceptedAt: undefined, progress: 5 }), now);
  assert.equal(orb.endsAt, undefined);
  assert.equal(orb.endsOn, undefined);
  assert.deepEqual([orb.acceptedOn, orb.acceptedAt, orb.progress], ['2026-11-14', now.getTime(), 0]);
});

test('con una sin plazo en curso sigues atracado en el sistema', () => {
  const s = fresh();
  s.ship.contract = orbit();
  assert.equal(docked(), true);
});

test('no vence nunca: lo hecho semanas después sigue contando', () => {
  const s = fresh();
  s.ship.contract = orbit({ progress: 2 });
  clock('2026-12-20T10:00:00');
  assert.equal(checkContractEnd(), false);
  assert.equal(addEffort(1), 'o1');
  assert.equal(s.ship.contract.progress, 3);
  onUndo({ c: 'o1', ef: 1, day: '2026-12-20' });
  assert.equal(s.ship.contract.progress, 2);
});

test('lo de antes de aceptarla no cuenta', () => {
  const s = fresh();
  s.ship.contract = orbit({ acceptedOn: '2026-11-14' });
  assert.equal(addEffort(1, '2026-11-13'), null);
});

test('al reunir la cuota cobra, da méritos y no hay vuelta que anunciar', () => {
  const s = fresh();
  s.ship.contract = orbit({ progress: 9 });
  assert.equal(addEffort(1), 'o1');
  assert.equal(s.ship.contract, null);
  assert.equal(s.wallet.mc, 120);
  assert.equal(s.wallet.ale, 2);
  assert.equal(s.cmd.stats.missions, 1);
  assert.equal(s.cmd.xp, XP_CONTRACT);
  const e = s.ship.log.at(-1);
  assert.equal(e.tone, 'win');
  assert.deepEqual(e.lines, []);
});

test('en órbita, quien termina su contrato se marcha como en el sistema', () => {
  const s = fresh();
  s.ship.contract = orbit();
  s.ship.crew = [{ id: 'm1', name: 'Lina Okafor', role: 'pilot', lv: 1, xp: 0, wage: 45, until: '2026-11-13', cancel: true, idle: false }];
  crewPayroll('2026-11-14');
  assert.equal(s.ship.crew.length, 0);
  assert.equal(returnHome(), null);
});

test('las partidas guardan la misión sin plazo; sin fecha de aceptación no vale', () => {
  const sh = normShip({ contract: orbit() });
  assert.equal(sh.contract.kind, 'orbit');
  assert.equal(sh.contract.endsAt, undefined);
  assert.equal(normShip({ contract: orbit({ acceptedAt: undefined }) }).contract, null);
  const offers = normShip({ board: { offers: [orbit({ expiresOn: '2026-11-16' })] } }).board.offers;
  assert.equal(offers[0].days, undefined);   // a una sin plazo no se le ponen días
});

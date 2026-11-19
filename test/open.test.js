// Misiones sin plazo (docs/plan-viajes.md, fase 2): te sacan del sistema
// como cualquier otra y terminan al reunir la cuota o al abandonarlas.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OPEN_DAYS, OPEN_P, OFFER_TTL, XP_CONTRACT } from '../public/js/config.js';
import { crewPayroll, returnHome } from '../public/js/core/crew.js';
import { agedMc, avgDaily, checkContractEnd, contractFrom, docked, freshOffer, genOffer, genOpenOffer } from '../public/js/core/missions.js';
import { addEffort, onUndo } from '../public/js/core/ship.js';
import { normShip } from '../public/js/store.js';
import { MISSIONS } from '../public/js/missions.js';
import { addDays } from '../public/js/util.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

const open = (over = {}) => ({
  id: 'o1', kind: 'open', mid: 'exp-nebulosa', topic: 'Exploración', flavor: 'x', diff: 'normal', quota: 10, progress: 0,
  reward: { mc: 120, mats: { ale: 2 } }, urgent: false, postedOn: '2026-11-10',
  acceptedOn: '2026-11-10', acceptedAt: new Date('2026-11-10T10:00:00').getTime(), ...over,
});

test('por ahora no llegan misiones sin plazo al tablón', () => {
  fresh({ modules: { engines: { lv: 3, cond: 100 } } });
  assert.equal(OPEN_P, 0);
  for (let i = 0; i < 200; i++) assert.equal(genOffer('2026-11-14').kind, 'run');
});

const OPEN_IDS = new Set(MISSIONS.filter((m) => m.open).map((m) => m.id));

test('las misiones marcadas solo salen sin plazo, y las demás solo con plazo', () => {
  fresh({ modules: { engines: { lv: 3, cond: 100 } } });
  assert.equal(OPEN_IDS.size, 8);
  for (let i = 0; i < 200; i++) assert.ok(!OPEN_IDS.has(genOffer('2026-11-14').mid));
  for (let i = 0; i < 30; i++) assert.ok(OPEN_IDS.has(genOpenOffer('2026-11-14').mid));
});

test('una oferta sin plazo: sin días, nunca urgente, con su cuota y su caducidad en el tablón', () => {
  fresh();
  for (let i = 0; i < 30; i++) {
    const o = genOpenOffer('2026-11-14');
    assert.equal(o.kind, 'open');
    assert.equal(o.days, undefined);
    assert.equal(o.urgent, false);
    assert.ok(o.quota >= 2);
    assert.ok(o.quota >= Math.round(OPEN_DAYS[0] * avgDaily() * 0.5) - 1);
    assert.ok(o.expiresOn >= addDays('2026-11-14', OFFER_TTL[0] - 1) && o.expiresOn <= addDays('2026-11-14', OFFER_TTL[1] - 1));
  }
});

test('la paga de una sin plazo no sube con la espera', () => {
  fresh();
  assert.equal(agedMc({ kind: 'open', reward: { mc: 100 }, postedOn: '2026-11-11' }), 100);
  assert.equal(agedMc({ kind: 'run', reward: { mc: 100 }, postedOn: '2026-11-11' }), 115);
});

test('una sin plazo no cuenta como misión fácil para el tablón', () => {
  fresh();
  const o = freshOffer([open({ diff: 'easy' })], '2026-11-14');
  assert.ok(['easy', 'normal'].includes(o.diff));
  assert.equal(o.urgent, false);
});

test('aceptar: con plazo vence en sus días; sin plazo no tiene fin', () => {
  fresh();
  const now = new Date();
  const run = contractFrom({ kind: 'run', days: 3, reward: { mc: 50 }, postedOn: '2026-11-14' }, now);
  assert.equal(run.endsOn, '2026-11-17');
  assert.equal(run.endsAt, new Date('2026-11-17T10:00:00').getTime());
  const orb = contractFrom(open({ acceptedOn: undefined, acceptedAt: undefined, progress: 5 }), now);
  assert.equal(orb.endsAt, undefined);
  assert.equal(orb.endsOn, undefined);
  assert.deepEqual([orb.acceptedOn, orb.acceptedAt, orb.progress], ['2026-11-14', now.getTime(), 0]);
});

test('con una sin plazo en curso estás fuera del sistema, como en cualquier misión', () => {
  const s = fresh();
  s.ship.contract = open();
  assert.equal(docked(), false);
});

test('no vence nunca: lo hecho semanas después sigue contando', () => {
  const s = fresh();
  s.ship.contract = open({ progress: 2 });
  clock('2026-12-20T10:00:00');
  assert.equal(checkContractEnd(), false);
  assert.equal(addEffort(1), 'o1');
  assert.equal(s.ship.contract.progress, 3);
  onUndo({ c: 'o1', ef: 1, day: '2026-12-20' });
  assert.equal(s.ship.contract.progress, 2);
});

test('lo de antes de aceptarla no cuenta', () => {
  const s = fresh();
  s.ship.contract = open({ acceptedOn: '2026-11-14' });
  assert.equal(addEffort(1, '2026-11-13'), null);
});

test('al reunir la cuota cobra, da méritos y vuelve al sistema', () => {
  const s = fresh();
  s.ship.contract = open({ progress: 9 });
  assert.equal(addEffort(1), 'o1');
  assert.equal(s.ship.contract, null);
  assert.equal(s.wallet.mc, 120);
  assert.equal(s.wallet.ale, 2);
  assert.equal(s.cmd.stats.missions, 1);
  assert.equal(s.cmd.xp, XP_CONTRACT);
  const e = s.ship.log.at(-1);
  assert.equal(e.tone, 'win');
  assert.deepEqual(e.lines, ['De vuelta en el Sistema Madre']);
});

test('fuera, quien termina su contrato sigue a bordo hasta volver, como en cualquier misión', () => {
  const s = fresh();
  s.ship.contract = open();
  s.ship.crew = [{ id: 'm1', name: 'Lina Okafor', role: 'pilot', lv: 1, xp: 0, wage: 45, until: '2026-11-13', cancel: true, idle: false }];
  crewPayroll('2026-11-14');
  assert.equal(s.ship.crew[0].idle, true);
  assert.equal(returnHome(), 'Lina Okafor desembarca en el Sistema Madre');
});

test('las partidas guardan la misión sin plazo; sin fecha de aceptación no vale', () => {
  const sh = normShip({ contract: open() });
  assert.equal(sh.contract.kind, 'open');
  assert.equal(sh.contract.endsAt, undefined);
  assert.equal(normShip({ contract: open({ acceptedAt: undefined }) }).contract, null);
  const offers = normShip({ board: { offers: [open({ expiresOn: '2026-11-16' })] } }).board.offers;
  assert.equal(offers[0].days, undefined);   // a una sin plazo no se le ponen días
});

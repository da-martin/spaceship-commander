// Misiones sin plazo (docs/plan-viajes.md, fase 2): te sacan del sistema
// como cualquier otra y terminan al reunir la cuota o al abandonarlas.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFS, OFFER_TTL, SIZES, SPEED_BONUS, XP_CONTRACT } from '../public/js/config.js';
import { crewPayroll, missionCrewXp, returnHome } from '../public/js/core/crew.js';
import { agedMc, checkContractEnd, contractFrom, docked, freshOffer, genOffer, genOpenOffer } from '../public/js/core/missions.js';
import { addEffort, onUndo } from '../public/js/core/ship.js';
import { normShip } from '../public/js/store.js';
import { HOME, SYSTEMS } from '../public/js/systems.js';
import { addDays } from '../public/js/util.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

const open = (over = {}) => ({
  id: 'o1', kind: 'open', mid: 'exp-nebulosa', topic: 'Exploración', flavor: 'x', diff: 'normal', quota: 10, progress: 0,
  reward: { mc: 120, mats: { ale: 2 } }, urgent: false, postedOn: '2026-11-10',
  acceptedOn: '2026-11-10', acceptedAt: new Date('2026-11-10T10:00:00').getTime(), ...over,
});

test('las no urgentes llegan sin plazo; las urgentes, con plazo', () => {
  fresh({ modules: { engines: { lv: 3, cond: 100 } } });
  let open = 0, run = 0;
  for (let i = 0; i < 200; i++) { const o = genOffer('2026-11-14'); if (o.urgent) { assert.equal(o.kind, 'run'); run++; } else { assert.equal(o.kind, 'open'); open++; } }
  assert.ok(open > run && run > 0);
});

const OPEN_IDS = new Set(SYSTEMS[HOME].missions.filter((m) => m.open).map((m) => m.id));

test('las marcadas sin plazo nunca salen urgentes; sin plazo sale cualquiera', () => {
  fresh({ modules: { engines: { lv: 3, cond: 100 } } });
  assert.equal(OPEN_IDS.size, 8);
  for (let i = 0; i < 200; i++) { const o = genOffer('2026-11-14'); if (o.urgent) assert.ok(!OPEN_IDS.has(o.mid)); }
  const mids = Array.from({ length: 200 }, () => genOpenOffer('2026-11-14').mid);
  assert.ok(mids.some((id) => OPEN_IDS.has(id)) && mids.some((id) => !OPEN_IDS.has(id)));
});

test('una oferta sin plazo: sin días, nunca urgente, con la distancia de su tamaño y su caducidad', () => {
  fresh();
  const sizes = new Set();
  for (let i = 0; i < 60; i++) {
    const o = genOpenOffer('2026-11-14'), S = SIZES[o.size];
    sizes.add(o.size);
    assert.equal(o.kind, 'open');
    assert.equal(o.days, undefined);
    assert.equal(o.urgent, false);
    assert.equal(o.quota, S.pts);
    assert.equal(o.window, S.days);
    assert.equal(o.reward.mc, Math.round(S.pts * 12 * DIFFS[o.diff].pay));
    assert.ok(o.expiresOn >= addDays('2026-11-14', OFFER_TTL[0] - 1) && o.expiresOn <= addDays('2026-11-14', OFFER_TTL[1] - 1));
  }
  assert.deepEqual([...sizes].sort(), Object.keys(SIZES).sort());
});

test('la distancia no sube con tu ritmo ni con la dificultad', () => {
  const s = fresh();
  for (let i = 1; i <= 14; i++) s.ship.activity[addDays('2026-11-14', -i)] = 50;   // un ritmo altísimo
  for (let i = 0; i < 100; i++) { const o = genOpenOffer('2026-11-14'); assert.equal(o.quota, SIZES[o.size].pts, o.diff); }
});

test('aceptar una sin plazo fija hasta cuándo cuenta la bonificación', () => {
  fresh();
  const now = new Date(), c = contractFrom(open({ size: 'short', window: 4, acceptedOn: undefined, acceptedAt: undefined }), now);
  assert.equal(c.bonusAt, now.getTime() + 4 * 864e5);
  assert.equal(c.endsAt, undefined);
});

test('llegar dentro de los días de la bonificación paga un 25 % más', () => {
  const s = fresh();
  s.ship.contract = open({ size: 'short', window: 4, progress: 9, bonusAt: new Date('2026-11-14T12:00:00').getTime() });
  addEffort(1);
  assert.equal(s.wallet.mc, Math.floor(120 * (1 + SPEED_BONUS)));
  assert.match(s.ship.log.at(-1).lines[0], /Bonificación de rapidez/);
});

test('llegar más tarde cobra lo normal, sin castigo', () => {
  const s = fresh();
  s.ship.contract = open({ size: 'short', window: 4, progress: 9, bonusAt: new Date('2026-11-14T09:00:00').getTime() });
  addEffort(1);
  assert.equal(s.wallet.mc, 120);
  assert.equal(s.ship.log.at(-1).tone, 'win');
});

test('lo del repaso de ayer cuenta para la bonificación como hecho ayer', () => {
  const s = fresh();
  s.ship.contract = open({ size: 'short', window: 4, progress: 9, bonusAt: new Date('2026-11-13T20:00:00').getTime() });
  addEffort(1, '2026-11-13');
  assert.equal(s.wallet.mc, Math.floor(120 * (1 + SPEED_BONUS)));
});

test('los Motores suben el avance de la misión, no la actividad del día, y deshacer resta lo mismo', () => {
  const s = fresh({ modules: { engines: { lv: 2, cond: 100 } } });
  s.ship.contract = open({ size: 'mid', window: 7, quota: 30 });
  const g = { ef: 0.5 };
  addEffort(0.5, '2026-11-14', g);
  assert.equal(g.cef, 0.56);
  assert.equal(s.ship.contract.progress, 0.56);
  assert.equal(s.ship.activity['2026-11-14'], 0.5);
  onUndo({ ...g, c: 'o1', day: '2026-11-14' });
  assert.equal(s.ship.contract.progress, 0);
});

test('un contrato de antes, sin tamaño, sigue sin Motores', () => {
  const s = fresh({ modules: { engines: { lv: 2, cond: 100 } } });
  s.ship.contract = open();
  const g = { ef: 1 };
  addEffort(1, '2026-11-14', g);
  assert.equal(s.ship.contract.progress, 1);
  assert.equal(g.cef, undefined);
});

test('la tripulación gana experiencia como mucho los días de la bonificación', () => {
  const s = fresh();
  s.ship.contract = open({ size: 'short', window: 4 });   // aceptada hace 4 días; luego, semanas
  clock('2026-12-01T10:00:00');
  missionCrewXp(s.ship.contract);
  assert.equal(s.ship.contract.xpDays, 4);
});

test('la paga de una sin plazo no sube con la espera', () => {
  fresh();
  assert.equal(agedMc({ kind: 'open', reward: { mc: 100 }, postedOn: '2026-11-11' }), 100);
  assert.equal(agedMc({ kind: 'run', reward: { mc: 100 }, postedOn: '2026-11-11' }), 115);
});

test('un capítulo de historia no cuenta como misión fácil para el tablón', () => {
  fresh();
  for (let i = 0; i < 30; i++) {
    const o = freshOffer([open({ diff: 'normal', story: true })], '2026-11-14');
    assert.ok(['easy', 'normal'].includes(o.diff));
    assert.equal(o.urgent, false);
  }
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

test('las partidas guardan el tamaño y la bonificación; un tamaño desconocido sigue las reglas de antes', () => {
  const sh = normShip({ contract: open({ size: 'long', window: 12, bonusAt: 123 }) });
  assert.deepEqual([sh.contract.size, sh.contract.window, sh.contract.bonusAt], ['long', 12, 123]);
  const old = normShip({ contract: open({ size: 'enorme', window: 9, bonusAt: 5 }) }).contract;
  assert.deepEqual([old.size, old.window, old.bonusAt], [undefined, undefined, undefined]);
  const [o] = normShip({ board: { offers: [open({ size: 'short', expiresOn: '2026-11-16' })] } }).board.offers;
  assert.equal(o.window, SIZES.short.days);
});

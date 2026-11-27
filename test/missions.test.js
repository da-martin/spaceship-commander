import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFS, OFFER_TTL, SIZES, URGENT_TTL, REP_DAYS, XP_CONTRACT } from '../public/js/config.js';
import { agedMc, finishContract, checkContractEnd, genOffer, tickBoard } from '../public/js/core/missions.js';
import { addEffort, maxDays } from '../public/js/core/ship.js';
import { addDays } from '../public/js/util.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

const contract = (over = {}) => ({
  id: 'c1', mid: 'exp-nebulosa', topic: 'Exploración', flavor: 'x', diff: 'normal', days: 3, quota: 4, progress: 0,
  reward: { mc: 100, mats: { ale: 3 } }, urgent: false, acceptedOn: '2026-11-13', endsOn: '2026-11-15',
  endsAt: new Date('2026-11-15T10:00:00').getTime(), ...over,
});

test('la paga de una oferta sube un 5 % por cada día en el tablón', () => {
  fresh();
  assert.equal(agedMc({ reward: { mc: 100 }, postedOn: '2026-11-14' }), 100);
  assert.equal(agedMc({ reward: { mc: 100 }, postedOn: '2026-11-11' }), 115);
});

test('cobrar una parte del contrato redondea hacia abajo y lo cierra', () => {
  const s = fresh();
  s.ship.contract = contract();
  assert.deepEqual(finishContract(0.5), { mc: 50, mats: { ale: 1 } });
  assert.equal(s.wallet.mc, 50);
  assert.equal(s.ship.contract, null);
});

test('la Bodega sube lo que se cobra', () => {
  const s = fresh({ modules: { cargo: { lv: 2, cond: 100 } } });
  s.ship.contract = contract();
  assert.equal(finishContract(1).mc, 120);
});

test('llegar a la cuota completa la misión y da méritos extra', () => {
  const s = fresh();
  s.ship.contract = contract({ progress: 3 });
  assert.equal(addEffort(1), 'c1');
  assert.equal(s.ship.contract, null);
  assert.equal(s.wallet.mc, 100);
  assert.equal(s.cmd.stats.missions, 1);
  assert.equal(s.cmd.xp, XP_CONTRACT);
  assert.equal(s.ship.log.at(-1).tone, 'win');
});

test('lo hecho después del plazo no cuenta para la misión', () => {
  const s = fresh();
  s.ship.contract = contract({ endsAt: new Date('2026-11-14T09:00:00').getTime() });
  assert.equal(addEffort(1), null);
  assert.equal(s.ship.contract.progress, 0);
  assert.equal(s.ship.activity['2026-11-14'], 1);   // pero sí cuenta como actividad del día
});

test('el plazo vence a su hora: antes no pasa nada', () => {
  const s = fresh();
  s.ship.contract = contract({ progress: 2 });
  assert.equal(checkContractEnd(), false);
  clock('2026-11-15T10:00:00');
  assert.equal(checkContractEnd(), true);
  assert.equal(s.ship.contract, null);
  assert.equal(s.wallet.mc, 50);   // la mitad hecha, la mitad cobrada
  assert.equal(s.ship.log.at(-1).tone, 'warn');
});

test('una urgente fallida no cobra y daña la reputación', () => {
  const s = fresh();
  s.ship.contract = contract({ urgent: true, progress: 3 });
  clock('2026-11-15T10:00:00');
  assert.equal(checkContractEnd(), true);
  assert.equal(s.wallet.mc, 0);
  assert.equal(s.ship.board.repUntil, addDays('2026-11-15', REP_DAYS));
  assert.equal(s.cmd.stats.urgentFails, 1);
  assert.equal(s.ship.log.at(-1).tone, 'bad');
});

test('las ofertas salen dentro de sus límites', () => {
  fresh({ modules: { comms: { lv: 1, cond: 100 }, engines: { lv: 2, cond: 100 } } });
  for (let i = 0; i < 200; i++) {
    const safe = i % 2 === 0, o = genOffer('2026-11-14', safe);
    if (o.urgent) assert.ok(o.days >= 2 && o.days <= maxDays(), `días ${o.days}`);
    else { assert.equal(o.kind, 'open'); assert.equal(o.days, undefined); assert.equal(o.quota, SIZES[o.size].pts); }
    assert.ok(o.quota >= 2);
    assert.ok(o.reward.mc > 0);
    assert.ok(DIFFS[o.diff]);
    const [lo, hi] = o.urgent ? URGENT_TTL : OFFER_TTL;
    assert.ok(o.expiresOn >= addDays('2026-11-14', lo - 1) && o.expiresOn <= addDays('2026-11-14', hi - 1), o.expiresOn);
    if (safe) { assert.equal(o.urgent, false); assert.notEqual(o.diff, 'hard'); }
  }
});

test('sin Antena no llegan misiones; con ella, la primera llega al momento', () => {
  const s = fresh();
  tickBoard();
  assert.equal(s.ship.board.offers.length, 0);
  assert.equal(s.ship.board.sigAt, null);
  s.ship.modules.comms.lv = 1;
  tickBoard();
  assert.equal(s.ship.board.offers.length, 1);
  assert.equal(s.ship.board.signal, 0);
  assert.equal(s.ship.board.news.got, 1);
});

test('con la señal acumulada llegan más, hasta llenar el tablón', () => {
  const s = fresh({ modules: { comms: { lv: 1, cond: 100 } } });
  tickBoard();
  clock('2026-11-20T10:00:00');   // seis días después, sin abrir la app
  tickBoard();
  assert.ok(s.ship.board.offers.length > 1);
  assert.ok(s.ship.board.offers.length <= 3 + Math.floor(s.ship.modules.bridge.lv));
  assert.ok(s.ship.board.offers.every((o) => o.expiresOn >= '2026-11-20'));
});

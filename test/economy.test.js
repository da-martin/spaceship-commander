import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { effOf, payRound, EF_MC, MOD_MC, MOD_MAT, MODS, REPAIR_MC, RANKS } from '../public/js/config.js';
import { grantTask, revokeTask, checkHabit, uncheckHabit, tapFree, untapFree, tapNeg, untapNeg, addXP, wageOf } from '../public/js/core/rewards.js';
import { modCost, repairCost, priceOf, sellOf, buyPrice } from '../public/js/core/shipyard.js';
import { on } from '../public/js/core/events.js';
import { clock, seed, fresh, clone, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

const tracked = [];
on('track', (x, kind, op) => tracked.push(`${kind}${op}${x.id}`));
const ranks = [];
on('rankUp', (i) => ranks.push(RANKS[i][0]));

test('puntos de esfuerzo y redondeo de la paga', () => {
  assert.equal(effOf({ diff: 'easy' }), 0.5);
  assert.equal(effOf({ diff: 'hard' }), 2);
  assert.equal(effOf({}), 1);
  assert.equal(effOf({ kind: 'acc', diff: 'hard' }), 0.5);   // acción rápida del Focus
  assert.equal(payRound(2.5, 0.5), 2);   // lo fácil redondea hacia abajo
  assert.equal(payRound(2.5, 1), 3);
  assert.equal(payRound(EF_MC * 0.5, 0.5), 2);
});

test('completar una tarea paga según la dificultad y desmarcarla lo devuelve todo', () => {
  const s = fresh();
  const x = { id: 'a', title: 'Difícil', diff: 'hard', areas: ['Craft'] };
  s.tasks.push(x);
  const before = clone(s);
  const g = grantTask(x);
  assert.equal(g.mc, 10);
  assert.equal(g.res, 'ale');
  assert.equal(s.wallet.mc, 10);
  assert.equal(s.wallet.ale, 1);
  assert.equal(s.cmd.xp, 10);
  assert.equal(s.ship.activity['2026-11-14'], 2);
  revokeTask(x);
  s.ship.activity = {};   // el contador del día se queda a 0, no desaparece
  before.ship.activity = {};
  assert.deepEqual(s, before);
  assert.deepEqual(tracked.splice(0), ['task+a', 'task-a']);
});

test('lo fácil paga la mitad, redondeado hacia abajo', () => {
  const s = fresh();
  const x = { id: 'e', title: 'Fácil', diff: 'easy', areas: [] };
  grantTask(x);
  assert.equal(s.wallet.mc, 2);
  assert.equal(s.cmd.xp, 2);
});

test('marcar y desmarcar un hábito deja la partida como estaba', () => {
  const s = fresh();
  const h = { id: 'h', title: 'Leer', type: 'daily', areas: ['Spirit'], log: {} };
  s.habits.push(h);
  const before = clone(s);
  h.log['2026-11-14'] = 1; checkHabit(h, '2026-11-14');
  assert.equal(s.wallet.mc, 5);
  assert.equal(s.wallet.ecos, 1);
  uncheckHabit(h, '2026-11-14'); delete h.log['2026-11-14'];
  delete h.g;   // queda {} tras quitar la del día
  s.ship.activity = {}; before.ship.activity = {};
  assert.deepEqual(s, before);
});

test('hábito libre: cada toque paga y −1 resta lo mismo', () => {
  const s = fresh();
  const h = { id: 'w', title: 'Agua', type: 'free', diff: 'hard', areas: ['Health'], log: {} };
  tapFree(h, '2026-11-14'); tapFree(h, '2026-11-14');
  assert.equal(h.log['2026-11-14'], 2);
  assert.equal(s.wallet.mc, 8);        // 2 ¢ × 2 puntos, por toque
  assert.equal(s.wallet.bio, 1);       // el material, solo el primero
  untapFree(h, '2026-11-14'); untapFree(h, '2026-11-14');
  assert.equal(s.wallet.mc, 0);
  assert.equal(s.wallet.bio, 0);
  assert.equal(h.g['2026-11-14'], undefined);
});

test('hábito negativo: el toque daña un módulo y −1 lo repara', () => {
  const s = fresh({ modules: { bridge: { lv: 1, cond: 90 } } });
  const h = { id: 'n', title: 'Redes', type: 'neg', areas: [], log: {} };
  const hit = tapNeg(h, '2026-11-14');
  assert.deepEqual(hit, { k: 'bridge', n: 3 });
  assert.equal(s.ship.modules.bridge.cond, 87);
  untapNeg(h, '2026-11-14');
  assert.equal(s.ship.modules.bridge.cond, 90);
  assert.deepEqual(h.log, {});
});

test('el ascenso se avisa una vez, al cruzar el umbral', () => {
  const s = fresh();
  s.cmd.xp = RANKS[1][1] - 3;
  addXP(2); addXP(2); addXP(2);
  assert.deepEqual(ranks.splice(0), [RANKS[1][0]]);
});

test('astillero: coste de mejora y reparación, y el Taller lo abarata', () => {
  fresh();
  assert.deepEqual(modCost('bridge'), { mc: Math.round(MOD_MC[0] * (MODS.bridge.mcMult || 1)) });
  assert.deepEqual(modCost('spirit'), { mc: Math.round(MOD_MC[0] * (MODS.spirit.mcMult || 1)), [MODS.spirit.res]: MOD_MAT[0] });
  fresh({ modules: { bridge: { lv: 5 } } });
  assert.equal(modCost('bridge'), null);
  fresh({ modules: { bridge: { lv: 1, cond: 80 } } });
  assert.equal(repairCost('bridge'), 20 * REPAIR_MC);
  fresh({ modules: { bridge: { lv: 1, cond: 80 }, craft: { lv: 2, cond: 100 } } });
  assert.equal(repairCost('bridge'), Math.ceil(20 * REPAIR_MC * 0.8));
});

test('mercado: precios fijos para cada día y material, entre 15 y 40 ¢', () => {
  fresh();
  for (const k of ['ecos', 'nexos', 'ale', 'bio']) {
    const p = priceOf(k, '2026-11-14');
    assert.equal(p, priceOf(k, '2026-11-14'));
    assert.ok(p >= 15 && p <= 40, `${k} ${p}`);
    assert.equal(sellOf(k), Math.floor(priceOf(k) * 0.6));
    assert.equal(buyPrice(k), priceOf(k));   // sin comerciante a bordo
  }
});

test('el Salón rebaja los sueldos', () => {
  fresh();
  assert.equal(wageOf(100), 100);
  fresh({ modules: { social: { lv: 5, cond: 100 } } });
  assert.equal(wageOf(100), 60);
});

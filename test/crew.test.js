import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BERTHS, MODS, SHIP_LV_MAX } from '../public/js/config.js';
import { hireBlock } from '../public/js/core/crew.js';
import { berths, berthsUsable } from '../public/js/core/ship.js';
import { normShip } from '../public/js/store.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

const crewOf = (n) => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, name: 'Tripulante ' + i, role: 'pilot', lv: 1, wage: 45, until: '2026-11-20', cancel: false, idle: false }));
const cand = { id: 'x', name: 'Nueva Persona', role: 'medic', lv: 1 };

test('los Camarotes suman una litera por nivel', () => {
  fresh();
  assert.equal(berths(), BERTHS);
  fresh({ modules: { quarters: { lv: 3, cond: 100 } } });
  assert.equal(berths(), BERTHS + 3);
  assert.equal(berthsUsable(), BERTHS + 3);
  assert.equal(SHIP_LV_MAX, Object.keys(MODS).length * 5);
});

test('con literas libres se contrata; sin ellas, no', () => {
  const s = fresh({ modules: { quarters: { lv: 1, cond: 100 } }, wallet: { mc: 1000 } });
  s.ship.crew = crewOf(BERTHS);
  assert.equal(hireBlock(cand), null);
  s.ship.crew = crewOf(BERTHS + 1);
  assert.equal(hireBlock(cand), 'Sin litera libre');
});

test('con los Camarotes dañados no se contrata en las literas de más, pero nadie se va', () => {
  const s = fresh({ modules: { quarters: { lv: 2, cond: 60 } }, wallet: { mc: 1000 } });   // nivel efectivo 1,2
  assert.equal(berths(), BERTHS + 2);
  assert.equal(berthsUsable(), BERTHS + 1);
  s.ship.crew = crewOf(BERTHS);
  assert.equal(hireBlock(cand), null);
  s.ship.crew = crewOf(BERTHS + 1);
  assert.equal(hireBlock(cand), 'Camarotes dañados · repáralos');
  assert.equal(s.ship.crew.length, BERTHS + 1);
});

test('las partidas sin Camarotes cargan con el módulo a nivel 0', () => {
  const sh = normShip({ modules: { bridge: { lv: 2, cond: 90 } } });
  assert.deepEqual(sh.modules.quarters, { lv: 0, cond: 100 });
});

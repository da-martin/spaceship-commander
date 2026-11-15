import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { processDays } from '../public/js/core/day.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

test('los días sin abrir desgastan por hábitos fallados y tareas atrasadas', () => {
  const s = fresh({ modules: { bridge: { lv: 1, cond: 100 }, health: { lv: 1, cond: 100 } } });
  s.ship.lastTick = '2026-11-10';
  s.habits.push({ id: 'h', title: 'Gym', type: 'daily', areas: ['Health'], log: { '2026-11-12': 1 }, createdAt: 0 });
  s.tasks.push({ id: 't', title: 'Atrasada', dueDate: '2026-11-11', done: false, areas: [], createdAt: 0 });
  processDays();
  assert.equal(s.ship.lastTick, '2026-11-13');
  // 11 y 13 sin hábito (5 % cada uno, en Salud); la tarea vencida el 11 desgasta el 12 y el 13 (2 % cada uno)
  assert.ok(s.ship.modules.health.cond < 100);
  assert.ok(s.ship.modules.bridge.cond < 100);
  const wear = s.ship.log.find((e) => e.kind === 'wear');
  assert.match(wear.lines.at(-1), /2 hábitos sin cumplir y 2 tareas atrasadas/);
});

test('procesar dos veces el mismo día no desgasta dos veces', () => {
  const s = fresh({ modules: { bridge: { lv: 1, cond: 100 } } });
  s.ship.lastTick = '2026-11-10';
  s.habits.push({ id: 'h', title: 'Leer', type: 'daily', areas: [], log: {}, createdAt: 0 });
  processDays();
  const cond = s.ship.modules.bridge.cond;
  processDays();
  assert.equal(s.ship.modules.bridge.cond, cond);
});

test('como mucho se procesan los últimos 7 días', () => {
  const s = fresh({ modules: { bridge: { lv: 1, cond: 100 } } });
  s.ship.lastTick = '2026-09-01';
  s.habits.push({ id: 'h', title: 'Leer', type: 'daily', areas: [], log: {}, createdAt: 0 });
  processDays();
  assert.equal(s.ship.modules.bridge.cond, 100 - 7 * 5);
});

test('un hábito creado hoy no cuenta para los días anteriores', () => {
  const s = fresh({ modules: { bridge: { lv: 1, cond: 100 } } });
  s.ship.lastTick = '2026-11-10';
  s.habits.push({ id: 'h', title: 'Nuevo', type: 'daily', areas: [], log: {}, createdAt: Date.now() });
  processDays();
  assert.equal(s.ship.modules.bridge.cond, 100);
});

test('el tablón de candidatos se renueva cada domingo y la actividad vieja se poda', () => {
  const s = fresh({ modules: { bridge: { lv: 1, cond: 100 } } });
  s.ship.activity = { '2026-10-01': 3, '2026-11-13': 2 };
  processDays();
  assert.equal(s.ship.crewBoard.week, '2026-11-08');
  assert.ok(s.ship.crewBoard.cands.length > 0);
  assert.deepEqual(s.ship.activity, { '2026-11-13': 2 });
});

// Hábitos mensuales, dificultades Micro y Épica, y la conversión desde TaskHero.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { effOf } from '../public/js/config.js';
import { habitKind, isScheduledOn, monthDayHit, nextScheduled, streak } from '../public/js/core/habits.js';
import { processDays, todayProgress } from '../public/js/core/day.js';
import { checkHabit, grantTask, tapNeg } from '../public/js/core/rewards.js';
import { normState } from '../public/js/store.js';
import { kindLock, thChanges, thDiff, thHabit, thTask, thType } from '../public/js/lib/taskhero-map.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-16T10:00:00'); seed(); });
afterEach(restore);

const mh = (mdays, extra = {}) => ({ id: 'm', title: 'Arena del gato', type: 'monthly', mdays, areas: [], log: {}, createdAt: 0, ...extra });

test('mensual: toca sus días; si el mes no tiene el día, el último', () => {
  const h = mh([1, 15]);
  assert.equal(isScheduledOn(h, '2026-11-01'), true);
  assert.equal(isScheduledOn(h, '2026-11-15'), true);
  assert.equal(isScheduledOn(h, '2026-11-16'), false);
  const d31 = mh([31]);
  assert.equal(isScheduledOn(d31, '2026-11-30'), true);    // noviembre tiene 30
  assert.equal(isScheduledOn(d31, '2026-12-30'), false);   // diciembre sí tiene 31
  assert.equal(isScheduledOn(d31, '2026-12-31'), true);
  assert.equal(isScheduledOn(d31, '2027-02-28'), true);    // febrero normal
  assert.equal(isScheduledOn(d31, '2028-02-29'), true);    // bisiesto
  assert.equal(isScheduledOn(d31, '2028-02-28'), false);
  // 29, 30 y 31 caen el mismo día en febrero: toca una vez
  assert.equal(monthDayHit([29, 30, 31], '2027-02-28'), true);
  assert.equal(nextScheduled(h, '2026-11-16'), '2026-12-01');
  assert.equal(nextScheduled(d31, '2026-11-01'), '2026-11-30');
  assert.equal(habitKind(h), 'Mensual · días 1 y 15');
  assert.equal(habitKind(d31), 'Mensual · día 31');
});

test('mensual: el progreso de hoy (y el de la alianza) solo lo cuenta su día', () => {
  const s = fresh();
  s.habits.push(mh([16]), { ...mh([1]), id: 'otro' });
  assert.deepEqual(todayProgress(), { done: 0, total: 1 });
  s.habits[0].log['2026-11-16'] = 1;
  assert.deepEqual(todayProgress(), { done: 1, total: 1 });
});

test('mensual: desgasta solo si se falla un día suyo', () => {
  const s = fresh({ modules: { health: { lv: 1, cond: 100 } } });
  s.ship.lastTick = '2026-11-13';           // quedan por procesar el 14 y el 15
  s.habits.push(mh([15], { areas: ['Health'] }), { ...mh([20], { areas: ['Health'] }), id: 'otro' });
  processDays();
  assert.ok(s.ship.modules.health.cond < 100);
  // solo el día 15: el día 14 no le toca a ninguno y el 20 aún no ha llegado
  assert.match(s.ship.log.find((e) => e.kind === 'wear').lines.at(-1), /1 hábito sin cumplir/);
});

test('mensual: la racha cuenta sus días seguidos, aunque estén a meses', () => {
  const h = mh([1, 15], { log: { '2026-09-15': 1, '2026-10-01': 1, '2026-10-15': 1, '2026-11-01': 1, '2026-11-15': 1 } });
  assert.equal(streak(h), 5);
  delete h.log['2026-10-01'];
  assert.equal(streak(h), 3);
});

test('al cargar: mdays se limpia y un mensual sin días pasa a diario', () => {
  const s = normState({ habits: [
    { id: 'a', title: 'A', type: 'monthly', mdays: [15, '1', 15, 40, 0, 2.5] },
    { id: 'b', title: 'B', type: 'monthly', mdays: [] },
    { id: 'c', title: 'C', type: 'daily', mdays: [3] },
  ], tasks: [{ id: 't', title: 'T', diff: 'epic' }, { id: 'u', title: 'U', diff: 'micro' }] });
  assert.deepEqual(s.habits[0].mdays, [1, 15]);
  assert.equal(s.habits[1].type, 'daily');
  assert.equal('mdays' in s.habits[1], false);
  assert.equal('mdays' in s.habits[2], false);
  assert.equal(s.tasks[0].diff, 'epic');
  assert.equal(s.tasks[1].diff, 'micro');
});

test('Micro y Épica: lo que pagan y desgastan', () => {
  assert.equal(effOf({ diff: 'micro' }), 0.1);
  assert.equal(effOf({ diff: 'epic' }), 3);
  const s = fresh();
  const micro = { id: 'm', title: 'Micro', diff: 'micro', areas: ['Craft'] };
  const g = grantTask(micro);
  assert.equal(g.mc, 0);                 // 0,5 ¢ hacia abajo
  assert.equal(s.cmd.xp, 0);
  assert.equal(s.wallet.ale, 1);         // el material no depende de la dificultad
  const epic = { id: 'e', title: 'Épica', type: 'daily', diff: 'epic', areas: [], log: {} };
  epic.log['2026-11-16'] = 1;
  assert.equal(checkHabit(epic, '2026-11-16').mc, 15);
  assert.equal(s.cmd.xp, 15);
  const neg = { id: 'n', title: 'Caída', type: 'neg', diff: 'micro', areas: ['Health'], log: {} };
  const before = s.ship.modules.health.cond;
  tapNeg(neg, '2026-11-16');
  assert.equal(s.ship.modules.health.cond, before);   // 0,3 % se queda en 0
});

/* ---------- TaskHero ---------- */
// Los dos hábitos reales que nos pasaron: la API no dice si son negativos.
const thNeg = { id: 'ae245bd8', type: 'habit', title: 'Dopamine Depleting', notes: '', difficulty: 'epic', status: 'open', lastCompletedAt: null, listId: null,
  repsPerDayGoal: 0, repsCompletedToday: 0, schedule: { mode: 'weekly', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }, scheduleOverrides: { scheduledFor: [], unscheduledFor: [] } };
const thDouble = { ...thNeg, id: '1e2583a7', title: 'Hábito doble', difficulty: 'normal' };

test('TaskHero: el tipo se deduce solo si tiene equivalente; si no, se elige', () => {
  assert.deepEqual(thType({ repsPerDayGoal: 1, schedule: { mode: 'weekly', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] } }), { type: 'daily', days: null });
  assert.deepEqual(thType({ repsPerDayGoal: 1, schedule: { mode: 'weekly', daysOfWeek: [1, 3] } }), { type: 'weekly', days: [1, 3] });
  assert.deepEqual(thType({ repsPerDayGoal: 1, schedule: { mode: 'monthly', daysOfMonth: [15, 1] } }), { type: 'monthly', days: null, mdays: [1, 15] });
  for (const t of [thNeg, thDouble,
    { repsPerDayGoal: 3, schedule: { mode: 'weekly', daysOfWeek: [1] } },
    { repsPerDayGoal: 1, schedule: { mode: 'yearly', days: [{ day: 1, month: 1 }] } },
    { repsPerDayGoal: 1, schedule: { mode: 'everyXDays', intervalDays: 3 } },
    { repsPerDayGoal: 1, schedule: { mode: 'weekly', daysOfWeek: [] } }]) {
    assert.equal(thType(t).pick, true, JSON.stringify(t.schedule));
  }
  const h = thHabit(thNeg);
  assert.equal(h.type, 'free');
  assert.equal(h._pick, true);
  assert.equal(h.diff, 'epic');
  assert.doesNotMatch(h.notes, /Dificultad/);   // ya va en diff
});

test('TaskHero: dificultades', () => {
  assert.deepEqual(['micro', 'small', 'normal', 'hard', 'epic', 'rara', undefined].map((d) => thDiff({ difficulty: d })),
    ['micro', 'easy', 'normal', 'hard', 'epic', 'normal', 'normal']);
  assert.match(thTask({ id: 'x', title: 'T', difficulty: 'rara' }).notes, /Dificultad: rara/);   // la desconocida, a las notas
  assert.equal(thTask({ id: 'x', title: 'T', difficulty: 'small' }).diff, 'easy');
});

test('TaskHero: qué cambia en lo ya importado', () => {
  // importado antes: todo Normal y el mensual como Libre
  const old = { type: 'free', diff: 'normal', log: {} };
  const monthly = thHabit({ id: 'm', title: 'Arena', difficulty: 'hard', repsPerDayGoal: 1, schedule: { mode: 'monthly', daysOfMonth: [1, 15] } });
  assert.deepEqual(thChanges(old, monthly), {
    diff: { from: 'normal', to: 'hard' },
    sched: { from: 'Libre', to: 'Mensual · días 1 y 15', type: 'monthly', days: null, mdays: [1, 15] } });
  // sin equivalente y ya Libre o Negativo: solo la dificultad (el tipo lo elige quien importa)
  assert.deepEqual(thChanges({ type: 'neg', diff: 'normal' }, thHabit(thNeg)), { diff: { from: 'normal', to: 'epic' } });
  assert.equal(thChanges({ type: 'free', diff: 'normal' }, thHabit(thDouble)), null);
  // igual que aquí: nada
  assert.equal(thChanges({ type: 'monthly', mdays: [1, 15], diff: 'hard' }, monthly), null);
  // tareas: solo la dificultad
  assert.deepEqual(thChanges({ diff: 'normal' }, { diff: 'epic' }), { diff: { from: 'normal', to: 'epic' } });
  // con historial no cambia de lado
  assert.equal(kindLock({ type: 'free', log: { '2026-11-01': 2 } }), 'pos');
  assert.equal(kindLock({ type: 'neg', log: { '2026-11-01': 1 } }), 'neg');
  assert.equal(kindLock({ type: 'free', log: {} }), null);
});

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BOOKS_DAYS } from '../public/js/config.js';
import { dayIn, dayOut, earn, firstDay, incomeFn, incomeForecast, pastIn, spend, trimBooks, unearn } from '../public/js/core/books.js';
import { crewPayroll, payDebt, payDue, payForecast } from '../public/js/core/crew.js';
import { checkHabit, grantTask, revokeTask, tapFree, uncheckHabit, untapFree } from '../public/js/core/rewards.js';
import { lastWeekOut, weekPlan } from '../public/js/core/forecast.js';
import { normBooks, normSettings, normShip } from '../public/js/store.js';
import { addDays } from '../public/js/util.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-19T10:00:00'); seed(); });
afterEach(restore);

const T = '2026-11-19', Y = '2026-11-18';
const member = (over = {}) => ({ id: 'm1', name: 'Lina Okafor', role: 'pilot', lv: 2, xp: 100, wage: 90, until: '2026-11-20', cancel: false, idle: false, owed: false, ...over });

/* ---------- libro de cuentas ---------- */
test('una partida nueva empieza el libro hoy y vacío', () => {
  const s = fresh();
  assert.deepEqual(s.ship.books, { since: T, days: {} });
});

test('se anota por día, categoría y sentido; lo desmarcado se resta de su día', () => {
  const s = fresh();
  earn(10, 'task'); earn(5, 'task'); earn(7, 'habit', Y); spend(90, 'wages');
  s.ship.books.since = Y;
  assert.deepEqual(s.ship.books.days[T], { in: { task: 15 }, out: { wages: 90 } });
  assert.equal(dayIn(T), 15); assert.equal(dayOut(T), 90); assert.equal(dayIn(Y), 7);
  unearn(7, 'habit', Y);
  assert.equal(s.ship.books.days[Y], undefined);   // un día que se queda a cero desaparece
  unearn(50, 'task');
  assert.deepEqual(s.ship.books.days[T].in, {});   // nunca baja de 0
});

test('no se resta de antes del libro ni se anotan categorías desconocidas', () => {
  const s = fresh();
  unearn(5, 'task', Y);
  earn(5, 'lotería');
  earn(0, 'task');
  assert.deepEqual(s.ship.books.days, {});
});

test('se borra lo de hace más de 30 días', () => {
  const s = fresh();
  const old = addDays(T, -BOOKS_DAYS - 1), edge = addDays(T, -BOOKS_DAYS);
  s.ship.books.since = old;
  earn(3, 'task', old); earn(4, 'task', edge);
  trimBooks(T);
  assert.deepEqual(Object.keys(s.ship.books.days), [edge]);
});

test('normBooks descarta lo que no es del libro', () => {
  const b = normBooks({ since: '2026-11-01', days: { '2026-11-02': { in: { task: 12, raro: 3, habit: -4 }, out: { yard: '60' } }, 'ayer': { in: { task: 1 } }, '2026-11-03': { in: {}, out: {} } } });
  assert.deepEqual(b, { since: '2026-11-01', days: { '2026-11-02': { in: { task: 12 }, out: { yard: 60 } } } });
  assert.equal(normShip(null).books.since, T);
  assert.equal(normBooks({ since: 'x' }).since, T);
});

test('tareas, hábitos y toques libres anotan lo que pagan y lo devuelven al desmarcar', () => {
  const s = fresh();
  const x = { id: 'a', title: 'Tarea', diff: 'hard' };
  const h = { id: 'h', title: 'Hábito', type: 'daily', diff: 'normal' };
  const f = { id: 'f', title: 'Libre', type: 'free', diff: 'normal' };
  s.tasks.push(x); s.habits.push(h, f);
  const g = grantTask(x, Y);   // repaso de ayer: cuenta para ayer
  s.ship.books.since = Y;
  const gh = checkHabit(h, T);
  const gf = tapFree(f, T); tapFree(f, T);
  assert.deepEqual(s.ship.books.days[Y].in, { task: g.mc });
  assert.deepEqual(s.ship.books.days[T].in, { habit: gh.mc, free: gf.mc * 2 });
  revokeTask(x); uncheckHabit(h, T); untapFree(f, T); untapFree(f, T);
  assert.deepEqual(s.ship.books.days, {});
});

test('los sueldos y las deudas se anotan como gastos', () => {
  const s = fresh({ wallet: { mc: 300 } });
  s.ship.crew = [member({ until: Y })];
  crewPayroll(T);
  assert.deepEqual(s.ship.books.days[T].out, { wages: 90 });
  s.ship.crew = [member({ id: 'm2', owed: true, until: '2026-11-17' })];
  const paid = payDebt(s.ship.crew[0]);
  assert.ok(paid > 0);
  assert.equal(s.ship.books.days[T].out.debt, paid);
});

// Si alguien añade un ingreso o un gasto de ¢ sin anotarlo, el libro descuadra sin avisar.
test('todo lo que mueve ¢ se anota en el libro', () => {
  const root = new URL('../public/js/', import.meta.url);
  const files = (d) => readdirSync(new URL(d, root), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(d + e.name + '/') : e.name.endsWith('.js') ? [d + e.name] : []);
  const bad = [];
  for (const f of files('')) readFileSync(new URL(f, root), 'utf8').split('\n').forEach((l, i) => {
    if (/\b(addW|subW)\('mc'/.test(l) && !/\b(earn|unearn|spend)\(/.test(l)) bad.push(`${f}:${i + 1}`);
  });
  assert.deepEqual(bad, []);
});

/* ---------- aviso de impago ---------- */
test('cobra al día siguiente del último pagado y descuenta del saldo', () => {
  fresh({ wallet: { mc: 200 } }).ship.crew = [member({ until: '2026-11-20' })];
  assert.deepEqual(payForecast(), [{ day: '2026-11-21', id: 'm1', name: 'Lina Okafor', due: 90, bal: 200, ok: true, short: 0, inc: 0, tight: false, rely: 0 }]);
});

test('sueldo entero o nada, en el orden de la tripulación; uno más barato puede cobrar después', () => {
  const s = fresh({ wallet: { mc: 100 } });
  s.ship.crew = [member({ id: 'a', until: T }), member({ id: 'b', wage: 90, until: T }), member({ id: 'c', lv: 1, wage: 45, until: T })];
  const p = payForecast();
  assert.deepEqual(p.map((x) => [x.id, x.ok, x.bal, x.short]), [['a', true, 100, 0], ['b', false, 10, 80], ['c', false, 10, 35]]);
  s.wallet.mc = 140;
  assert.deepEqual(payForecast().map((x) => [x.id, x.ok]), [['a', true], ['b', false], ['c', true]]);
});

test('no cobran los cancelados, los que tienen deuda ni los que no tienen contrato', () => {
  fresh({ wallet: { mc: 0 } }).ship.crew = [member({ id: 'a', cancel: true }), member({ id: 'b', owed: true }), member({ id: 'c', idle: true })];
  assert.deepEqual(payForecast(), []);
  assert.equal(payDue(), 0);
});

test('lo previsto de cada día cuenta para los cobros siguientes, no para el de ese día', () => {
  fresh({ wallet: { mc: 20 } }).ship.crew = [member({ until: '2026-11-20' })];   // cobra el 21
  const p = (income) => payForecast(7, income)[0];
  assert.equal(p(() => 0).short, 70);
  assert.equal(p((d) => d === '2026-11-20' ? 36 : 0).short, 34);   // el 20 se gana antes del cobro
  assert.equal(p((d) => d === '2026-11-21' ? 500 : 0).ok, false);   // el 21 llega tarde
});

test('quien cobra mañana y dentro de 7 días cobra dos veces si alcanza', () => {
  fresh({ wallet: { mc: 1000 } }).ship.crew = [member({ until: T })];
  const p = payForecast(8);
  assert.deepEqual(p.map((x) => x.day), ['2026-11-20', '2026-11-27']);
  assert.equal(payDue(8), 180);
  assert.equal(payDue(), 90);
});

test('el Salón rebaja el sueldo previsto', () => {
  fresh({ wallet: { mc: 0 }, modules: { social: { lv: 1, cond: 100 } } }).ship.crew = [member()];
  assert.equal(payForecast()[0].due, 83);
});

test('justo: cobra con lo previsto, pero no con el saldo de ahora', () => {
  fresh({ wallet: { mc: 60 } }).ship.crew = [member({ until: '2026-11-20' }), member({ id: 'b', wage: 45, lv: 1, until: '2026-11-23' })];   // cobran el 21 y el 24
  const p = payForecast(7, (d) => ({ '2026-11-20': 50, '2026-11-22': 30 })[d]);
  // al b le quedan 50 ¢ el 24, pero 80 son previstos: sin ellos irían −30
  assert.deepEqual(p.map((x) => [x.id, x.ok, x.tight, x.rely]), [['m1', true, true, 30], ['b', true, true, 75]]);
  assert.deepEqual(payForecast(7, () => 0).map((x) => [x.id, x.ok, x.tight]), [['m1', false, false], ['b', true, false]]);
});

/* ---------- previsión de entradas ---------- */
// Partida con libro desde `since` y actividad desde `first`.
const books = (since, days = {}, first = since) => { const s = fresh(); s.ship.books = { since, days }; s.ship.activity = { [first]: 1 }; return s; };
const inn = (o) => ({ in: o, out: {} });

test('cada día prevé la media de ese día de la semana en las últimas 4 semanas; el de hoy empieza hace una semana', () => {
  const days = {};
  for (let i = 1; i <= 35; i++) days[addDays(T, -i)] = inn({ task: i });   // hace i días: i ¢
  books(addDays(T, -35), days);
  const fc = incomeForecast();
  assert.deepEqual(fc.map((p) => p.day), Array.from({ length: 7 }, (_, i) => addDays(T, i + 1)));
  assert.deepEqual(fc[0].refs.map((r) => r.day), ['2026-11-13', '2026-11-06', '2026-10-30', '2026-10-23']);   // vie 20
  assert.deepEqual(fc[6].refs.map((r) => r.day), ['2026-11-12', '2026-11-05', '2026-10-29', '2026-10-22']);   // jue 26: hoy no
  assert.deepEqual(fc.map((p) => p.total), [17, 16, 15, 14, 13, 12, 18]);   // (6+13+20+27)/4 = 16,5…
  assert.ok(fc.every((p) => !p.avg && !p.est && !p.none && p.mission === 0));
  assert.equal(incomeFn(fc)('2026-11-20'), 17);
  assert.equal(incomeFn(fc)('2027-01-01'), 0);
});

test('un día muy bueno solo pesa una cuarta parte', () => {
  books(addDays(T, -28), { '2026-11-13': inn({ task: 200 }), '2026-11-06': inn({ task: 40 }), '2026-10-30': inn({ task: 40 }), '2026-10-23': inn({ task: 40 }) });
  assert.equal(incomeForecast()[0].total, 80);
});

test('con menos de 4 semanas, las que haya; sin ningún día igual, la media de los días que hay; sin ninguno, nada', () => {
  books(addDays(T, -14), { '2026-11-13': inn({ task: 10 }), '2026-11-06': inn({ task: 30 }) });
  assert.deepEqual([incomeForecast()[0].refs.length, incomeForecast()[0].total], [2, 20]);
  books(Y, { [Y]: inn({ task: 10 }), '2026-11-17': inn({ habit: 20 }) }, '2026-11-17');
  const fc = incomeForecast();
  assert.deepEqual([fc[5].refs.map((r) => r.day), fc[5].total], [[Y], 10]);   // mié 25 ← mié 18
  assert.equal(fc[4].total, 20);
  assert.deepEqual([fc[0].avg, fc[0].total, fc[0].refs.map((r) => r.day)], [true, 15, ['2026-11-17', Y]]);   // vie 20: no hay ningún viernes
  assert.equal(fc[6].avg, true);
  books(T);
  assert.ok(incomeForecast().every((p) => p.none && p.total === 0 && !p.avg));
});

test('las misiones no van en su día de la semana: se reparten entre todos', () => {
  books(addDays(T, -28), { '2026-11-13': inn({ task: 12, mission: 280 }) });
  const fc = incomeForecast();
  assert.deepEqual([fc[0].routine, fc[0].mission, fc[0].total], [3, 10, 13]);   // vie 20: 12/4 de rutina + 280/28
  assert.deepEqual([fc[1].routine, fc[1].total], [0, 10]);
  assert.deepEqual([fc[0].missionSum, fc[0].missionDays], [280, 28]);
});

test('antes del libro se rehace con lo que pagaron tareas, hábitos, libres y misiones', () => {
  const s = books(T, {}, '2026-11-10');
  const D = '2026-11-13';
  s.tasks.push({ id: 'a', title: 'A', done: true, doneOn: D, grant: { mc: 20, day: D } }, { id: 'b', title: 'B', done: true, grant: { mc: 9, day: '2026-11-14' } });
  s.focus.lines.push({ id: 'l', kind: 'acc', ref: 'x', title: 'Rápida', grant: { mc: 5, day: D } });
  s.habits.push(
    { id: 'h', title: 'H', type: 'daily', g: { [D]: { mc: 15 } } },
    { id: 'f', title: 'F', type: 'free', g: { [D]: { mc: 4, tap: 4 } }, log: { [D]: 3 } },
    { id: 'o', title: 'Viejo libre', type: 'free', g: { [D]: { mc: 6 } }, log: { [D]: 2 } },   // sin tap: los demás toques valían FREE_MC
    { id: 'n', title: 'Caída', type: 'neg', g: { [D]: { hits: [{ k: 'hull', n: 3 }] } }, log: { [D]: 1 } });
  s.ship.log.push({ kind: 'mission', day: D, rew: { mc: 100 } }, { kind: 'mission', day: D, rew: null });
  const p = pastIn(D);
  assert.deepEqual(p.cats, { task: 25, habit: 15, free: 12 + 6 + 2, mission: 100 });
  assert.deepEqual(p.n, { task: 2, habit: 1, free: 5, mission: 1 });
  assert.equal(p.est, true);
  assert.equal(incomeForecast()[0].est, true);   // vie 20 ← vie 13
  assert.equal(firstDay(), '2026-11-10');
});

test('el día que empieza el libro se queda con lo mayor de cada categoría; después, solo el libro', () => {
  const s = books(Y, { [Y]: inn({ task: 8, sale: 30 }) });
  s.tasks.push({ id: 'a', title: 'A', grant: { mc: 20, day: Y } }, { id: 'b', title: 'B', grant: { mc: 7, day: T } });
  assert.deepEqual([pastIn(Y).cats, pastIn(Y).est], [{ task: 20, sale: 30 }, true]);
  s.ship.books.days[T] = inn({ task: 3 });
  assert.deepEqual([pastIn(T).cats, pastIn(T).est, pastIn(T).n.task], [{ task: 3 }, false, 1]);
});

/* ---------- la semana en Contabilidad ---------- */
test('el saldo de cada día: menos lo que se cobra al empezar, más lo previsto; lo que no se cobra no resta', () => {
  const days = {};
  for (let i = 1; i <= 7; i++) days[addDays(T, -i)] = inn({ task: 10 });
  const s = books(addDays(T, -7), days);
  s.wallet.mc = 50;
  s.ship.crew = [member({ until: T }), member({ id: 'b', name: 'Tomás', wage: 45, lv: 1, until: '2026-11-21' }), member({ id: 'c', name: 'Aiko', cancel: true, until: '2026-11-22' }), member({ id: 'd', name: 'Rui', owed: true, until: '2026-11-16' })];
  const p = weekPlan();
  assert.deepEqual(p.days.map((d) => [d.out, d.unpaid, d.start, d.end]), [
    [0, 90, 50, 60],   // vie 20: Lina no cobra
    [0, 0, 60, 70],
    [45, 0, 25, 35],   // dom 22: Tomás
    [0, 0, 35, 45], [0, 0, 45, 55], [0, 0, 55, 65], [0, 0, 65, 75]]);
  assert.equal(p.end, 75);
  assert.deepEqual(p.days[3].leave.map((m) => m.id), ['c']);   // lun 23: se marcha Aiko
  assert.deepEqual(p.risks.map((r) => r.id), ['m1']);
  assert.deepEqual(p.debts.map((d) => [d.id, d.debt, d.perDay]), [['d', 39, 13]]);
});

test('lo gastado la última semana sale del libro, separando lo que se decide cada vez', () => {
  books(addDays(T, -3), { [Y]: { in: {}, out: { wages: 90, yard: 60 } }, [T]: { in: {}, out: { buy: 5 } } });
  assert.deepEqual(lastWeekOut(), { from: addDays(T, -3), total: 150, cats: { wages: 90, yard: 60 }, voluntary: 60 });
});

test('la pestaña Contabilidad viene apagada, también en las partidas que la tuvieron encendida por defecto', () => {
  assert.equal(normSettings(null).showLedger, false);
  assert.equal(normSettings({ showBooks: true }).showLedger, false);
  assert.equal(normSettings({ showBooks: true }).showBooks, undefined);
  assert.equal(normSettings({ showLedger: true }).showLedger, true);
});

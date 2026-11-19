import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BOOKS_DAYS } from '../public/js/config.js';
import { dayIn, dayOut, earn, spend, trimBooks, unearn } from '../public/js/core/books.js';
import { crewPayroll, payDebt, payDue, payForecast } from '../public/js/core/crew.js';
import { checkHabit, grantTask, revokeTask, tapFree, uncheckHabit, untapFree } from '../public/js/core/rewards.js';
import { normBooks, normShip } from '../public/js/store.js';
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
  assert.deepEqual(payForecast(), [{ day: '2026-11-21', id: 'm1', name: 'Lina Okafor', due: 90, bal: 200, ok: true, short: 0 }]);
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

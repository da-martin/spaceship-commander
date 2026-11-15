import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, weekStart, etaDays, isoWeek, mondayOf, clampInt, efRound, plural, todayStr, fDate } from '../public/js/util.js';
import { clock, restore } from './helpers.js';

afterEach(restore);

test('addDays cruza meses, años y los cambios de hora', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');   // horario de verano
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');   // vuelta al de invierno
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(addDays('2026-10-31', -7), '2026-10-24');
});

test('weekStart es el domingo; mondayOf, el lunes', () => {
  assert.equal(weekStart('2026-11-14'), '2026-11-08');    // sábado
  assert.equal(weekStart('2026-11-08'), '2026-11-08');    // domingo
  assert.equal(mondayOf('2026-11-14'), '2026-11-09');
  assert.equal(mondayOf('2026-11-15'), '2026-11-09');     // el domingo cierra la semana ISO
});

test('etaDays cuenta días de calendario aunque haya cambio de hora', () => {
  clock('2026-10-24T23:30:00');
  assert.equal(etaDays('2026-10-24'), 0);
  assert.equal(etaDays('2026-10-26'), 2);
  assert.equal(etaDays('2026-10-20'), -4);
});

test('todayStr usa la fecha local', () => {
  clock('2026-11-14T00:10:00');
  assert.equal(todayStr(), '2026-11-14');
});

test('isoWeek: la semana 1 es la del primer jueves', () => {
  assert.deepEqual(isoWeek('2026-01-01'), { n: 1, year: 2026 });   // jueves
  assert.deepEqual(isoWeek('2027-01-01'), { n: 53, year: 2026 });  // viernes: aún es 2026
  assert.deepEqual(isoWeek('2026-11-14'), { n: 46, year: 2026 });
});

test('clampInt, efRound, plural y fDate', () => {
  assert.equal(clampInt('7.9', 0, 5, 1), 5);
  assert.equal(clampInt(-3, 0, 5, 1), 0);
  assert.equal(clampInt('x', 0, 5, 1), 1);
  assert.equal(efRound(0.1 + 0.2), 0.3);
  assert.equal(plural(1, 'tarea', 'tareas'), '1 tarea');
  assert.equal(plural(2, 'tarea', 'tareas'), '2 tareas');
  assert.match(fDate('2026-11-14'), /^sáb 14 nov/);
});

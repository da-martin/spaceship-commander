import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { normState, freshState } from '../public/js/store.js';
import { NOTES_MAX } from '../public/js/config.js';
import { clock, seed, clone, restore } from './helpers.js';

afterEach(restore);

// Una partida de las de antes: áreas viejas, sin méritos, un tipo de hábito que no
// existe, un proyecto borrado y basura en las listas.
const legacy = () => ({
  tasks: [
    { id: 't1', title: 'Informe', dueDate: '2026-11-14', priority: true, done: false, areas: ['Work', 'Work'], projectId: 'p1' },
    { id: 't2', title: 'Llamar', dueDate: '2026-11-10', done: true, doneOn: '2026-11-10', areas: ['Family'] },
    { id: 't3', title: 'Bici', done: false, areas: ['Health', 'Nope'], projectId: 'gone', diff: 'hard', notes: 'x'.repeat(NOTES_MAX + 50) },
    { id: 't4', title: 'Sin notas', notes: '   ', diff: 'imposible' },
    null, { id: 'bad' }, 'texto',
  ],
  habits: [
    { id: 'h1', title: 'Leer', type: 'daily', log: { '2026-11-08': 1, '2026-11-09': 1, '2026-11-13': 1 } },
    { id: 'h2', title: 'Raro', type: 'bogus', log: { '2026-11-13': 2 } },
    { id: 'h3', title: 'Redes', type: 'neg', log: { '2026-11-12': 4 } },
  ],
  projects: [{ id: 'p1', name: 'Trabajo', due: '2026-12-01' }],
  wallet: { mc: '120', ecos: -4 },
  ship: { modules: { bridge: { lv: 9, cond: 150 } }, contract: { id: 'c1', mid: 'exp-nebulosa', topic: 'Exploración', endsOn: '2026-11-15', acceptedOn: '2026-11-12', quota: 4, progress: 1, reward: { mc: 100 } } },
});

test('migra áreas, tipos, dificultades, notas y proyectos', () => {
  clock('2026-11-14T10:00:00'); seed();
  const s = normState(legacy());
  assert.deepEqual(s.tasks.map((x) => x.id), ['t1', 't2', 't3', 't4']);
  assert.deepEqual(s.tasks[0].areas, ['Craft']);
  assert.deepEqual(s.tasks[1].areas, ['Social']);
  assert.deepEqual(s.tasks[2].areas, ['Health']);
  assert.equal(s.tasks[0].projectId, 'p1');
  assert.equal(s.tasks[2].projectId, null);
  assert.equal(s.tasks[2].notes.length, NOTES_MAX);
  assert.equal('notes' in s.tasks[3], false);
  assert.equal(s.tasks[3].diff, 'normal');
  assert.equal(s.tasks[2].diff, 'hard');
  assert.equal(s.habits[1].type, 'daily');
});

test('una partida sin méritos los calcula con el historial', () => {
  clock('2026-11-14T10:00:00'); seed();
  const s = normState(legacy());
  // 1 tarea hecha × 10 + 4 días de hábito cumplidos × 5 (los negativos no cuentan)
  assert.equal(s.cmd.xp, 10 + 4 * 5);
  assert.deepEqual(s.cmd.stats, { missions: 0, rounds: 0, hires: 0, urgentFails: 0 });
});

test('acota números de la nave y del monedero', () => {
  clock('2026-11-14T10:00:00'); seed();
  const s = normState(legacy());
  assert.deepEqual(s.ship.modules.bridge, { lv: 5, cond: 100 });
  assert.equal(s.wallet.mc, 120);
  assert.ok(s.wallet.ecos >= 0);
});

test('un contrato de antes del plazo en horas vence a medianoche de su último día', () => {
  clock('2026-11-14T10:00:00'); seed();
  const c = normState(legacy()).ship.contract;
  assert.equal(c.endsAt, new Date(2026, 10, 16).getTime());
  assert.equal(c.diff, 'normal');
});

test('normalizar dos veces da lo mismo', () => {
  clock('2026-11-14T10:00:00'); seed();
  const a = normState(legacy());
  assert.deepEqual(normState(clone(a)), a);
  const f = freshState();
  assert.deepEqual(normState(clone(f)), f);
});

test('cualquier cosa rara da una partida válida', () => {
  clock('2026-11-14T10:00:00'); seed();
  for (const junk of [null, undefined, 42, 'x', [], { tasks: 'no', habits: {}, ship: [] }]) {
    const s = normState(junk);
    assert.ok(Array.isArray(s.tasks) && Array.isArray(s.habits) && Array.isArray(s.projects));
    assert.equal(typeof s.wallet.mc, 'number');
    assert.equal(s.ship.contract, null);
  }
});

test('normAreaNames: solo áreas conocidas, recorta y descarta vacíos o el nombre original', async () => {
  const { normAreaNames, AREA_NAME_MAX } = await import('../public/js/store.js');
  assert.deepEqual(normAreaNames({ Spirit: '  Mente ', Social: '', Craft: 'Craft', Health: 5, Otro: 'x' }), { Spirit: 'Mente' });
  assert.equal(normAreaNames({ Health: 'x'.repeat(50) }).Health.length, AREA_NAME_MAX);
  assert.deepEqual(normAreaNames(null), {});
});

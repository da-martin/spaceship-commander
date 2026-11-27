// Rasgos de las misiones sin plazo (docs/plan-misiones.md, fase C): cambian cuánto
// cuenta el esfuerzo para la misión, no lo que se gana al completar.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { HEAVY_P, HEAVY_P_ART, TRAITS } from '../public/js/config.js';
import { armShield, contractFrom, genOpenOffer, heavyP, missionNight, rollTraits, storyOffer, traitMult } from '../public/js/core/missions.js';
import { negText, tapNeg, untapNeg } from '../public/js/core/rewards.js';
import { addEffort, onUndo } from '../public/js/core/ship.js';
import { normShip } from '../public/js/store.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

const mission = (traits, over = {}) => ({
  id: 'm1', kind: 'open', mid: 'esc-magnate', topic: 'Escolta', flavor: 'x', diff: 'normal', size: 'mid', window: 4, quota: 30, progress: 10,
  reward: { mc: 360, mats: { ale: 2 } }, urgent: false, postedOn: '2026-11-12', threat: 'pirates', traits, daily: {},
  acceptedOn: '2026-11-12', acceptedAt: new Date('2026-11-12T10:00:00').getTime(),
  shield: { armed: false, readyOn: '2026-11-12' }, heavy: false, hits: 0, blocked: 0, ...over,
});
const task = (diff = 'normal') => ({ kind: 'task', diff });
const habit = (diff = 'normal') => ({ kind: 'habit', diff });
const withComms = () => fresh({ modules: { comms: { lv: 1, cond: 100 } } });

test('fácil trae un rasgo favorable; normal, uno neutro o adverso; difícil, dos adversos distintos', () => {
  fresh();
  for (let i = 0; i < 50; i++) {
    const e = rollTraits('easy'), n = rollTraits('normal'), h = rollTraits('hard');
    assert.equal(e.length, 1); assert.equal(TRAITS[e[0]].kind, 'good');
    assert.equal(n.length, 1); assert.ok(['mid', 'bad'].includes(TRAITS[n[0]].kind));
    assert.equal(h.length, 2); assert.notEqual(h[0], h[1]); assert.ok(h.every((k) => TRAITS[k].kind === 'bad'));
  }
});

test('las ofertas sin plazo traen rasgos; los capítulos de historia, no', () => {
  const s = fresh();
  for (let i = 0; i < 20; i++) assert.ok(genOpenOffer('2026-11-14').traits.length >= 1);
  s.ship.system = 'zeta';
  assert.equal(storyOffer('2026-11-14').traits, undefined);
});

test('al aceptar una con rasgos, empieza a contar los puntos de cada día', () => {
  fresh();
  const c = contractFrom({ kind: 'open', topic: 'Escolta', threat: 'pirates', traits: ['window'], size: 'mid', window: 4, quota: 30, reward: { mc: 1 }, postedOn: '2026-11-14' });
  assert.deepEqual(c.daily, {});
});

test('los multiplicadores de cada rasgo', () => {
  fresh();
  const m = (traits, src, daily = {}) => traitMult({ traits, daily }, src, '2026-11-14');
  assert.equal(m(['solar'], task('hard')), 1.5);
  assert.equal(m(['solar'], habit('epic')), 1.5);
  assert.equal(m(['solar'], task('normal')), 1);
  assert.equal(m(['window'], task()), 3);
  assert.equal(m(['window'], task(), { '2026-11-14': 1 }), 1);
  assert.equal(m(['habits'], habit()), 1.5);
  assert.equal(m(['habits'], task()), 0.5);
  assert.equal(m(['errands'], task()), 1.5);
  assert.equal(m(['errands'], habit()), 0.5);
  assert.equal(m(['armored'], task('easy')), 0.5);
  assert.equal(m(['armored'], task('micro')), 0.5);
  assert.equal(m(['armored'], task('normal')), 1);
  assert.equal(m(['solar', 'errands'], task('hard')), 2.25);
  assert.equal(m([], task()), 1);
});

test('los rasgos cambian el avance de la misión, no la actividad del día', () => {
  const s = fresh();
  s.ship.contract = mission(['habits']);
  const g = { ef: 1 };
  addEffort(1, '2026-11-14', g, habit());
  assert.equal(g.cef, 1.5);
  assert.equal(s.ship.contract.progress, 11.5);
  assert.equal(s.ship.activity['2026-11-14'], 1);
});

test('Ventana de lanzamiento: lo primero del día cuenta ×3; deshacerlo la deja libre otra vez', () => {
  const s = fresh();
  s.ship.contract = mission(['window']);
  const a = { ef: 1, day: '2026-11-14' }, b = { ef: 1, day: '2026-11-14' };
  addEffort(1, '2026-11-14', a, task()); a.c = 'm1';
  addEffort(1, '2026-11-14', b, task()); b.c = 'm1';
  assert.deepEqual([a.cef, b.cef, s.ship.contract.progress], [3, 1, 14]);
  onUndo(b); onUndo(a);
  assert.equal(s.ship.contract.progress, 10);
  assert.equal(s.ship.contract.daily['2026-11-14'], undefined);
  const c = { ef: 1 };
  addEffort(1, '2026-11-14', c, task());
  assert.equal(c.cef, 3);
});

test('Regenerativo: una noche sin avance la misión retrocede un 10 %, aunque el escudo pare el impacto', () => {
  const s = withComms();
  s.ship.contract = mission(['regen'], { shield: { armed: true, readyOn: '2026-11-12' } });
  missionNight('2026-11-13');
  assert.equal(s.ship.contract.progress, 7);   // 10 − 10 % de 30
  assert.equal(s.ship.contract.blocked, 1);
  assert.ok(s.ship.log.some((e) => /Regenerativo: la misión retrocede 3 puntos/.test(e.title)));
});

test('Regenerativo: con algo hecho ese día, nada', () => {
  const s = withComms();
  s.ship.contract = mission(['regen'], { daily: { '2026-11-13': 1 } });
  missionNight('2026-11-13');
  assert.equal(s.ship.contract.progress, 10);
});

test('Saqueadores: cada impacto sin bloquear se lleva 1 material de la recompensa', () => {
  const s = withComms();
  s.ship.contract = mission(['looters']);
  missionNight('2026-11-13');
  assert.deepEqual(s.ship.contract.reward.mats, { ale: 1 });
  assert.match(s.ship.log.at(-1).lines.at(-1), /Los saqueadores se llevan 1/);
  armShield(); missionNight('2026-11-14');
  assert.deepEqual(s.ship.contract.reward.mats, { ale: 1 });   // bloqueado: no se llevan nada
});

test('Artillería pesada: los impactos fuertes salen la mitad de las veces', () => {
  fresh();
  assert.equal(heavyP(mission(['artillery'])), HEAVY_P_ART);
  assert.equal(heavyP(mission([])), HEAVY_P);
});

test('Tormenta iónica: una caída resta sus puntos a la misión y deshacerla los devuelve', () => {
  const s = withComms();
  s.ship.contract = mission(['storm']);
  const h = { id: 'n', type: 'neg', diff: 'hard', areas: [], log: {} };
  tapNeg(h, '2026-11-14');
  assert.equal(s.ship.contract.progress, 8);
  assert.match(negText(null, h.g['2026-11-14'].storm.at(-1)), /−2 a la misión por la Tormenta iónica/);
  untapNeg(h, '2026-11-14');
  assert.equal(s.ship.contract.progress, 10);
});

test('sin Tormenta iónica, una caída no toca la misión', () => {
  const s = withComms();
  s.ship.contract = mission(['regen']);
  const h = { id: 'n', type: 'neg', diff: 'normal', areas: [], log: {} };
  tapNeg(h, '2026-11-14');
  assert.equal(s.ship.contract.progress, 10);
  assert.equal(h.g['2026-11-14'].storm, undefined);
});

test('las partidas guardan los rasgos conocidos y los puntos de cada día', () => {
  const sh = normShip({ contract: mission(['window', 'dragones', 'window'], { daily: { '2026-11-13': 2, basura: 5, '2026-11-12': 0 } }) });
  assert.deepEqual(sh.contract.traits, ['window']);
  assert.deepEqual(sh.contract.daily, { '2026-11-13': 2 });
  const [o] = normShip({ board: { offers: [{ ...mission(['solar']), acceptedOn: undefined, daily: undefined, expiresOn: '2026-11-16' }] } }).board.offers;
  assert.deepEqual([o.traits, o.daily], [['solar'], undefined]);
});

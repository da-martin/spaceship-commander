// Amenaza y escudo de las misiones sin plazo (docs/plan-misiones.md, fase B):
// un impacto de daño fijo cada noche de misión; el escudo bloquea uno y luego se recarga.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { HIT, SHIELD_GAP, THREATS, threatFor } from '../public/js/config.js';
import { processDays } from '../public/js/core/day.js';
import { armShield, contractFrom, genOpenOffer, missionNight, shieldReady } from '../public/js/core/missions.js';
import { addEffort } from '../public/js/core/ship.js';
import { normShip } from '../public/js/store.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

// misión media normal aceptada el 12, con la amenaza de su tema
const mission = (over = {}) => ({
  id: 'm1', kind: 'open', mid: 'esc-magnate', topic: 'Escolta', flavor: 'x', diff: 'normal', size: 'mid', window: 4, quota: 30, progress: 0,
  reward: { mc: 360, mats: { ale: 2 } }, urgent: false, postedOn: '2026-11-12', threat: 'pirates',
  acceptedOn: '2026-11-12', acceptedAt: new Date('2026-11-12T10:00:00').getTime(),
  shield: { armed: false, readyOn: '2026-11-12' }, heavy: false, hits: 0, blocked: 0, ...over,
});
const cond = (s) => s.ship.modules.comms.cond;
const withComms = () => fresh({ modules: { comms: { lv: 1, cond: 100 } } });

test('cada tema tiene su amenaza, y las ofertas sin plazo la traen', () => {
  fresh();
  for (const t of ['Escolta', 'Patrulla', 'Minería', 'Exploración', 'Reconocimiento', 'Rescate', 'Transporte', 'Chárter']) assert.ok(THREATS[threatFor(t)], t);
  assert.equal(threatFor('Escolta'), 'pirates');
  for (let i = 0; i < 30; i++) { const o = genOpenOffer('2026-11-14'); assert.equal(o.threat, threatFor(o.topic)); }
});

test('al aceptar, el escudo empieza cargado y sin impactos', () => {
  fresh();
  const c = contractFrom({ kind: 'open', topic: 'Escolta', threat: 'pirates', size: 'mid', window: 4, quota: 30, reward: { mc: 1 }, postedOn: '2026-11-14' });
  assert.deepEqual(c.shield, { armed: false, readyOn: '2026-11-14' });
  assert.equal(typeof c.heavy, 'boolean');
  assert.deepEqual([c.hits, c.blocked], [0, 0]);
  assert.equal(shieldReady(c), true);
});

test('un impacto por noche, ninguno la del día en que se acepta', () => {
  const s = withComms();
  s.ship.contract = mission();
  s.ship.lastTick = '2026-11-11';
  processDays();   // noches del 12 (aceptación: nada) y del 13
  assert.equal(s.ship.contract.hits, 1);
  assert.equal(cond(s), 100 - HIT.normal);
  const e = s.ship.log.find((x) => x.title.startsWith('Piratas'));
  assert.match(e.title, /impacto en Antena −6 %/);
  assert.ok(!s.ship.log.some((x) => x.kind === 'wear'));   // no se cuenta como desgaste por hábitos o tareas
});

test('el impacto fuerte hace el doble, y el siguiente ya viene sorteado', () => {
  const s = withComms();
  s.ship.contract = mission({ heavy: true });
  missionNight('2026-11-13');
  assert.equal(cond(s), 100 - 2 * HIT.normal);
  assert.match(s.ship.log.at(-1).title, /impacto fuerte/);
  assert.equal(typeof s.ship.contract.heavy, 'boolean');
});

test('el daño depende de la dificultad, no del ritmo', () => {
  const s = withComms();
  s.ship.contract = mission({ diff: 'hard' });
  for (let i = 1; i <= 14; i++) s.ship.activity[`2026-11-${String(i).padStart(2, '0')}`] = 50;
  missionNight('2026-11-13');
  assert.equal(cond(s), 100 - HIT.hard);
});

test('el escudo bloquea un impacto y se recarga durante los dos siguientes', () => {
  const s = withComms();
  s.ship.contract = mission();
  assert.equal(armShield(), true);
  missionNight('2026-11-13');
  const c = s.ship.contract;
  assert.equal(cond(s), 100);
  assert.deepEqual([c.hits, c.blocked, c.shield.armed], [0, 1, false]);
  assert.equal(c.shield.readyOn, '2026-11-16');   // pasan las noches del 14 y del 15
  assert.equal(SHIELD_GAP, 2);
  assert.equal(armShield(), false);               // hoy, 14: recargando
  clock('2026-11-16T09:00:00');
  assert.equal(armShield(), true);
});

test('desactivar el escudo no lo gasta', () => {
  const s = withComms();
  s.ship.contract = mission();
  armShield(); armShield(false);
  assert.equal(shieldReady(s.ship.contract), true);
  missionNight('2026-11-13');
  assert.equal(s.ship.contract.hits, 1);
  assert.equal(s.ship.contract.shield.readyOn, '2026-11-12');   // sigue listo
});

test('días sin abrir: un impacto por noche, como mucho siete, y el escudo solo para el primero', () => {
  const s = withComms();
  s.ship.contract = mission({ acceptedOn: '2026-10-30', shield: { armed: true, readyOn: '2026-10-30' } });
  s.ship.lastTick = '2026-10-31';
  processDays();   // del 7 al 13: siete noches
  assert.equal(s.ship.contract.blocked, 1);
  assert.equal(s.ship.contract.hits, 6);
});

test('una misión completada no recibe el impacto de esa noche', () => {
  const s = withComms();
  s.ship.contract = mission({ progress: 29 });
  addEffort(1);
  assert.equal(s.ship.contract, null);
  missionNight('2026-11-14');
  assert.equal(cond(s), 100);
});

test('las misiones sin amenaza (de antes, o urgentes) no reciben impactos', () => {
  const s = withComms();
  const { threat, shield, ...old } = mission();
  s.ship.contract = old;
  missionNight('2026-11-13');
  s.ship.contract = { ...mission(), kind: 'run', days: 3, endsAt: Date.now() + 864e5, endsOn: '2026-11-15' };
  missionNight('2026-11-13');
  assert.equal(cond(s), 100);
});

test('las partidas guardan la amenaza y el escudo; una amenaza desconocida no trae impactos', () => {
  const sh = normShip({ contract: mission({ hits: 2, blocked: 1, heavy: true, shield: { armed: true, readyOn: '2026-11-15' } }) });
  assert.deepEqual([sh.contract.threat, sh.contract.hits, sh.contract.blocked, sh.contract.heavy], ['pirates', 2, 1, true]);
  assert.deepEqual(sh.contract.shield, { armed: true, readyOn: '2026-11-15' });
  const bad = normShip({ contract: mission({ threat: 'dragones' }) }).contract;
  assert.deepEqual([bad.threat, bad.shield], [undefined, undefined]);
  const [o] = normShip({ board: { offers: [{ ...mission(), acceptedOn: undefined, expiresOn: '2026-11-16' }] } }).board.offers;
  assert.deepEqual([o.threat, o.shield], ['pirates', undefined]);
});

// Sistemas estelares (docs/plan-viajes.md, fase 1): la nave está siempre en uno
// y su ficha decide mercado, astillero, tablón y candidatos.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MATS, MISSION_BY_ID, MOD_MC, MODS, REPAIR_MC, ROLES, TRAVEL_ON } from '../public/js/config.js';
import { genCandidates } from '../public/js/core/crew.js';
import { docked, genOffer, missionStory, pickMission } from '../public/js/core/missions.js';
import { here, herePrep } from '../public/js/core/ship.js';
import { buyPrice, modCost, onSale, priceOf, repairCost, sellOf, yardClosed } from '../public/js/core/shipyard.js';
import { MISSIONS } from '../public/js/missions.js';
import { normShip } from '../public/js/store.js';
import { HOME, SYSTEMS, destinations, makeSystem, sysPrep } from '../public/js/systems.js';
import { clock, seed, fresh, restore } from './helpers.js';

const TEST = makeSystem({
  id: 'prueba', name: 'Kepler', market: { bio: 2, ale: 0 }, yard: { mult: 0.5, closed: ['engines'] },
  missions: MISSIONS.slice(0, 2), roles: ['navigator', 'engineer'],
});

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); SYSTEMS.prueba = TEST; });
afterEach(() => { delete SYSTEMS.prueba; restore(); });

// Pone la nave en el sistema de prueba.
const travel = (s) => { s.ship.system = 'prueba'; return s; };

test('una partida nueva empieza en el Sistema Madre', () => {
  const s = fresh();
  assert.equal(s.ship.system, HOME);
  assert.equal(here().name, 'Sistema Madre');
  assert.equal(herePrep('en'), 'en el Sistema Madre');
  assert.equal(herePrep('de'), 'del Sistema Madre');
  assert.equal(herePrep('a'), 'al Sistema Madre');
});

test('sin artículo, el nombre va tal cual tras la preposición', () => {
  assert.equal(sysPrep(TEST, 'de'), 'de Kepler');
  assert.equal(sysPrep(TEST, 'a'), 'a Kepler');
});

test('las partidas de antes de los viajes cargan en el Sistema Madre, con misiones normales', () => {
  const sh = normShip({
    contract: { id: 'c', mid: MISSIONS[0].id, endsOn: '2026-11-16', endsAt: 1, quota: 4, reward: { mc: 10 }, postedOn: '2026-11-13', diff: 'normal' },
    board: { offers: [{ id: 'o', quota: 3, reward: { mc: 9 }, postedOn: '2026-11-14', expiresOn: '2026-11-16', days: 2, diff: 'easy' }] },
  });
  assert.equal(sh.system, HOME);
  assert.equal(sh.contract.kind, 'run');
  assert.equal(sh.board.offers[0].kind, 'run');
});

test('un sistema que no existe carga como Sistema Madre; uno que existe se conserva', () => {
  assert.equal(normShip({ system: 'atlantida' }).system, HOME);
  assert.equal(normShip({ system: 'toString' }).system, HOME);
  assert.equal(normShip({ system: 'prueba' }).system, 'prueba');
});

test('en el Sistema Madre todo vale lo mismo que antes', () => {
  fresh();
  assert.deepEqual(modCost('bridge'), { mc: Math.round(MOD_MC[0] * MODS.bridge.mcMult) });
  for (const k of ['ecos', 'nexos', 'ale', 'bio']) assert.ok(onSale(k));
  assert.equal(yardClosed('engines'), false);
});

test('el mercado multiplica el precio del día; con ×0 no se comercia', () => {
  const s = fresh();
  const base = { bio: priceOf('bio', '2026-11-14'), ecos: priceOf('ecos', '2026-11-14') };
  travel(s);
  assert.equal(priceOf('ecos', '2026-11-14'), base.ecos);   // sin multiplicador: ×1
  assert.ok(Math.abs(priceOf('bio', '2026-11-14') - base.bio * 2) <= 1);   // se redondea una vez
  assert.equal(sellOf('bio'), Math.floor(priceOf('bio') * 0.6));
  assert.equal(buyPrice('bio'), priceOf('bio'));
  assert.equal(onSale('ale'), false);
  assert.equal(onSale('bio'), true);
});

test('el astillero aplica el multiplicador del sistema y cierra sus módulos', () => {
  const s = travel(fresh({ modules: { bridge: { lv: 1, cond: 80 } } }));
  assert.deepEqual(modCost('cargo'), { mc: Math.round(MOD_MC[0] * 0.5) });
  assert.equal(repairCost('bridge'), Math.ceil(20 * REPAIR_MC * 0.5));
  assert.equal(yardClosed('engines'), true);
  assert.equal(yardClosed('cargo'), false);
  s.ship.system = HOME;
  assert.equal(yardClosed('engines'), false);
});

test('el tablón sortea solo del catálogo del sistema', () => {
  const s = travel(fresh());
  const ids = new Set(TEST.missions.map((m) => m.id));
  for (let i = 0; i < 10; i++) assert.ok(ids.has(pickMission().id));
  const o = genOffer('2026-11-14');
  assert.ok(ids.has(o.mid));
  assert.ok(['run', 'open'].includes(o.kind));
  assert.equal(s.ship.system, 'prueba');
});

test('los candidatos salen de los roles del sistema', () => {
  travel(fresh());
  const roles = genCandidates().map((x) => x.role);
  assert.deepEqual([...roles].sort(), ['engineer', 'navigator']);
});

test('con una misión normal en curso no estás atracado', () => {
  const s = fresh();
  assert.equal(docked(), true);
  s.ship.contract = { id: 'c', kind: 'run' };
  assert.equal(docked(), false);
  s.ship.contract = { id: 'c' };   // sin tipo: por si acaso, fuera
  assert.equal(docked(), false);
});

/* ---------- Los sistemas de destino (cerrados mientras TRAVEL_ON sea false) ---------- */
const OTHERS = Object.values(SYSTEMS).filter((s) => s.id !== HOME && s.id !== 'prueba');
const TOPICS = new Set(SYSTEMS[HOME].missions.map((m) => m.topic));

test('hay cuatro sistemas de destino, y con los viajes cerrados no se puede ir a ninguno', () => {
  assert.deepEqual(OTHERS.map((s) => s.id), ['zeta', 'umbral', 'canopo', 'betelgeuse']);
  assert.equal(TRAVEL_ON, false);
  assert.deepEqual(destinations(HOME), []);
});

test('cada ficha es válida', () => {
  for (const s of OTHERS) {
    for (const k of Object.keys(s.market)) assert.ok(MATS.includes(k), `${s.id}: material ${k}`);
    for (const k of s.yard.closed) assert.ok(MODS[k], `${s.id}: módulo ${k}`);
    for (const r of s.roles) assert.ok(ROLES[r], `${s.id}: rol ${r}`);
    assert.ok(s.days > 0, s.id);
    assert.equal(s.travel.length, s.days, `${s.id}: un fragmento por día de salto`);
    for (const k of ['quote', 'desc', 'intro']) assert.ok(s[k].length > 20, `${s.id}: ${k}`);
    assert.equal(s.missions.length, 16, `${s.id}: catálogo`);
    for (const t of TOPICS) assert.equal(s.missions.filter((m) => m.topic === t).length, 2, `${s.id}: ${t}`);
    const open = s.missions.filter((m) => m.open).length;
    assert.ok(open >= 2 && open <= 3, `${s.id}: ${open} sin plazo`);
    for (const m of s.missions) for (const k of ['flavor', 'win', 'partial', 'fail']) assert.ok(m[k], `${m.id}: ${k}`);
  }
});

test('la historia: capítulos del 1 al N, sin plazo y fuera del catálogo', () => {
  const lens = Object.fromEntries(OTHERS.map((s) => [s.id, s.story.length]));
  assert.deepEqual(lens, { zeta: 9, umbral: 5, canopo: 6, betelgeuse: 9 });
  for (const s of OTHERS) {
    s.story.forEach((m, i) => {
      assert.equal(m.chapter, i + 1, m.id);
      assert.equal(m.open, true, m.id);
      assert.equal(m.system, s.id, m.id);
      for (const k of ['title', 'flavor', 'brief', 'win']) assert.ok(m[k], `${m.id}: ${k}`);
      assert.ok(TOPICS.has(m.topic), `${m.id}: ${m.topic}`);
    });
    assert.ok(s.missions.every((m) => !m.chapter), s.id);
  }
});

test('ids y frases únicos en todos los catálogos, y temas conocidos', () => {
  const ids = MISSIONS.map((m) => m.id), flavors = MISSIONS.map((m) => m.flavor);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(flavors).size, flavors.length);
  for (const m of MISSIONS) assert.ok(TOPICS.has(m.topic), `${m.id}: ${m.topic}`);
  for (const s of OTHERS) for (const m of [...s.missions, ...s.story]) assert.ok(m.id.startsWith(s.missions[0].id.slice(0, 3)), m.id);
});

test('el catálogo del Sistema Madre no cambia: mismas 64 misiones y en el mismo orden', () => {
  const home = SYSTEMS[HOME].missions;
  assert.equal(home.length, 64);
  assert.deepEqual(home.map((m) => m.id), MISSIONS.slice(0, 64).map((m) => m.id));
  assert.equal(home[0].id, 'exp-nebulosa');
  assert.equal(home[63].id, 'rec-colonia');
  assert.ok(home.every((m) => !m.system));
  assert.deepEqual(SYSTEMS[HOME].story, []);
});

test('en el Sistema Madre el tablón nunca saca misiones de otro sistema', () => {
  fresh({ modules: { engines: { lv: 3, cond: 100 } } });
  for (let i = 0; i < 300; i++) assert.equal(MISSION_BY_ID[genOffer('2026-11-14').mid].system, undefined);
});

test('en cada sistema, el tablón saca de su catálogo y el mercado respeta sus ×0', () => {
  for (const sys of OTHERS) {
    const s = fresh();
    s.ship.system = sys.id;
    const all = new Set(sys.missions.map((m) => m.id)), timed = new Set(sys.missions.filter((m) => !m.open).map((m) => m.id));
    for (let i = 0; i < 40; i++) { const o = genOffer('2026-11-14'); assert.ok((o.urgent ? timed : all).has(o.mid), sys.id); }
    for (const k of MATS) assert.equal(onSale(k), (sys.market[k] ?? 1) > 0, `${sys.id}: ${k}`);
  }
  const s = fresh();
  s.ship.system = 'zeta';
  assert.equal(onSale('bio'), false);
});

test('una misión de otro sistema encuentra su relato aunque estés en el Sistema Madre', () => {
  fresh();
  const ch = SYSTEMS.zeta.story[0];
  assert.equal(missionStory({ mid: ch.id }, 'win'), ch.win);
});

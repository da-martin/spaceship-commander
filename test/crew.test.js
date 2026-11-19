import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BERTHS, CREW_LV, CREW_XP_DAY, CREW_XP_RUN, MODS, RANKS, SHIP_LV_MAX } from '../public/js/config.js';
import { crewPayroll, dayWage, debtOf, gainCrewXp, genCandidates, hireBlock, missionCrewXp, payDebt, promoteBlock, returnHome, trainCrewXp, xpReady } from '../public/js/core/crew.js';
import { perk } from '../public/js/core/rewards.js';
import { checkContractEnd, finishContract } from '../public/js/core/missions.js';
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

/* ---------- experiencia y ascensos ---------- */
const member = (over = {}) => ({ id: 'm1', name: 'Lina Okafor', role: 'pilot', lv: 1, xp: 0, wage: 45, until: '2026-11-20', cancel: false, idle: false, ...over });
const mission = (over = {}) => ({ id: 'c1', topic: 'Exploración', diff: 'normal', days: 3, quota: 4, progress: 0, reward: { mc: 100, mats: {} }, urgent: false,
  acceptedOn: '2026-11-11', acceptedAt: new Date('2026-11-11T10:00:00').getTime(), endsOn: '2026-11-14', endsAt: new Date('2026-11-14T10:00:00').getTime(), ...over });

test('cuatro niveles: élite no se contrata, solo se llega ascendiendo', () => {
  assert.deepEqual(CREW_LV.map((L) => L.name), ['Aprendiz', 'Veterano', 'Oficial', 'Élite']);
  fresh();
  for (let i = 0; i < 50; i++) for (const x of genCandidates()) assert.ok(x.lv >= 1 && x.lv <= 3);
  const sh = normShip({ crewBoard: { week: '2026-11-08', cands: [{ name: 'A B', role: 'pilot', lv: 4 }] } });
  assert.equal(sh.crewBoard.cands[0].lv, 3);
});

test('las partidas antiguas cargan con la experiencia de su nivel', () => {
  const sh = normShip({ crew: [{ name: 'A B', role: 'pilot', lv: 2, wage: 90, until: '2026-11-20' }, { name: 'C D', role: 'medic', lv: 4, xp: 900, wage: 225, until: '2026-11-20' }] });
  assert.equal(sh.crew[0].xp, CREW_LV[1].xp);
  assert.deepEqual([sh.crew[1].lv, sh.crew[1].xp], [4, 900]);
});

test('solo gana experiencia quien sigue con contrato, y avisa al poder ascender', () => {
  const s = fresh();
  const a = member({ xp: 95 }), b = member({ id: 'm2', idle: true });
  s.ship.crew = [a, b];
  assert.equal(xpReady(a), false);
  gainCrewXp(s.ship.crew, 10);
  assert.deepEqual([a.xp, b.xp], [105, 0]);
  assert.equal(xpReady(a), true);
  assert.match(s.ship.log.at(-1).title, /listo para ascender/);
  gainCrewXp(s.ship.crew, 10);
  assert.equal(s.ship.log.filter((e) => e.kind === 'crew').length, 1);   // no repite el aviso
});

test('cada día de misión cumplido da experiencia, sin repetirla', () => {
  const s = fresh();
  s.ship.crew = [member()];
  clock('2026-11-13T09:00:00');   // 1 día y 23 h desde que zarpó
  missionCrewXp(mission());
  const c = mission({ xpDays: 1 });
  assert.equal(s.ship.crew[0].xp, CREW_XP_DAY);
  missionCrewXp(c);
  assert.equal(s.ship.crew[0].xp, CREW_XP_DAY);
  clock('2026-11-13T10:00:00');
  missionCrewXp(c);
  assert.equal(s.ship.crew[0].xp, 2 * CREW_XP_DAY);
});

test('al terminar la misión cuenta el día empezado, sin pasar del plazo', () => {
  let s = fresh();
  s.ship.crew = [member()];
  clock('2026-11-11T12:00:00');   // completada a las 2 h de zarpar
  s.ship.contract = mission();
  finishContract(1);
  assert.equal(s.ship.crew[0].xp, CREW_XP_DAY);
  s = fresh();
  s.ship.crew = [member()];
  clock('2026-11-20T10:00:00');   // la app no se abrió hasta días después del plazo
  s.ship.contract = mission({ xpDays: 1 });
  checkContractEnd();
  assert.equal(s.ship.crew[0].xp, 2 * CREW_XP_DAY);
  s = fresh();
  s.ship.crew = [member()];
  s.ship.contract = mission({ urgent: true });
  checkContractEnd();
  assert.equal(s.ship.crew[0].xp, 3 * CREW_XP_DAY);
});

test('las simulaciones de VR Training dan experiencia a quien sigue a bordo', () => {
  const s = fresh();
  s.ship.crew = [member(), member({ id: 'm2' })];
  trainCrewXp(['c-m1', 's-vega', 'c-ya-no-esta']);
  assert.deepEqual(s.ship.crew.map((m) => m.xp), [CREW_XP_RUN, 0]);
});

test('ascender pide experiencia, rango y el sueldo nuevo', () => {
  const s = fresh({ wallet: { mc: 1000 } });
  const m = member({ lv: 2, xp: 300, wage: 90 });
  assert.equal(promoteBlock(m), 'Faltan 50 XP');
  m.xp = 350;
  assert.equal(promoteBlock(m), 'Requiere rango ' + RANKS[CREW_LV[2].rank][0]);
  s.cmd.xp = RANKS[CREW_LV[2].rank][1];
  assert.equal(promoteBlock(m), null);
  s.wallet.mc = CREW_LV[2].wage - 1;
  assert.equal(promoteBlock(m), 'Recursos insuficientes');
  assert.equal(promoteBlock({ ...m, idle: true }), 'Sin contrato');
  assert.equal(promoteBlock({ ...m, owed: true }), 'Sueldo pendiente');
  assert.equal(promoteBlock(member({ lv: 4, xp: 5000 })), 'Nivel máximo');
});

/* ---------- sueldo pendiente ---------- */
test('sin ¢ para el sueldo no se marcha: deja de trabajar y acumula deuda', () => {
  const s = fresh({ wallet: { mc: 10 } });
  s.ship.crew = [member({ lv: 2, xp: 100, wage: 90, until: '2026-11-13' })];
  crewPayroll('2026-11-14');
  const m = s.ship.crew[0];
  assert.equal(s.ship.crew.length, 1);
  assert.deepEqual([m.owed, m.until, s.wallet.mc], [true, '2026-11-13', 10]);
  assert.equal(perk('pilot'), 0);
  assert.equal(dayWage(m), 13);
  assert.equal(debtOf(m, '2026-11-14'), 13);
  assert.equal(debtOf(m, '2026-11-20'), 7 * 13);
  crewPayroll('2026-11-20');   // con deuda no se le intenta cobrar la semana
  assert.equal(s.wallet.mc, 10);
  gainCrewXp(s.ship.crew, 50);
  assert.equal(m.xp, 100);
});

test('pagar la deuda le devuelve al trabajo y mañana cobra la semana', () => {
  const s = fresh({ wallet: { mc: 1000 } });
  const m = member({ wage: 45, until: '2026-11-11', owed: true });
  s.ship.crew = [m];
  assert.equal(payDebt(m, '2026-11-14'), 3 * 7);
  assert.deepEqual([m.owed, m.until, s.wallet.mc], [false, '2026-11-14', 1000 - 21]);
  assert.equal(perk('pilot'), 1);
  crewPayroll('2026-11-15');
  assert.deepEqual([m.until, s.wallet.mc], ['2026-11-21', 1000 - 21 - 45]);
  s.wallet.mc = 5;
  assert.equal(payDebt(member({ until: '2026-11-11', owed: true }), '2026-11-14'), null);
});

test('con deuda sigue a bordo al volver, salvo que se le despidiera en la misión', () => {
  const s = fresh();
  s.ship.crew = [member({ owed: true }), member({ id: 'm2', name: 'Tomás Ibarra', owed: true, cancel: true }), member({ id: 'm3', name: 'Aiko Tanaka', idle: true, cancel: true })];
  assert.match(returnHome(), /Tomás Ibarra, Aiko Tanaka desembarcan/);
  assert.deepEqual(s.ship.crew.map((m) => m.id), ['m1']);
});

test('el contrato cancelado sigue terminando como antes', () => {
  const s = fresh({ wallet: { mc: 1000 } });
  s.ship.crew = [member({ cancel: true, until: '2026-11-13' })];
  crewPayroll('2026-11-14');
  assert.equal(s.ship.crew.length, 0);
});

test('las partidas antiguas: «sin contrato» por impago pasa a sueldo pendiente', () => {
  const sh = normShip({ crew: [{ name: 'A B', role: 'pilot', until: '2026-11-10', idle: true }, { name: 'C D', role: 'pilot', until: '2026-11-10', idle: true, cancel: true }] });
  assert.deepEqual(sh.crew.map((m) => [m.owed, m.idle]), [[true, false], [false, true]]);
});

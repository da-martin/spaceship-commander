// VR Training (Holocubierta): energía, tiradas, simulación, datos, partidas
// guardadas, equilibrio y el cortafuegos con el juego principal.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../public/js/config.js';
import { normState } from '../public/js/store.js';
import { BANK_MAX, BOSS_AT, CHARGES_DAY, HP_MAX, ITEMS_MAX, REST_AT, ROOMS, SUP_START } from '../public/js/rpg/config.js';
import { BOSSES, EVENTS, ITEMS, SCENARIOS, STARTERS } from '../public/js/rpg/data.js';
import { canStart, nextCharge, syncEnergy } from '../public/js/rpg/energy.js';
import { abandon, applyFx, bonusFor, canReroll, canUse, chance, choose, eventOf, reroll, resolve, rest, startRun, useItem } from '../public/js/rpg/run.js';
import { normRpg } from '../public/js/rpg/state.js';
import { clock, clone, fresh, restore } from './helpers.js';
import { playRun } from './rpg-policy.js';

afterEach(restore);

const SQUAD = STARTERS.map((m) => m.id);
const DAY = '2026-11-18';
// Azar repetible (mulberry32) para pasar como `rng`; `fixed` devuelve siempre lo mismo.
function rngOf(n = 1) {
  let s = n;
  return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const fixed = (die) => () => (die - 1) / 6 + 0.01;   // un dado que saca siempre `die`
// Una simulación recién empezada (gratis: la primera no gasta carga).
function started(seedN = 1) {
  const r = normRpg(null);
  assert.equal(startRun(r, 'estacion', SQUAD, rngOf(seedN)), null);
  return r;
}

/* ---------- energía ---------- */
test('cargas: una por cada 3 puntos de esfuerzo, como mucho 3 al día', () => {
  for (const [pts, n] of [[0, 0], [2.9, 0], [3, 1], [6, 2], [9, 3], [12, 3]]) {
    const r = normRpg(null);
    syncEnergy(r, { [DAY]: pts }, DAY);
    assert.equal(r.energy.bank, n, `${pts} puntos`);
  }
});

test('cargas: el banco tiene tope y lo ganado espera hueco ese día', () => {
  const r = normRpg(null);
  r.energy.bank = BANK_MAX - 1;
  syncEnergy(r, { [DAY]: 9 }, DAY);
  assert.equal(r.energy.bank, BANK_MAX);
  assert.deepEqual(nextCharge(r, { [DAY]: 9 }, DAY), { waiting: 2 });
  r.energy.bank = 0;   // juega dos
  syncEnergy(r, { [DAY]: 9 }, DAY);
  assert.equal(r.energy.bank, 2);
  assert.deepEqual(nextCharge(r, { [DAY]: 9 }, DAY), { capped: true });
});

test('cargas: desmarcar y volver a marcar no da cargas de más; el día nuevo empieza de cero', () => {
  const r = normRpg(null);
  syncEnergy(r, { [DAY]: 3 }, DAY);
  syncEnergy(r, { [DAY]: 2 }, DAY);   // desmarca
  syncEnergy(r, { [DAY]: 3 }, DAY);   // vuelve a marcar
  assert.equal(r.energy.bank, 1);
  assert.deepEqual(nextCharge(r, { [DAY]: 3.5 }, DAY), { left: 2.5 });
  syncEnergy(r, { [DAY]: 3, '2026-11-19': 3 }, '2026-11-19');
  assert.equal(r.energy.bank, 2);
  assert.equal(r.energy.credited, 1);
});

test('cargas: la primera simulación es gratis y las demás gastan una', () => {
  const r = normRpg(null);
  assert.ok(canStart(r));
  assert.equal(startRun(r, 'estacion', SQUAD, rngOf()), null);
  assert.equal(r.energy.freeUsed, true);
  abandon(r);
  assert.equal(canStart(r), false);
  assert.equal(startRun(r, 'estacion', SQUAD, rngOf()), 'Sin cargas holo');
  r.energy.bank = 1;
  assert.equal(startRun(r, 'estacion', SQUAD, rngOf()), null);
  assert.equal(r.energy.bank, 0);
  assert.equal(r.stats.runs, 2);
});

/* ---------- empezar ---------- */
test('una simulación: 8 eventos distintos del escenario, descanso en la 5 y jefe en la 10', () => {
  const r = started();
  const { rooms } = r.run;
  assert.equal(rooms.length, ROOMS);
  assert.equal(rooms[REST_AT], 'rest');
  assert.equal(rooms[BOSS_AT], 'boss');
  const evs = rooms.filter((x) => x !== 'rest' && x !== 'boss');
  assert.equal(new Set(evs).size, 8);
  assert.ok(evs.every((id) => id.startsWith('est-')));
  assert.deepEqual(r.run.squad.map((m) => m.hp), [HP_MAX, HP_MAX, HP_MAX]);
  assert.equal(r.run.sup, SUP_START);
  assert.equal(r.seen[rooms[0]], 1);
  assert.equal(r.run.found, 1);
});

test('no se empieza con escuadrones raros, escenarios bloqueados ni dos a la vez', () => {
  const r = normRpg(null);
  assert.match(startRun(r, 'estacion', ['s-vega', 's-vega', 's-kofi']), /Elige 3/);
  assert.match(startRun(r, 'estacion', ['s-vega', 's-kofi']), /Elige 3/);
  assert.match(startRun(r, 'selva', SQUAD), /bloqueado/);
  startRun(r, 'estacion', SQUAD, rngOf());
  assert.match(startRun(r, 'estacion', SQUAD), /en curso/);
});

/* ---------- tiradas ---------- */
test('bono: +2 si el rol encaja, +1 por nivel por encima de 1 y lo que sumen los objetos', () => {
  const r = started();
  r.roster.push({ id: 'c1', name: 'Lina Sol', role: 'engineer', lv: 3, src: 'crew' });
  assert.equal(bonusFor(r, 's-kofi', ['engineer']).bonus, 2);
  assert.equal(bonusFor(r, 's-vega', ['engineer']).bonus, 0);
  assert.equal(bonusFor(r, 'c1', ['engineer']).bonus, 4);
  r.run.items = ['chip', 'ganzua', 'mapa'];
  assert.equal(bonusFor(r, 's-kofi', ['engineer'], ['chip', 'ganzua', 'mapa']).bonus, 5);   // el mapa no es de Ingeniería
  assert.equal(chance(2, 5), 4 / 6);
  assert.equal(chance(0, 7), 0);
  assert.equal(chance(0, 7, true), 1);
});

test('éxito, éxito con coste y fallo en los límites', () => {
  const r = started();
  r.run.rooms[0] = 'est-01';   // dificultad 5; Kofi hackea con +2
  for (const [die, kind] of [[3, 'ok'], [2, 'part'], [1, 'ko']]) {
    r.run.stage = 'room';
    assert.equal(choose(r, 0, 's-kofi', [], fixed(die)), null);
    assert.equal(r.run.res.kind, kind, `dado ${die}`);
    assert.equal(r.run.res.total, die + 2);
  }
});

test('un tripulante desconectado no tira; con todos desconectados se pierde', () => {
  const r = started();
  r.run.rooms[0] = 'est-01';
  r.run.squad[0].hp = 0;
  assert.match(choose(r, 0, r.run.squad[0].id, [], fixed(6)), /no puede tirar/);
  r.run.squad.forEach((m) => { m.hp = 1; });
  r.run.rooms[0] = 'est-04';   // el camarero: si falla la negociación, −1 vida a todos
  choose(r, 0, 's-ada', [], fixed(1));
  resolve(r);
  assert.equal(r.run.stage, 'end');
  assert.equal(r.run.outcome, 'lose');
});

test('repetir una tirada cuesta un suministro o una baliza; con éxito no se repite', () => {
  const r = started();
  r.run.rooms[0] = 'est-01';
  r.run.items = ['baliza'];
  choose(r, 0, 's-kofi', [], fixed(1));
  assert.ok(canReroll(r.run));
  assert.equal(reroll(r, 'baliza', fixed(2)), null);
  assert.equal(r.run.res.kind, 'part');
  assert.deepEqual(r.run.items, []);
  const sup = r.run.sup;
  assert.equal(reroll(r, 'sup', fixed(6)), null);
  assert.equal(r.run.res.kind, 'ok');
  assert.equal(r.run.sup, sup - 1);
  assert.equal(canReroll(r.run), false);
});

test('las opciones seguras no tiran y piden los suministros que cuestan', () => {
  const r = started();
  r.run.rooms[0] = 'est-01';
  r.run.sup = 0;
  assert.equal(choose(r, 2, null), 'Sin suministros');
  r.run.sup = 1;
  assert.equal(choose(r, 2, null), null);
  assert.equal(r.run.res.kind, 'safe');
  resolve(r);
  assert.equal(r.run.sup, 0);
  assert.equal(r.run.i, 1);
});

test('el dado trucado saca un 6 y se gasta', () => {
  const r = started();
  r.run.rooms[0] = 'est-01';
  r.run.items = ['dado'];
  choose(r, 1, 's-ada', ['dado'], fixed(1));   // Ada no tiene el rol: solo cuenta el dado
  assert.equal(r.run.res.kind, 'ok');
  assert.equal(r.run.res.die, 6);
  assert.deepEqual(r.run.items, []);
});

/* ---------- efectos y objetos ---------- */
test('efectos: vida con tope, escudo, suministros sin bajar de 0 y objetos con hueco', () => {
  const r = started();
  const kofi = r.run.squad[1];
  applyFx(r, { hp: 2 }, kofi.id);
  assert.equal(kofi.hp, HP_MAX);
  r.run.items = ['escudo'];
  assert.deepEqual(applyFx(r, { hpAll: -1 }, kofi.id), ['El escudo personal absorbe el golpe']);
  assert.ok(r.run.squad.every((m) => m.hp === HP_MAX));
  applyFx(r, { hp: -3 }, kofi.id);
  assert.equal(kofi.hp, 0);
  applyFx(r, { hpAll: 1 }, null);
  assert.equal(kofi.hp, 0, 'curar a todos no reconecta');
  applyFx(r, { sup: -10 }, null);
  assert.equal(r.run.sup, 0);
  r.run.items = ['chip', 'chip', 'chip'];
  assert.match(applyFx(r, { item: 'mapa' }, null)[0], /se queda atrás/);
  assert.equal(r.run.items.length, ITEMS_MAX);
});

test('objetos de uso: parche al más herido, estimulante reconecta, nada si no hace falta', () => {
  const r = started();
  r.run.items = ['parche', 'estim', 'botiquin'];
  assert.equal(canUse(r.run, 'parche'), false, 'nadie herido');
  r.run.squad[0].hp = 2; r.run.squad[1].hp = 1; r.run.squad[2].hp = 0;
  useItem(r, 'parche');
  assert.equal(r.run.squad[1].hp, 2);
  useItem(r, 'estim');
  assert.equal(r.run.squad[2].hp, 1);
  useItem(r, 'botiquin');
  assert.deepEqual(r.run.squad.map((m) => m.hp), [3, 3, 2]);
  assert.deepEqual(r.run.items, []);
});

test('descanso: curar, reabastecer o buscar equipo, y se pasa a la sala 6', () => {
  const r = started();
  r.run.i = REST_AT; r.run.stage = 'rest'; r.run.squad[0].hp = 1;
  rest(r, 'heal');
  assert.equal(r.run.squad[0].hp, 2);
  assert.equal(r.run.i, REST_AT + 1);
  assert.equal(r.run.stage, 'room');
});

/* ---------- jefe y final ---------- */
test('jefe: cada fallo cuesta 1 de vida y se repite el paso; superar los 3 gana y desbloquea', () => {
  const r = started();
  r.run.i = BOSS_AT - 1; r.run.stage = 'room';
  r.run.rooms[BOSS_AT - 1] = 'est-03';
  choose(r, 1, null); resolve(r);   // pasa de largo → jefe
  assert.equal(r.run.stage, 'boss');
  choose(r, 0, 's-kofi', [], fixed(1)); resolve(r);
  assert.deepEqual(r.run.boss, { step: 0, wins: 0, fails: 1 });
  assert.equal(r.run.squad[1].hp, HP_MAX - 1);
  choose(r, 0, 's-kofi', [], fixed(4)); resolve(r);   // 4 + 2 = 6: éxito con coste, pasa
  assert.equal(r.run.boss.step, 1);
  assert.equal(r.run.squad[1].hp, HP_MAX - 2);
  choose(r, 0, 's-vega', [], fixed(6)); resolve(r);
  choose(r, 0, 's-kofi', [], fixed(6)); resolve(r);
  assert.equal(r.run.outcome, 'win');
  assert.equal(r.stats.wins, 1);
  assert.equal(r.stats.bosses.estacion, 1);
  assert.equal(r.stats.best, ROOMS);
  abandon(r);
  assert.equal(r.run, null);
});

test('abandonar termina la simulación y apunta la mejor sala', () => {
  const r = started();
  r.run.i = 6;
  abandon(r);
  assert.equal(r.run, null);
  assert.equal(r.stats.best, 6);
});

/* ---------- datos ---------- */
test('eventos: formato, ids únicos, 20 por escenario jugable y textos cortos', () => {
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
  for (const s of SCENARIOS.filter((x) => !x.soon)) {
    assert.equal(EVENTS.filter((e) => e.esc === s.id).length, 20, s.id);
    assert.ok(BOSSES[s.id], `jefe de ${s.id}`);
    assert.equal(BOSSES[s.id].steps.length, 3);
  }
  const fxOk = (fx) => fx && typeof fx.t === 'string' && fx.t.length <= 160 && Object.keys(fx).every((k) => ['t', 'hp', 'hpAll', 'sup', 'item'].includes(k))
    && (!fx.item || fx.item === 'random' || ITEMS[fx.item]);
  for (const e of EVENTS) {
    assert.ok(e.text.length <= 280, `${e.id}: texto largo`);
    assert.ok(e.opts.length >= 2 && e.opts.length <= 3, e.id);
    assert.ok(e.opts.filter((o) => o.safe).length <= 1, `${e.id}: más de una segura`);
    for (const o of e.opts) {
      if (o.safe) { assert.ok(fxOk(o.res), `${e.id}: ${o.label}`); continue; }
      assert.ok(o.roles.length && o.roles.every((k) => ROLES[k]), `${e.id}: roles`);
      for (const k of ['ok', 'part', 'ko']) assert.ok(fxOk(o[k]), `${e.id}: ${o.label} ${k}`);
    }
  }
});

test('eventos: con los de serie siempre hay algo que hacer, y cada rol sale a menudo', () => {
  const starter = new Set(STARTERS.map((m) => m.role)), count = {};
  for (const e of EVENTS) {
    assert.ok(e.opts.some((o) => o.safe || o.roles.some((k) => starter.has(k))), `${e.id}: nada para los de serie`);
    for (const k of new Set(e.opts.flatMap((o) => o.roles || []))) count[k] = (count[k] || 0) + 1;
  }
  for (const b of Object.values(BOSSES)) for (const s of b.steps) assert.ok(s.roles.some((k) => starter.has(k)), `${b.name}: ${s.label}`);
  // Con 20 eventos por escenario, cada rol debe salir en al menos 3 de cada 20.
  for (const k of Object.keys(ROLES)) assert.ok((count[k] || 0) >= 3 * EVENTS.length / 20, `${k}: ${count[k] || 0}`);
});

/* ---------- partidas guardadas ---------- */
test('normRpg: partidas sin VR Training, con basura y con una simulación a medias', () => {
  const empty = normRpg(undefined);
  assert.deepEqual(empty.roster.map((m) => m.id), SQUAD);
  assert.deepEqual(empty.unlocked, ['estacion']);
  assert.equal(empty.run, null);
  assert.deepEqual(normRpg({ energy: { bank: 99, credited: -3 }, roster: [null, { id: 'x', name: 'Ana', role: 'nope' }], unlocked: ['selva', 'nada'], seen: { 'est-01': 1, zzz: 1 }, run: { esc: 'estacion' } }),
    { ...empty, energy: { ...empty.energy, bank: BANK_MAX }, seen: { 'est-01': 1 } });
  const r = started();
  choose(r, 0, 's-kofi', [], fixed(1));
  const back = normRpg(JSON.parse(JSON.stringify(r)));
  assert.deepEqual(back, r);
  // si la sala ya no casa (catálogo cambiado), la simulación se pierde
  const broken = clone(r); broken.run.rooms[0] = 'est-99';
  assert.equal(normRpg(broken).run, null);
});

test('normState: añade VR Training desactivado a las partidas de antes', () => {
  const st = normState({ tasks: [], habits: [], settings: { showStreaks: false } });
  assert.equal(st.settings.showVR, false);
  assert.deepEqual(st.rpg, normRpg(null));
});

/* ---------- equilibrio ---------- */
test('equilibrio: el primer escenario se gana a menudo, pero no siempre', () => {
  const rng = rngOf(7), N = 1000;
  let wins = 0;
  for (let i = 0; i < N; i++) if (playRun(normRpg(null), 'estacion', SQUAD, rng) === 'win') wins++;
  const rate = wins / N;
  assert.ok(rate >= 0.6 && rate <= 0.8, `victorias: ${(rate * 100).toFixed(1)} %`);
});

/* ---------- cortafuegos ---------- */
test('cortafuegos: jugar no toca nada de la partida salvo state.rpg', () => {
  clock('2026-11-18T10:00:00');
  const st = fresh({ wallet: { mc: 250, ale: 3 }, modules: { bridge: { lv: 2, cond: 80 } } });
  st.ship.activity[DAY] = 9;
  st.cmd.xp = 420;
  const before = clone({ ...st, rpg: null });
  syncEnergy(st.rpg, st.ship.activity, DAY);
  playRun(st.rpg, 'estacion', SQUAD, rngOf(3));
  abandon(st.rpg);   // salir del resumen final
  playRun(st.rpg, 'estacion', SQUAD.slice().reverse(), rngOf(4));
  assert.deepEqual(clone({ ...st, rpg: null }), before);
  assert.equal(st.rpg.stats.runs, 2);
});

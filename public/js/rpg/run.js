/* VR Training: una simulación del pasillo de decisiones.
 * Todo recibe `r` (state.rpg) y escribe solo ahí. El azar es inyectable
 * (`rng`, por defecto Math.random) para los tests. Las funciones devuelven
 * un texto de error si la acción no vale, o lo que la vista tenga que avisar. */
import { BOSS_AT, BOSS_STEPS, dcOf, EVENTS_PER_RUN, HP_MAX, ITEMS_MAX, lvBonus, REST_AT, ROLE_BONUS, ROOMS, SQUAD, SUP_START } from './config.js';
import { canStart, spendCharge } from './energy.js';
import { BOSSES, EVENT_BY_ID, EVENTS, ITEMS, MEDALS, SCENARIO_BY_ID, SCENARIOS, STARTERS } from './data.js';

// Cada tirada son dos dados de 6 caras que se suman.
const die = (rng) => 1 + Math.floor(rng() * 6);
export const rollDice = (rng) => [die(rng), die(rng)];
export const isDoubles = (dice) => dice[0] === dice[1];
export const memberInfo = (r, id) => r.roster.find((m) => m.id === id);
export const alive = (run) => run.squad.filter((m) => m.hp > 0);
export const eventOf = (run) => EVENT_BY_ID[run.rooms[run.i]] || null;
export const bossOf = (run) => BOSSES[run.esc];
export const dcNow = (run) => dcOf(run.i, SCENARIO_BY_ID[run.esc]?.dc);
// La opción en juego: la del evento, o el paso del jefe.
export const optionOf = (run, idx) => run.i === BOSS_AT ? bossOf(run).steps[run.boss.step] : eventOf(run)?.opts[idx];
// Los dobles siempre son éxito (1 de cada 6 tiradas): ninguna tirada es imposible.
export const kindOf = (total, dc, doubles = false) => doubles || total >= dc ? 'ok' : total === dc - 1 ? 'part' : 'ko';

/* ---------- empezar y terminar ---------- */
export function startRun(r, esc, squadIds, rng = Math.random) {
  if (r.run) return 'Ya hay una simulación en curso';
  if (!r.unlocked.includes(esc)) return 'Escenario bloqueado';
  const ids = [...new Set(squadIds)];
  if (ids.length !== SQUAD || !ids.every((id) => memberInfo(r, id))) return `Elige ${SQUAD} tripulantes`;
  if (!canStart(r)) return 'Sin cargas holo';
  spendCharge(r);
  // 8 eventos distintos del escenario, al azar (Fisher-Yates).
  const pool = EVENTS.filter((e) => e.esc === esc).map((e) => e.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const evs = pool.slice(0, EVENTS_PER_RUN), rooms = [];
  for (let i = 0; i < ROOMS; i++) rooms.push(i === REST_AT ? 'rest' : i === BOSS_AT ? 'boss' : evs.shift());
  r.run = { esc, squad: ids.map((id) => ({ id, hp: HP_MAX })), rooms, i: 0, stage: 'room', boss: null, sup: SUP_START, items: [], res: null, outcome: null, found: 0, downs: 0, rerolled: 0, unlocked: null, medals: [] };
  r.stats.runs++;
  r.lastSquad = [...ids];
  markSeen(r);
  return null;
}

function markSeen(r) {
  const id = r.run.rooms[r.run.i];
  if (EVENT_BY_ID[id] && !r.seen[id]) { r.seen[id] = 1; r.run.found++; }
}

function endRun(r, outcome) {
  const run = r.run;
  run.stage = 'end'; run.outcome = outcome; run.res = null;
  r.stats.best = Math.max(r.stats.best, outcome === 'win' ? ROOMS : run.i);
  if (outcome === 'win') {
    r.stats.wins++;
    r.stats.bosses[run.esc] = (r.stats.bosses[run.esc] || 0) + 1;
    const next = SCENARIOS[SCENARIOS.findIndex((s) => s.id === run.esc) + 1];
    if (next && !next.soon && !r.unlocked.includes(next.id)) { r.unlocked.push(next.id); run.unlocked = next.id; }
  }
  run.medals = MEDALS.filter((m) => !r.medals.includes(m.id) && MEDAL_RULES[m.rule]?.(r, run, m)).map((m) => m.id);
  r.medals.push(...run.medals);
}
// Para las medallas: si el escuadrón era todo de tripulación propia y si ya se ha visto todo un escenario.
export const noStarters = (run) => run.squad.every((m) => !STARTERS.some((s) => s.id === m.id));
export const allSeen = (r, esc) => EVENTS.filter((e) => e.esc === esc).every((e) => r.seen[e.id]);
// Cuándo se gana cada medalla (las de jefe llevan su escenario en `esc`). Se mira al acabar la simulación.
const MEDAL_RULES = {
  first: (r, run) => run.outcome === 'win',
  noDowns: (r, run) => run.outcome === 'win' && run.downs === 0,
  noRerolls: (r, run) => run.outcome === 'win' && run.rerolled === 0,
  ownCrew: (r, run) => run.outcome === 'win' && noStarters(run),
  explorer: (r, run) => allSeen(r, run.esc),
  boss: (r, run, m) => run.outcome === 'win' && run.esc === m.esc,
};

// Abandonar: la carga no se devuelve. Salir del resumen final, igual.
export function abandon(r) {
  if (!r.run) return;
  if (r.run.stage !== 'end') r.stats.best = Math.max(r.stats.best, r.run.i);
  r.run = null;
}

/* ---------- la tirada ---------- */
// Holoobjetos de tirada que puede usar este tripulante.
export function rollItemsFor(r, memberId) {
  const role = memberInfo(r, memberId)?.role;
  return [...new Set(r.run.items)].filter((k) => ITEMS[k].kind === 'roll' && (!ITEMS[k].roles || ITEMS[k].roles.includes(role)));
}
export function bonusFor(r, memberId, roles, itemIds = []) {
  const m = memberInfo(r, memberId), ok = rollItemsFor(r, memberId);
  let bonus = (roles?.includes(m.role) ? ROLE_BONUS : 0) + lvBonus(m.lv), sure = false;
  for (const k of itemIds) if (ok.includes(k)) { bonus += ITEMS[k].bonus || 0; if (ITEMS[k].sure) sure = true; }
  return { bonus, sure };
}
// Probabilidades de cada resultado, para enseñarlas antes de tirar.
export function odds(bonus, dc, sure = false) {
  const p = { ok: 0, part: 0, ko: 0 };
  if (sure) { p.ok = 1; return p; }
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) p[kindOf(a + b + bonus, dc, a === b)] += 1 / 36;
  return p;
}

// Elegir una opción del evento (o tirar en el jefe). Las seguras no llevan tirada.
export function choose(r, optIdx, memberId, itemIds = [], rng = Math.random) {
  const run = r.run;
  if (!run || (run.stage !== 'room' && run.stage !== 'boss')) return 'No toca elegir';
  const boss = run.stage === 'boss', opt = optionOf(run, optIdx);
  if (!opt) return 'Opción no válida';
  if (opt.safe) {
    if ((opt.res.sup || 0) < 0 && run.sup < -opt.res.sup) return 'Sin suministros';
    run.res = { kind: 'safe', opt: optIdx }; run.stage = 'result';
    return null;
  }
  const m = run.squad.find((x) => x.id === memberId);
  if (!m || m.hp <= 0) return 'Ese tripulante no puede tirar';
  const use = [...new Set(itemIds)].filter((k) => rollItemsFor(r, memberId).includes(k));
  const { bonus, sure } = bonusFor(r, memberId, opt.roles, use);
  for (const k of use) run.items.splice(run.items.indexOf(k), 1);
  // El dado trucado saca dobles: éxito seguro.
  const dice = sure ? [6, 6] : rollDice(rng), dc = dcNow(run), total = dice[0] + dice[1] + bonus;
  run.res = { kind: kindOf(total, dc, isDoubles(dice)), opt: boss ? run.boss.step : optIdx, member: memberId, dice, bonus, total, dc, boss, mods: use, rerolls: 0 };
  run.stage = 'result';
  return null;
}

// Repetir una tirada que no ha salido bien: con 1 suministro o con una baliza.
export function canReroll(run) { return run?.stage === 'result' && run.res.kind !== 'safe' && run.res.kind !== 'ok'; }
export function reroll(r, how, rng = Math.random) {
  const run = r.run;
  if (!canReroll(run)) return 'No hay nada que repetir';
  if (how === 'baliza') { const i = run.items.indexOf('baliza'); if (i < 0) return 'No tienes baliza'; run.items.splice(i, 1); }
  else { if (run.sup < 1) return 'Sin suministros'; run.sup--; }
  const res = run.res;
  res.dice = rollDice(rng); res.total = res.dice[0] + res.dice[1] + res.bonus; res.kind = kindOf(res.total, res.dc, isDoubles(res.dice)); res.rerolls++; run.rerolled++;
  return null;
}

/* ---------- efectos ---------- */
export function randomItem(rng = Math.random) {
  const ks = Object.keys(ITEMS), tot = ks.reduce((a, k) => a + ITEMS[k].w, 0);
  let x = rng() * tot;
  for (const k of ks) { x -= ITEMS[k].w; if (x < 0) return k; }
  return ks[ks.length - 1];
}
const nameOf = (r, id) => memberInfo(r, id)?.name.split(' ')[0] || '';
function shield(run, notes) {
  const i = run.items.indexOf('escudo'); if (i < 0) return false;
  run.items.splice(i, 1); notes.push('El escudo personal absorbe el golpe'); return true;
}
function hurt(r, m, n, notes) {
  const before = m.hp; m.hp = Math.max(0, Math.min(HP_MAX, m.hp + n));
  if (before > 0 && m.hp === 0) { notes.push(`${nameOf(r, m.id)} se desconecta`); r.run.downs++; }
}
// Aplica un resultado. `memberId`: quien tiró (las opciones seguras no tienen).
export function applyFx(r, fx, memberId, rng = Math.random) {
  const run = r.run, notes = [], m = run.squad.find((x) => x.id === memberId);
  if (fx.hp && m) { if (fx.hp > 0 || !shield(run, notes)) hurt(r, m, fx.hp, notes); }
  if (fx.hpAll) { if (fx.hpAll > 0 || !shield(run, notes)) for (const x of alive(run)) hurt(r, x, fx.hpAll, notes); }
  if (fx.sup) run.sup = Math.max(0, run.sup + fx.sup);
  if (fx.item) {
    const k = fx.item === 'random' ? randomItem(rng) : fx.item;
    if (run.items.length >= ITEMS_MAX) notes.push(`Sin hueco: ${ITEMS[k].name} se queda atrás`);
    else { run.items.push(k); notes.push(`Consigues: ${ITEMS[k].name}`); }
  }
  return notes;
}
// El resultado que toca según la tirada.
export function fxOf(run) {
  const res = run.res;
  if (res.boss) return res.kind === 'ok' ? {} : { hp: -1 };
  const opt = eventOf(run).opts[res.opt];
  return res.kind === 'safe' ? opt.res : opt[res.kind];
}

// Aceptar el resultado: se aplica y se pasa a lo siguiente. Devuelve los avisos.
export function resolve(r, rng = Math.random) {
  const run = r.run;
  if (run?.stage !== 'result') return [];
  const res = run.res, notes = applyFx(r, fxOf(run), res.member, rng);
  run.res = null;
  if (!alive(run).length) { endRun(r, 'lose'); return notes; }
  if (res.boss) {
    // Un fallo cuesta vida y se repite el paso: la vida con la que llegas es tu margen.
    const b = run.boss;
    if (res.kind === 'ko') b.fails++; else { b.step++; b.wins++; }
    if (b.step >= BOSS_STEPS) endRun(r, 'win'); else run.stage = 'boss';
    return notes;
  }
  advance(r);
  return notes;
}

function advance(r) {
  const run = r.run;
  run.i++;
  if (run.i === REST_AT) run.stage = 'rest';
  else if (run.i === BOSS_AT) { run.stage = 'boss'; run.boss = { step: 0, wins: 0, fails: 0 }; }
  else { run.stage = 'room'; markSeen(r); }
}

/* ---------- descanso y holoobjetos ---------- */
export const REST_OPTS = {
  heal: { label: 'Curar', desc: '+1 vida a todo el escuadrón conectado' },
  sup: { label: 'Reabastecer', desc: '+2 suministros' },
  item: { label: 'Buscar equipo', desc: 'Un holoobjeto al azar' },
};
export function rest(r, choice, rng = Math.random) {
  const run = r.run;
  if (run?.stage !== 'rest' || !REST_OPTS[choice]) return null;
  const notes = applyFx(r, choice === 'heal' ? { hpAll: 1 } : choice === 'sup' ? { sup: 2 } : { item: 'random' }, null, rng);
  advance(r);
  return notes;
}

// Objetos de uso: cuándo se pueden usar y a quién le tocan.
function useTarget(run, k) {
  const hurtOnes = alive(run).filter((m) => m.hp < HP_MAX);
  if (k === 'parche') return hurtOnes.sort((a, b) => a.hp - b.hp)[0] || null;
  if (k === 'botiquin') return hurtOnes.length ? true : null;
  if (k === 'estim') return run.squad.find((m) => m.hp <= 0) || null;
  if (k === 'raciones') return true;
  return null;
}
export const canUse = (run, k) => !!run && run.stage !== 'end' && run.items.includes(k) && ITEMS[k].kind === 'use' && !!useTarget(run, k);
export function useItem(r, k) {
  const run = r.run;
  if (!canUse(run, k)) return null;
  const t = useTarget(run, k);
  run.items.splice(run.items.indexOf(k), 1);
  if (k === 'parche') { t.hp++; return `${nameOf(r, t.id)} recupera 1 vida`; }
  if (k === 'botiquin') { for (const m of alive(run)) m.hp = Math.min(HP_MAX, m.hp + 1); return 'El escuadrón recupera 1 vida'; }
  if (k === 'estim') { t.hp = 1; return `${nameOf(r, t.id)} vuelve a conectarse`; }
  run.sup += 2; return '+2 suministros';
}

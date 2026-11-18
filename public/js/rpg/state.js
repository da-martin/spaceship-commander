/* VR Training: la parte de la partida que es del minijuego (state.rpg).
 * Normaliza también partidas sin ella o con basura: lo que no se entiende
 * se descarta, y una simulación a medias que no cuadra se pierde. */
import { ROLES } from '../config.js';
import { clampInt } from '../util.js';
import { BANK_MAX, BOSS_AT, BOSS_STEPS, CHARGES_DAY, HP_MAX, ITEMS_MAX, REST_AT, ROOMS, SQUAD } from './config.js';
import { EVENT_BY_ID, ITEMS, SCENARIO_BY_ID, SCENARIOS, STARTERS } from './data.js';

export const STAGES = ['room', 'result', 'rest', 'boss', 'end'];
const KINDS = ['ok', 'part', 'ko', 'safe'];
const str = (v) => typeof v === 'string' && v ? v : null;
const playable = (id) => !!SCENARIO_BY_ID[id] && !SCENARIO_BY_ID[id].soon;

export function normRpg(x) {
  const e = x?.energy;
  const roster = STARTERS.map((m) => ({ ...m }));
  const ids = new Set(roster.map((m) => m.id));
  for (const m of Array.isArray(x?.roster) ? x.roster : []) {
    if (!m || typeof m.id !== 'string' || ids.has(m.id) || !ROLES[m.role] || typeof m.name !== 'string' || !m.name.trim()) continue;
    ids.add(m.id);
    roster.push({ id: m.id, name: m.name.slice(0, 40), role: m.role, lv: clampInt(m.lv, 1, 3, 1), src: 'crew' });
  }
  const unlocked = SCENARIOS.filter((s) => playable(s.id) && (s.id === SCENARIOS[0].id || (Array.isArray(x?.unlocked) && x.unlocked.includes(s.id)))).map((s) => s.id);
  const seen = {};
  if (x?.seen && typeof x.seen === 'object') for (const k of Object.keys(x.seen)) if (EVENT_BY_ID[k] && x.seen[k]) seen[k] = 1;
  const s = x?.stats, bosses = {};
  if (s?.bosses && typeof s.bosses === 'object') for (const k of Object.keys(s.bosses)) if (SCENARIO_BY_ID[k]) bosses[k] = clampInt(s.bosses[k], 0, 1e6, 0);
  return {
    energy: {
      bank: clampInt(e?.bank, 0, BANK_MAX, 0),
      day: str(e?.day),
      credited: clampInt(e?.credited, 0, CHARGES_DAY, 0),
      freeUsed: !!e?.freeUsed,
    },
    roster,
    unlocked,
    seen,
    stats: { runs: clampInt(s?.runs, 0, 1e6, 0), wins: clampInt(s?.wins, 0, 1e6, 0), best: clampInt(s?.best, 0, ROOMS, 0), bosses },
    run: normRun(x?.run, ids),
  };
}

export function normRun(r, rosterIds) {
  if (!r || typeof r !== 'object' || !playable(r.esc)) return null;
  const squad = (Array.isArray(r.squad) ? r.squad : []).filter((m) => m && rosterIds.has(m.id)).map((m) => ({ id: m.id, hp: clampInt(m.hp, 0, HP_MAX, HP_MAX) }));
  if (squad.length !== SQUAD || new Set(squad.map((m) => m.id)).size !== SQUAD) return null;
  const rooms = Array.isArray(r.rooms) ? r.rooms : [];
  const roomOk = (id, i) => i === REST_AT ? id === 'rest' : i === BOSS_AT ? id === 'boss' : EVENT_BY_ID[id]?.esc === r.esc;
  if (rooms.length !== ROOMS || !rooms.every(roomOk)) return null;
  const i = clampInt(r.i, 0, ROOMS - 1, 0);
  let stage = STAGES.includes(r.stage) ? r.stage : 'room';
  const boss = i === BOSS_AT ? { step: clampInt(r.boss?.step, 0, BOSS_STEPS, 0), wins: clampInt(r.boss?.wins, 0, BOSS_STEPS, 0), fails: clampInt(r.boss?.fails, 0, 99, 0) } : null;
  // La sala manda: si la etapa no casa con ella, se vuelve al principio de la sala.
  const base = i === REST_AT ? 'rest' : i === BOSS_AT ? 'boss' : 'room';
  const res = normRes(r.res, squad);
  if (stage === 'result' && !res) stage = base;
  if (stage !== 'result' && stage !== 'end' && stage !== base) stage = base;
  return {
    esc: r.esc, squad, rooms, i, stage, boss,
    sup: clampInt(r.sup, 0, 99, 0),
    items: (Array.isArray(r.items) ? r.items : []).filter((k) => ITEMS[k]).slice(0, ITEMS_MAX),
    res: stage === 'result' ? res : null,
    outcome: stage === 'end' ? (r.outcome === 'win' ? 'win' : 'lose') : null,
    found: clampInt(r.found, 0, 1e3, 0),
    unlocked: stage === 'end' && playable(r.unlocked) ? r.unlocked : null,
  };
}

function normRes(x, squad) {
  if (!x || typeof x !== 'object' || !KINDS.includes(x.kind)) return null;
  const opt = clampInt(x.opt, 0, 9, 0);
  if (x.kind === 'safe') return { kind: 'safe', opt };
  if (!squad.some((m) => m.id === x.member)) return null;
  const n = (v) => clampInt(v, -99, 99, 0);
  return { kind: x.kind, opt, member: x.member, die: clampInt(x.die, 1, 6, 1), bonus: n(x.bonus), total: n(x.total), dc: n(x.dc), boss: !!x.boss,
    mods: (Array.isArray(x.mods) ? x.mods : []).filter((k) => ITEMS[k]), rerolls: clampInt(x.rerolls, 0, 99, 0) };
}

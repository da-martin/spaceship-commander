/* Vista VR Training: Entrenamiento en Holocubierta.
 * Se pinta sola (como la alianza): entrada con cargas y escenarios, elección
 * de escuadrón y la simulación sala a sala. Las reglas están en rpg/; aquí
 * solo se pinta, se guarda y se avisa. */
import { CREW_LV, CREW_XP_RUN, ROLES } from '../config.js';
import { profileId, trainCrewXp, working } from '../core/crew.js';
import { save, state } from '../store.js';
import { escapeHtml, fmtEf, plural, todayStr } from '../util.js';
import { HP_MAX, ITEMS_MAX, ROOMS, SQUAD } from '../rpg/config.js';
import { BOSSES, bossRef, EVENT_BY_ID, ITEMS, MEDAL_BY_ID, MEDALS, SCENARIO_BY_ID, SCENARIOS } from '../rpg/data.js';
import { syncCrew } from '../rpg/roster.js';
import { canStart, isFree, nextCharge, syncEnergy } from '../rpg/energy.js';
import { normRpg } from '../rpg/state.js';
import { abandon, alive, bonusFor, bossOf, canReroll, canUse, choose, dcNow, eventOf, fxOf, memberInfo, odds, REST_OPTS, rest, reroll, resolve, rollItemsFor, startRun, useItem } from '../rpg/run.js';
import { uiMode } from './mode.js';
import { toast } from './toast.js';

// Lo que solo vive mientras miras: pantalla de entrada, escuadrón elegido,
// la opción y el tripulante marcados, los objetos de tirada y la confirmación.
const ui = { screen: 'lobby', esc: null, pick: [], opt: null, member: null, items: [], confirm: null, rolled: false };
const resetPick = () => { ui.opt = null; ui.member = null; ui.items = []; };

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const KIND = { ok: ['Éxito', 'text-emerald-300 border-emerald-700 bg-emerald-950/40'], part: ['Éxito con coste', 'text-amber-300 border-amber-700 bg-amber-950/40'], ko: ['Fallo', 'text-red-300 border-red-800 bg-red-950/40'] };
const btn = 'min-h-[44px] px-3 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-200 hover:border-violet-500 disabled:opacity-40 disabled:cursor-not-allowed';
const btnMain = 'min-h-[44px] px-4 rounded-lg text-sm font-medium bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-40 disabled:cursor-not-allowed';
const btnDanger = 'min-h-[44px] px-3 rounded-lg text-sm bg-slate-800 border border-red-900 text-red-300 hover:border-red-600';
const chip = (txt, cls = 'border-slate-700 text-slate-300') => `<span class="mono text-[10px] px-1.5 py-0.5 rounded border ${cls}">${txt}</span>`;
const roleName = (k) => ROLES[k]?.name || k;
const first = (id) => escapeHtml(memberInfo(state.rpg, id)?.name.split(' ')[0] || '');
const hearts = (hp) => `<span class="text-violet-300 tracking-tight" aria-label="${plural(hp, 'vida', 'vidas')}">${'♥'.repeat(hp)}<span class="text-slate-600">${'♡'.repeat(Math.max(0, HP_MAX - hp))}</span></span>`;
// Lo que hace un resultado, en corto: «−1 vida · +1 suministro».
export function fxLabel(fx) {
  const out = [], sg = (n) => (n > 0 ? '+' : '−') + Math.abs(n);
  if (fx.hp) out.push(`${sg(fx.hp)} vida`);
  if (fx.hpAll) out.push(`${sg(fx.hpAll)} vida a todos`);
  if (fx.sup) out.push(`${sg(fx.sup)} ${fx.sup === 1 || fx.sup === -1 ? 'suministro' : 'suministros'}`);
  if (fx.item) out.push(fx.item === 'random' ? 'holoobjeto al azar' : ITEMS[fx.item].name);
  return out.join(' · ');
}

/* ---------- entrar y repintar ---------- */
// Al entrar se abonan las cargas ganadas desde la última vez.
export function enterVR() {
  // Cargas ganadas desde la última vez, y la tripulación a bordo como holoperfiles.
  const energy = syncEnergy(state.rpg, state.ship.activity, todayStr()), crew = syncCrew(state.rpg, state.ship.crew);
  if (energy || crew) save();
  if (!state.rpg.run && ui.screen !== 'squad') ui.screen = 'lobby';
  renderVR();
}
export function renderVR() {
  if (uiMode !== 'vr') return;
  const el = document.getElementById('vrBody');
  const r = state.rpg;
  el.innerHTML = r.run ? runView(r) : ui.screen === 'squad' ? squadView(r) : lobbyView(r);
  ui.rolled = false;
}
const act = (fn) => { fn(); save(); renderVR(); };
const notify = (notes) => { if (notes?.length) toast(notes.join(' · ')); };

/* ---------- entrada ---------- */
function energyBox(r) {
  const n = nextCharge(r, state.ship.activity, todayStr()), bank = r.energy.bank;
  const dots = Array.from({ length: 3 }, (_, i) => `<span class="w-3.5 h-3.5 rounded-full border ${i < bank ? 'bg-violet-400 border-violet-300' : 'border-slate-600'}"></span>`).join('');
  const sub = n.waiting ? `Banco lleno: ${plural(n.waiting, 'carga espera', 'cargas esperan')} a que juegues`
    : n.capped ? 'Hoy ya has ganado todas las cargas del día'
      : `Te faltan ${fmtEf(n.left)} puntos de esfuerzo para la próxima carga`;
  return `<div class="flex items-center gap-3 mt-4 p-3 rounded-xl border border-violet-900 bg-violet-950/20">
    <div class="flex gap-1.5" aria-hidden="true">${dots}</div>
    <div class="min-w-0">
      <div class="text-sm font-medium">${plural(bank, 'carga holo', 'cargas holo')}${isFree(r) ? ' · <span class="text-violet-300">la primera simulación es gratis</span>' : ''}</div>
      <div class="mono text-[11px] text-slate-400 mt-0.5">${sub}</div>
    </div>
  </div>`;
}
function lobbyView(r) {
  const found = (esc) => Object.keys(r.seen).filter((id) => EVENT_BY_ID[id]?.esc === esc).length;
  const total = (esc) => Object.values(EVENT_BY_ID).filter((e) => e.esc === esc).length;
  const can = canStart(r);
  const scen = SCENARIOS.map((s, i) => {
    const open = r.unlocked.includes(s.id);
    if (!open) {
      const prev = SCENARIOS[i - 1], why = s.soon ? 'Próximamente' : `Vence a ${bossRef(prev.id)} en ${prev.name}`;
      return `<div class="flex items-center gap-3 min-h-[60px] px-3 py-2 rounded-lg border border-dashed border-slate-700 opacity-60">
        <span aria-hidden="true">🔒</span>
        <div class="min-w-0"><div class="text-sm font-medium">${s.name}</div><div class="mono text-[11px] text-slate-400">${s.theme} · ${why}</div></div>
      </div>`;
    }
    const wins = r.stats.bosses[s.id] || 0;
    return `<button type="button" data-vr="esc" data-id="${s.id}" ${can ? '' : 'disabled'} class="w-full flex items-center gap-3 min-h-[60px] px-3 py-2 rounded-lg border border-violet-800 bg-violet-950/20 hover:border-violet-500 text-left disabled:opacity-60 disabled:cursor-not-allowed">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">${s.name}</div>
        <div class="mono text-[11px] text-slate-400">${s.theme} · ${found(s.id)}/${total(s.id)} eventos descubiertos${wins ? ` · jefe vencido ×${wins}` : ''}</div>
      </div>
      <span class="shrink-0 text-sm text-violet-300">${can ? 'Entrar ▸' : 'Sin cargas'}</span>
    </button>`;
  }).join('');
  const st = r.stats;
  return `<section class="panel corner p-4 sm:p-5">
    <div class="sys-label">VR Training</div>
    <h2 class="text-lg font-bold mt-1">Entrenamiento en Holocubierta</h2>
    <p class="text-sm text-slate-300 mt-2 leading-relaxed">Un simulador a bordo. Nada de lo que pase aquí dentro afecta a tu nave, a tu monedero ni a tu rango. Las cargas se ganan con el esfuerzo del día.</p>
    ${energyBox(r)}
  </section>
  <section class="panel p-4 sm:p-5">
    <div class="sys-label mb-3">Escenarios</div>
    <div class="space-y-2">${scen}</div>
  </section>
  <section class="panel p-4 sm:p-5">
    <div class="sys-label mb-2">Registro de simulación</div>
    <div class="grid grid-cols-3 gap-2 text-center">
      ${[['Jugadas', st.runs], ['Completadas', st.wins], ['Mejor sala', `${st.best}/${ROOMS}`]].map(([k, v]) => `<div class="rounded-lg border border-[#1f2a3d] bg-[#0d1526] py-2"><div class="text-lg font-bold">${v}</div><div class="mono text-[11px] text-slate-400">${k}</div></div>`).join('')}
    </div>
    <div class="sys-label mt-5 mb-2">Medallas <span class="text-slate-400">${r.medals.length}/${MEDALS.length}</span></div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${MEDALS.map((m) => medalCard(m, r.medals.includes(m.id))).join('')}</div>
    <div class="flex flex-wrap items-center gap-2 mt-4">
      ${ui.confirm === 'wipe'
        ? `<span class="text-sm text-red-300">¿Borrar todo el progreso de VR Training? No toca nada más.</span><button type="button" data-vr="wipe-yes" class="${btnDanger}">Sí, borrar</button><button type="button" data-vr="no" class="${btn}">No</button>`
        : `<button type="button" data-vr="wipe" class="${btnDanger}">Borrar progreso de VR Training</button>`}
    </div>
  </section>`;
}

const medalCard = (m, got) => `<div class="rounded-lg border px-2.5 py-2 ${got ? 'border-amber-600 bg-amber-950/30' : 'border-dashed border-slate-700 opacity-60'}" title="${m.desc}">
  <div class="text-sm font-medium ${got ? 'text-amber-200' : 'text-slate-300'}">${got ? '★' : '☆'} ${m.name}</div>
  <div class="mono text-[10px] text-slate-400 mt-0.5 leading-snug">${m.desc}</div>
</div>`;

/* ---------- escuadrón ---------- */
// Los roles que más se piden en un escenario, contando los eventos y los pasos del jefe.
// No se dice qué pide cada paso del jefe: eso se descubre al enfrentarse a él.
function topRoles(esc, n = 4) {
  const count = {}, add = (roles) => { for (const k of new Set(roles)) count[k] = (count[k] || 0) + 1; };
  for (const e of Object.values(EVENT_BY_ID)) if (e.esc === esc) add(e.opts.flatMap((o) => o.roles || []));
  for (const st of BOSSES[esc].steps) add(st.roles);
  return Object.entries(count).sort((a, b) => b[1] - a[1] || roleName(a[0]).localeCompare(roleName(b[0]), 'es')).slice(0, n).map(([k]) => k);
}
const rolesBox = (esc) => `<div class="mt-4 p-3 rounded-xl border border-violet-900 bg-violet-950/10">
    <div class="text-sm font-medium">Roles más útiles en este escenario</div>
    <div class="flex flex-wrap gap-1.5 mt-2">${topRoles(esc).map((k) => chip(roleName(k), 'border-violet-700 text-violet-200')).join('')}</div>
    <p class="mono text-[11px] text-slate-400 mt-2">Cuentan los eventos y el jefe.</p>
  </div>`;

function squadView(r) {
  const s = SCENARIO_BY_ID[ui.esc];
  // Tres grupos: la tripulación a bordo (la única que gana experiencia de verdad),
  // los holoperfiles de quienes ya se fueron y los de serie. En cada uno, de más a menos nivel.
  const aboard = new Map(state.ship.crew.map((m) => [profileId(m), m]));
  const byLv = (a, b) => b.lv - a.lv || a.name.localeCompare(b.name, 'es');
  const groups = [
    ['A bordo de la nave', `con el sueldo al día ganan +${CREW_XP_RUN} XP de tripulación al terminar la simulación`, r.roster.filter((m) => m.src === 'crew' && aboard.has(m.id))],
    ['Antiguos tripulantes', 'holoperfiles: ya no están a bordo y no ganan experiencia', r.roster.filter((m) => m.src === 'crew' && !aboard.has(m.id))],
    ['De serie', 'holoperfiles de entrenamiento: no ganan experiencia', r.roster.filter((m) => m.src === 'serie')],
  ].filter((g) => g[2].length);
  const card = (m) => {
    const on = ui.pick.includes(m.id), crew = aboard.get(m.id);
    const tag = !crew ? '' : working(crew)
      ? chip(`+${CREW_XP_RUN} XP`, 'border-emerald-700 text-emerald-300')
      : chip(crew.owed ? 'sin cobrar · sin XP' : 'sin contrato · sin XP', 'border-red-800 text-red-300');
    return `<button type="button" data-vr="pick" data-id="${m.id}" aria-pressed="${on}" class="flex items-center gap-3 min-h-[56px] px-3 py-2 rounded-lg border text-left ${on ? 'border-violet-400 bg-violet-950/40' : crew ? 'border-cyan-800 bg-[#0d1526] hover:border-violet-600' : 'border-slate-700 bg-[#0d1526] hover:border-violet-600'}">
      <span class="w-6 h-6 shrink-0 rounded-md border grid place-items-center text-xs ${on ? 'bg-violet-500 border-violet-300 text-white' : 'border-slate-600'}" aria-hidden="true">${on ? '✓' : ''}</span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-medium">${escapeHtml(m.name)}</span><span class="block mono text-[11px] text-slate-400">${roleName(m.role)} · ${CREW_LV[m.lv - 1]?.name || 'nivel ' + m.lv}</span>${tag ? `<span class="flex mt-1">${tag}</span>` : ''}</span>
    </button>`;
  };
  const cards = groups.map(([title, note, list]) => `<div class="mt-4">
      <h3 class="text-sm font-semibold">${title} <span class="text-slate-400 font-medium">· ${list.length}</span></h3>
      <p class="mono text-[11px] text-slate-400 mt-0.5">${note}</p>
      <div class="grid sm:grid-cols-3 gap-2 mt-2">${[...list].sort(byLv).map(card).join('')}</div>
    </div>`).join('');
  return `<section class="panel corner p-4 sm:p-5">
    <div class="sys-label">${s.name}</div>
    <h2 class="text-lg font-bold mt-1">Elige tu escuadrón <span class="text-slate-400 font-medium text-sm">${ui.pick.length}/${SQUAD}</span></h2>
    <p class="text-sm text-slate-300 mt-2 leading-relaxed">${s.intro}</p>
    ${rolesBox(ui.esc)}
    ${aboard.size ? '' : '<p class="mono text-[11px] text-slate-400 mt-3">Cuando contrates tripulantes en la nave, aparecerán aquí. Solo los que estén a bordo ganan experiencia al entrenar.</p>'}
    ${cards}
    <div class="flex flex-wrap gap-2 mt-4">
      <button type="button" data-vr="start" ${ui.pick.length === SQUAD && canStart(r) ? '' : 'disabled'} class="${btnMain}">Iniciar simulación${isFree(r) ? ' (gratis)' : ' · 1 carga'}</button>
      <button type="button" data-vr="back" class="${btn}">Volver</button>
    </div>
  </section>`;
}

/* ---------- simulación ---------- */
function header(r) {
  const run = r.run, s = SCENARIO_BY_ID[run.esc];
  const room = run.stage === 'end' ? '' : `Sala ${run.i + 1}/${ROOMS}${run.stage === 'rest' ? ' · descanso' : ` · dificultad ${dcNow(run)}`}`;
  const bar = Array.from({ length: ROOMS }, (_, i) => `<span class="h-1.5 flex-1 rounded-sm ${i < run.i || run.outcome === 'win' ? 'bg-violet-500' : i === run.i && run.stage !== 'end' ? 'bg-violet-300' : 'bg-slate-700'}"></span>`).join('');
  const squad = run.squad.map((m) => {
    const info = memberInfo(r, m.id), off = m.hp <= 0;
    return `<div class="min-w-0 rounded-lg border px-2 py-1.5 ${off ? 'border-slate-800 opacity-50' : 'border-[#1f2a3d] bg-[#0d1526]'}">
      <div class="flex items-baseline justify-between gap-1"><span class="text-sm font-medium truncate">${first(m.id)}</span><span class="mono text-[10px] text-slate-400">${ROLES[info.role].code}</span></div>
      <div class="text-sm leading-tight">${off ? '<span class="mono text-[10px] text-red-300">desconectado</span>' : hearts(m.hp)}</div>
    </div>`;
  }).join('');
  const items = run.items.map((k) => canUse(run, k)
    ? `<button type="button" data-vr="use" data-id="${k}" title="${ITEMS[k].desc}" class="mono text-[11px] min-h-[32px] px-2 rounded border border-violet-600 text-violet-200 hover:bg-violet-900/40">${ITEMS[k].name} · usar</button>`
    : `<span title="${ITEMS[k].desc}" class="mono text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-300">${ITEMS[k].name}</span>`).join('');
  const quit = run.stage === 'end' ? '' : ui.confirm === 'quit'
    ? `<div class="flex flex-wrap items-center justify-end gap-2 mt-3"><span class="text-sm text-red-300">¿Abandonar? La carga no se devuelve.</span><button type="button" data-vr="quit-yes" class="${btnDanger}">Sí</button><button type="button" data-vr="no" class="${btn}">No</button></div>`
    : '';
  return `<section class="panel corner p-4 sm:p-5">
    <div class="flex items-start gap-2">
      <div class="min-w-0">
        <div class="sys-label truncate">${s.name}</div>
        ${room ? `<div class="mono text-[11px] text-slate-400 mt-1">${room}</div>` : ''}
      </div>
      ${run.stage === 'end' || ui.confirm === 'quit' ? '' : `<button type="button" data-vr="quit" class="ml-auto shrink-0 mono text-[11px] min-h-[32px] px-2 rounded border border-slate-700 text-slate-400 hover:border-red-700 hover:text-red-300">Abandonar</button>`}
    </div>
    <div class="flex gap-1 mt-3" aria-hidden="true">${bar}</div>
    <div class="grid grid-cols-3 gap-2 mt-3">${squad}</div>
    <div class="flex flex-wrap items-center gap-1.5 mt-3">
      <span class="mono text-[11px] px-2 py-1 rounded border border-amber-800 text-amber-200">Suministros: ${run.sup}</span>
      ${items}${run.items.length ? `<span class="mono text-[10px] text-slate-500">${run.items.length}/${ITEMS_MAX}</span>` : ''}
    </div>
    ${quit}
  </section>`;
}

function runView(r) {
  const run = r.run;
  const body = run.stage === 'room' ? roomView(r) : run.stage === 'boss' ? bossView(r) : run.stage === 'result' ? resultView(r) : run.stage === 'rest' ? restView() : endView(r);
  return header(r) + body;
}

function optionButton(o, i, sel) {
  const tags = o.safe
    ? chip(o.res.sup ? `Segura · ${fxLabel(o.res)}` : 'Segura · sin coste', 'border-slate-600 text-slate-300')
    : o.roles.map((k) => chip(`+2 ${roleName(k)}`, 'border-violet-800 text-violet-200')).join(' ');
  return `<button type="button" data-vr="opt" data-i="${i}" aria-pressed="${sel}" class="w-full text-left min-h-[52px] px-3 py-2 rounded-lg border ${sel ? 'border-violet-400 bg-violet-950/40' : 'border-slate-700 bg-[#0d1526] hover:border-violet-600'}">
    <span class="block text-sm font-medium">${o.label}</span>
    <span class="flex flex-wrap gap-1 mt-1">${tags}</span>
  </button>`;
}

// Quién tira, con su bono y su probabilidad, y los objetos que puede gastar.
// En el jefe el éxito con coste también supera el paso: se enseña la probabilidad de pasar.
const pct = (p) => `${Math.round(p * 100)} %`;
function rollPanel(r, opt) {
  const run = r.run, dc = dcNow(run), boss = run.stage === 'boss';
  const sayOdds = (o) => boss ? `superar ${pct(o.ok + o.part)}` : `éxito ${pct(o.ok)}`;
  const score = (o) => boss ? o.ok + o.part : o.ok + o.part / 2;
  // El mejor objeto de tirada que tiene a mano cada tripulante, para avisar antes de elegir.
  const bestItem = (id) => rollItemsFor(r, id).map((k) => {
    const b = bonusFor(r, id, opt.roles, [k]);
    return { k, o: odds(b.bonus, dc, b.sure) };
  }).sort((a, b) => score(b.o) - score(a.o))[0];
  if (!ui.member || !alive(run).some((m) => m.id === ui.member)) {
    ui.member = alive(run).map((m) => m.id).sort((a, b) => bonusFor(r, b, opt.roles).bonus - bonusFor(r, a, opt.roles).bonus || rollItemsFor(r, b).length - rollItemsFor(r, a).length)[0];
    ui.items = [];
  }
  const who = alive(run).map((m) => {
    const { bonus } = bonusFor(r, m.id, opt.roles), on = ui.member === m.id, o = odds(bonus, dc), best = bestItem(m.id);
    const hint = best && score(best.o) > score(o) ? `<span class="block mono text-[11px] text-violet-300">con ${ITEMS[best.k].name}: ${sayOdds(best.o).replace(/^\S+ /, '')}</span>` : '';
    return `<button type="button" data-vr="member" data-id="${m.id}" aria-pressed="${on}" class="flex-1 min-w-[96px] min-h-[52px] px-2 py-1.5 rounded-lg border text-left ${on ? 'border-violet-400 bg-violet-950/40' : 'border-slate-700 hover:border-violet-600'}">
      <span class="block text-sm font-medium">${first(m.id)}</span>
      <span class="block mono text-[11px] text-slate-400">+${bonus} · ${sayOdds(o)}</span>
      ${hint}
    </button>`;
  }).join('');
  ui.items = ui.items.filter((k) => rollItemsFor(r, ui.member).includes(k));
  const usable = rollItemsFor(r, ui.member);
  const items = usable.length ? `<div class="flex flex-wrap items-center gap-1.5 mt-3"><span class="mono text-[11px] text-slate-400">Objetos:</span>${usable.map((k) => {
    const on = ui.items.includes(k);
    return `<button type="button" data-vr="item" data-id="${k}" aria-pressed="${on}" title="${ITEMS[k].desc}" class="mono text-[11px] min-h-[32px] px-2 rounded border ${on ? 'border-violet-300 bg-violet-800 text-white' : 'border-slate-600 text-slate-300'}">${ITEMS[k].name}</button>`;
  }).join('')}</div>` : '';
  const { bonus, sure } = bonusFor(r, ui.member, opt.roles, ui.items), o = odds(bonus, dc, sure);
  const sum = boss ? `superar el paso ${pct(o.ok + o.part)}` : `éxito ${pct(o.ok)}${o.part ? ` · con coste ${pct(o.part)}` : ''}`;
  return `<div class="mt-4 p-3 rounded-xl border border-violet-900 bg-violet-950/10">
    <div class="text-sm font-medium mb-2">¿Quién lo intenta?</div>
    <div class="flex flex-wrap gap-2">${who}</div>
    ${items}
    <div class="flex flex-wrap items-center gap-3 mt-3">
      <button type="button" data-vr="roll" class="${btnMain}">Tirar el dado</button>
      <span class="mono text-[11px] text-slate-400">2 dados + ${bonus} contra ${dc} · ${sum}</span>
    </div>
    <p class="mono text-[10px] text-slate-500 mt-2">Los dobles siempre son éxito.</p>
  </div>`;
}

function roomView(r) {
  const ev = eventOf(r.run), sel = ui.opt;
  return `<section class="panel p-4 sm:p-5">
    <h2 class="text-lg font-bold">${ev.title}</h2>
    <p class="text-sm text-slate-300 mt-2 leading-relaxed">${ev.text}</p>
    <div class="space-y-2 mt-4">${ev.opts.map((o, i) => optionButton(o, i, sel === i)).join('')}</div>
    ${sel !== null && !ev.opts[sel].safe ? rollPanel(r, ev.opts[sel]) : ''}
  </section>`;
}

function bossView(r) {
  const run = r.run, b = bossOf(run), step = b.steps[run.boss.step];
  ui.opt = 0;
  return `<section class="panel corner p-4 sm:p-5 border-violet-800">
    <div class="sys-label">Jefe</div>
    <h2 class="text-lg font-bold mt-1">${b.name}</h2>
    ${run.boss.step === 0 && !run.boss.fails ? `<p class="text-sm text-slate-300 mt-2 leading-relaxed">${b.text}</p>` : ''}
    <p class="mono text-[11px] text-slate-400 mt-3">Supera los 3 pasos. Cada fallo cuesta 1 vida a quien tira y hay que repetir el paso.</p>
    <div class="flex gap-1.5 mt-2" aria-hidden="true">${b.steps.map((_, i) => `<span class="h-1.5 flex-1 rounded-sm ${i < run.boss.step ? 'bg-violet-500' : i === run.boss.step ? 'bg-violet-300' : 'bg-slate-700'}"></span>`).join('')}</div>
    <div class="mt-4 px-3 py-2 rounded-lg border border-violet-800 bg-violet-950/30">
      <div class="mono text-[11px] text-violet-300">Paso ${run.boss.step + 1} de 3</div>
      <div class="text-sm font-medium mt-0.5">${step.label}</div>
      <div class="flex flex-wrap gap-1 mt-1">${step.roles.map((k) => chip(`+2 ${roleName(k)}`, 'border-violet-800 text-violet-200')).join(' ')}</div>
    </div>
    ${rollPanel(r, step)}
  </section>`;
}

function resultView(r) {
  const run = r.run, res = run.res, fx = fxOf(run);
  let text, title;
  if (res.boss) {
    const step = bossOf(run).steps[res.opt];
    title = step.label; text = res.kind === 'ko' ? step.ko : step.ok;
  } else {
    const o = eventOf(run).opts[res.opt];
    title = o.label; text = (res.kind === 'safe' ? o.res : o[res.kind]).t;
  }
  const effect = fxLabel(fx);
  const dice = res.kind === 'safe' ? '' : `<div class="flex items-center gap-4 mt-3">
    <span class="shrink-0 flex gap-1" aria-hidden="true">${res.dice.map((d, i) => `<span class="vr-die ${ui.rolled ? 'vr-roll' : ''} text-6xl leading-none text-violet-200" style="animation-delay:${i * 90}ms">${FACES[d - 1]}</span>`).join('')}</span>
    <div class="${ui.rolled ? 'vr-reveal' : ''}">
      <div class="mono text-[11px] text-slate-400">${first(res.member)} · ${res.dice[0]} + ${res.dice[1]} + ${res.bonus} = ${res.total} contra ${res.dc}${res.mods.length ? ` · ${res.mods.map((k) => ITEMS[k].name).join(', ')}` : ''}${res.rerolls ? ` · ${plural(res.rerolls, 'repetición', 'repeticiones')}` : ''}</div>
      <span class="inline-block mt-1 text-sm font-semibold px-2 py-0.5 rounded border ${KIND[res.kind][1]}">${KIND[res.kind][0]}</span>
      ${res.dice[0] === res.dice[1] && !res.mods.some((k) => ITEMS[k].sure) ? `<span class="inline-block mt-1 ml-1 text-sm font-semibold px-2 py-0.5 rounded border border-amber-600 bg-amber-950/40 text-amber-200">¡Dobles!</span>` : ''}
    </div>
  </div>`;
  const again = canReroll(run) ? `
    <button type="button" data-vr="reroll" data-how="sup" ${run.sup < 1 ? 'disabled' : ''} class="${btn}">Repetir tirada · −1 suministro</button>
    ${run.items.includes('baliza') ? `<button type="button" data-vr="reroll" data-how="baliza" class="${btn}">Repetir con la baliza</button>` : ''}` : '';
  return `<section class="panel p-4 sm:p-5">
    <div class="mono text-[11px] text-slate-400">${res.boss ? bossOf(run).name : eventOf(run).title}</div>
    <h2 class="text-lg font-bold mt-0.5">${title}</h2>
    ${dice}
    <div class="${ui.rolled ? 'vr-reveal' : ''}">
      <p class="text-sm text-slate-200 mt-3 leading-relaxed">${text}</p>
      ${effect ? `<div class="mt-2">${chip(effect, 'border-slate-600 text-slate-200')}</div>` : ''}
    </div>
    <div class="flex flex-wrap gap-2 mt-4"><button type="button" data-vr="continue" class="${btnMain}">Continuar</button>${again}</div>
  </section>`;
}

function restView() {
  return `<section class="panel p-4 sm:p-5">
    <h2 class="text-lg font-bold">Sala de descanso</h2>
    <p class="text-sm text-slate-300 mt-2 leading-relaxed">Un rincón tranquilo, con una puerta que todavía cierra. Tenéis un momento antes de seguir. Elige una cosa.</p>
    <div class="grid sm:grid-cols-3 gap-2 mt-4">${Object.entries(REST_OPTS).map(([k, o]) => `<button type="button" data-vr="rest" data-id="${k}" class="text-left min-h-[60px] px-3 py-2 rounded-lg border border-slate-700 bg-[#0d1526] hover:border-violet-500">
      <span class="block text-sm font-medium">${o.label}</span><span class="block mono text-[11px] text-slate-400 mt-0.5">${o.desc}</span>
    </button>`).join('')}</div>
  </section>`;
}

function endView(r) {
  const run = r.run, b = bossOf(run), win = run.outcome === 'win';
  const idx = SCENARIOS.findIndex((s) => s.id === run.esc), next = SCENARIOS[idx + 1];
  const unlock = run.unlocked ? `Se desbloquea: ${SCENARIO_BY_ID[run.unlocked].name}` : win && next?.soon ? `Próximamente: ${next.name}` : '';
  const cleared = win ? ROOMS : run.i;
  return `<section class="panel corner p-4 sm:p-5 ${win ? 'border-emerald-800' : 'border-red-900'}">
    <div class="sys-label">Fin de la simulación</div>
    <h2 class="text-lg font-bold mt-1">${win ? '¡Lo habéis conseguido!' : 'El escuadrón ha caído'}</h2>
    <p class="text-sm text-slate-300 mt-2 leading-relaxed">${win ? b.win : b.lose}</p>
    <ul class="mono text-[12px] text-slate-300 mt-3 space-y-1">
      <li>Salas superadas: ${cleared}/${ROOMS}</li>
      <li>Eventos nuevos descubiertos: ${run.found}</li>
      ${unlock ? `<li class="text-violet-300">${unlock}</li>` : ''}
    </ul>
    ${run.medals.length ? `<div class="mt-3"><div class="mono text-[11px] text-amber-300 mb-1.5">Medallas nuevas</div><div class="grid sm:grid-cols-2 gap-2">${run.medals.map((id) => medalCard(MEDAL_BY_ID[id], true)).join('')}</div></div>` : ''}
    <div class="flex flex-wrap gap-2 mt-4"><button type="button" data-vr="leave" class="${btnMain}">Volver a la Holocubierta</button></div>
  </section>`;
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init() {
  document.getElementById('vrBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vr]');
    if (!b || b.disabled) return;
    const r = state.rpg, run = r.run, id = b.dataset.id, a = b.dataset.vr;
    if (a !== 'wipe' && a !== 'quit') ui.confirm = null;
    switch (a) {
      case 'esc': {
        // Se propone el último escuadrón; si no hay, y el plantel es justo de 3, esos 3.
        const last = r.lastSquad.filter((x) => memberInfo(r, x));
        ui.esc = id; ui.screen = 'squad';
        ui.pick = last.length === SQUAD ? last : r.roster.length <= SQUAD ? r.roster.map((m) => m.id) : [];
        renderVR(); scrollTo(0, 0); break;
      }
      case 'pick': ui.pick = ui.pick.includes(id) ? ui.pick.filter((x) => x !== id) : ui.pick.length < SQUAD ? [...ui.pick, id] : ui.pick; renderVR(); break;
      case 'back': ui.screen = 'lobby'; renderVR(); break;
      case 'start': {
        const err = startRun(r, ui.esc, ui.pick);
        if (err) { toast(err); return; }
        resetPick(); ui.screen = 'lobby'; save(); renderVR(); scrollTo(0, 0); break;
      }
      case 'opt': {
        const i = +b.dataset.i, o = eventOf(run).opts[i];
        if (o.safe) { const err = choose(r, i, null); if (err) { toast(err); return; } resetPick(); save(); renderVR(); break; }
        if (ui.opt !== i) { ui.opt = i; ui.member = null; ui.items = []; }
        renderVR(); break;
      }
      case 'member': ui.member = id; renderVR(); break;
      case 'item': ui.items = ui.items.includes(id) ? ui.items.filter((x) => x !== id) : [...ui.items, id]; renderVR(); break;
      case 'roll': {
        const err = choose(r, ui.opt, ui.member, ui.items);
        if (err) { toast(err); return; }
        resetPick(); save(); ui.rolled = true; renderVR(); break;
      }
      case 'reroll': { const err = reroll(r, b.dataset.how); if (err) { toast(err); return; } save(); ui.rolled = true; renderVR(); break; }
      case 'continue': {
        // Al terminar la simulación (ganada o perdida), XP para la tripulación que siga a bordo.
        let notes; act(() => { const was = r.run?.stage; notes = resolve(r);
          if (was !== 'end' && r.run?.stage === 'end') { const got = trainCrewXp(r.run.squad.map((m) => m.id)); if (got.length) notes.push(`${got.map((m) => m.name.split(' ')[0]).join(', ')}: +${CREW_XP_RUN} XP de tripulación`); } });
        notify(notes); scrollTo(0, 0); break;
      }
      case 'rest': { let notes; act(() => { notes = rest(r, id); }); notify(notes); break; }
      case 'use': { let msg; act(() => { msg = useItem(r, id); }); if (msg) toast(msg); break; }
      case 'quit': ui.confirm = 'quit'; renderVR(); break;
      case 'quit-yes': resetPick(); act(() => abandon(r)); break;
      case 'leave': resetPick(); ui.screen = 'lobby'; act(() => abandon(r)); scrollTo(0, 0); break;
      case 'wipe': ui.confirm = 'wipe'; renderVR(); break;
      case 'wipe-yes': {
        // Solo se vacía lo de VR Training; la energía ganada hoy se respeta.
        const energy = r.energy;
        act(() => { Object.assign(r, { ...normRpg(null), energy }); });
        toast('Progreso de VR Training borrado'); break;
      }
      case 'no': renderVR(); break;
    }
  });
}

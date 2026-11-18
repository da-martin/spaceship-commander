/* Hoja de servicios: rango y tripulación. */
import { CREW_DAYS, CREW_LV, EF_XP, EFFORT, payRound, RANKS, ROLES, SHIP_LV_MAX, XP_CONTRACT, XP_PROGRESS, XP_ROUND } from '../config.js';
import { crewHint, crewUnlocked, hireBlock } from '../core/crew.js';
import { atHome, missionsUnlocked } from '../core/missions.js';
import { rankIdx, wageOf } from '../core/rewards.js';
import { berths, berthsUsable } from '../core/ship.js';
import { state } from '../store.js';
import { crewReleasing, hireCrew, rehireCrew, releaseCrew, toggleCancel } from './actions.js';
import { btnCls, showHomeTab } from './ship-view.js';
import { addDays, dayParse, escapeHtml, fDate, todayStr, weekStart } from '../util.js';

/* ---------- render: rango y tripulación ---------- */
export const CREW_LV_CHIP=['border-slate-600 text-slate-300','border-cyan-700 text-cyan-300','border-amber-600 text-amber-300'];
export const roleTile=(role)=>`<span class="w-10 h-10 shrink-0 rounded-lg grid place-items-center border border-cyan-800 bg-cyan-950/40 mono text-[11px] font-bold text-cyan-300" aria-hidden="true">${ROLES[role].code}</span>`;
export function renderRank(){
  const xp=state.cmd.xp, i=rankIdx(), next=RANKS[i+1], base=RANKS[i][1], st=state.cmd.stats;
  const pct=next?Math.min(100,Math.round((xp-base)/(next[1]-base)*100)):100;
  document.getElementById('rankBadge').textContent='R'+(i+1);
  document.getElementById('rankSummary').textContent=`· ${RANKS[i][0]} · ${xp} méritos`;
  const habitDays=state.habits.reduce((a,h)=>h.type==='neg'?a:a+Object.values(h.log||{}).filter(n=>n>=1).length,0);
  const stats=[['Tareas completadas',state.tasks.filter(x=>x.done).length],['Hábitos cumplidos',habitDays],...(missionsUnlocked()?[[st.urgentFails?`Misiones completadas · ${st.urgentFails} ${st.urgentFails===1?'urgente fallida':'urgentes fallidas'}`:'Misiones completadas',st.missions]]:[]),['Rondas Forster',st.rounds],...(crewUnlocked()?[['Tripulantes contratados',st.hires]]:[]),['Nivel de la nave',Object.values(state.ship.modules).reduce((a,m)=>a+m.lv,0)+'/'+SHIP_LV_MAX]];
  document.getElementById('rankPanel').innerHTML=`
    <div class="flex items-center gap-2">
      <div class="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-label="Progreso hacia el siguiente rango" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="h-full bg-amber-400 rounded-full transition-all" style="width:${pct}%"></div></div>
      <span class="mono text-[11px] text-slate-300">${next?`${next[1]-xp} para ${next[0]}`:'rango máximo'}</span>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">${stats.map(([k,v])=>`<div class="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2"><div class="text-xl font-bold">${v}</div><div class="mono text-[11px] text-slate-400">${k}</div></div>`).join('')}</div>
    <p class="mono text-[11px] text-slate-400 mt-3">Méritos: +${EF_XP} por punto de esfuerzo (micro +${payRound(EF_XP*EFFORT.micro,EFFORT.micro)} · fácil +${payRound(EF_XP*EFFORT.easy,EFFORT.easy)} · normal +${EF_XP} · difícil +${EF_XP*EFFORT.hard} · épica +${EF_XP*EFFORT.epic}) · progreso +${XP_PROGRESS} · ronda Forster +${XP_ROUND}${missionsUnlocked()?` · misión +${XP_CONTRACT}`:''}. Nunca se gastan.</p>
    ${crewUnlocked()?`<p class="mono text-[11px] text-slate-400 mt-1">Tripulación ${CREW_LV[1].name.toLowerCase()} desde ${RANKS[CREW_LV[1].rank][0]} · ${CREW_LV[2].name.toLowerCase()} desde ${RANKS[CREW_LV[2].rank][0]}.</p>`:''}`;
}
export function renderCrew(){
  const sh=state.ship;
  // Bloqueada: se rellenan los mismos destinos con la pista y se sale antes de
  // cablear los clics. El marcado no se borra porque abajo se escribe en cinco
  // ids sin comprobar que existan.
  if(!crewUnlocked()){
    const pista=`<p class="sm:col-span-2 mono text-[11px] text-slate-400 border border-dashed border-slate-700 rounded-lg px-3 py-3 text-center">${crewHint()}</p>`;
    document.getElementById('crewBerths').innerHTML='';
    document.getElementById('crewWarn').classList.add('hidden');
    document.getElementById('crewList').innerHTML=pista;
    document.getElementById('crewBoardNote').textContent='';
    document.getElementById('candList').innerHTML=pista;
    return;
  }
  const wages=sh.crew.filter(m=>!m.idle&&!m.cancel).reduce((a,m)=>a+wageOf(m.wage),0), short=state.wallet.mc<wages;
  document.getElementById('crewBerths').innerHTML=`· literas ${sh.crew.length}/${berths()}${wages?` · sueldos ${wages} ¢/sem`:''}`;
  const cw=document.getElementById('crewWarn'); cw.classList.toggle('hidden',!short); cw.textContent=short?`Saldo insuficiente para los sueldos de la semana (${wages} ¢): quien no cobre se marchará.`:'';
  const cl=document.getElementById('crewList'), home=atHome();
  cl.innerHTML=sh.crew.map(m=>{
    const R=ROLES[m.role], conf=crewReleasing===m.id;
    const fire=home?`<button data-crew="release" data-id="${m.id}" class="px-2.5 py-2 rounded-lg text-sm ${conf?'bg-red-900/60 border border-red-700 text-red-200':'text-slate-400 hover:text-red-300 underline underline-offset-2'}">${conf?'¿Seguro? Pierdes lo pagado':'Despedir ya'}</button>`:'';
    const status=m.idle?'<span class="text-slate-400">Sin contrato · desembarca al volver al Sistema Madre</span>'
      :m.cancel?`<span class="text-amber-300">Contrato cancelado · se marcha el ${fDate(addDays(m.until,1))}</span>`
      :`<span class="text-slate-400">Próximo cobro: ${fDate(addDays(m.until,1))} · ${wageOf(m.wage)} ¢ · se renueva solo</span>`;
    const main=m.idle?`<button data-crew="rehire" data-id="${m.id}" class="${btnCls(state.wallet.mc>=wageOf(m.wage))} flex-1" ${state.wallet.mc>=wageOf(m.wage)?'':'disabled'}>Recontratar ${CREW_DAYS} días · ${wageOf(m.wage)} ¢</button>`
      :`<button data-crew="cancel" data-id="${m.id}" class="flex-1 px-2.5 py-2 rounded-lg text-sm bg-slate-800 border ${m.cancel?'border-amber-600 text-amber-200 hover:border-amber-400':'border-slate-700 text-slate-300 hover:border-slate-500'}">${m.cancel?'Mantener contrato':'Cancelar contrato'}</button>`;
    return `<div class="rounded-xl border ${m.idle?'border-slate-700 border-dashed':m.cancel?'border-amber-600':'border-slate-700'} bg-slate-900/70 p-3">
      <div class="flex items-start gap-3">
        ${roleTile(m.role)}
        <div class="min-w-0 flex-1">
          <div class="font-semibold leading-tight">${escapeHtml(m.name)}</div>
          <div class="flex flex-wrap items-center gap-1.5 mt-1"><span class="mono text-[11px] text-slate-300">${R.name}</span><span class="mono text-[11px] px-1.5 py-0.5 rounded border ${CREW_LV_CHIP[m.lv-1]}">${CREW_LV[m.lv-1].name}</span></div>
        </div>
      </div>
      <div class="text-sm mt-2 ${m.idle?'text-slate-400 line-through':'text-cyan-200'}">${R.desc(R.eff[m.lv-1])}</div>
      <div class="mono text-[11px] mt-1">${status}</div>
      <div class="flex flex-wrap items-center gap-1.5 mt-2.5">${main}${m.idle?'':fire}</div>
    </div>`;
  }).join('')+Array.from({length:Math.max(0,berths()-sh.crew.length)},(_,i)=>sh.crew.length+i>=berthsUsable()
    ?`<div class="rounded-xl border border-dashed border-red-900 p-3 grid place-items-center text-center text-sm text-slate-400 min-h-[120px]">Litera dañada · repara los Camarotes</div>`
    :atHome()
    ?`<button type="button" data-crew="board" class="rounded-xl border border-dashed border-slate-700 hover:border-cyan-600 p-3 grid place-items-center text-sm text-slate-400 hover:text-cyan-300 min-h-[120px]">Litera libre · ver candidatos</button>`
    :`<div class="rounded-xl border border-dashed border-slate-700 p-3 grid place-items-center text-sm text-slate-400 min-h-[120px]">Litera libre · contrata al volver al Sistema Madre</div>`).join('');
  const nextSun=addDays(sh.crewBoard.week||weekStart(),7), dn=Math.round((dayParse(nextSun)-dayParse(todayStr()))/864e5);
  document.getElementById('crewBoardNote').textContent=`· nuevos el ${fDate(nextSun)} (en ${dn} ${dn===1?'día':'días'})`;
  const cand=document.getElementById('candList');
  cand.innerHTML=sh.crewBoard.cands.map(x=>{
    const R=ROLES[x.role], L=CREW_LV[x.lv-1], why=hireBlock(x);
    return `<div class="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
      <div class="flex items-start gap-3">
        ${roleTile(x.role)}
        <div class="min-w-0 flex-1">
          <div class="font-semibold leading-tight">${escapeHtml(x.name)}</div>
          <div class="flex flex-wrap items-center gap-1.5 mt-1"><span class="mono text-[11px] text-slate-300">${R.name}</span><span class="mono text-[11px] px-1.5 py-0.5 rounded border ${CREW_LV_CHIP[x.lv-1]}">${L.name}</span></div>
        </div>
        <span class="mono text-[11px] text-amber-300 shrink-0">${wageOf(L.wage)} ¢/sem</span>
      </div>
      <div class="text-sm text-cyan-200 mt-2">${R.desc(R.eff[x.lv-1])}</div>
      <button data-crew="hire" data-id="${x.id}" class="${btnCls(!why)} w-full mt-2.5" ${why?'disabled':''}>${why||`Contratar · ${wageOf(L.wage)} ¢`}</button>
    </div>`;
  }).join('')||'<div class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-4 text-center sm:col-span-2">Ya contrataste a todos los candidatos de esta semana.</div>';
  const act=(e)=>{ const b=e.target.closest('[data-crew]'); if(!b||b.disabled) return; const id=b.dataset.id, a=b.dataset.crew;
    if(a==='hire') hireCrew(id); else if(a==='cancel') toggleCancel(id); else if(a==='rehire') rehireCrew(id); else if(a==='release') releaseCrew(id); else if(a==='board') showHomeTab('crew'); };
  cl.onclick=act; cand.onclick=act;
}

/* Bitácora de a bordo e informe de fin de misión. */
import { RES } from '../config.js';
import { logText } from '../core/log.js';
import { chip, fClock } from './focus.js';
import { save, state } from '../store.js';
import { uiMode } from '../ui/mode.js';
import { toast } from '../ui/toast.js';
import { addDays, escapeHtml, fDate, todayStr } from '../util.js';

/* ---------- bitácora de a bordo e informes de misión ---------- */
// Lo que la vista hace con cada entrada nueva (avisos de core/log.js). Dentro de
// Spaceship lo pequeño se da por leído y sale como aviso; lo grande abre su informe.
// Como el de llegada, el aviso se toca para abrir la bitácora.
export function onLog(e){ if(uiMode==='ship'&&!e.big){ e.seen=e.read=true; toast(logText(e),undefined,openLog); } }
export function onLogged(e){ if(uiMode==='ship'&&e.big) openReport(); else paintLog(); }
export const LOG_TONE={
  win: {label:'text-amber-300', edge:'border-amber-600', panel:'#92400e', ring:'bg-amber-950/60 border-amber-500 text-amber-300', btn:'bg-[#b45309] hover:bg-[#c2410c] border-amber-500',
        icon:'<polyline points="20 6 9 17 4 12"/>'},
  warn:{label:'text-cyan-300',  edge:'border-cyan-600',  panel:'#155e75', ring:'bg-cyan-950/60 border-cyan-500 text-cyan-300',    btn:'bg-cyan-700 hover:bg-cyan-600 border-cyan-500',
        icon:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'},
  bad: {label:'text-red-300',   edge:'border-red-600',   panel:'#7f1d1d', ring:'bg-red-950/60 border-red-500 text-red-300',        btn:'bg-slate-800 hover:bg-slate-700 border-slate-600',
        icon:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'},
  info:{label:'text-slate-300', edge:'border-slate-600'}
};
export const LOG_KIND_TXT={mission:'MISIÓN',crew:'TRIPULACIÓN',wear:'DESGASTE',board:'TABLÓN',books:'CONTABILIDAD',travel:'SALTO'};
export const logDay=(d)=>d===todayStr()?'Hoy':d===addDays(todayStr(),-1)?'Ayer':fDate(d);
export const rewChips=(r)=>!r?'':[chip(`+${r.mc} ¢`,RES.mc.chip),...Object.entries(r.mats||{}).filter(([k])=>RES[k]).map(([k,n])=>chip(`+${n} ${RES[k].sym} ${RES[k].name}`,RES[k].chip)),
  ...(r.xp?[chip(`+${r.xp} méritos`,'border-slate-600 text-slate-300')]:[])].join('');
// Un punto en el botón Spaceship mientras haya algo que no se ha visto; ámbar si es un informe.
export function paintLog(){
  const L=state.ship.log, unseen=L.filter(e=>!e.seen), big=unseen.some(e=>e.big), unread=L.filter(e=>!e.read).length;
  document.querySelectorAll('[data-logdot]').forEach(d=>{ d.classList.toggle('hidden',!unseen.length||uiMode==='ship'); d.style.background=big?'#fbbf24':'#22d3ee'; });
  const n=document.getElementById('miLogCount'); n.textContent=unread; n.classList.toggle('hidden',!unread);
}
// Al entrar en la nave: primero los informes, uno a uno; lo pequeño se resume en un aviso.
export function shipArrive(){
  const L=state.ship.log, fresh=L.filter(e=>!e.seen&&!e.big);
  if(!L.some(e=>!e.seen)) return;
  fresh.forEach(e=>e.seen=true); save();
  if(L.some(e=>e.big&&!e.read)) openReport(); else announceLog(fresh);
}
export function announceLog(fresh){
  // Tocar el aviso abre la bitácora: no hace falta ir a buscarla al menú.
  if(fresh.length===1) toast(logText(fresh[0]),undefined,openLog);
  else if(fresh.length) toast(`${fresh.length} novedades en la bitácora · toca para verlas`,undefined,openLog);
  paintLog();
}
export let rpOpen=null;
export function openReport(){
  const pend=state.ship.log.filter(e=>e.big&&!e.read), e=pend[0];
  if(!e) return;
  const T=LOG_TONE[e.tone]||LOG_TONE.win;
  rpOpen=e.id;
  document.getElementById('rpBox').style.borderColor=T.panel;
  const ic=document.getElementById('rpIcon');
  ic.className='w-16 h-16 rounded-full grid place-items-center border-2 '+T.ring;
  ic.innerHTML=`<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${T.icon}</svg>`;
  document.getElementById('rpTitle').textContent=e.title;
  const w=document.getElementById('rpWhen'); w.className='mono text-sm mt-1.5 '+T.label; w.textContent=`${logDay(e.day)} · ${fClock(e.at)}`;
  const ch=document.getElementById('rpChips'); ch.innerHTML=rewChips(e.rew); ch.classList.toggle('hidden',!e.rew);
  document.getElementById('rpKind').textContent=e.kind==='travel'?'Informe de salto':'Informe de misión';
  const qt=document.getElementById('rpQuote'); qt.textContent=e.quote?`«${e.quote}»`:''; qt.classList.toggle('hidden',!e.quote);
  const st=document.getElementById('rpStory'); st.textContent=e.story||''; st.classList.toggle('hidden',!e.story);
  document.getElementById('rpLines').innerHTML=e.lines.map(l=>`<p>${escapeHtml(l)}</p>`).join('');
  const more=document.getElementById('rpMore'); more.textContent=pend.length>1?`Quedan ${pend.length-1} ${pend.length===2?'informe':'informes'} más`:''; more.classList.toggle('hidden',pend.length<2);
  const ok=document.getElementById('rpOk'); ok.className='w-full h-12 rounded-xl text-white text-[15px] font-semibold border '+T.btn;
  document.getElementById('toast').classList.add('hidden');   // el informe sustituye al aviso pequeño
  document.getElementById('reportModal').classList.remove('hidden');
  ok.focus(); paintLog();
}
export function acceptReport(){
  const e=state.ship.log.find(x=>x.id===rpOpen); rpOpen=null;
  if(e) e.seen=e.read=true;
  save();
  if(state.ship.log.some(x=>x.big&&!x.read)){ openReport(); return; }
  document.getElementById('reportModal').classList.add('hidden');
  announceLog(state.ship.log.filter(x=>!x.big&&!x.read));
}
// La bitácora se pinta con lo no leído resaltado y, al abrirla, todo queda leído.
export function openLog(){
  const L=state.ship.log, body=document.getElementById('logBody');
  if(!L.length) body.innerHTML='<p class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 mt-3">Todavía no hay nada. Aquí quedarán los finales de misión, los sueldos, el desgaste de los módulos y las transmisiones del tablón que lleguen mientras no estés en la nave.</p>';
  else {
    let h='', day=null;
    for(const e of [...L].reverse()){
      if(e.day!==day){ day=e.day; h+=`<div class="sys-label mt-4 mb-2">${logDay(day)}</div>`; }
      const T=LOG_TONE[e.tone]||LOG_TONE.info;
      h+=`<div class="rounded-lg border ${e.read?'border-slate-800':T.edge} bg-slate-900/60 px-3 py-2.5 mb-1.5">
        <div class="flex items-baseline gap-2">
          <span class="mono text-[11px] tracking-wider ${T.label}">${LOG_KIND_TXT[e.kind]}</span>
          ${e.read?'':'<span class="mono text-[11px] text-slate-100">· nuevo</span>'}
          <span class="mono text-[11px] text-slate-400 ml-auto shrink-0">${fClock(e.at)}</span>
        </div>
        <p class="text-sm text-slate-100 mt-0.5">${escapeHtml(e.title)}</p>
        ${e.quote?`<p class="text-[13px] italic text-violet-200 mt-1.5 leading-relaxed">«${escapeHtml(e.quote)}»</p>`:''}
        ${e.story?`<p class="text-[13px] text-slate-300 mt-1.5 leading-relaxed">${escapeHtml(e.story)}</p>`:''}
        ${e.lines.length?`<p class="mono text-[11px] text-slate-400 mt-1 leading-relaxed">${e.lines.map(escapeHtml).join('<br>')}</p>`:''}
        ${e.rew?`<div class="flex flex-wrap gap-1.5 mt-2">${rewChips(e.rew)}</div>`:''}
      </div>`;
    }
    body.innerHTML=h;
  }
  document.getElementById('logModal').classList.remove('hidden');
  if(L.some(e=>!e.read||!e.seen)){ L.forEach(e=>{ e.seen=e.read=true; }); save(); }
  paintLog();
}
export const closeLog=()=>document.getElementById('logModal').classList.add('hidden');

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('rpOk').onclick=acceptReport;
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&rpOpen) acceptReport(); });
  document.getElementById('miLog').onclick=openLog;
  document.getElementById('logClose').onclick=closeLog;
  document.getElementById('logModal').addEventListener('click',e=>{ if(e.target.id==='logModal') closeLog(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeLog(); });
}

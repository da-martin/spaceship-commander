/* Protocolo Forster (modo Focus, en memoria de Mark Forster). */
import { EF_PROGRESS, XP_PROGRESS, XP_ROUND } from '../config.js';
import { countToday, isDoneToday, isScheduledToday } from '../core/habits.js';
import { projBadge } from '../core/projects.js';
import { addW, addXP, checkHabit, gainText, grantTask, perk, tapFree } from '../core/rewards.js';
import { addEffort } from '../core/ship.js';
import { deleteHabit, deleteTask } from '../core/tasks.js';
import { plural } from './saves.js';
import { thShow } from '../integrations/taskhero.js';
import { save, state } from '../store.js';
import { render } from '../ui/commander.js';
import { openModal } from '../ui/modal.js';
import { setMode, uiMode } from '../ui/mode.js';
import { areaBadges, diffBadge, LINK_ICON, linkify, NOTE_ICON } from '../ui/rows.js';
import { toast } from '../ui/toast.js';
import { dayParse, DOW_NAMES, escapeHtml, etaDays, fmtDate, todayStr, uid } from '../util.js';

/* ---------- Protocolo Forster (modo focus, en memoria de Mark Forster) ---------- */
export const FICON={
  habit:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  task:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>',
  acc:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
};
export const FOPT_ICON={
  progress:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>',
  done:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  edit:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  del:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  warn:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 mt-0.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};
export const GRIP_SVG='<svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>';
export const FKIND={habit:{label:'HÁBITO',cls:'text-emerald-300'},task:{label:'TAREA',cls:'text-sky-300'},acc:{label:'ACCIÓN',cls:'text-slate-200'}};
export const FDAY=['dom','lun','mar','mié','jue','vie','sáb'];
export const fDate=(s)=>FDAY[dayParse(s).getDay()]+' '+fmtDate(s);
export const fClock=(ms)=>new Date(ms).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
export const chip=(txt,cls)=>`<span class="mono text-[11px] px-2 py-1 rounded border ${cls}">${txt}</span>`;
export const newLine=(kind,ref,extra)=>({id:uid(),kind,ref,dotted:false,status:null,re:0,added:Date.now(),...extra});
export const focusItem=(l)=>l.kind==='task'?state.tasks.find(x=>x.id===l.ref):l.kind==='habit'?state.habits.find(h=>h.id===l.ref):null;
export const focusTitle=(l)=>l.kind==='acc'?l.title:(focusItem(l)?.title||'');

// lo pendiente de hoy: tareas abiertas + hábitos que tocan hoy sin cumplir (los libres siempre)
export function focusEligible(){
  const hs=state.habits.filter(h=>h.type!=='neg'&&isScheduledToday(h)&&(h.type==='free'||!isDoneToday(h))).sort((a,b)=>(b.priority-a.priority)||a.title.localeCompare(b.title,'es'));
  const ts=state.tasks.filter(x=>!x.done).sort((a,b)=>(b.priority-a.priority)||((a.dueDate||'9999')<(b.dueDate||'9999')?-1:1));
  return [...hs.map(h=>({kind:'habit',ref:h.id})),...ts.map(x=>({kind:'task',ref:x.id}))];
}
export function syncFocus(){
  const f=state.focus, t=todayStr(), sig=()=>f.day+'|'+f.lines.map(l=>l.id).join();
  const before=sig();
  if(f.day!==t){ f.lines=f.lines.filter(l=>!l.status); f.session={progress:0,done:0,mc:0}; f.day=t; if(f.phase==='work') f.workStart=Date.now(); }
  const elig=focusEligible(), ok=new Set(elig.map(e=>e.kind+':'+e.ref));
  f.lines=f.lines.filter(l=>l.kind==='acc'||(focusItem(l)&&(l.status||ok.has(l.kind+':'+l.ref))));
  const have=new Set(f.lines.map(l=>l.kind+':'+l.ref));
  for(const e of elig) if(!have.has(e.kind+':'+e.ref)) f.lines.push(newLine(e.kind,e.ref));
  if(sig()!==before) save();
}
export function dropFocusRef(ref){ state.focus.lines=state.focus.lines.filter(l=>l.ref!==ref); }

export function focusMeta(l){
  const it=focusItem(l);
  if(l.kind==='task'){
    if(!it.dueDate) return {text:'Sin fecha límite',cls:'text-slate-400'};
    const e=etaDays(it.dueDate), d=fDate(it.dueDate);
    if(e<0) return {text:`Atrasada ${-e} d · ${d}`,cls:'text-orange-300'};
    if(e===0) return {text:'Vence hoy · '+d,cls:'text-amber-300'};
    if(e===1) return {text:'Vence mañana · '+d,cls:'text-slate-200'};
    return {text:`Vence en ${e} d · ${d}`,cls:'text-slate-400'};
  }
  if(l.kind==='habit'){
    const c=countToday(it);
    const sc=it.type==='free'?`Libre · llevas ${c} ${c===1?'vez':'veces'}`:it.type==='daily'?'Diario':'Semanal ('+(it.days||[]).map(d=>DOW_NAMES[d]).join(' ')+')';
    return {text:sc+' · hoy, '+fDate(todayStr()),cls:'text-slate-400'};
  }
  return {text:`Añadida a las ${fClock(l.added)} · sin vincular`,cls:'text-slate-400'};
}
export const focusMetaHTML=(l)=>{ const k=FKIND[l.kind], m=focusMeta(l), it=focusItem(l);
  return `<span class="font-bold tracking-wider ${k.cls}">${k.label}</span><span class="${m.cls}">${escapeHtml(m.text)}</span>${diffBadge(it)}`
    +(l.re?`<span class="text-cyan-300">${l.re+1}.ª vuelta</span>`:'')
    +(l.kind==='task'&&it?projBadge(it.projectId):'')+(it?areaBadges(it.areas):''); };

export function renderFocus(){
  syncFocus();
  if(state.focus.phase==='work'&&state.focus.workStart===null){ state.focus.workStart=Date.now(); save(); }
  paintFocusClock();
  const f=state.focus, prep=f.phase==='prep', live=f.lines.filter(l=>!l.status), dots=live.filter(l=>l.dotted).length, se=f.session;
  for(const [id,on] of [['btnFocusPrep',prep],['btnFocusWork',!prep]]){ const b=document.getElementById(id); b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); }
  const fv=document.getElementById('focus-view'); fv.classList.toggle('f-mode-prep',prep); fv.classList.toggle('f-mode-work',!prep);
  const pl=document.getElementById('focusPhaseLabel');
  pl.textContent=prep?'FASE 1 · PREPARAR':'FASE 2 · TRABAJAR';
  pl.className='mono text-[11px] font-bold tracking-[.14em] px-2 py-1 rounded border '+(prep?'border-amber-800 text-amber-300':'border-cyan-800 text-cyan-300');
  document.getElementById('focusPhaseHint').textContent=prep
    ?'Toca una línea para marcarla con un punto: es lo que planeas trabajar. Arrastra desde el asa para reordenar.'
    :'Toca una línea para anotar progreso, completarla, editarla o eliminarla. Solo se muestran las marcadas con punto.';
  const workChips=chip(plural(se.progress,'progreso','progresos'),'border-cyan-800 text-cyan-300')+chip(plural(se.done,'completado','completados'),'border-emerald-800 text-emerald-300');
  document.getElementById('focusChips').innerHTML=prep
    ?chip('● '+plural(dots,'marcada','marcadas'),'border-amber-800 text-amber-300')+chip(plural(live.length,'línea','líneas')+' en la lista','border-slate-700 text-slate-300')
    :workChips;
  document.getElementById('focusCount').textContent=plural(live.length,'pendiente','pendientes')+' · '+plural(f.lines.length-live.length,'tachada','tachadas');

  // Al trabajar solo se ve lo marcado (y lo ya tachado de la ronda, que conserva
  // el punto). Si se entró sin marcar nada, no hay qué ocultar y se ve todo.
  const focused=!prep&&f.lines.some(l=>l.dotted), shown=focused?f.lines.filter(l=>l.dotted):f.lines, hid=f.lines.length-shown.length;
  const ol=document.getElementById('focusList');
  ol.className='space-y-1.5'+(prep?' f-prep':'');
  ol.innerHTML=shown.map(l=>{
    const it=focusItem(l), struck=!!l.status, title=escapeHtml(focusTitle(l)), kl=FKIND[l.kind].label.toLowerCase();
    const cls='f-row'+(l.dotted&&!struck?' dot':'')+(struck?' struck':(!prep&&!l.dotted?' dim':''));
    const stamp=l.status==='done'?'<span class="mono text-[11px] font-bold tracking-wider px-1.5 py-0.5 rounded border border-emerald-600 text-emerald-300 shrink-0">COMPLETADO</span>'
      :l.status==='progress'?'<span class="mono text-[11px] font-bold tracking-wider px-1.5 py-0.5 rounded border border-cyan-600 text-cyan-300 shrink-0">PROGRESO</span>':'';
    const label=(prep?(l.dotted?'Quitar punto de ':'Marcar con punto ')+kl:'Opciones de '+kl)+': '+title;
    return `<li class="${cls}" data-id="${l.id}">
      ${prep?`<button type="button" class="f-grip" data-grip aria-label="Mover ${title} (flechas arriba y abajo)">${GRIP_SVG}</button>`:''}
      <button type="button" class="f-main" data-main ${!prep&&struck?'disabled':''} ${prep?`aria-pressed="${l.dotted}"`:'aria-haspopup="dialog"'} aria-label="${label}">
        <span class="f-dot" aria-hidden="true"></span>
        <span class="f-tile f-${l.kind}" aria-hidden="true">${FICON[l.kind]}</span>
        <span class="min-w-0 flex-1 flex flex-col gap-1">
          <span class="f-title text-[15px] font-medium leading-snug break-words ${l.dotted&&!struck?'text-slate-50':'text-slate-300'}">${it?.priority?'<span class="text-amber-300">★ </span>':''}${title}${it?.notes?NOTE_ICON:''}${thShow(it)?LINK_ICON:''}</span>
          <span class="mono text-[11px] flex flex-wrap items-center gap-x-2 gap-y-1">${focusMetaHTML(l)}</span>
        </span>
        ${stamp}
      </button>
    </li>`;
  }).join('')+(hid?`<li class="mono text-[11px] text-slate-400 border border-dashed border-slate-700 rounded-lg px-3 py-2.5 text-center">${plural(hid,'línea sin punto oculta','líneas sin punto ocultas')} · se ven al volver a preparar</li>`:'')
    ||'<li class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-4 text-center">Nada pendiente hoy. Añade una acción rápida abajo.</li>';

  document.getElementById('focusCta').innerHTML=prep
    ?`<button type="button" data-phase="work" class="btn-primary w-full h-12 rounded-xl border border-cyan-400 text-[15px] font-semibold">Empezar a trabajar · ${plural(dots,'marcada','marcadas')} →</button>`
    :`<div class="flex flex-wrap items-center justify-between gap-2.5"><p class="mono text-[11px] leading-relaxed text-slate-400 flex-1 basis-64">Lo tachado queda como registro de la sesión. Lo que avanzaste vuelve al final, sin punto.</p><button type="button" data-phase="prep" class="h-11 px-4 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white">Volver a preparar</button></div>`;
}
// al volver a Preparar desde Trabajar se limpian las líneas ya trabajadas (tachadas)
// cada ronda de Trabajar lleva su propio reloj (workStart)
// pasar a Trabajar sin ninguna línea con punto pide confirmación
export function requestWork(){
  const f=state.focus;
  if(f.phase==='prep'&&!f.lines.some(l=>!l.status&&l.dotted)){ document.getElementById('focusConfirm').classList.remove('hidden'); document.getElementById('fcBack').focus(); return; }
  setFocusPhase('work'); scrollTo(0,0);
}
export const closeFocusConfirm=()=>document.getElementById('focusConfirm').classList.add('hidden');
export function setFocusPhase(p){
  const f=state.focus;
  if(p==='prep'&&f.phase==='work') f.lines=f.lines.filter(l=>!l.status);
  if(p==='work'&&f.phase!=='work'){ f.workStart=Date.now(); f.round={progress:0,done:0,mc:0}; }
  if(p==='prep') f.workStart=null;
  f.phase=p; save(); render();
}
export const fmtDur=(ms)=>{ const s=Math.max(0,Math.floor(ms/1000)), h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=String(s%60).padStart(2,'0'); return h?`${h}:${String(m).padStart(2,'0')}:${x}`:`${m}:${x}`; };
export let fClockT=null;
export function paintFocusClock(){
  const f=state.focus, on=uiMode==='focus'&&f.phase==='work'&&f.workStart!==null;
  document.getElementById('focusClock').textContent=on?' · '+fmtDur(Date.now()-f.workStart):'';
  if(on&&!fClockT) fClockT=setInterval(paintFocusClock,1000);
  if(!on&&fClockT){ clearInterval(fClockT); fClockT=null; }
}
// tras Progreso o Completado sobre una línea con punto: si ya no queda ninguna, la ronda termina
export function focusRoundDone(wasDotted){
  const f=state.focus;
  if(f.phase!=='work'||!wasDotted||f.lines.some(l=>!l.status&&l.dotted)) return null;
  addXP(XP_ROUND); state.cmd.stats.rounds++;
  return endWork();
}
// termina la ronda de Trabajar y devuelve su resumen (tiempo y contadores) para el modal
export function endWork(){
  const f=state.focus, r={dur:f.workStart!==null?fmtDur(Date.now()-f.workStart):null,...f.round};
  setFocusPhase('prep'); scrollTo(0,0);
  return r;
}
// volver a Preparar a mano: si se estaba trabajando, también se muestra el resumen
export function backToPrep(){
  if(state.focus.phase!=='work'){ setFocusPhase('prep'); return; }
  openRoundModal(endWork(),null,false);
}
// suma a la sesión (diálogo de salida) y a la ronda actual (modal de fin de ronda)
export function focusCount(k,n){ state.focus.session[k]+=n; state.focus.round[k]+=n; }
export function openRoundModal(r,last,completed=true){
  document.getElementById('rmDur').textContent=r.dur?`Tiempo de la ronda · ${r.dur}`:'';
  // Progresos y completados son hechos del método de Forster, no recompensa.
  document.getElementById('rmChips').innerHTML=chip(plural(r.progress,'progreso','progresos'),'border-cyan-800 text-cyan-300')+chip(plural(r.done,'completado','completados'),'border-emerald-800 text-emerald-300');
  document.getElementById('rmTitle').textContent=completed?'¡Ronda completada!':'Ronda terminada';
  const lastTxt=last?'Última acción: '+last:'';
  const rl=document.getElementById('rmLast'); rl.textContent=lastTxt; rl.classList.toggle('hidden',!lastTxt);
  document.getElementById('toast').classList.add('hidden');   // el modal sustituye al aviso pequeño
  document.getElementById('roundModal').classList.remove('hidden');
  document.getElementById('rmGo').focus();
}
export const closeRoundModal=()=>document.getElementById('roundModal').classList.add('hidden');
export function enterFocus(){ state.focus.phase='prep'; state.focus.workStart=null; save(); setMode('focus'); }
export function moveFocusLine(id,tid,after){
  const L=state.focus.lines, i=L.findIndex(l=>l.id===id); if(i<0) return;
  const [m]=L.splice(i,1); let j=L.findIndex(l=>l.id===tid); if(j<0){ L.splice(i,0,m); return; }
  L.splice(after?j+1:j,0,m); save(); render();
}

// acciones del modal de una línea
export function focusProgress(l){
  const f=state.focus, dotted=l.dotted; l.status='progress';
  f.lines.push(newLine(l.kind,l.ref,{re:l.re+1,...(l.kind==='acc'?{title:l.title}:{})}));
  // Recompensa pequeña: 0,1 puntos de esfuerzo, 1 mérito y ¢ solo con Pilotaje
  const pm=perk('pilot');
  if(pm){ addW('mc',pm); focusCount('mc',pm); }
  addXP(XP_PROGRESS); addEffort(EF_PROGRESS); focusCount('progress',1); closeFocusModal(); save(); render();
  const round=focusRoundDone(dotted);
  if(round) openRoundModal(round,'Progreso anotado');
  else toast('Progreso anotado · vuelve al final de la lista');
}
export function focusComplete(l){
  const it=focusItem(l), k=todayStr(), dotted=l.dotted; let g=null;
  if(l.kind==='task'){ it.done=true; g=grantTask(it); }
  else if(l.kind==='habit'){ if(it.type==='free') g=tapFree(it,k); else { it.log=it.log||{}; it.log[k]=1; g=checkHabit(it,k); } }
  else if(!l.grant) g=grantTask(l);   // acción rápida: cuenta como una tarea fácil
  for(const x of state.focus.lines) if(x.ref===l.ref&&!x.status) x.status='done';
  focusCount('done',1); if(g) focusCount('mc',g.mc);
  closeFocusModal(); save(); render();
  const round=focusRoundDone(dotted), gain=g?gainText(g):'Hecho';
  if(round) openRoundModal(round,gain); else toast(gain);
}
export function focusDelete(l){
  closeFocusModal();
  if(l.kind==='task') deleteTask(l.ref);
  else if(l.kind==='habit') deleteHabit(l.ref);
  else { dropFocusRef(l.ref); save(); render(); toast('Acción quitada de la sesión'); }
}

export let fmId=null, fmStep='menu';
export function openFocusModal(id){ fmId=id; fmStep='menu'; paintFocusModal(); document.getElementById('focusModal').classList.remove('hidden'); document.querySelector('#fmBody button')?.focus(); }
export function closeFocusModal(){ document.getElementById('focusModal').classList.add('hidden'); fmId=null; }
export function paintFocusModal(){
  const l=state.focus.lines.find(x=>x.id===fmId); if(!l){ closeFocusModal(); return; }
  const it=focusItem(l), isT=l.kind==='task', isH=l.kind==='habit', isA=l.kind==='acc', title=escapeHtml(focusTitle(l));
  const tile=document.getElementById('fmTile'); tile.className='f-tile f-'+l.kind; tile.innerHTML=FICON[l.kind];
  document.getElementById('fmMeta').innerHTML=focusMetaHTML(l);
  document.getElementById('fmTitle').textContent=(it?.priority?'★ ':'')+focusTitle(l);
  const btn2='px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-sm';
  let html;
  if(fmStep==='menu'){
    const reward='';   // la recompensa existe, pero no se anuncia fuera de la nave
    const doneDesc=isT?'Tacha aquí y completa la tarea en Commander.':isH?(it.type==='free'?'Tacha aquí y suma un registro de hoy al hábito.':'Tacha aquí y marca el hábito como cumplido hoy.'):'Tacha la acción. Cuenta como una tarea fácil.';
    html=(it?.notes?`<details class="fm-notes mb-3 rounded-lg border border-slate-700 bg-slate-900/60"><summary class="cursor-pointer select-none px-3 py-2 mono text-[11px] text-slate-300">NOTAS</summary><div class="px-3 pb-3 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap break-words">${linkify(it.notes)}</div></details>`:'')
      +`<p class="sys-label mb-2.5">¿Qué quieres hacer?</p>
      <div class="grid grid-cols-2 gap-2.5">
        <button type="button" data-fm="progress" class="f-opt border-cyan-900 bg-[#0b1f2e]"><span class="flex items-center gap-2 text-cyan-300 text-[15px] font-semibold">${FOPT_ICON.progress} Progreso</span><span class="text-xs leading-snug text-slate-300">Tacha esta línea y la vuelve a poner al final, sin punto. El original no cambia.</span></button>
        <button type="button" data-fm="done" class="f-opt border-emerald-900 bg-[#0b211c]"><span class="flex items-center gap-2 text-emerald-300 text-[15px] font-semibold">${FOPT_ICON.done} Completado</span><span class="text-xs leading-snug text-slate-300">${doneDesc}</span>${reward}</button>
        <button type="button" data-fm="edit" class="f-opt border-slate-700 bg-slate-900"><span class="flex items-center gap-2 text-slate-200 text-[15px] font-semibold">${FOPT_ICON.edit} Editar</span><span class="text-xs leading-snug text-slate-300">${isA?'Cambia el texto de la acción.':'Abre el editor: los cambios se guardan aquí y en el original.'}</span></button>
        <button type="button" data-fm="delete" class="f-opt border-red-900 bg-[#1c0d10]"><span class="flex items-center gap-2 text-red-300 text-[15px] font-semibold">${FOPT_ICON.del} Eliminar</span><span class="text-xs leading-snug text-slate-300">${isA?'Quita la acción de esta sesión.':'Borra el original para siempre. Pide confirmación.'}</span></button>
      </div>`;
  } else if(fmStep==='delete'){
    const head=isT?'¿Eliminar la tarea para siempre?':isH?'¿Eliminar el hábito para siempre?':'¿Quitar la acción de la sesión?';
    const warn=isT?`«${title}» desaparecerá de esta lista y de Commander. No se puede deshacer.`
      :isH?`«${title}» se borrará con todo su historial y su racha. No se puede deshacer.`
      :`«${title}» no se guardará como tarea al salir.`;
    html=`<div class="flex gap-3 items-start p-3.5 rounded-xl bg-[#1c0d10] border border-red-800">${FOPT_ICON.warn}<div><b class="block text-[15px] text-red-200">${head}</b><span class="text-[13px] leading-relaxed text-red-300">${warn}</span></div></div>
      <div class="flex flex-wrap justify-end gap-2 mt-3.5"><button type="button" data-fm="back" class="${btn2}">Cancelar</button><button type="button" data-fm="confirm-delete" class="px-4 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold">${isA?'Quitar acción':'Eliminar definitivamente'}</button></div>`;
  } else {
    html=`<form data-fm-form class="space-y-3">
      <div><label for="fmEditInput" class="mono text-[11px] text-slate-400">TEXTO DE LA ACCIÓN</label>
      <input id="fmEditInput" type="text" maxlength="200" value="${title}" class="mt-1 w-full h-11 bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm outline-none focus:border-cyan-600"></div>
      <p class="text-xs text-slate-400">Solo cambia en esta sesión. Al salir podrás guardarla como tarea.</p>
      <div class="flex justify-end gap-2"><button type="button" data-fm="back" class="${btn2}">Cancelar</button><button type="submit" class="btn-primary px-4 py-2.5 rounded-lg text-sm font-semibold">Guardar</button></div></form>`;
  }
  document.getElementById('fmBody').innerHTML=html;
  if(fmStep==='edit') setTimeout(()=>document.getElementById('fmEditInput')?.focus(),30);
}

// salir: ofrecer guardar las acciones rápidas como tareas
export let fxTarget='commander', fxPicks=new Set();
export function focusCandidates(){
  const L=state.focus.lines, seen=new Set(), out=[];
  for(const l of L){
    if(l.kind!=='acc'||seen.has(l.ref)) continue; seen.add(l.ref);
    if(!L.some(x=>x.ref===l.ref&&x.status==='done')) out.push(l);
  }
  return out;
}
export function requestFocusExit(target='commander'){
  closeFocusModal(); fxTarget=target;
  const c=focusCandidates();
  if(!c.length){ finishFocusExit(new Set()); return; }
  fxPicks=new Set(c.map(l=>l.ref)); paintFocusExit();
  document.getElementById('focusExitModal').classList.remove('hidden');
}
export function closeFocusExit(){ document.getElementById('focusExitModal').classList.add('hidden'); }
export function paintFocusExit(){
  const se=state.focus.session;
  document.getElementById('fxChips').innerHTML=chip(plural(se.progress,'progreso','progresos'),'border-cyan-800 text-cyan-300')+chip(plural(se.done,'completado','completados'),'border-emerald-800 text-emerald-300');
  document.getElementById('fxList').innerHTML=focusCandidates().map(l=>`<li><label class="flex items-center gap-3 min-h-[52px] px-3 py-2 rounded-lg border border-[#1f2a3d] bg-[#0d1526] cursor-pointer">
      <input type="checkbox" data-ref="${l.ref}" ${fxPicks.has(l.ref)?'checked':''} class="w-[18px] h-[18px] accent-cyan-600 shrink-0">
      <span class="f-tile f-acc" aria-hidden="true">${FICON.acc}</span>
      <span class="min-w-0 flex-1"><span class="block text-sm text-slate-100 break-words">${escapeHtml(l.title)}</span><span class="mono text-[11px] text-slate-400">añadida a las ${fClock(l.added)} · pasará a TAREA fácil sin fecha</span></span>
    </label></li>`).join('');
  paintFocusExitBtn();
}
export function paintFocusExitBtn(){ const n=fxPicks.size; document.getElementById('fxSave').textContent=n===0?'Salir':n===1?'Crear 1 tarea y salir':`Crear ${n} tareas y salir`; }
export function finishFocusExit(keep){
  const f=state.focus, se=f.session, conv={};
  f.lines=f.lines.filter(l=>!l.status);
  for(const ref of keep){
    const l=f.lines.find(x=>x.ref===ref); if(!l) continue;
    const id=uid(); state.tasks.push({id,title:l.title,dueDate:null,priority:false,diff:'easy',done:false,areas:[],projectId:null,createdAt:Date.now()}); conv[ref]=id;
  }
  // las acciones guardadas se quedan en su sitio de la lista larga, ya como tareas
  f.lines=f.lines.filter(l=>l.kind!=='acc'||conv[l.ref]).map(({title,...l})=>l.kind==='acc'?{...l,kind:'task',ref:conv[l.ref]}:(title!==undefined?{...l,title}:l));
  const n=Object.keys(conv).length;
  const msg=`Sesión cerrada · ${plural(se.progress,'progreso','progresos')} · ${plural(se.done,'completado','completados')}`+(n?` · ${plural(n,'tarea nueva','tareas nuevas')}`:'');
  f.session={progress:0,done:0,mc:0}; f.phase='prep'; f.workStart=null;
  closeFocusExit(); save(); setMode(fxTarget); toast(msg);
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  (()=>{
    const ol=document.getElementById('focusList');
    ol.addEventListener('click',e=>{
      const b=e.target.closest('[data-main]'); if(!b||b.disabled) return;
      const id=b.closest('li').dataset.id, l=state.focus.lines.find(x=>x.id===id); if(!l) return;
      if(state.focus.phase==='prep'){
        l.dotted=!l.dotted; save(); render();
        // solo se devuelve el foco si se usó el teclado (Enter/Espacio): con ratón o dedo no hay anillo
        if(e.detail===0) ol.querySelector(`li[data-id="${id}"] [data-main]`)?.focus();
      }
      else openFocusModal(id);
    });
    // reordenar con el asa: Pointer Events (ratón y táctil) + flechas del teclado
    let drag=null;
    const clearMarks=()=>ol.querySelectorAll('.drop-before,.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after'));
    ol.addEventListener('pointerdown',e=>{
      const g=e.target.closest('[data-grip]'); if(!g||e.button>0) return;
      e.preventDefault(); const li=g.closest('li');
      drag={id:li.dataset.id,li,target:null,after:false}; g.setPointerCapture(e.pointerId); li.classList.add('dragging');
    });
    ol.addEventListener('pointermove',e=>{
      if(!drag) return;
      const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('#focusList > li[data-id]');
      clearMarks();
      if(e.clientY<70) scrollBy(0,-14); else if(e.clientY>innerHeight-70) scrollBy(0,14);
      if(!el||el===drag.li){ drag.target=null; return; }
      const r=el.getBoundingClientRect(), after=e.clientY>r.top+r.height/2;
      el.classList.add(after?'drop-after':'drop-before'); drag.target=el.dataset.id; drag.after=after;
    });
    const endDrag=(commit)=>{ if(!drag) return; const d=drag; drag=null; clearMarks(); d.li.classList.remove('dragging'); if(commit&&d.target) moveFocusLine(d.id,d.target,d.after); };
    ol.addEventListener('pointerup',()=>endDrag(true));
    ol.addEventListener('pointercancel',()=>endDrag(false));
    ol.addEventListener('keydown',e=>{
      const g=e.target.closest('[data-grip]'); if(!g||(e.key!=='ArrowUp'&&e.key!=='ArrowDown')) return;
      e.preventDefault();
      const id=g.closest('li').dataset.id, L=state.focus.lines, i=L.findIndex(l=>l.id===id), j=i+(e.key==='ArrowUp'?-1:1);
      if(i<0||j<0||j>=L.length) return;
      [L[i],L[j]]=[L[j],L[i]]; save(); render(); ol.querySelector(`li[data-id="${id}"] [data-grip]`)?.focus();
    });

    document.getElementById('focusAddForm').addEventListener('submit',e=>{
      e.preventDefault(); const inp=document.getElementById('focusAddInput'), t=inp.value.trim(); if(!t) return;
      // al trabajar, lo que se añade entra en la ronda: con punto, y por tanto visible
      state.focus.lines.push(newLine('acc',uid(),{title:t,dotted:state.focus.phase==='work'})); inp.value=''; save(); render(); inp.focus();
    });
    document.getElementById('focusCta').addEventListener('click',e=>{ const b=e.target.closest('[data-phase]'); if(!b) return; if(b.dataset.phase==='work') requestWork(); else backToPrep(); });
    document.getElementById('btnFocusPrep').onclick=backToPrep;
    document.getElementById('btnFocusWork').onclick=requestWork;
    const fc=document.getElementById('focusConfirm');
    fc.addEventListener('click',e=>{ if(e.target===fc) closeFocusConfirm(); });
    document.getElementById('fcBack').onclick=closeFocusConfirm;
    document.getElementById('fcGo').onclick=()=>{ closeFocusConfirm(); setFocusPhase('work'); scrollTo(0,0); };
    document.getElementById('btnFocusExit').onclick=()=>requestFocusExit('commander');
    // Ya en focus, volver a pulsarlo no debe reiniciar la fase ni el reloj.
    document.getElementById('btnFocusMode').onclick=()=>{ if(uiMode!=='focus') enterFocus(); };
    document.querySelectorAll('[data-ficon]').forEach(el=>el.innerHTML=FICON[el.dataset.ficon]);

    const fm=document.getElementById('focusModal'), body=document.getElementById('fmBody');
    document.getElementById('fmClose').onclick=closeFocusModal;
    fm.addEventListener('click',e=>{ if(e.target===fm) closeFocusModal(); });
    body.addEventListener('click',e=>{
      const b=e.target.closest('[data-fm]'); if(!b) return;
      const l=state.focus.lines.find(x=>x.id===fmId); if(!l){ closeFocusModal(); return; }
      const a=b.dataset.fm;
      if(a==='progress') focusProgress(l);
      else if(a==='done') focusComplete(l);
      else if(a==='edit'){ if(l.kind==='acc'){ fmStep='edit'; paintFocusModal(); } else { closeFocusModal(); openModal(l.kind,l.ref); } }
      else if(a==='delete'){ fmStep='delete'; paintFocusModal(); }
      else if(a==='back'){ fmStep='menu'; paintFocusModal(); }
      else if(a==='confirm-delete') focusDelete(l);
    });
    body.addEventListener('submit',e=>{
      e.preventDefault();
      const l=state.focus.lines.find(x=>x.id===fmId), t=document.getElementById('fmEditInput').value.trim();
      if(!l) return closeFocusModal();
      if(t) state.focus.lines.forEach(x=>{ if(x.ref===l.ref) x.title=t; });
      closeFocusModal(); save(); render(); toast('Acción editada');
    });

    const fx=document.getElementById('focusExitModal');
    fx.addEventListener('click',e=>{ if(e.target===fx) closeFocusExit(); });
    document.getElementById('fxList').addEventListener('change',e=>{ const r=e.target.dataset.ref; if(!r) return; e.target.checked?fxPicks.add(r):fxPicks.delete(r); paintFocusExitBtn(); });
    document.getElementById('fxBack').onclick=closeFocusExit;
    document.getElementById('fxDiscard').onclick=()=>finishFocusExit(new Set());
    document.getElementById('fxSave').onclick=()=>finishFocusExit(new Set(fxPicks));
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeFocusModal(); closeFocusExit(); closeFocusConfirm(); closeRoundModal(); } });
    const rm=document.getElementById('roundModal');
    rm.addEventListener('click',e=>{ if(e.target===rm) closeRoundModal(); });
    document.getElementById('rmGo').onclick=closeRoundModal;
  })();
}

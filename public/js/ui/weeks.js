/* Panel de las próximas 13 semanas y su modal de detalle. */
import { on } from '../core/events.js';
import { projTaskCount } from '../core/projects.js';
import { chip } from '../features/focus.js';
import { ical } from '../integrations/calendars.js';
import { state } from '../store.js';
import { render } from './commander.js';
import { uiMode } from './mode.js';
import { view } from './view.js';
import { addDays, dayParse, escapeHtml, etaDays, fmtDate, isoWeek, mondayOf, todayStr } from '../util.js';

// Próximas 13 semanas: el panel de escritorio se recuerda; la pantalla del
// teléfono no, para que la app nunca arranque en ella.
export const WEEKS_KEY='spaceship-commander:weeks';
export let weeksOpen=(()=>{ try{ return localStorage.getItem(WEEKS_KEY)==='1'; }catch{ return false; } })();
export const wideMQ=matchMedia('(min-width:1024px)');
export function weeksData(){
  // Con los proyectos ocultos en Ajustes, el panel queda solo como calendario.
  const t=todayStr(), mon=mondayOf(t), dated=state.settings.showProjects?state.projects.filter(p=>p.due).sort((a,b)=>a.due<b.due?-1:1):[];
  // Los eventos que ya pasaron no son atraso: simplemente no se enseñan.
  const evs=state.settings.showEvents
    ? ical.calendars.flatMap(c=>c.events.map(e=>({...e,cal:c.name}))).filter(e=>e.date>=t)
    : [];
  const weeks=[];
  for(let i=0;i<13;i++){
    const start=addDays(mon,7*i), end=addDays(start,6), a=dayParse(start), b=dayParse(end);
    const rangeLabel=a.getMonth()===b.getMonth()
      ? `${a.getDate()}–${fmtDate(end)}`
      : `${fmtDate(start)} – ${fmtDate(end)}`;
    weeks.push({start, n:isoWeek(start).n, rangeLabel, days:`${a.getDate()}–${b.getDate()}`, monthKey:start.slice(0,7), current:i===0,
      // Lo de esta semana anterior a hoy ya es atraso: va arriba, no aquí.
      items:dated.filter(p=>p.due>=start&&p.due<=end&&p.due>=t),
      events:evs.filter(e=>e.date>=start&&e.date<=end)});
  }
  const last=weeks[12].start, endAll=addDays(last,6);
  return {weeks, overdue:dated.filter(p=>p.due<t), later:dated.filter(p=>p.due>endAll).length};
}
// Lo que pinta el panel, en orden: cada línea abre su detalle por índice.
export let wkItems=[];
// Una línea compacta: icono (▣ proyecto, calendario a trazos evento) y nombre.
export function wkLine(it){
  const i=wkItems.push(it)-1, ev=it.kind==='ev', name=escapeHtml(ev?it.e.title:it.p.name), over=!ev&&it.p.due<todayStr();
  const ico=ev
    ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>'
    : '▣';
  return `<button type="button" data-wk="${i}" class="wk-line${ev?' ev':''}${over?' over':''}" aria-label="${ev?'Evento':'Proyecto'}: ${name}">
    <span class="wk-ico ${ev?'ev':'proj'}" aria-hidden="true">${ico}</span><span class="wk-name">${name}</span></button>`;
}
export const weekRowHtml=(p)=>wkLine({kind:'proj',p});
// Proyectos y eventos de la semana, mezclados por día; dentro del día, lo de
// todo el día (y los vencimientos) antes que lo que tiene hora.
export function weekRows(w){
  const rows=[...w.items.map(p=>({k:p.due,it:{kind:'proj',p}})),...w.events.map(e=>({k:e.date+(e.time||''),it:{kind:'ev',e}}))];
  if(!rows.length) return '';
  rows.sort((a,b)=>a.k<b.k?-1:a.k>b.k?1:0);
  return `<div>${rows.map(r=>wkLine(r.it)).join('')}</div>`;
}
/* El detalle, en un modal: fecha, avance o calendario, y desde Commander el
   atajo a las tareas del proyecto. */
export const wkLongDate=(s)=>{ const d=dayParse(s); return d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',...(d.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})}); };
export const wkField=(label,html)=>`<div><dt class="mono text-[11px] uppercase tracking-[.16em] text-slate-400">${label}</dt><dd class="mt-1 text-sm text-slate-200">${html}</dd></div>`;
export let wkReturn=null;
export function openWkModal(it){
  const ev=it.kind==='ev', t=todayStr();
  let body='', act='';
  if(ev){
    const e=it.e;
    body=wkField('Cuándo',`${wkLongDate(e.date)} · ${e.time||'todo el día'}`)+wkField('Calendario',escapeHtml(e.cal));
  } else {
    const p=it.p, c=projTaskCount(p.id), pct=c.total?Math.round(c.done/c.total*100):0, over=p.due<t, eta=etaDays(p.due);
    const chip=p.due===t?'<span class="px-1.5 py-px rounded border border-slate-500 text-slate-200">HOY</span>'
      :`<span class="px-1.5 py-px rounded border ${over?'border-amber-700 text-amber-300':'border-slate-600 text-slate-300'}">${over?'ATRASADO · hace '+(-eta)+(-eta===1?' día':' días'):'ETA '+eta+(eta===1?' día':' días')}</span>`;
    body=wkField('Fecha límite',`<span class="${over?'text-amber-300':''}">${wkLongDate(p.due)}</span> <span class="mono text-[11px] ml-1">${chip}</span>`)
      +wkField('Avance',c.total
        ?`<div class="flex items-center gap-2.5"><span class="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"><span class="block h-full rounded-full bg-emerald-500" style="width:${pct}%"></span></span><span class="mono text-[11px] text-slate-300">${c.done} de ${c.total} ${c.total===1?'tarea':'tareas'}</span></div>`
        :'<span class="text-slate-400">Sin tareas vinculadas</span>');
    // Solo desde Commander: en Focus y la nave sería sacarte de ahí.
    if(uiMode==='commander') act=`<button type="button" id="wkmGo" class="w-full btn-primary h-11 rounded-lg text-sm font-medium">Ver sus tareas</button>`;
  }
  document.getElementById('wkmKind').textContent=ev?'Evento':'Proyecto';
  document.getElementById('wkmTitle').textContent=ev?it.e.title:it.p.name;
  document.getElementById('wkmBody').innerHTML=body;
  const a=document.getElementById('wkmActions'); a.innerHTML=act; a.classList.toggle('hidden',!act);
  if(act) document.getElementById('wkmGo').onclick=()=>weeksPick(it.p.id);
  wkReturn=document.activeElement;
  document.getElementById('wkModal').classList.remove('hidden');
  document.getElementById('wkmClose').focus();
}
export function closeWkModal(){
  const m=document.getElementById('wkModal'); if(m.classList.contains('hidden')) return;
  m.classList.add('hidden');
  if(wkReturn&&wkReturn.isConnected) wkReturn.focus(); wkReturn=null;
}
export function renderWeeks(){
  const d=weeksData();
  wkItems=[];
  const total=d.weeks.reduce((s,w)=>s+w.items.length,0), nev=d.weeks.reduce((s,w)=>s+w.events.length,0);
  // El número del botón: proyectos de esta semana y atrasados, y si se pide en
  // Ajustes también los eventos de esta semana. Ámbar si hay atraso.
  const wkP=d.weeks[0].items.length, wkO=d.overdue.length, wkE=state.settings.badgeEvents?d.weeks[0].events.length:0, now=wkP+wkO+wkE;
  const badge=document.getElementById('weeksBadge');
  badge.textContent=now; badge.classList.toggle('hidden',!now);
  badge.classList.toggle('bg-amber-600',!!wkO); badge.classList.toggle('bg-cyan-700',!wkO);
  const parts=[wkP&&`${wkP} ${wkP===1?'proyecto':'proyectos'} esta semana`,wkO&&`${wkO} ${wkO===1?'atrasado':'atrasados'}`,wkE&&`${wkE} ${wkE===1?'evento':'eventos'}`].filter(Boolean);
  document.getElementById('btnWeeks').setAttribute('aria-label',`Próximas 13 semanas${parts.length?' · '+parts.join(', '):''}`);
  const showP=state.settings.showProjects, showE=state.settings.showEvents;
  document.getElementById('weeksRange').textContent=`${fmtDate(d.weeks[0].start)} – ${fmtDate(addDays(d.weeks[12].start,6))}${showP?` · ${total} ${total===1?'proyecto':'proyectos'}`:''}${nev?` · ${nev} ${nev===1?'evento':'eventos'}`:''}`;

  let h='';
  if(d.overdue.length){
    h+=`<div role="group" class="wk-week" style="border-top:0" aria-label="Atrasados: ${d.overdue.length}"><div class="wk-rail over" aria-hidden="true">ATRASO</div>
      <div class="min-w-0">${d.overdue.map(p=>weekRowHtml(p)).join('')}</div></div>`;
  }
  let month='';
  for(const w of d.weeks){
    if(w.monthKey!==month){
      month=w.monthKey;
      const name=dayParse(w.start).toLocaleDateString('es-ES',{month:'long',year:'numeric'}).replace(' de ',' ');
      h+=`<div class="wk-month"><span class="sys-label">${name}</span></div>`;
    }
    const rows=weekRows(w);
    h+=`<div role="group" class="wk-week${rows?'':' empty'}${w.current?' now':''}" aria-label="Semana ${w.n}, ${w.rangeLabel}${w.current?', esta semana':''}">
      <div class="wk-rail" aria-hidden="true"><div class="wk-num">${w.n}</div><div class="wk-days">${w.days}</div></div>
      <div class="min-w-0">${w.current?'<div class="wk-tag" aria-hidden="true">ESTA SEMANA</div>':''}${rows||'<div class="wk-free">Libre</div>'}</div>
    </div>`;
  }
  if(d.later) h+=`<p class="mono text-[11px] text-slate-400 px-1 pt-4">Más adelante: ${d.later} ${d.later===1?'proyecto':'proyectos'}</p>`;
  const note=(t)=>`<p class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 text-center mt-4">${t}</p>`;
  if(!showP&&!showE) h+=note('Proyectos y eventos ocultos. Actívalos en Ajustes › Calendarios.');
  else if(showP&&!state.projects.some(p=>p.due)&&!nev) h+=note('Ningún proyecto tiene fecha límite. Pónsela en Commander › Tareas › Proyectos y aparecerá en su semana.');
  const body=document.getElementById('weeksBody');
  body.innerHTML=h;
  body.querySelectorAll('[data-wk]').forEach(b=>b.onclick=()=>openWkModal(wkItems[+b.dataset.wk]));
}
export function measureBars(){
  const s=document.documentElement.style, hdr=document.querySelector('header').offsetHeight;
  s.setProperty('--hdr-h',hdr+'px');
  s.setProperty('--nav-h',document.getElementById('bottomNav').offsetHeight+'px');
  // La tarjeta de semanas empieza a la altura de la primera tarjeta de la vista
  // (Hoy en Commander). Cada vista tiene su propio margen, así que se mide.
  const v=document.querySelector('#views > main:not(.hidden)'), first=v&&[...v.children].find(c=>c.offsetParent);
  if(first) s.setProperty('--wk-top',Math.max(0,Math.round(first.getBoundingClientRect().top+scrollY-hdr))+'px');
}
export function applyWeeks(){
  measureBars();   // también aquí: no esperar al primer aviso del ResizeObserver
  const wide=wideMQ.matches, ship=uiMode==='ship'||uiMode==='alliance', on=!ship&&(wide?weeksOpen:view.weeksScreen);
  document.body.classList.toggle('weeks-open',on&&wide);
  document.body.classList.toggle('weeks-screen',on&&!wide);
  const b=document.getElementById('btnWeeks');
  b.classList.toggle('hidden',ship); b.setAttribute('aria-expanded',String(on));
}
export function setWeeks(v){
  if(wideMQ.matches){ weeksOpen=v; try{ localStorage.setItem(WEEKS_KEY,v?'1':'0'); }catch{} }
  else view.weeksScreen=v;
  applyWeeks();
}
// Llevar a las tareas del proyecto con el filtro que ya existe.
export function weeksPick(id){
  closeWkModal();
  view.pFilter=id; view.cmdTab='tasks'; view.weeksScreen=false; applyWeeks(); render();
  const box=document.getElementById('projBox');
  if(box.offsetParent) scrollTo(0,box.getBoundingClientRect().top+scrollY-document.querySelector('header').offsetHeight-12);
}

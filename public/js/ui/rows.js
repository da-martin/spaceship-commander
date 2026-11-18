/* Filas de las listas de Commander (tareas, hábitos, negativos), su menú ⚙ y
 * las piezas que comparten: insignias, plegado de completados, enlaces. */
import { AREA_DOT, AREAS, EFFORT_NAME, RECENT_MS } from '../config.js';
import { countToday, habitKind, isDoneToday, isScheduledToday, nextScheduled, streak } from '../core/habits.js';
import { projBadge } from '../core/projects.js';
import { cleanDays, revokeTask, untapFree, untapNeg } from '../core/rewards.js';
import { thShow } from '../integrations/taskhero.js';
import { areaName, save, state } from '../store.js';
import { completeTask, deleteHabit, deleteTask, toggleHabitToday } from './actions.js';
import { render } from './commander.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { view } from './view.js';
import { escapeHtml, etaDays, fmtDate, uid } from '../util.js';

export function areaBadges(areas,max=2){
  areas=(areas||[]).filter(a=>AREAS.includes(a));
  if(!areas.length) return '';
  const shown=areas.slice(0,max).map(a=>`<span class="mono text-[11px] text-slate-400 inline-flex items-center gap-1"><span class="w-[7px] h-[7px] rounded-full shrink-0" style="background:${AREA_DOT[a]}" aria-hidden="true"></span>${escapeHtml(areaName(a))}</span>`).join('');
  return shown+(areas.length>max?`<span class="mono text-[11px] text-slate-400">+${areas.length-max}</span>`:'');
}
// Solo lo que se sale de lo normal lleva etiqueta: hoy casi todo es normal.
export const DIFF_TXT={micro:'text-sky-300',easy:'text-emerald-300',hard:'text-red-300',epic:'text-violet-300'};
export const diffBadge=(x)=>DIFF_TXT[x?.diff]?`<span class="${DIFF_TXT[x.diff]}">${EFFORT_NAME[x.diff]}</span>`:'';
export const matchAreas=(x,set)=> set.size===0 || (x.areas||[]).some(a=>set.has(a));

/* ---------- gear menu (un solo botón ⚙ por tarjeta/fila) ---------- */
export const GEAR_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
export function gearMenuHTML(isPri){
  return `<div data-act="menu" class="gear-menu hidden right-2 top-10">`
    + `<button data-m="pri">${isPri?'★ Quitar prioridad':'★ Marcar prioridad'}</button>`
    + `<button data-m="edit">✎ Editar</button>`
    + `<button data-m="del" class="danger">✕ Eliminar</button></div>`;
}
export function wireGear(el,acts){
  const gear=el.querySelector('[data-act="gear"]'), menu=el.querySelector('[data-act="menu"]');
  if(!gear||!menu) return;
  gear.onclick=(e)=>{e.stopPropagation(); document.querySelectorAll('.gear-menu').forEach(m=>{if(m!==menu)m.classList.add('hidden');}); menu.classList.toggle('hidden');};
  menu.onclick=(e)=>e.stopPropagation();
  menu.querySelector('[data-m="pri"]').onclick=()=>{menu.classList.add('hidden');acts.pri();};
  menu.querySelector('[data-m="edit"]').onclick=()=>{menu.classList.add('hidden');acts.edit();};
  menu.querySelector('[data-m="del"]').onclick=()=>{menu.classList.add('hidden');acts.del();};
}

/* ---------- la fila de las listas de Commander ----------
   Una sola anatomía: [control] [título + meta] [extras] [engranaje]. El tipo se
   lee por la forma del control —círculo hábito, cuadrado tarea—, igual que en el
   Protocolo Forster, y no por el color. `size:'lg'` es solo talla: misma fila.
   `title` y `meta` llegan ya escapados por quien llama. */
export function rowHTML(o){
  const lg=o.size==='lg';
  const cls=['row',lg?'row--lg':'',o.done?'done':'',o.over?'over':'',o.dim?'dim':''].filter(Boolean).join(' ');
  const mark=['row-mark',o.kind,o.tone||'',o.on?'on':'',o.off?'off':''].filter(Boolean).join(' ');
  // Recién marcado: la mecha se consume durante el margen y dice cuándo se irá.
  // El retraso negativo la retoma por donde iba aunque la fila se repinte.
  // `fuseUntil`: mecha sin plegado (hábitos libres): solo marca cuándo se sincroniza.
  const burn=o.until||o.fuseUntil;
  const fuse=burn?`<span class="row-fuse" aria-hidden="true" style="animation-duration:${RECENT_MS}ms;animation-delay:${Math.min(0,burn-RECENT_MS-Date.now())}ms"></span>`:'';
  return `<div class="${cls}"${o.until?` data-until="${o.until}"`:''}>${fuse}
    <button type="button" data-act="done" class="row-hit" aria-pressed="${!!o.on}" aria-label="${o.markLabel}"><span class="${mark}" aria-hidden="true">${o.markText||''}</span></button>
    <button type="button" data-act="body" class="row-body" aria-label="Opciones de ${o.title}">
      <span class="row-title ${lg?'text-[17px]':'text-sm'} font-medium leading-snug break-words">${o.pri?'<span class="text-amber-300">★ </span>':''}${o.title}${o.notes?NOTE_ICON:''}${o.linked?LINK_ICON:''}</span>
      ${o.meta?`<span class="mono text-[11px] flex flex-wrap items-center gap-x-2 gap-y-1">${o.meta}</span>`:''}
    </button>
    ${o.extras||''}
    <button type="button" data-act="gear" class="row-gear" title="Opciones" aria-label="Opciones de ${o.title}">${GEAR_SVG}</button>
    ${gearMenuHTML(o.pri)}</div>`;
}
// El control marca, el cuerpo abre el detalle y el engranaje sigue en wireGear.
export function wireRow(el,acts){
  el.querySelector('[data-act="done"]').onclick=acts.done;
  el.querySelector('[data-act="body"]').onclick=acts.edit;
  wireGear(el,{pri:acts.pri,edit:acts.edit,del:acts.del});
  return el;
}
// Construye la fila ya cableada, lista para colgar de la lista que toque.
export function rowEl(o,acts){
  const el=document.createElement('div');
  el.innerHTML=rowHTML(o);
  return wireRow(el.firstElementChild,acts);
}
// Un hábito, en cualquiera de sus dos listas. Entre Hoy y la gestión solo cambia
// la talla: en las dos se marca el día desde el mismo control, que es
// justamente lo que faltaba en la de gestión.
export function habitRowEl(h,size,t){
  if(h.type==='neg') return negRowEl(h,size,t);
  const c=countToday(h), d=isDoneToday(h), free=h.type==='free', sched=isScheduledToday(h), s=streak(h);
  const title=escapeHtml(h.title);
  const kind=habitKind(h), next=!sched&&h.type==='monthly'?nextScheduled(h,t):null;
  const meta=[
    `<span class="text-slate-400">${kind}</span>`,
    diffBadge(h),
    free?`<span class="text-slate-400">hoy ${c} ${c===1?'vez':'veces'}</span>`:'',
    (!free&&s>=2&&state.settings.showStreaks)?`<span class="text-emerald-300">🔥 racha ${s}</span>`:'',
    sched?'':`<span class="text-slate-400">stand-by hoy${next?' · próximo: '+fmtDate(next):''}</span>`,
    areaBadges(h.areas)
  ].filter(Boolean).join('');
  const at=h.g?.[t]?.at;
  const el=rowEl({
    kind:'habit', size, title, pri:h.priority, notes:!!h.notes, linked:thShow(h),
    until:(!free&&d&&recentAt(at))?at+RECENT_MS:0,
    fuseUntil:(free&&c>0&&Number.isFinite(at)&&at+RECENT_MS>Date.now())?at+RECENT_MS:0,
    done:d&&!free, on:!free&&d, off:!d&&((free&&c===0)||!sched), dim:!sched&&!d,
    markText:free?String(c):(d?'✓':''),
    markLabel:(free?'Registrar ':d?'Desmarcar ':'Completar ')+title,
    meta,
    extras:(free&&c>0)?`<button type="button" data-act="minus" class="shrink-0 mono text-sm text-slate-300 border border-slate-700 rounded-lg h-11 min-w-[44px] px-3 hover:border-cyan-600" title="Quitar uno" aria-label="Quitar un registro de ${title}">−1</button>`:''
  },{
    done:()=>toggleHabitToday(h),
    edit:()=>openModal('habit',h.id),
    pri:()=>{h.priority=!h.priority;save();render();},
    del:()=>deleteHabit(h.id)
  });
  const minus=el.querySelector('[data-act="minus"]');
  if(minus) minus.onclick=()=>{ untapFree(h,t); save(); render(); };
  return el;
}
// Hábito negativo: se pulsa cada vez que se cae. El círculo dice cuántas van
// hoy y se pone rojo; en vez de racha, los días seguidos sin caer.
export function negRowEl(h,size,t){
  const c=countToday(h), title=escapeHtml(h.title), clean=cleanDays(h);
  const meta=[
    '<span class="text-red-300">Negativo</span>',
    diffBadge(h),
    c?`<span class="text-red-300">hoy ${c} ${c===1?'caída':'caídas'}</span>`:'',
    (!c&&clean>=1&&state.settings.showStreaks)?`<span class="text-emerald-300">${clean} ${clean===1?'día limpio':'días limpios'}</span>`:'',
    areaBadges(h.areas)
  ].filter(Boolean).join('');
  const el=rowEl({
    kind:'habit', tone:c?'neg':'', size, title, pri:h.priority, notes:!!h.notes, linked:thShow(h),
    off:!c, markText:c?String(c):'−',
    markLabel:'Anotar una caída: '+title,
    meta,
    extras:c>0?`<button type="button" data-act="minus" class="shrink-0 mono text-sm text-slate-300 border border-slate-700 rounded-lg h-11 min-w-[44px] px-3 hover:border-cyan-600" title="Quitar una caída" aria-label="Quitar una caída de ${title}">−1</button>`:''
  },{
    done:()=>toggleHabitToday(h),
    edit:()=>openModal('habit',h.id),
    pri:()=>{h.priority=!h.priority;save();render();},
    del:()=>deleteHabit(h.id)
  });
  const minus=el.querySelector('[data-act="minus"]');
  if(minus) minus.onclick=()=>{ untapNeg(h,t); save(); render(); };
  return el;
}
/* ---------- el primer día ----------
   En frío la app enseñaba once chips de filtro y dos cajas vacías: ni rastro de
   la nave, el rango ni la economía, que es justo lo que la hace distinta de una
   lista de tareas cualquiera. Esto lo cuenta y deja empezar de un toque. */
export const SEED_HABITS=[{title:'Beber agua',type:'free'},{title:'Leer 20 minutos',type:'daily'},{title:'Salir a andar',type:'daily'}];
export function welcomeEl(){
  const el=document.createElement('div');
  el.className='text-center py-3 sm:py-5';
  el.innerHTML=`
    <svg width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" stroke-width="0.9" stroke-linejoin="round" aria-hidden="true" class="mx-auto opacity-80"><path d="M12 2c2.6 2.8 4 6.4 4 10v5l2.4 2.4V21H5.6v-1.6L8 17v-5c0-3.6 1.4-7.2 4-10z"/><circle cx="12" cy="10" r="1.7"/><path d="M8 15l-3 2.6V21M16 15l3 2.6V21"/></svg>
    <h3 class="text-xl sm:text-2xl font-bold mt-4 text-slate-50">Tu nave está en el astillero</h3>
    <p class="text-sm leading-relaxed text-slate-300 max-w-md mx-auto mt-3">Cada hábito que cumples y cada tarea que cierras paga los módulos, la tripulación y las misiones. Empieza por un hábito: la nave se construye sola a partir de ahí.</p>
    <button id="wcNew" type="button" class="btn-primary mt-5 px-5 h-12 rounded-xl text-[15px] font-semibold">Crear mi primer hábito</button>
    <p class="sys-label mt-6 mb-2.5">o empieza con uno de estos</p>
    <div class="flex flex-wrap justify-center gap-2">${SEED_HABITS.map((h,i)=>`<button type="button" data-seed="${i}" class="h-11 px-4 rounded-full border border-slate-700 text-sm text-slate-200 hover:border-cyan-600">+ ${escapeHtml(h.title)}</button>`).join('')}</div>`;
  el.querySelector('#wcNew').onclick=()=>openModal('habit');
  el.querySelectorAll('[data-seed]').forEach(b=>b.onclick=()=>{
    const s=SEED_HABITS[+b.dataset.seed];
    state.habits.push({id:uid(),title:s.title,type:s.type,days:null,priority:false,diff:'normal',areas:[],log:{},createdAt:Date.now()});
    save(); render(); toast('Hábito creado: '+s.title);
  });
  return el;
}
// Hoy usa la fila grande hasta este número de filas; a partir de ahí cede la
// talla. Cinco filas grandes son 395 px: menos de media pantalla de portátil.
export const HOY_LG_MAX = 5;
// Lo vencido no se pliega con el reloj sino cuando leaveRecent lo suelta
// (`released`): así un repintado cualquiera —marcar otra fila, por ejemplo— no
// lo quita de golpe mientras espera a que dejes de tocar la lista.
let released = Date.now();
export const recentAt = (at) => Number.isFinite(at) && at+RECENT_MS > released;
export const taskFolded = (x) => !!x.done && !recentAt(x.grant?.at);
export const habitFolded = (h,t) => h.type!=='free' && h.type!=='neg' && isDoneToday(h) && !recentAt(h.g?.[t]?.at);
export let recentTimer = null;
// Mientras se toca una lista (y TOUCH_HOLD después), lo vencido espera: que
// nada se mueva justo cuando uno va a pulsar. Lo anotan las listas de Commander.
export const TOUCH_HOLD = 1500;
let lastTouch = 0;
export const noteTouch = () => { lastTouch = Date.now(); };
// Despierta justo cuando lo siguiente deja de ser reciente.
export function scheduleRecent(t){
  clearTimeout(recentTimer); recentTimer=null;
  const now=Date.now(); let next=Infinity;
  const see=(at)=>{ if(Number.isFinite(at)&&at+RECENT_MS>released) next=Math.min(next,at+RECENT_MS); };
  for(const x of state.tasks) if(x.done) see(x.grant?.at);
  for(const h of state.habits) if(h.type!=='free'&&h.type!=='neg') see(h.g?.[t]?.at);
  if(next<Infinity) recentTimer=setTimeout(leaveRecent,Math.max(0,next-now)+50);
}
// Al acabar el margen, la fila viaja hasta la franja de completados mientras
// las de abajo suben deslizándose: nada salta de golpe bajo el dedo.
const EASE='cubic-bezier(.4,0,.2,1)';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
export async function leaveRecent(){
  clearTimeout(recentTimer); recentTimer=null;
  const wait=lastTouch+TOUCH_HOLD-Date.now();
  if(wait>0){ recentTimer=setTimeout(leaveRecent,wait+50); return; }   // aún tocando la lista
  const now=Date.now();
  released=Math.max(released,now+100);
  const els=[...document.querySelectorAll('.row[data-until]')]
    .filter(el=>+el.dataset.until<=released&&el.getClientRects().length);   // solo las que se ven
  if(els.length){
    // Lo que sube la franja de cada lista: el hueco de las filas que se van por encima.
    const shift=new Map();
    for(const el of els){ const p=el.parentElement; shift.set(p,(shift.get(p)||0)+el.offsetHeight+(parseFloat(getComputedStyle(el).marginTop)||0)); }
    try{ await Promise.all(els.map(el=>reducedMotion.matches?fadeOut(el):flyOut(el,shift.get(el.parentElement)))); }catch{}
  }
  const lists=new Set(els.map(el=>el.parentElement));
  render();
  if(reducedMotion.matches) return;
  for(const p of lists) p.querySelector('[data-done-target]')?.animate([
    {borderColor:'#1f2a3d',backgroundColor:'#0d1526',transform:'scale(1)'},
    {borderColor:'#047857',backgroundColor:'#0b211c',transform:'scale(1.02)',offset:.35},
    {borderColor:'#1f2a3d',backgroundColor:'#0d1526',transform:'scale(1)'}
  ],{duration:520,easing:'ease-out'});
}
// Cierra el hueco de la fila. Con space-y el hueco va en el margin-top de la
// siguiente; si la fila es la primera, se lo descuenta con margin-bottom.
function collapse(el,dur,delay=0){
  const cs=getComputedStyle(el), next=el.nextElementSibling;
  const under=!el.previousElementSibling&&next?parseFloat(getComputedStyle(next).marginTop)||0:0;
  el.style.overflow='hidden';
  return el.animate([
    {height:el.offsetHeight+'px',paddingTop:cs.paddingTop,paddingBottom:cs.paddingBottom,borderTopWidth:cs.borderTopWidth,borderBottomWidth:cs.borderBottomWidth,marginTop:cs.marginTop,marginBottom:cs.marginBottom},
    {height:'0px',paddingTop:'0px',paddingBottom:'0px',borderTopWidth:'0px',borderBottomWidth:'0px',marginTop:'0px',marginBottom:-under+'px'}
  ],{duration:dur,delay,easing:EASE,fill:'forwards'}).finished;
}
function fadeOut(el){
  el.inert=true;
  return el.animate([{opacity:1},{opacity:0}],{duration:120,fill:'forwards'}).finished.then(()=>collapse(el,160));
}
function flyOut(el,shift){
  el.inert=true;
  const r=el.getBoundingClientRect(), list=el.parentElement;
  // Sin franja todavía (el primero del día): va a donde aparecerá, al final de la lista.
  const target=list.querySelector('[data-done-target]');
  const tr=target?target.getBoundingClientRect():{top:list.getBoundingClientRect().bottom+8,height:44};
  const dy=(tr.top-shift+tr.height/2)-(r.top+r.height/2);
  // La copia vuela por encima de todo (fixed, en body): sobrevive aunque algo repinte a mitad.
  const g=el.cloneNode(true);
  g.querySelector('.row-fuse')?.remove();
  g.removeAttribute('data-until'); g.setAttribute('aria-hidden','true'); g.inert=true;
  Object.assign(g.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',margin:'0',zIndex:'60',pointerEvents:'none'});
  document.body.appendChild(g);
  el.style.visibility='hidden';
  const fly=g.animate([
    {transform:'translateY(0) scale(1)',opacity:1},
    {transform:`translateY(${dy}px) scale(.9)`,opacity:.85,offset:.8},
    {transform:`translateY(${dy}px) scale(.82)`,opacity:0}
  ],{duration:560,easing:'cubic-bezier(.55,0,.25,1)',fill:'forwards'}).finished;
  return Promise.all([fly,collapse(el,380,60)]).finally(()=>g.remove());
}
// Lo completado, recogido al final de la lista en una línea que se despliega.
export function doneFoldEl(items,open,toggle,label,rowFn,extra=''){
  const wrap=document.createElement('div');
  wrap.className='space-y-2';
  const b=document.createElement('button');
  b.type='button';
  b.dataset.doneTarget='';
  b.className='done-strip w-full flex items-center gap-2.5 rounded-lg border border-[#1f2a3d] bg-[#0d1526] px-3 h-11 hover:border-emerald-800';
  b.setAttribute('aria-expanded',open);
  b.innerHTML=`<span class="done-chev mono text-slate-400 text-sm leading-none" aria-hidden="true">▸</span>
    <span class="w-5 h-5 shrink-0 rounded-full bg-emerald-800 text-emerald-50 grid place-items-center text-[11px]" aria-hidden="true">✓</span>
    <span class="mono text-[11px] text-emerald-300">${label}</span>${extra}`;
  b.onclick=()=>{ toggle(); render(); };
  wrap.appendChild(b);
  if(open) items.forEach(x=>wrap.appendChild(rowFn(x)));
  return wrap;
}
// En Hoy la franja pasa a decir «te quedan tres» en vez de «tienes ocho», que
// es lo que uno quiere saber a media tarde, y de paso recoge lo ganado en el día.
// Llegan hábitos y tareas mezclados; solo los hábitos guardan lo ganado por día.
export function doneStripEl(hechos,size,t){
  const n=hechos.length, mc=hechos.reduce((a,h)=>a+(+h.g?.[t]?.mc||0),0);
  return doneFoldEl(hechos,view.todayDoneOpen,()=>{ view.todayDoneOpen=!view.todayDoneOpen; },`${n} ${n===1?'completado':'completados'}`,
    x=>x.type?habitRowEl(x,size,t):taskRowEl(x,t,size),mc?`<span class="mono text-[11px] text-slate-400 ml-auto">+${mc} ¢ hoy</span>`:'');
}
// Una tarea. El atraso es ámbar, no rojo: el rojo queda para lo destructivo.
// `stays`: la lista la enseña igual pasado el margen (filtro Completadas), así que no lleva mecha.
export function taskRowEl(x,t,size,stays=false){
  const over=x.dueDate&&x.dueDate<t&&!x.done, eta=x.dueDate?etaDays(x.dueDate):null;
  const title=escapeHtml(x.title);
  const date=x.dueDate?('◷ '+fmtDate(x.dueDate)+(over?' · ATRASADA':x.dueDate===t?' · HOY':'')):'sin fecha';
  const meta=[
    `<span class="${over?'text-amber-300':x.dueDate===t?'text-slate-200':'text-slate-400'}">${date}</span>`,
    diffBadge(x),
    (eta!==null&&x.dueDate!==t)?`<span class="px-1.5 py-px rounded border ${over?'border-amber-700 text-amber-300':'border-slate-600 text-slate-300'}">${over?('hace '+(-eta)+(-eta===1?' día':' días')):('ETA '+eta+(eta===1?' día':' días'))}</span>`:'',
    projBadge(x.projectId), areaBadges(x.areas)
  ].filter(Boolean).join('');
  return rowEl({
    kind:'task', size, title, pri:x.priority, notes:!!x.notes, linked:thShow(x), done:x.done, over, on:x.done,
    until:(!stays&&x.done&&recentAt(x.grant?.at))?x.grant.at+RECENT_MS:0,
    markText:x.done?'✓':'',
    markLabel:(x.done?'Desmarcar ':'Completar ')+title,
    meta
  },{
    done:()=>{ if(!x.done) completeTask(x); else { x.done=false; revokeTask(x); save(); render(); } },
    edit:()=>openModal('task',x.id),
    pri:()=>{x.priority=!x.priority;save();render();},
    del:()=>deleteTask(x.id)
  });
}

export const LINK_SVG='<svg class="link-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>';
export const LINK_ICON=LINK_SVG+'<span class="sr-only"> · enlazado con TaskHero</span>';
export const NOTE_ICON='<svg class="note-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg><span class="sr-only"> · tiene notas</span>';
// Texto plano: solo se escapan y se hacen pulsables las direcciones web.
export function linkify(s){
  return escapeHtml(s).replace(/https?:\/\/[^\s<]+/g,u=>{
    const m=u.match(/[.,;:!?)\]]+$/), tail=m?m[0]:'', url=tail?u.slice(0,-tail.length):u;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-cyan-300 underline break-all">${url}</a>${tail}`;
  });
}

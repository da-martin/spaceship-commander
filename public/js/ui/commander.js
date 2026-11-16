/* Vista Commander: render() de toda la app, grupos de tareas y filtros. */
import { RANKS } from '../config.js';
import { on } from '../core/events.js';
import { todayProgress } from '../core/day.js';
import { isDoneToday, isScheduledToday } from '../core/habits.js';
import { projById } from '../core/projects.js';
import { rankIdx } from '../core/rewards.js';
import { renderFocus } from '../features/focus.js';
import { paintLog } from '../features/log.js';
import { state } from '../store.js';
import { addProject } from './actions.js';
import { fillProjectSelect, openModal, paintAreaFilters, paintProjHint } from './modal.js';
import { uiMode } from './mode.js';
import { renderProjects } from './projects.js';
import { doneFoldEl, doneStripEl, habitFolded, habitRowEl, HOY_LG_MAX, matchAreas, noteTouch, scheduleRecent, taskFolded, taskRowEl, welcomeEl } from './rows.js';
import { renderShip } from './ship-view.js';
import { toast } from './toast.js';
import { view } from './view.js';
import { applyWeeks, closeWkModal, measureBars, renderWeeks, setWeeks, weeksOpen, wideMQ } from './weeks.js';
import { etaDays, todayStr } from '../util.js';

/* ---------- tareas: los grupos de «cuándo» ----------
   Es el orden que uno ya tiene en la cabeza. Dentro de cada grupo sigue
   mandando la prioridad, pero deja de saltarse el calendario: una ★ sin fecha
   ya no se pone por delante de algo vencido hace nueve días. */
export const TGROUPS=[
  {k:'over', name:'Atrasadas',    cls:'text-amber-300',   bd:'border-amber-800'},
  {k:'today',name:'Hoy',          cls:'text-slate-200',   bd:'border-slate-500'},
  {k:'week', name:'Esta semana',  cls:'text-slate-300',   bd:'border-slate-700'},
  {k:'later',name:'Más adelante', cls:'text-slate-300',   bd:'border-slate-700'},
  {k:'none', name:'Sin fecha',    cls:'text-slate-300',   bd:'border-slate-700'},
  {k:'done', name:'Completadas',  cls:'text-emerald-300', bd:'border-emerald-800'}
];
export const TGROUP_MAX = 6;   // filas abiertas antes de empezar a plegar
export let tGroupOpen = {};    // solo lo que el usuario ha tocado a mano
export function taskGroup(x,t){
  if(taskFolded(x)) return 'done';   // recién marcada: sigue en su grupo hasta que pasa el margen
  if(!x.dueDate) return 'none';
  if(x.dueDate<t) return 'over';
  if(x.dueDate===t) return 'today';
  return etaDays(x.dueDate)<=7 ? 'week' : 'later';
}
export function renderTaskGroups(tl,tasks,t){
  const by={};
  for(const x of tasks){ const k=taskGroup(x,t); (by[k]=by[k]||[]).push(x); }
  let n=0;
  for(const g of TGROUPS){
    const items=by[g.k];
    if(!items) continue;
    // Se abren grupos hasta llenar unas seis filas. El primero se abre siempre:
    // una lista que empieza entera plegada no enseña nada.
    const auto = g.k!=='done' && (n===0 || n+items.length<=TGROUP_MAX);
    if(auto) n+=items.length;
    const on = (g.k in tGroupOpen) ? tGroupOpen[g.k] : auto;
    const head=document.createElement('button');
    head.type='button';
    head.className='grp-head w-full flex items-center gap-2 px-1 pt-2 pb-1 rounded-md hover:bg-slate-800/40';
    head.setAttribute('aria-expanded',on);
    if(g.k==='done') head.dataset.doneTarget='';   // adonde vuelan las recién completadas
    head.innerHTML=`<span class="grp-chev mono text-slate-400 text-sm leading-none" aria-hidden="true">▸</span>
      <span class="mono text-[11px] tracking-[.16em] uppercase ${g.cls}">${g.name}</span>
      <span class="mono text-[11px] px-1.5 py-px rounded border ${g.bd} ${g.cls}">${items.length}</span>`;
    head.onclick=()=>{ tGroupOpen[g.k]=!on; render(); };
    tl.appendChild(head);
    if(on) items.forEach(x=>tl.appendChild(taskRowEl(x,t)));
  }
}
// Las áreas son un filtro de segunda: viven detrás de su botón, que lleva la
// cuenta de las activas para que plegarlas no esconda que están puestas.
export let tAreaOpen=false;
export function paintTaskAreas(){
  const row=document.getElementById('taskAreaRow'), b=document.getElementById('btnTAreas'), n=aFilterTasks.size;
  row.classList.toggle('hidden',!tAreaOpen); row.classList.toggle('flex',tAreaOpen);
  b.setAttribute('aria-expanded',tAreaOpen);
  b.textContent = n ? `Áreas · ${n}` : 'Áreas';
  b.className = 'ml-auto px-2.5 py-1 rounded-md '+(n?'bg-cyan-800 text-white border border-cyan-700':'bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-cyan-600');
}
export let tFilter='all', hFilter='all';
// La tira de proyectos abierta o cerrada se recuerda en este dispositivo.
export const PROJ_OPEN_KEY='spaceship-commander:projOpen';
export let projOpen=(()=>{ try{ return localStorage.getItem(PROJ_OPEN_KEY)==='1'; }catch{ return false; } })();
export function setProjOpen(v){ projOpen=v; try{ localStorage.setItem(PROJ_OPEN_KEY,v?'1':'0'); }catch{} }
export let aFilterTasks=new Set(), aFilterHabits=new Set();
export function render(){
  const t=todayStr();
  const hoy=new Date();   // el año va aparte: en el móvil no cabe
  document.getElementById('stardate').textContent = hoy.toLocaleDateString('es-ES',{day:'2-digit',month:'short'});
  document.getElementById('stardateYear').textContent = ' '+hoy.getFullYear();
  document.getElementById('hdrRank').textContent = RANKS[rankIdx()][0].toUpperCase();
  paintLog();
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});

  // --- 1) Orden del día: hábitos que tocan y tareas con fecha de hoy ---
  // Los libres no tienen día: viven en Hábitos. Las atrasadas se enseñan
  // arriba, pero no cuentan en el progreso: al cerrarlas dejan de ser de hoy y
  // el total encogería a media mañana.
  const porPri = (a,b)=>(b.priority-a.priority)||a.title.localeCompare(b.title,'es');
  const todays = state.habits.filter(h=>h.type!=='free'&&h.type!=='neg'&&isScheduledToday(h)).sort(porPri);
  const dueTasks = state.tasks.filter(x=>x.dueDate===t).sort(porPri);
  // Las atrasadas que se cierran hoy se quedan: a la vista el margen y luego en Completados.
  const overTasks = state.tasks.filter(x=>x.dueDate&&x.dueDate<t&&(!x.done||x.doneOn===t)).sort((a,b)=>(b.priority-a.priority)||(a.dueDate<b.dueDate?-1:1));
  const {done,total} = todayProgress();   // el mismo número que ve tu alianza
  document.getElementById('todayDone').textContent = done;
  document.getElementById('todayTotal').textContent = '/ '+total;
  document.getElementById('todayProgressBar').style.width = total? (done/total*100)+'%' : '0%';
  paintAreaFilters();
  // En frío, Commander es solo la bienvenida: ni filtros, ni cajas vacías, ni
  // pestañas que repartan la nada entre dos mitades.
  const fresh = !state.habits.length && !state.tasks.length;
  if(fresh) view.cmdTab='today';   // la bienvenida vive en Hoy; sin pestañas no hay forma de volver
  document.getElementById('todayHead').classList.toggle('hidden',fresh);
  document.getElementById('cmdTabs').classList.toggle('hidden',fresh);
  document.querySelector('[data-cmd="tasks"]').classList.toggle('hidden',fresh);
  document.getElementById('habitsBox').classList.toggle('hidden',fresh);
  // Los filtros de tareas aparecen cuando hay algo que filtrar.
  const hayTareas = state.tasks.length>0;
  document.getElementById('taskFilterRow').classList.toggle('hidden',!hayTareas);
  document.getElementById('projBox').classList.toggle('hidden',!hayTareas&&!state.projects.length);
  const box=document.getElementById('todayList'); box.innerHTML='';
  if(fresh){ box.appendChild(welcomeEl()); }
  else if(!total && !overTasks.length) box.innerHTML='<div class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-4 text-center">Nada en el orden del día. Los hábitos libres y negativos están en Hábitos.</div>';
  // La talla mira el total del día, no los pendientes: si mirara los
  // pendientes, la lista encogería sola al marcar el sexto y daría un salto a
  // media mañana. El resto de la jerarquía —ser lo primero, el ancho completo,
  // el marco de esquinas y el número grande— no depende del número de filas.
  const hSize = total+overTasks.length>HOY_LG_MAX ? null : 'lg';
  overTasks.filter(x=>!taskFolded(x)).forEach(x=>box.appendChild(taskRowEl(x,t,hSize)));
  todays.filter(h=>!habitFolded(h,t)).forEach(h=>box.appendChild(habitRowEl(h,hSize,t)));
  dueTasks.filter(x=>!taskFolded(x)).forEach(x=>box.appendChild(taskRowEl(x,t,hSize)));
  const hechos = [...overTasks.filter(taskFolded), ...todays.filter(h=>habitFolded(h,t)), ...dueTasks.filter(taskFolded)];
  if(total && done===total && !overTasks.some(x=>!x.done)) box.insertAdjacentHTML('beforeend','<p class="mono text-[11px] text-emerald-300 text-center py-2">✓ Jornada completa</p>');
  if(hechos.length) box.appendChild(doneStripEl(hechos,hSize,t));

  // --- 2) Tareas ---
  if(view.pFilter&&view.pFilter!=='none'&&!projById(view.pFilter)) view.pFilter=null;
  renderProjects();
  let tasks=[...state.tasks];
  if(tFilter==='today') tasks=tasks.filter(x=>x.dueDate===t);
  if(tFilter==='priority') tasks=tasks.filter(x=>x.priority);
  if(tFilter==='done') tasks=tasks.filter(x=>x.done);
  if(aFilterTasks.size>0) tasks=tasks.filter(x=>matchAreas(x,aFilterTasks));
  if(view.pFilter==='none') tasks=tasks.filter(x=>!x.projectId);
  else if(view.pFilter) tasks=tasks.filter(x=>x.projectId===view.pFilter);
  tasks.sort((a,b)=>(taskFolded(a)-taskFolded(b))||(b.priority-a.priority)||((a.dueDate||'9999')<(b.dueDate||'9999')?-1:1));
  const open=state.tasks.filter(x=>!x.done).length;
  document.getElementById('taskCount').textContent=open+' abiertas';
  const cv=document.getElementById('commander-view');
  for(const k of ['today','habits','tasks']) cv.classList.toggle('tab-'+k,view.cmdTab===k);
  document.querySelectorAll('#cmdTabs [data-ctab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.ctab===view.cmdTab)));
  document.getElementById('ctabToday').textContent = total?`${done}/${total}`:'';
  document.getElementById('ctabHabits').textContent = state.habits.length||'';
  document.getElementById('ctabTasks').textContent = open||'';
  paintTaskAreas();
  const tl=document.getElementById('taskList'); tl.innerHTML='';
  // Agrupar solo cuando la lista es larga y no viene ya recortada: «Hoy» y
  // «★ Prioridad» son un grupo de por sí, y partirlos otra vez no dice nada.
  if(!tasks.length) tl.innerHTML='<div class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 text-center">Sin tareas aquí.</div>';
  else if(tFilter==='all' && !view.pFilter && tasks.length>TGROUP_MAX) renderTaskGroups(tl,tasks,t);
  else if(tFilter==='done') tasks.forEach(x=>tl.appendChild(taskRowEl(x,t,undefined,true)));
  else {
    tasks.filter(x=>!taskFolded(x)).forEach(x=>tl.appendChild(taskRowEl(x,t)));
    const hechas=tasks.filter(taskFolded);
    if(hechas.length) tl.appendChild(doneFoldEl(hechas,view.tasksDoneOpen,()=>{ view.tasksDoneOpen=!view.tasksDoneOpen; },
      `${hechas.length} ${hechas.length===1?'completada':'completadas'}`,x=>taskRowEl(x,t)));
  }

  // --- 3) Hábitos: todos, libres incluidos, y se marcan desde aquí ---
  document.getElementById('habitCount').textContent=state.habits.length;
  let hs=[...state.habits];
  if(hFilter!=='all') hs=hs.filter(h=>h.type===hFilter);
  if(aFilterHabits.size>0) hs=hs.filter(h=>matchAreas(h,aFilterHabits));
  // Primero lo que toca hoy (diarios, semanales, mensuales), luego libres y negativos, al final lo que no toca hoy.
  const rango=h=>!isScheduledToday(h)?9:({daily:0,weekly:1,monthly:2,free:3,neg:4}[h.type]??2);
  hs.sort((a,b)=>(rango(a)-rango(b))||(b.priority-a.priority)||a.title.localeCompare(b.title,'es'));
  const al=document.getElementById('allHabitsList'); al.innerHTML='';
  if(!hs.length) al.innerHTML='<div class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 text-center">Sin hábitos. Crea el primero.</div>';
  hs.filter(h=>!habitFolded(h,t)).forEach(h=>al.appendChild(habitRowEl(h,null,t)));
  const cumplidos=hs.filter(h=>habitFolded(h,t));
  if(cumplidos.length) al.appendChild(doneFoldEl(cumplidos,view.habitsDoneOpen,()=>{ view.habitsDoneOpen=!view.habitsDoneOpen; },
    `${cumplidos.length} ${cumplidos.length===1?'completado':'completados'} hoy`,h=>habitRowEl(h,null,t)));

  scheduleRecent(t);
  renderShip();
  if(uiMode==='focus') renderFocus();
  renderWeeks();
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  // acordeón de la vista nave: todas empiezan colapsadas y solo una abierta a la vez
  document.querySelectorAll('.acc-head').forEach(h=>h.onclick=()=>{
    const sec=h.closest('.acc'), willOpen=!sec.classList.contains('open');
    document.querySelectorAll('.acc').forEach(s=>{
      const on=s===sec&&willOpen;
      s.classList.toggle('open',on);
      s.querySelector('.acc-body').classList.toggle('hidden',!on);
      s.querySelector('.acc-head').setAttribute('aria-expanded',on);
    });
  });
  // Tocar, desplazar o recorrer con el teclado una lista retiene la salida de lo completado.
  for(const id of ['todayList','allHabitsList','taskList']){
    const l=document.getElementById(id);
    for(const ev of ['pointerdown','touchmove','wheel','keydown']) l.addEventListener(ev,noteTouch,{passive:true});
    l.addEventListener('pointermove',e=>{ if(e.pointerType==='mouse') noteTouch(); },{passive:true});
  }
  document.getElementById('btnNewTask').onclick=()=>openModal('task');
  document.getElementById('projToggle').onclick=()=>{ setProjOpen(!projOpen); renderProjects(); };
  document.getElementById('btnWeeks').onclick=()=>setWeeks(!(wideMQ.matches?weeksOpen:view.weeksScreen));
  document.getElementById('weeksClose').onclick=()=>setWeeks(false);
  document.getElementById('wkmClose').onclick=closeWkModal;
  document.getElementById('wkModal').addEventListener('click',e=>{ if(e.target.id==='wkModal') closeWkModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeWkModal(); });
  wideMQ.addEventListener('change',applyWeeks);
  // El panel cuelga bajo la cabecera y la pantalla del teléfono deja ver la
  // barra inferior: los dos altos cambian con el modo y el ancho.
  { const ro=new ResizeObserver(measureBars); ro.observe(document.querySelector('header')); ro.observe(document.getElementById('bottomNav')); }
  document.getElementById('btnNewProj').onclick=()=>{ setProjOpen(true); view.projEdit='new'; view.projDel=null; renderProjects(); };
  document.getElementById('fProject').onchange=paintProjHint;
  document.getElementById('btnModalNewProj').onclick=()=>{
    const box=document.getElementById('fProjNew'), hidden=box.classList.toggle('hidden');
    if(!hidden) setTimeout(()=>document.getElementById('fProjName').focus(),30);
  };
  document.getElementById('fProjAdd').onclick=()=>{
    const n=document.getElementById('fProjName'), d=document.getElementById('fProjDue'), name=n.value.trim();
    if(!name){ toast('Escribe un nombre'); return; }
    const p=addProject(name,d.value||null);
    n.value=''; d.value=''; document.getElementById('fProjNew').classList.add('hidden');
    fillProjectSelect(p.id); toast('Proyecto creado ✓');
  };
  document.getElementById('fProjName').onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); document.getElementById('fProjAdd').click(); } };
  document.getElementById('btnNewHabit').onclick=()=>openModal('habit');
  document.querySelectorAll('.tfilter').forEach(b=>b.onclick=()=>{tFilter=b.dataset.tfilter;document.querySelectorAll('.tfilter').forEach(x=>x.className='tfilter px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300');b.className='tfilter px-2.5 py-1 rounded-md bg-cyan-800 text-white';render();});
  document.querySelectorAll('.hfilter').forEach(b=>b.onclick=()=>{hFilter=b.dataset.hfilter;document.querySelectorAll('.hfilter').forEach(x=>x.className='hfilter px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300');b.className='hfilter px-2.5 py-1 rounded-md bg-cyan-800 text-white';render();});
  document.querySelectorAll('.tafilter').forEach(b=>b.onclick=()=>{const a=b.dataset.tarea; if(a==='__all') aFilterTasks.clear(); else aFilterTasks.has(a)?aFilterTasks.delete(a):aFilterTasks.add(a); render();});
  document.querySelectorAll('.hafilter').forEach(b=>b.onclick=()=>{const a=b.dataset.harea; if(a==='__all') aFilterHabits.clear(); else aFilterHabits.has(a)?aFilterHabits.delete(a):aFilterHabits.add(a); render();});
  document.getElementById('btnTAreas').onclick=()=>{ tAreaOpen=!tAreaOpen; render(); };
}

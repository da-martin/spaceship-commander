/* Modal de alta y edición de tareas y hábitos. */
import { EFFORT, NOTES_MAX } from '../config.js';
import { on } from '../core/events.js';
import { projById, projDue } from '../core/projects.js';
import { closeSaveModal } from '../features/saves.js';
import { thc, thIsLinked } from '../integrations/taskhero.js';
import { areaName, save, state } from '../store.js';
import { aFilterHabits, aFilterTasks, render } from './commander.js';
import { LINK_SVG } from './rows.js';
import { toast } from './toast.js';
import { escapeHtml, uid } from '../util.js';

export let modalMode=null, editingId=null, pickedDays=new Set(), pickedMdays=new Set(), pickedAreas=new Set(), pickedDiff='normal';

/* ---------- modal ---------- */
export function openModal(mode,id=null){
  modalMode=mode; editingId=id; pickedDays=new Set(); pickedMdays=new Set(); pickedAreas=new Set(); pickedDiff='normal';
  const isEdit=!!id;
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modalKicker').textContent=(isEdit?'EDITAR // ':'NUEVO // ')+(mode==='task'?'TASK':'HABIT');
  document.getElementById('modalTitle').textContent=mode==='task'?(isEdit?'Editar tarea':'Nueva tarea'):(isEdit?'Editar hábito':'Nuevo hábito');
  document.getElementById('rowTaskDate').classList.toggle('hidden',mode!=='task');
  document.getElementById('rowTaskProject').classList.toggle('hidden',mode!=='task');
  document.getElementById('rowHabitType').classList.toggle('hidden',mode!=='habit');
  const t=document.getElementById('fTitle'), d=document.getElementById('fDate'), p=document.getElementById('fPriority'), ty=document.getElementById('fType');
  const nt=document.getElementById('fNotes'); nt.value='';
  t.value='';d.value='';p.checked=false;ty.value='daily';syncDayPicker();syncAreaPicker();syncDiffPicker();
  document.getElementById('fProjNew').classList.add('hidden');
  document.getElementById('fProjName').value=''; document.getElementById('fProjDue').value='';
  fillProjectSelect('');
  if(isEdit){
    const it=(mode==='task'?state.tasks:state.habits).find(y=>y.id===id); pickedDiff=EFFORT[it?.diff]?it.diff:'normal'; syncDiffPicker();
    nt.value=it?.notes||'';
    if(mode==='task'){const x=state.tasks.find(y=>y.id===id); t.value=x.title; d.value=x.dueDate||''; p.checked=!!x.priority; pickedAreas=new Set(x.areas||[]); syncAreaPicker(); fillProjectSelect(x.projectId||'');}
    else{const h=state.habits.find(y=>y.id===id); t.value=h.title; p.checked=!!h.priority; ty.value=h.type; pickedDays=new Set(h.days||[]); pickedMdays=new Set(h.mdays||[]); syncDayPicker(); pickedAreas=new Set(h.areas||[]); syncAreaPicker();}
  }
  thModalLink=null; paintThModal();
  growNotes();
  setTimeout(()=>t.focus(),30);
}
// Enlace con TaskHero en el modal: el cambio se aplica al guardar, como lo demás.
// thModalLink: null = sin tocar; true/false = enlazado o no al guardar.
export let thModalLink=null;
export function paintThModal(){
  const row=document.getElementById('fThRow'), it=editingId?(modalMode==='task'?state.tasks:state.habits).find(y=>y.id===editingId):null;
  const show=!!(thc.connected&&it&&thIsLinked(it)&&it.type!=='neg');
  row.classList.toggle('hidden',!show); if(!show) return;
  const on=thModalLink??!it.thOff, changed=thModalLink!==null&&thModalLink!==!it.thOff;
  row.className='flex items-center gap-2 rounded-lg border px-3 py-2 '+(on?'border-cyan-900 bg-cyan-950/20':'border-slate-700 bg-slate-900/60');
  document.getElementById('fThText').innerHTML=on
    ? `<span class="text-cyan-200">${LINK_SVG} Enlazado con TaskHero</span>${changed?'<span class="block mono text-[11px] text-slate-400">al guardar</span>':''}`
    : `<span class="text-slate-300">Sin enlace: envía su esfuerzo como tracker points</span>${changed?'<span class="block mono text-[11px] text-slate-400">al guardar</span>':''}`;
  const b=document.getElementById('fThToggle');
  b.textContent=on?'Quitar enlace':'Volver a enlazar';
  b.className='shrink-0 px-2 h-9 rounded-lg text-xs underline underline-offset-2 '+(on?'text-slate-300 hover:text-red-300':'text-cyan-300 hover:text-cyan-200');
}
// El cuadro de notas crece con el texto (hasta su max-h) en vez de traer barra propia.
export function growNotes(){ const n=document.getElementById('fNotes'); n.style.height='auto'; n.style.height=n.scrollHeight+2+'px'; }
export function fillProjectSelect(sel){
  const s=document.getElementById('fProject');
  s.innerHTML='<option value="">— Sin proyecto —</option>'+state.projects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  s.value=sel||''; paintProjHint();
}
export function paintProjHint(){
  const h=document.getElementById('fProjHint'), p=projById(document.getElementById('fProject').value);
  if(!p){ h.textContent=''; h.className='mono text-[11px] mt-1.5 text-slate-400'; return; }
  const m=projDue(p);
  h.textContent=(p.due?'FECHA LÍMITE DEL PROYECTO · '+m.text.replace('◷ ',''):'EL PROYECTO NO TIENE FECHA LÍMITE').toUpperCase();
  h.className='mono text-[11px] mt-1.5 '+m.cls;
}
export function syncDayPicker(){
  const type=document.getElementById('fType').value;
  document.getElementById('dayPicker').classList.toggle('hidden',type!=='weekly');
  document.getElementById('mdayBox').classList.toggle('hidden',type!=='monthly');
  document.querySelectorAll('.day-pill').forEach(b=>b.classList.toggle('on',pickedDays.has(Number(b.dataset.day))));
  document.querySelectorAll('.mday-pill').forEach(b=>{ const on=pickedMdays.has(Number(b.dataset.mday)); b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); });
}
export function syncDiffPicker(){
  document.querySelectorAll('#diffPicker .diff-pill').forEach(b=>{ const on=b.dataset.diff===pickedDiff; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); });
}
export function syncAreaPicker(){
  document.querySelectorAll('#areaPicker .area-pill').forEach(b=>b.classList.toggle('on',pickedAreas.has(b.dataset.area)));
}
export function paintAreaFilters(){
  // Los nombres de las áreas se pueden cambiar en Ajustes: las etiquetas se repintan aquí.
  document.querySelectorAll('[data-tarea],[data-harea],#areaPicker [data-area]').forEach(b=>{const a=b.dataset.tarea||b.dataset.harea||b.dataset.area; if(a!=='__all') b.textContent=areaName(a);});
  document.querySelectorAll('.tafilter[data-tarea]').forEach(b=>{const a=b.dataset.tarea; if(a!=='__all') b.classList.toggle('on',aFilterTasks.has(a));});
  document.querySelectorAll('.hafilter[data-harea]').forEach(b=>{const a=b.dataset.harea; if(a!=='__all') b.classList.toggle('on',aFilterHabits.has(a));});
}
export function closeModal(){document.getElementById('modal').classList.add('hidden');modalMode=null;editingId=null;}

// Cierra cualquier menú y deja aria-expanded del de cabecera en su sitio:
// si no, un lector de pantalla seguiría anunciándolo abierto.
export function closeAllMenus(){
  document.querySelectorAll('.gear-menu').forEach(m=>m.classList.add('hidden'));
  document.getElementById('btnMenu')?.setAttribute('aria-expanded','false');
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('fThToggle').onclick=()=>{
    const it=(modalMode==='task'?state.tasks:state.habits).find(y=>y.id===editingId); if(!it) return;
    thModalLink=!(thModalLink??!it.thOff); paintThModal();
  };
  document.getElementById('fNotes').addEventListener('input',growNotes);
  document.getElementById('modalSave').onclick=()=>{
    const title=document.getElementById('fTitle').value.trim();
    if(!title){toast('Escribe un título');return;}
    const notes=document.getElementById('fNotes').value.trim().slice(0,NOTES_MAX);
    const setNotes=(x)=>{ if(notes) x.notes=notes; else delete x.notes; return x; };
    // quitar el enlace deja el origen (src) para no duplicar al importar; thOff para el envío y el enlace por nombre
    const setThLink=(x)=>{ if(thModalLink===false) x.thOff=true; else if(thModalLink===true) delete x.thOff; return x; };
    if(modalMode==='task'){
      const due=document.getElementById('fDate').value||null, pri=document.getElementById('fPriority').checked, areas=[...pickedAreas];
      const pid=document.getElementById('fProject').value||null;
      if(editingId){const x=state.tasks.find(y=>y.id===editingId); setThLink(setNotes(Object.assign(x,{title,dueDate:due,priority:pri,diff:pickedDiff,areas,projectId:pid})));}
      else state.tasks.push(setNotes({id:uid(),title,dueDate:due,priority:pri,diff:pickedDiff,done:false,areas,projectId:pid,createdAt:Date.now()}));
    } else {
      const type=document.getElementById('fType').value, pri=document.getElementById('fPriority').checked, areas=[...pickedAreas];
      if(type==='weekly'&&pickedDays.size===0){toast('Elige al menos un día');return;}
      if(type==='monthly'&&pickedMdays.size===0){toast('Elige al menos un día del mes');return;}
      const sched={days:type==='weekly'?[...pickedDays].sort():null, ...(type==='monthly'?{mdays:[...pickedMdays].sort((a,b)=>a-b)}:{})};
      if(editingId){
        const h=state.habits.find(y=>y.id===editingId);
        // El historial de uno se leería al revés en el otro: cumplimientos como caídas.
        if((h.type==='neg')!==(type==='neg')&&Object.values(h.log||{}).some(n=>n>0)){toast('Con historial, un hábito no puede pasar de positivo a negativo ni al revés');return;}
        setThLink(setNotes(Object.assign(h,{title,priority:pri,diff:pickedDiff,type,...sched,areas})));
        if(type!=='monthly') delete h.mdays;
      }
      else state.habits.push(setNotes({id:uid(),title,type,...sched,priority:pri,diff:pickedDiff,areas,log:{},createdAt:Date.now()}));
    }
    save();closeModal();render();toast('Guardado ✓');
  };
  document.getElementById('modalCancel').onclick=closeModal;
  document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeAllMenus();closeSaveModal();if(!document.getElementById('modal').classList.contains('hidden'))closeModal();}});
  document.addEventListener('click',closeAllMenus);
  document.getElementById('fType').onchange=syncDayPicker;
  document.querySelectorAll('.day-pill').forEach(b=>b.onclick=()=>{const d=Number(b.dataset.day);pickedDays.has(d)?pickedDays.delete(d):pickedDays.add(d);syncDayPicker();});
  const mp=document.getElementById('mdayPicker');
  mp.innerHTML=Array.from({length:31},(_,i)=>`<button type="button" data-mday="${i+1}" aria-pressed="false" class="mday-pill mono text-[11px] px-1 py-1.5 rounded-md bg-slate-800 border border-slate-700">${i+1}</button>`).join('');
  mp.querySelectorAll('.mday-pill').forEach(b=>b.onclick=()=>{const d=Number(b.dataset.mday);pickedMdays.has(d)?pickedMdays.delete(d):pickedMdays.add(d);syncDayPicker();});
  document.querySelectorAll('#diffPicker .diff-pill').forEach(b=>b.onclick=()=>{pickedDiff=b.dataset.diff;syncDiffPicker();});
  document.querySelectorAll('#areaPicker .area-pill').forEach(b=>b.onclick=()=>{const a=b.dataset.area;pickedAreas.has(a)?pickedAreas.delete(a):pickedAreas.add(a);syncAreaPicker();});
}

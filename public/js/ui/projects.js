/* La tira plegable de proyectos dentro de Tareas. */
import { on } from '../core/events.js';
import { projById, projDue, projTaskCount } from '../core/projects.js';
import { save, state } from '../store.js';
import { addProject, deleteProject } from './actions.js';
import { projOpen, render } from './commander.js';
import { GEAR_SVG } from './rows.js';
import { toast } from './toast.js';
import { view } from './view.js';
import { escapeHtml } from '../util.js';

/* ---------- proyectos: la tira plegable dentro de Tareas ---------- */
export function projFormEl(p){
  const el=document.createElement('div');
  el.className='rounded-lg border border-cyan-800 bg-cyan-500/5 p-2.5 space-y-2';
  el.innerHTML=`
    <div class="flex gap-2">
      <span class="flex-1 min-w-0">
        <label for="projName" class="mono text-[11px] text-slate-400">NOMBRE</label>
        <input id="projName" type="text" maxlength="80" value="${p?escapeHtml(p.name):''}" placeholder="Ej. Informe Q4" class="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-600">
      </span>
      <span class="w-36 shrink-0">
        <label for="projDue" class="mono text-[11px] text-slate-400">LÍMITE (OPC.)</label>
        <input id="projDue" type="date" value="${p&&p.due?p.due:''}" class="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[13px] outline-none focus:border-cyan-600">
      </span>
    </div>
    <div class="flex justify-end gap-2">
      <button data-p="cancel" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">Cancelar</button>
      <button data-p="ok" class="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium">${p?'Guardar':'Crear'}</button>
    </div>`;
  const commit=()=>{
    const name=el.querySelector('#projName').value.trim(), due=el.querySelector('#projDue').value||null;
    if(!name){ toast('Escribe un nombre'); return; }
    if(p){ p.name=name.slice(0,80); p.due=due; } else addProject(name,due);
    view.projEdit=null; save(); render(); toast(p?'Proyecto guardado ✓':'Proyecto creado ✓');
  };
  el.querySelector('[data-p="ok"]').onclick=commit;
  el.querySelector('[data-p="cancel"]').onclick=()=>{ view.projEdit=null; renderProjects(); };
  el.querySelector('#projName').onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); } };
  return el;
}
export function projDelEl(p){
  const n=state.tasks.filter(x=>x.projectId===p.id).length;
  const el=document.createElement('div');
  el.className='rounded-lg border border-red-800 bg-red-950/40 p-2.5';
  el.innerHTML=`<p class="text-[13px] font-semibold text-red-100">Eliminar «${escapeHtml(p.name)}»</p>
    <p class="text-xs text-red-200 mt-1 leading-snug">${n?`Sus ${n} ${n===1?'tarea se queda tal cual, solo que pasa':'tareas se quedan tal cual, solo que pasan'} a estar sin proyecto.`:'No tiene tareas vinculadas.'} No se borra nada más.</p>
    <div class="flex justify-end gap-2 mt-2.5">
      <button data-p="cancel" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">Cancelar</button>
      <button data-p="ok" class="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-semibold">Eliminar</button>
    </div>`;
  el.querySelector('[data-p="cancel"]').onclick=()=>{ view.projDel=null; renderProjects(); };
  el.querySelector('[data-p="ok"]').onclick=()=>deleteProject(p.id);
  return el;
}
export function renderProjects(){
  const box=document.getElementById('projBox'), body=document.getElementById('projBody'), ps=state.projects;
  box.classList.toggle('open',projOpen);
  document.getElementById('projToggle').setAttribute('aria-expanded',projOpen);
  body.classList.toggle('hidden',!projOpen);
  document.getElementById('projCount').textContent=ps.length;

  // Plegada, la tira sigue diciendo algo: el filtro activo, o el proyecto que peor va.
  const sum=document.getElementById('projSummary');
  let txt='', cls='text-slate-400';
  if(!projOpen){
    if(view.pFilter==='none'){ txt='· filtrando: sin proyecto'; cls='text-cyan-300'; }
    else if(view.pFilter){ txt='· filtrando: '+projById(view.pFilter).name; cls='text-cyan-300'; }
    else if(!ps.length){ txt='· ninguno todavía'; }
    else {
      const next=ps.filter(p=>p.due).sort((a,b)=>a.due<b.due?-1:1)[0];
      if(next){ const m=projDue(next); txt='· '+next.name+' '+m.short; cls=m.cls; }
      else txt='· sin fechas límite';
    }
  }
  sum.textContent=txt; sum.className='mono text-[11px] truncate '+cls;

  body.innerHTML='';
  if(!ps.length&&view.projEdit!=='new') body.innerHTML='<div class="text-xs text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 text-center">Sin proyectos todavía. Crea uno con «+ Nuevo» y podrás vincularle tareas.</div>';
  ps.forEach(p=>{
    if(view.projEdit===p.id){ body.appendChild(projFormEl(p)); return; }
    if(view.projDel===p.id){ body.appendChild(projDelEl(p)); return; }
    const on=view.pFilter===p.id, c=projTaskCount(p.id), m=projDue(p), pct=c.total?Math.round(c.done/c.total*100):0;
    const el=document.createElement('div');
    el.className='relative flex items-center gap-1 rounded-lg border pr-1 '+(on?'border-cyan-700 bg-cyan-500/5':'border-[#1f2a3d] bg-[#0d1526]');
    el.innerHTML=`
      <button data-act="pick" aria-pressed="${on}" class="flex-1 min-w-0 flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg">
        <span class="mono text-[13px] leading-none shrink-0 ${on?'text-cyan-300':'text-slate-400'}" aria-hidden="true">▣</span>
        <span class="min-w-0 flex-1">
          <span class="block text-[13px] font-semibold truncate">${escapeHtml(p.name)}</span>
          <span class="block mono text-[11px] mt-0.5 ${m.cls}">${m.text}</span>
        </span>
        <span class="shrink-0 flex items-center gap-1.5">
          <span class="w-11 h-[3px] rounded-full bg-slate-800 overflow-hidden block"><span class="block h-[3px] rounded-full bg-emerald-500" style="width:${pct}%"></span></span>
          <span class="mono text-[11px] text-slate-400 w-7 text-right">${c.done}/${c.total}</span>
        </span>
      </button>
      <button data-act="gear" class="shrink-0 text-slate-400 hover:text-cyan-300 p-1.5 leading-none" title="Opciones del proyecto" aria-label="Opciones del proyecto">${GEAR_SVG}</button>
      <div data-act="menu" class="gear-menu hidden right-2 top-10">
        <button data-m="edit">✎ Renombrar o cambiar fecha</button>
        ${p.due?'<button data-m="nodue">◷ Quitar fecha límite</button>':''}
        <button data-m="del" class="danger">✕ Eliminar proyecto</button>
      </div>`;
    el.querySelector('[data-act="pick"]').onclick=()=>{ view.pFilter=on?null:p.id; render(); };
    const gear=el.querySelector('[data-act="gear"]'), menu=el.querySelector('[data-act="menu"]');
    gear.onclick=(e)=>{ e.stopPropagation(); document.querySelectorAll('.gear-menu').forEach(o=>{ if(o!==menu) o.classList.add('hidden'); }); menu.classList.toggle('hidden'); };
    menu.onclick=(e)=>e.stopPropagation();
    menu.querySelector('[data-m="edit"]').onclick=()=>{ menu.classList.add('hidden'); view.projEdit=p.id; view.projDel=null; renderProjects(); };
    const nd=menu.querySelector('[data-m="nodue"]');
    if(nd) nd.onclick=()=>{ menu.classList.add('hidden'); p.due=null; save(); render(); toast('Fecha límite quitada'); };
    menu.querySelector('[data-m="del"]').onclick=()=>{ menu.classList.add('hidden'); view.projDel=p.id; view.projEdit=null; renderProjects(); };
    body.appendChild(el);
  });
  if(view.projEdit==='new') body.appendChild(projFormEl(null));
  // «Sin proyecto»: para encontrar lo que anda suelto
  if(ps.length){
    const n=state.tasks.filter(x=>!x.projectId&&!x.done).length, on=view.pFilter==='none';
    const b=document.createElement('button');
    b.className='w-full flex items-center gap-2.5 rounded-lg border border-dashed px-2.5 py-2 text-left '+(on?'border-cyan-700 bg-cyan-500/5 text-slate-200':'border-slate-700 text-slate-400');
    b.setAttribute('aria-pressed',on);
    b.innerHTML=`<span class="flex-1 text-xs">Sin proyecto</span><span class="mono text-[11px]">${n}</span>`;
    b.onclick=()=>{ view.pFilter=on?null:'none'; render(); };
    body.appendChild(b);
  }
  if(view.projEdit){ const i=document.getElementById('projName'); if(i) setTimeout(()=>i.focus(),30); }
}

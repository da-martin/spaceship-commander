/* Proyectos: fecha límite, recuento de tareas, alta y baja. */
import { state } from '../store.js';
import { escapeHtml, etaDays, fmtDate } from '../util.js';

/* ---------- proyectos ---------- */
export const projById = (id) => state.projects.find(p=>p.id===id)||null;
// La fecha límite se lee con el mismo código de color que las tareas: el rojo
// significa «atrasado» en toda la app, nunca «proyecto».
export function projDue(p){
  if(!p.due) return {text:'sin fecha límite',cls:'text-slate-400',short:'sin fecha'};
  const e=etaDays(p.due), d=fmtDate(p.due);
  if(e<0) return {text:`◷ ${d} · ATRASADA`,cls:'text-red-400',short:'ATRASADA'};
  if(e===0) return {text:`◷ ${d} · HOY`,cls:'text-slate-200',short:'vence HOY'};
  const r=`en ${e} ${e===1?'día':'días'}`;
  return {text:`◷ ${d} · ${r}`,cls:'text-slate-400',short:r};
}
// El proyecto no se distingue por color —los cuatro tonos ya son de las áreas—
// sino por forma: pastilla rellena con ▣.
export function projBadge(id){
  const p=projById(id);
  return p?`<span class="mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300">▣ ${escapeHtml(p.name)}</span>`:'';
}
export function projTaskCount(id){ let d=0,t=0; for(const x of state.tasks) if(x.projectId===id){ t++; if(x.done) d++; } return {done:d,total:t}; }

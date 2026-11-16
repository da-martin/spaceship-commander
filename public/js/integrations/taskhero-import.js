/* Importar hábitos y tareas desde TaskHero: lectura, vista previa y aplicar.
 * La conversión de cada elemento vive en lib/taskhero-map.js. */
import { EFFORT_NAME } from '../config.js';
import { habitKind } from '../core/habits.js';
import { BACKUPKEY, userErr } from '../features/saves.js';
import { kindLock, thChanges, thHabit, thTask, thTitle } from '../lib/taskhero-map.js';
import { thc, thConnect } from './taskhero.js';
import { closeThModal } from './taskhero-modal.js';
import { save, state } from '../store.js';
import { api } from '../sync/cloud.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';
import { escapeHtml, fmtDate, plural, todayStr, uid } from '../util.js';

/* ---------- importar de TaskHero ---------- */
// Se trae lo que tiene equivalente directo: nombre, frecuencia y dificultad de los
// hábitos; nombre, fecha y dificultad de las tareas. Lo demás va a las notas, en
// texto plano. El Worker hace de paso (/api/taskhero/*) porque TaskHero no admite
// llamadas desde nuestro dominio. `src` evita duplicados al repetir, y con él se
// ve qué ha cambiado en lo ya importado.
export const TH_PAGES = 40;
export const TH_ERR = {
  invalid_api_key:'TaskHero no acepta esa clave.', missing_authorization:'TaskHero no acepta esa clave.',
  insufficient_scope:'Esa clave no tiene permiso para leer tus tareas.',
  rate_limited:'TaskHero pide esperar un poco. Prueba dentro de un rato.',
};

// Errores de TaskHero llegan como {error:{code}}; los del Worker, como {error:'texto'}.
export async function thGet(key,path){
  let r;
  // sin clave, el Worker usa la de la cuenta conectada
  try{ r=await api('/api/taskhero/'+path,key?{headers:{authorization:'Bearer '+key}}:{}); }
  catch{ throw userErr('Sin conexión. Prueba otra vez.'); }
  const b=await r.json().catch(()=>null);
  if(r.ok&&b) return b;
  const e=b?.error;
  if(e&&typeof e==='object') throw userErr(TH_ERR[e.code]||`TaskHero respondió con un error (${e.code||r.status}).`);
  if(r.status===401) throw userErr('Tu sesión ha caducado. Vuelve a entrar en tu cuenta.');
  if(r.status===429) throw userErr('Demasiadas lecturas seguidas. Prueba dentro de un rato.');
  if(e==='bad_key') throw userErr(key?'Esa clave no parece completa. Cópiala entera desde TaskHero.':'Pega tu clave de API de TaskHero.');
  if(e==='not_ready') throw userErr('Falta preparar la base de datos para TaskHero (migración 0005).');
  if(r.status===502) throw userErr('TaskHero no responde. Prueba más tarde.');
  throw userErr('No se pudo leer TaskHero.');
}
export async function thAll(key,query){
  const out=[]; let cursor=null;
  for(let i=0;i<TH_PAGES;i++){
    const b=await thGet(key,'tasks?'+new URLSearchParams(cursor?{...query,cursor}:query));
    if(Array.isArray(b.tasks)) out.push(...b.tasks);
    cursor=b.nextCursor; if(!cursor) return out;
  }
  throw userErr('Hay demasiados elementos para importar de una vez.');
}

// {habits, tasks, upd, same}: lo nuevo, lo ya importado con cambios y cuántos
// ya importados no cambian. thSel: `src` nuevos marcados; thUpd: `src` de lo ya
// importado que se actualiza; thKind: Libre o Negativo de los hábitos sin equivalente.
export let thPending=null, thSel=new Set(), thUpd=new Set(), thKind=new Map(), thBusy=false;
export const thHave = () => new Set([...state.tasks,...state.habits].map(x=>x.src).filter(Boolean));
const bySrc = (src) => state.habits.find(x=>x.src===src)||state.tasks.find(x=>x.src===src);
export async function thRead(key){
  const [lb,hs,ts]=await Promise.all([thGet(key,'lists'),thAll(key,{type:'habit',status:'all'}),thAll(key,{type:'todo',status:'open'})]);
  const lists=new Map((Array.isArray(lb?.lists)?lb.lists:[]).filter(l=>typeof l?.id==='string').map(l=>[l.id,String(l.title||'')]));
  const seen=new Set(), upd=[]; let same=0;
  const take=(arr,kind,fn)=>arr.filter(t=>t?.type===kind&&typeof t.id==='string'&&thTitle(t)).flatMap(t=>{
    const src='taskhero:'+t.id; if(seen.has(src)) return []; seen.add(src);
    const x=fn(t,lists), cur=bySrc(src);
    if(!cur) return [x];
    // ya importado: las tareas hechas aquí no se tocan
    const ch=(kind==='todo'&&cur.done)?null:thChanges(cur,kind==='todo'?{diff:x.diff}:x);
    if(ch) upd.push({src,kind:kind==='todo'?'task':'habit',title:cur.title,ch,pick:kind==='habit'&&x._pick,cur:cur.type||null,lock:kind==='habit'?kindLock(cur):null});
    else same++;
    return [];
  });
  const habits=take(hs,'habit',thHabit), tasks=take(ts,'todo',thTask);
  return {habits,tasks,upd,same};
}
export function thMsg(t){ const m=document.getElementById('thMsg'); m.textContent=t||''; m.classList.toggle('hidden',!t); }
export function thReset(){ thPending=null; thSel=new Set(); thUpd=new Set(); thKind=new Map(); thMsg(''); paintThPreview(); }
// Lee TaskHero y enseña la vista previa. Sin clave, el Worker usa la de la cuenta conectada.
export async function thStartRead(key){
  if(thBusy) return;
  const btn=document.getElementById('thRead'), wait=document.getElementById('thLoading');
  thBusy=true; thMsg(''); thPending=null; paintThPreview(); btn.disabled=true; btn.textContent='Leyendo…'; wait.classList.remove('hidden');
  try{
    thPending=await thRead(key);
    thSel=new Set([...thPending.habits,...thPending.tasks].map(x=>x.src));
    thUpd=new Set();   // actualizar pisa lo cambiado aquí: se marca a mano
    thKind=new Map([...thPending.habits.filter(h=>h._pick).map(h=>[h.src,'free']),...thPending.upd.filter(u=>u.pick).map(u=>[u.src,u.cur==='neg'?'neg':'free'])]);
    paintThPreview();
  }catch(err){ thMsg(err.user?err.message:'No se pudo leer TaskHero.'); }
  finally{ thBusy=false; btn.disabled=false; btn.textContent='Leer'; wait.classList.add('hidden'); }
}
export const thPicked = () => thPending?[...thPending.habits,...thPending.tasks].filter(x=>thSel.has(x.src)):[];
const KIND_NAME={free:'Libre',neg:'Negativo'};
const diffTxt=(d)=>d&&d!=='normal'?EFFORT_NAME[d]:'';
// Lo que cambia en un ya importado, con el tipo elegido si no tiene equivalente.
function updText(u){
  const parts=[];
  if(u.ch.diff) parts.push(`${EFFORT_NAME[u.ch.diff.from]} → ${EFFORT_NAME[u.ch.diff.to]}`);
  const k=u.pick?thKind.get(u.src):null;
  if(u.pick){ if(u.ch.sched||k!==u.cur) parts.push(`${u.ch.sched?u.ch.sched.from:KIND_NAME[u.cur]||u.cur} → ${KIND_NAME[k]}`); }
  else if(u.ch.sched) parts.push(`${u.ch.sched.from} → ${u.ch.sched.to}`);
  return parts.join(' · ');
}
// Libre o Negativo, para lo que no tiene equivalente en la app.
function kindPick(src,title,lock=null){
  const k=thKind.get(src)||'free', b=(v)=>{ const on=k===v, off=(v==='neg'&&lock==='pos')||(v==='free'&&lock==='neg');
    return `<button type="button" data-thk="${escapeHtml(src)}" data-v="${v}" aria-pressed="${on}" ${off?'disabled':''} class="px-2.5 h-8 text-xs ${on?(v==='neg'?'bg-red-950/60 text-red-200':'bg-cyan-800 text-white'):'bg-slate-800 text-slate-300'} ${off?'opacity-40 cursor-not-allowed':''}">${KIND_NAME[v]}</button>`; };
  return `<div class="flex flex-wrap items-center gap-2 mt-2" style="padding-left:30px">
      <span class="mono text-[11px] text-slate-400">Tipo</span>
      <div class="inline-flex rounded-md border border-slate-700 overflow-hidden" role="group" aria-label="Tipo de ${escapeHtml(title)}">${b('free')}${b('neg')}</div>
      <span class="mono text-[11px] ${k==='neg'?'text-amber-300':'text-slate-400'}">${lock?`Con historial no puede pasar a ${lock==='pos'?'negativo':'positivo'}`:k==='neg'?'Cada caída daña la nave · no se sincroniza con TaskHero':'Se puede marcar varias veces al día'}</span>
    </div>`;
}
export function paintThPreview(){
  const pv=document.getElementById('thPreview'), P=thPending;
  pv.classList.toggle('hidden',!P);
  if(!P){ pv.innerHTML=''; return; }
  const t=todayStr(), n=P.habits.length+P.tasks.length;
  const row=(x,attr,on,meta,warn,extra='')=>`<div class="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 hover:border-slate-500">
      <label class="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" ${attr}="${escapeHtml(x.src)}" ${on?'checked':''} class="w-[18px] h-[18px] accent-cyan-600 shrink-0">
        <span class="flex-1 min-w-0"><span class="block text-sm break-words">${escapeHtml(x.title)}</span><span ${attr}-meta="${escapeHtml(x.src)}" class="block mono text-[11px] ${warn?'text-amber-300':'text-slate-400'} mt-0.5">${meta}</span></span>
      </label>${extra}</div>`;
  const hMeta=(h)=>[h._pick?`Sin equivalente en la app · TaskHero: ${escapeHtml(h._freq||'')}`:habitKind(h),diffTxt(h.diff),h._done&&'completado en TaskHero'].filter(Boolean).join(' · ');
  const tMeta=(x)=>[!x.dueDate?'Sin fecha':x.dueDate<t?`Atrasada · vencía el ${fmtDate(x.dueDate)}`:x.dueDate===t?'Vence hoy':`Vence el ${fmtDate(x.dueDate)}`,diffTxt(x.diff)].filter(Boolean).join(' · ');
  const sec=(label,rows,note='')=>rows?`<div class="sys-label mt-3 mb-1.5">${label}</div>${note}<div class="flex flex-col gap-1.5">${rows}</div>`:'';
  const head=n?`${plural(P.habits.length,'hábito','hábitos')} · ${plural(P.tasks.length,'tarea','tareas')}`:P.upd.length?'Nada nuevo que importar':'Nada nuevo que importar ni que actualizar';
  pv.innerHTML=`<div class="rounded-xl border border-cyan-700 bg-cyan-950/30 p-3">
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <div class="mono text-[11px] tracking-[.18em] text-cyan-300">LEÍDO DE TASKHERO</div>
        <div class="text-sm font-medium mt-1">${head}</div>
        ${P.upd.length?`<div class="mono text-[11px] text-slate-300 mt-1">${plural(P.upd.length,'ya importado con cambios','ya importados con cambios')}</div>`:''}
        ${P.same?`<div class="mono text-[11px] text-slate-300 mt-1">${plural(P.same,'ya importado sin cambios','ya importados sin cambios')}: no se repiten</div>`:''}
      </div>
      ${n>1?`<button type="button" data-tha="all" class="shrink-0 px-2 h-9 rounded-lg text-xs text-cyan-300 hover:text-cyan-200"></button>`:''}
    </div>
    <div id="thLate" class="hidden text-xs text-amber-200 mt-2"></div>
    ${n||P.upd.length?`<div class="max-h-[50vh] overflow-y-auto -mx-1 px-1">
      ${sec('Hábitos',P.habits.map(h=>row(h,'data-th',thSel.has(h.src),hMeta(h),false,h._pick?kindPick(h.src,h.title):'')).join(''))}
      ${sec('Tareas pendientes',P.tasks.map(x=>row(x,'data-th',thSel.has(x.src),tMeta(x),x.dueDate&&x.dueDate<t)).join(''))}
      ${sec('Ya importados con cambios',P.upd.map(u=>row(u,'data-thu',thUpd.has(u.src),updText(u),false,u.pick?kindPick(u.src,u.title,u.lock):'')).join(''),
        '<p class="mono text-[11px] text-slate-400 mb-1.5">Marca los que quieras poner al día. Solo cambia la dificultad y la frecuencia; el nombre y las notas se quedan como los tengas.</p>')}
    </div>`:''}
    <div class="flex gap-2 mt-3">
      <button type="button" data-tha="cancel" class="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm">${n||P.upd.length?'Cancelar':'Cerrar'}</button>
      ${n||P.upd.length?`<button type="button" data-tha="apply" class="flex-1 btn-primary px-3 py-2 rounded-lg text-sm font-semibold"></button>`:''}
    </div>
  </div>`;
  pv.querySelectorAll('[data-th]').forEach(c=>c.onchange=()=>{ c.checked?thSel.add(c.dataset.th):thSel.delete(c.dataset.th); thCounts(); });
  pv.querySelectorAll('[data-thu]').forEach(c=>c.onchange=()=>{ c.checked?thUpd.add(c.dataset.thu):thUpd.delete(c.dataset.thu); thCounts(); });
  wireKinds(pv);
  pv.querySelector('[data-tha="cancel"]').onclick=closeThModal;
  const all=pv.querySelector('[data-tha="all"]');
  if(all) all.onclick=()=>{ const every=thPicked().length===n; thSel=new Set(every?[]:[...P.habits,...P.tasks].map(x=>x.src));
    pv.querySelectorAll('[data-th]').forEach(c=>c.checked=!every); thCounts(); };
  const ap=pv.querySelector('[data-tha="apply"]'); if(ap) ap.onclick=thApply;
  thCounts();
}
// Elegir el tipo solo repinta su selector (y marca la actualización): la lista no vuelve arriba.
function wireKinds(pv){
  const P=thPending;
  pv.querySelectorAll('[data-thk]').forEach(b=>b.onclick=()=>{
    const src=b.dataset.thk; thKind.set(src,b.dataset.v);
    const u=P.upd.find(y=>y.src===src), h=P.habits.find(y=>y.src===src);
    b.closest('[role="group"]').parentElement.outerHTML=kindPick(src,(u||h).title,u?u.lock:null);
    if(u){
      thUpd.add(src);
      const cb=pv.querySelector(`[data-thu="${CSS.escape(src)}"]`); if(cb) cb.checked=true;
      const m=pv.querySelector(`[data-thu-meta="${CSS.escape(src)}"]`); if(m) m.textContent=updText(u);
    }
    wireKinds(pv); thCounts();
  });
}
// Solo lo que cambia al marcar: repintar la lista entera la devolvería arriba.
export function thCounts(){
  const pv=document.getElementById('thPreview'), P=thPending; if(!P) return;
  const k=thPicked().length, u=P.upd.filter(x=>thUpd.has(x.src)).length, n=P.habits.length+P.tasks.length, t=todayStr();
  const late=P.tasks.filter(x=>thSel.has(x.src)&&x.dueDate&&x.dueDate<t).length;
  const ap=pv.querySelector('[data-tha="apply"]');
  if(ap){ ap.disabled=!k&&!u; ap.textContent=k&&u?`Importar ${k} y actualizar ${u}`:u?`Actualizar ${u}`:`Importar ${k}`; }
  const all=pv.querySelector('[data-tha="all"]'); if(all) all.textContent=k===n?'Desmarcar todo':'Marcar todo';
  const el=document.getElementById('thLate');
  el.textContent=late?`${late===1?'1 tarea quedará atrasada':`${late} tareas quedarán atrasadas`}: cada noche desgastan la nave. Desmárcalas o cámbiales la fecha después.`:'';
  el.classList.toggle('hidden',!late);
}
// Pone al día uno ya importado: dificultad y, en hábitos, frecuencia o el tipo
// elegido (Libre o Negativo). Devuelve si cambió algo.
function applyUpd(u){
  const it=bySrc(u.src); if(!it) return false;
  if(u.ch.diff) it.diff=u.ch.diff.to;
  if(u.kind==='habit'){
    let s=u.ch.sched?{type:u.ch.sched.type,days:u.ch.sched.days,mdays:u.ch.sched.mdays}:null;
    if(u.pick){ const k=thKind.get(u.src)||'free'; s=(s||k!==it.type)?{type:k,days:null}:null; }
    if(s&&(s.type==='neg')!==(it.type==='neg')&&kindLock(it)) s=null;   // con historial no cambia de lado
    if(s){ it.type=s.type; it.days=s.days||null; if(s.type==='monthly') it.mdays=s.mdays; else delete it.mdays; }
  }
  return true;
}
export function thApply(){
  // Otro dispositivo pudo importar entretanto: se vuelve a mirar antes de añadir.
  const have=thHave(), now=Date.now();
  const pick=(arr)=>arr.filter(x=>thSel.has(x.src)&&!have.has(x.src)).map(({_done,_pick,_freq,...x})=>{
    const y={id:uid(),...x,createdAt:now};
    if(_pick&&thKind.get(x.src)==='neg') y.type='neg';
    return y;
  });
  const hs=pick(thPending.habits), ts=pick(thPending.tasks);
  const ups=thPending.upd.filter(u=>thUpd.has(u.src));
  if(!hs.length&&!ts.length&&!ups.length){ closeThModal(); return; }
  // misma copia que al cargar una partida: «Deshacer última carga» también deshace esto
  try{ localStorage.setItem(BACKUPKEY,JSON.stringify({at:now,data:state})); }catch{}
  const nu=ups.filter(applyUpd).length;
  state.habits.push(...hs); state.tasks.push(...ts); save(); render();
  const key=document.getElementById('thKey').value.trim(), link=!thc.connected&&key&&document.getElementById('thLinkToo').checked;
  closeThModal();
  const added=[hs.length&&plural(hs.length,'hábito','hábitos'),ts.length&&plural(ts.length,'tarea','tareas')].filter(Boolean).join(' y ');
  toast([added&&'Importados '+added,nu&&plural(nu,'actualizado','actualizados')].filter(Boolean).join(' · ')+' ✓');
  if(link) thConnect(key).then(err=>toast(err||'TaskHero conectado ✓'));
}

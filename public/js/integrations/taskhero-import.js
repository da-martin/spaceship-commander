/* Importar hábitos y tareas desde TaskHero. */
import { NOTES_MAX } from '../config.js';
import { BACKUPKEY, closeSaveModal, plural, userErr } from '../features/saves.js';
import { thc, thConnect } from './taskhero.js';
import { save, state } from '../store.js';
import { openAuthModal } from '../sync/auth.js';
import { api, cloud } from '../sync/cloud.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';
import { dayParse, DOW_NAMES, escapeHtml, fmtDate, pick, todayStr, uid } from '../util.js';

/* ---------- importar de TaskHero ---------- */
// Se trae lo que tiene equivalente directo: nombre y frecuencia de los hábitos,
// nombre y fecha de las tareas. Lo demás va a las notas, en texto plano, y el
// usuario decide. El Worker hace de paso (/api/taskhero/*) porque TaskHero no
// admite llamadas desde nuestro dominio. `src` evita duplicados al repetir.
export const TH_PAGES = 40;
export const TH_DIFF = {micro:'Mínima',small:'Pequeña',normal:'Normal',hard:'Difícil',epic:'Épica'};
export const TH_ERR = {
  invalid_api_key:'TaskHero no acepta esa clave.', missing_authorization:'TaskHero no acepta esa clave.',
  insufficient_scope:'Esa clave no tiene permiso para leer tus tareas.',
  rate_limited:'TaskHero pide esperar un poco. Prueba dentro de un rato.',
};
export const WEEK_ORDER = [1,2,3,4,5,6,0];
export const dowList = (days,sep=' ') => WEEK_ORDER.filter(d=>days.includes(d)).map(d=>DOW_NAMES[d]).join(sep);
export const listY = (a) => a.length<2 ? a.join('') : a.slice(0,-1).join(', ')+' y '+a[a.length-1];
// «AAAA-MM-DD» tal cual; una fecha con hora pasa al día local
export const thDay = (s) => typeof s!=='string' ? null : /^\d{4}-\d{2}-\d{2}$/.test(s) ? (todayStr(dayParse(s))===s?s:null) : Number.isFinite(Date.parse(s)) ? todayStr(new Date(s)) : null;
export const thLong = (d) => dayParse(d).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
export const thDates = (a,max=20) => { const v=(Array.isArray(a)?a:[]).map(thDay).filter(Boolean).sort(); return v.slice(0,max).map(thLong).join(', ')+(v.length>max?` y ${v.length-max} más`:''); };
// 0 = domingo … 6 = sábado, como getDay(); un 7 se toma como domingo (ISO)
export const thDows = (a) => [...new Set((Array.isArray(a)?a:[]).map(d=>d===7?0:d).filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort((x,y)=>x-y);
export const thTitle = (t) => (typeof t?.title==='string' ? t.title.trim().slice(0,200) : '');

// Libre si el objetivo diario no es exactamente 1 (vacío o varias veces) o si la
// frecuencia no es semanal (mensual, anual, cada X días).
export function thType(t){
  const s=t.schedule;
  if(t.repsPerDayGoal!==1||s?.mode!=='weekly') return {type:'free',days:null};
  const d=thDows(s.daysOfWeek);
  return d.length===7?{type:'daily',days:null}:d.length?{type:'weekly',days:d}:{type:'free',days:null};
}
export function thFreq(s){
  if(s?.mode==='weekly'){ const d=thDows(s.daysOfWeek); return d.length===7?'todos los días':d.length?'semanal: '+dowList(d,', ').toLowerCase():'semanal, sin días'; }
  if(s?.mode==='monthly'){ const d=(s.daysOfMonth||[]).filter(Number.isFinite); return 'mensual: '+(d.length===1?'día ':'días ')+listY(d.map(String)); }
  if(s?.mode==='yearly') return 'anual: '+(s.days||[]).map(x=>`${x.day}/${x.month}`).join(', ')+' (día/mes)';
  if(s?.mode==='everyXDays'){ const d=thDay(s.startingOn); return `cada ${s.intervalDays} días`+(d?` desde el ${thLong(d)}`:''); }
  return s?.mode?String(s.mode):'';
}
// Notas propias primero; si no cabe todo, se recortan ellas y el bloque queda entero.
export function thNotes(t,lines){
  const block=['— Importado de TaskHero —',...lines.filter(Boolean)].join('\n');
  const own=typeof t.notes==='string'?t.notes.trim():'';
  if(!own) return block.slice(0,NOTES_MAX);
  const room=NOTES_MAX-block.length-2;
  if(room<2) return block.slice(0,NOTES_MAX);
  return (own.length>room?own.slice(0,room-1).trimEnd()+'…':own)+'\n\n'+block;
}
export const thDiffLine = (t) => t.difficulty&&`Dificultad: ${TH_DIFF[t.difficulty]||t.difficulty} (${t.difficulty})`;
export const thListLine = (t,lists) => t.listId&&lists.has(t.listId)&&`Lista: ${lists.get(t.listId)}`;
export function thHabit(t,lists){
  const {type,days}=thType(t), o=t.scheduleOverrides||{}, last=thDay(t.lastCompletedAt);
  // _done solo sirve a la vista previa: no se guarda
  return {title:thTitle(t),type,days,priority:false,diff:'normal',areas:[],log:{},src:'taskhero:'+t.id,_done:t.status==='completed',
    notes:thNotes(t,[thDiffLine(t),`Frecuencia: ${thFreq(t.schedule)}`,
      `Repeticiones al día: ${t.repsPerDayGoal==null?'sin objetivo':t.repsPerDayGoal}`,
      o.scheduledFor?.length&&`Días añadidos: ${thDates(o.scheduledFor)}`,
      o.unscheduledFor?.length&&`Días quitados: ${thDates(o.unscheduledFor)}`,
      thListLine(t,lists), t.status==='completed'&&'Estado: completado',
      last&&`Última vez completado: ${thLong(last)}`])};
}
export function thTask(t,lists){
  const dates=(t.scheduledFor||[]).map(thDay).filter(Boolean).sort(), last=thDay(t.lastCompletedAt);
  return {title:thTitle(t),dueDate:dates[0]||null,priority:false,diff:'normal',done:false,areas:[],projectId:null,src:'taskhero:'+t.id,
    notes:thNotes(t,[thDiffLine(t),thListLine(t,lists),dates.length>1&&`Fechas programadas: ${thDates(t.scheduledFor)}`,
      last&&`Última vez completada: ${thLong(last)}`])};
}

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

// {habits, tasks, dup}: lo leído y aún sin importar; thSel guarda los `src` marcados.
export let thPending=null, thSel=new Set(), thBusy=false;
export const thHave = () => new Set([...state.tasks,...state.habits].map(x=>x.src).filter(Boolean));
export async function thRead(key){
  const [lb,hs,ts]=await Promise.all([thGet(key,'lists'),thAll(key,{type:'habit',status:'all'}),thAll(key,{type:'todo',status:'open'})]);
  const lists=new Map((Array.isArray(lb?.lists)?lb.lists:[]).filter(l=>typeof l?.id==='string').map(l=>[l.id,String(l.title||'')]));
  const have=thHave(), seen=new Set(); let dup=0;
  const take=(arr,kind,fn)=>arr.filter(t=>t?.type===kind&&typeof t.id==='string'&&thTitle(t)).flatMap(t=>{
    const src='taskhero:'+t.id; if(seen.has(src)) return []; seen.add(src);
    if(have.has(src)){ dup++; return []; }
    return [fn(t,lists)];
  });
  const habits=take(hs,'habit',thHabit), tasks=take(ts,'todo',thTask);
  return {habits,tasks,dup};
}
export function thMsg(t){ const m=document.getElementById('thMsg'); m.textContent=t||''; m.classList.toggle('hidden',!t); }
export function thReset(){
  thPending=null; thSel=new Set(); thMsg(''); paintThPreview();
  const on=!!cloud.user;
  document.getElementById('thSignedOut').classList.toggle('hidden',on);
  document.getElementById('thLogin').classList.toggle('hidden',!cloud.online);
  document.getElementById('thBox').classList.toggle('hidden',!on);
  const linked=on&&thc.connected;
  document.getElementById('thKey').placeholder=linked?'Clave conectada (no hace falta pegarla)':'Clave de API (th-api-…)';
  document.getElementById('thLinkRow').classList.toggle('hidden',linked||!thc.ready);
  document.getElementById('thLinkToo').checked=false;
  document.getElementById('thHelp').textContent='Trae tus hábitos y tus tareas pendientes con su nombre, su frecuencia y su fecha. Lo demás (dificultad, lista, notas…) va a las notas de cada uno. '
    +(linked?'Usa la clave de la cuenta conectada.':'La clave solo se usa para esta lectura y no se guarda, salvo que marques «Conectar también».');
}
export const thPicked = () => thPending?[...thPending.habits,...thPending.tasks].filter(x=>thSel.has(x.src)):[];
export function paintThPreview(){
  const pv=document.getElementById('thPreview'), P=thPending;
  pv.classList.toggle('hidden',!P);
  if(!P){ pv.innerHTML=''; return; }
  const t=todayStr(), n=P.habits.length+P.tasks.length;
  const row=(x,meta,warn)=>`<label class="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 cursor-pointer hover:border-slate-500">
      <input type="checkbox" data-th="${escapeHtml(x.src)}" ${thSel.has(x.src)?'checked':''} class="w-[18px] h-[18px] accent-cyan-600 shrink-0">
      <span class="flex-1 min-w-0"><span class="block text-sm break-words">${escapeHtml(x.title)}</span><span class="block mono text-[11px] ${warn?'text-amber-300':'text-slate-400'} mt-0.5">${meta}</span></span></label>`;
  const hMeta=(h)=>(h.type==='daily'?'Diario':h.type==='weekly'?'Semanal · '+dowList(h.days):'Libre')+(h._done?' · completado en TaskHero':'');
  const tMeta=(x)=>!x.dueDate?'Sin fecha':x.dueDate<t?`Atrasada · vencía el ${fmtDate(x.dueDate)}`:x.dueDate===t?'Vence hoy':`Vence el ${fmtDate(x.dueDate)}`;
  const sec=(label,rows)=>rows?`<div class="sys-label mt-3 mb-1.5">${label}</div><div class="flex flex-col gap-1.5">${rows}</div>`:'';
  pv.innerHTML=`<div class="rounded-xl border border-cyan-700 bg-cyan-950/30 p-3">
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <div class="mono text-[11px] tracking-[.18em] text-cyan-300">LEÍDO DE TASKHERO</div>
        <div class="text-sm font-medium mt-1">${n?`${plural(P.habits.length,'hábito','hábitos')} · ${plural(P.tasks.length,'tarea','tareas')}`:'Nada nuevo que importar'}</div>
        ${P.dup?`<div class="mono text-[11px] text-slate-300 mt-1">${plural(P.dup,'ya importado','ya importados')}: no se repiten</div>`:''}
      </div>
      ${n>1?`<button type="button" data-tha="all" class="shrink-0 px-2 h-9 rounded-lg text-xs text-cyan-300 hover:text-cyan-200"></button>`:''}
    </div>
    <div id="thLate" class="hidden text-xs text-amber-200 mt-2"></div>
    ${n?`<div class="max-h-[50vh] overflow-y-auto -mx-1 px-1">${sec('Hábitos',P.habits.map(h=>row(h,hMeta(h))).join(''))}${sec('Tareas pendientes',P.tasks.map(x=>row(x,tMeta(x),x.dueDate&&x.dueDate<t)).join(''))}</div>`:''}
    <div class="flex gap-2 mt-3">
      <button type="button" data-tha="cancel" class="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm">${n?'Cancelar':'Cerrar'}</button>
      ${n?`<button type="button" data-tha="apply" class="flex-1 btn-primary px-3 py-2 rounded-lg text-sm font-semibold"></button>`:''}
    </div>
  </div>`;
  pv.querySelectorAll('[data-th]').forEach(c=>c.onchange=()=>{ c.checked?thSel.add(c.dataset.th):thSel.delete(c.dataset.th); thCounts(); });
  pv.querySelector('[data-tha="cancel"]').onclick=thReset;
  const all=pv.querySelector('[data-tha="all"]');
  if(all) all.onclick=()=>{ const every=thPicked().length===n; thSel=new Set(every?[]:[...P.habits,...P.tasks].map(x=>x.src));
    pv.querySelectorAll('[data-th]').forEach(c=>c.checked=!every); thCounts(); };
  const ap=pv.querySelector('[data-tha="apply"]'); if(ap) ap.onclick=thApply;
  thCounts();
}
// Solo lo que cambia al marcar: repintar la lista entera la devolvería arriba.
export function thCounts(){
  const pv=document.getElementById('thPreview'), P=thPending; if(!P) return;
  const k=thPicked().length, n=P.habits.length+P.tasks.length, t=todayStr();
  const late=P.tasks.filter(x=>thSel.has(x.src)&&x.dueDate&&x.dueDate<t).length;
  const ap=pv.querySelector('[data-tha="apply"]'); if(ap){ ap.disabled=!k; ap.textContent=`Importar ${k}`; }
  const all=pv.querySelector('[data-tha="all"]'); if(all) all.textContent=k===n?'Desmarcar todo':'Marcar todo';
  const el=document.getElementById('thLate');
  el.textContent=late?`${late===1?'1 tarea quedará atrasada':`${late} tareas quedarán atrasadas`}: cada noche desgastan la nave. Desmárcalas o cámbiales la fecha después.`:'';
  el.classList.toggle('hidden',!late);
}
export function thApply(){
  // Otro dispositivo pudo importar entretanto: se vuelve a mirar antes de añadir.
  const have=thHave(), now=Date.now();
  const pick=(arr)=>arr.filter(x=>thSel.has(x.src)&&!have.has(x.src)).map(({_done,...x})=>({id:uid(),...x,createdAt:now}));
  const hs=pick(thPending.habits), ts=pick(thPending.tasks);
  if(!hs.length&&!ts.length){ thReset(); return; }
  // misma copia que al cargar una partida: «Deshacer última carga» también deshace esto
  try{ localStorage.setItem(BACKUPKEY,JSON.stringify({at:now,data:state})); }catch{}
  state.habits.push(...hs); state.tasks.push(...ts); save(); render();
  const key=document.getElementById('thKey').value.trim(), link=!thc.connected&&key&&document.getElementById('thLinkToo').checked;
  document.getElementById('thKey').value=''; closeSaveModal();
  toast(`Importados ${[hs.length&&plural(hs.length,'hábito','hábitos'),ts.length&&plural(ts.length,'tarea','tareas')].filter(Boolean).join(' y ')} ✓`);
  if(link) thConnect(key).then(err=>toast(err||'TaskHero conectado ✓'));
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('thForm').onsubmit=async(e)=>{
    e.preventDefault();
    const key=document.getElementById('thKey').value.trim(), btn=document.getElementById('thRead');
    if((!key&&!thc.connected)||thBusy) return;
    thBusy=true; thMsg(''); thPending=null; paintThPreview(); btn.disabled=true; btn.textContent='Leyendo…';
    try{
      thPending=await thRead(key);
      thSel=new Set([...thPending.habits,...thPending.tasks].map(x=>x.src));
      paintThPreview();
    }catch(err){ thMsg(err.user?err.message:'No se pudo leer TaskHero.'); }
    finally{ thBusy=false; btn.disabled=false; btn.textContent='Leer'; }
  };
  document.getElementById('thLogin').onclick=()=>{ closeSaveModal(); openAuthModal('login'); };
}

/* Repaso de ayer: marcar lo olvidado antes de procesar el día. */
import { dailyTick } from '../core/day.js';
import { checkHabit, grantTask, tapFree } from '../core/rewards.js';
import { fDate } from './focus.js';
import { state } from '../store.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';
import { addDays, dayParse, escapeHtml, fmtDate, todayStr } from '../util.js';

/* ---------- repaso de ayer ---------- */
// La primera vez de cada día (el tick de hoy sin hacer) se pregunta por lo de
// ayer que sigue sin marcar. `sel` guarda lo elegido por id: hábito o tarea →
// true, hábito libre → cuántas veces.
export const rv={open:false,done:null,sel:{}};
// Lo marcado y aún sin confirmar se guarda para que una recarga no lo borre.
export const RVKEY='spaceship-commander:review';
export function saveRvSel(){ try{ localStorage.setItem(RVKEY,JSON.stringify({day:todayStr(),sel:rv.sel})); }catch{} }
export function loadRvSel(){
  try{ const v=JSON.parse(localStorage.getItem(RVKEY)); if(v?.day===todayStr()&&v.sel&&typeof v.sel==='object') rv.sel={...v.sel}; }catch{}
}
export function clearRvSel(){ try{ localStorage.removeItem(RVKEY); }catch{} }
export function yesterdayPending(){
  const t=todayStr(), y=addDays(t,-1), start=dayParse(t).getTime(), dow=dayParse(y).getDay();
  const ord=(a,b)=>(b.priority-a.priority)||a.title.localeCompare(b.title,'es');
  const habits=[], free=[];
  for(const h of state.habits){
    if((h.createdAt||0)>=start||h.type==='neg') continue;   // creado hoy: ayer no existía; los negativos no se repasan
    const n=h.log?.[y]||0;
    if(h.type==='free'){ if(!n) free.push(h); continue; }
    if(h.type==='weekly'&&!(h.days||[]).includes(dow)) continue;
    if(n<1) habits.push(h);
  }
  const tasks=state.tasks.filter(x=>!x.done&&x.dueDate&&x.dueDate<=y&&(x.createdAt||0)<start)
    .sort((a,b)=>(b.priority-a.priority)||(a.dueDate<b.dueDate?-1:1));
  return {y,habits:habits.sort(ord),free:free.sort(ord),tasks,n:habits.length+free.length+tasks.length};
}
export function needsReview(){
  const sh=state.ship, t=todayStr();
  return !!sh.lastTick&&sh.lastTick<addDays(t,-1)&&rv.done!==t&&yesterdayPending().n>0;
}
export const rvCount=()=>Object.values(rv.sel).reduce((a,v)=>a+(v===true?1:v>0?v:0),0);
export function paintReviewOk(){
  const n=rvCount(), ok=document.getElementById('rvOk');
  ok.disabled=!n; ok.textContent=n?`Marcar ${n}`:'Marcar';
  ok.className='sm:flex-1 h-11 rounded-xl text-sm font-semibold '+(n?'bg-cyan-600 hover:bg-cyan-500 text-white':'bg-slate-800 text-slate-500 cursor-not-allowed');
}
export function openReview(){
  const p=yesterdayPending(), ids=new Set([...p.habits,...p.free,...p.tasks].map(x=>x.id));
  if(!rv.open&&!Object.keys(rv.sel).length) loadRvSel();   // tras recargar o reabrir la app
  for(const k of Object.keys(rv.sel)) if(!ids.has(k)) delete rv.sel[k];   // lo que ya no está (otro dispositivo, borrado)
  document.getElementById('rvWhen').textContent=`${fDate(p.y)}. Marca lo que hiciste y no llegaste a apuntar: cuenta como hecho ayer.`;
  const star=(x)=>x.priority?'<span class="text-amber-300">★ </span>':'';
  const sec=(label,rows)=>rows?`<div><div class="sys-label mb-2">${label}</div><div class="flex flex-col gap-1.5">${rows}</div></div>`:'';
  const check=(x,meta)=>`<label class="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5 cursor-pointer hover:border-slate-500">
      <input type="checkbox" data-rv="${x.id}" ${rv.sel[x.id]?'checked':''} class="w-[18px] h-[18px] accent-cyan-600 shrink-0">
      <span class="flex-1 min-w-0"><span class="block text-sm break-words">${star(x)}${escapeHtml(x.title)}</span>${meta?`<span class="block mono text-[11px] text-slate-400 mt-0.5">${meta}</span>`:''}</span></label>`;
  const step=(h)=>{ const n=rv.sel[h.id]||0;
    return `<div class="flex items-center gap-3 rounded-lg border ${n?'border-cyan-700':'border-slate-700'} bg-slate-900/60 px-3 py-2">
      <span class="flex-1 min-w-0 text-sm break-words">${star(h)}${escapeHtml(h.title)}</span>
      <button type="button" data-rvf="${h.id}" data-d="-1" aria-label="Una vez menos: ${escapeHtml(h.title)}" class="w-8 h-8 rounded-lg border border-slate-700 text-slate-300 ${n?'hover:border-slate-500':'opacity-40 cursor-not-allowed'}" ${n?'':'disabled'}>−</button>
      <span class="mono text-sm w-5 text-center ${n?'text-cyan-200':'text-slate-500'}" aria-live="polite">${n}</span>
      <button type="button" data-rvf="${h.id}" data-d="1" aria-label="Una vez más: ${escapeHtml(h.title)}" class="w-8 h-8 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500">+</button>
    </div>`; };
  const t=todayStr(), late=(x)=>x.dueDate===p.y?'vencía ayer':`vencía el ${fmtDate(x.dueDate)} · hace ${Math.round((dayParse(t)-dayParse(x.dueDate))/864e5)} días`;
  const list=document.getElementById('rvList');
  list.innerHTML=sec('Hábitos',p.habits.map(h=>check(h,h.type==='weekly'?'Semanal':'')).join(''))
    +sec('Hábitos libres',p.free.map(step).join(''))
    +sec('Tareas atrasadas',p.tasks.map(x=>check(x,late(x))).join(''));
  list.querySelectorAll('[data-rv]').forEach(cb=>cb.onchange=()=>{ if(cb.checked) rv.sel[cb.dataset.rv]=true; else delete rv.sel[cb.dataset.rv]; saveRvSel(); paintReviewOk(); });
  list.querySelectorAll('[data-rvf]').forEach(bt=>bt.onclick=()=>{
    const id=bt.dataset.rvf, n=Math.max(0,Math.min(99,(rv.sel[id]||0)+ +bt.dataset.d));
    if(n) rv.sel[id]=n; else delete rv.sel[id];
    saveRvSel(); openReview();
    document.querySelector(`[data-rvf="${id}"][data-d="${bt.dataset.d}"]`)?.focus();
  });
  paintReviewOk();
  const m=document.getElementById('reviewModal'), was=rv.open;
  rv.open=true; m.classList.remove('hidden');
  if(!was){ m.scrollTop=0; document.getElementById('rvNone').focus({preventScroll:true}); }   // se lee desde arriba
}
export function closeReview(){ rv.open=false; rv.sel={}; clearRvSel(); document.getElementById('reviewModal').classList.add('hidden'); }
// Marca lo elegido con fecha de ayer y, ya con eso, procesa el día.
export function answerReview(apply){
  if(!rv.open) return;
  const p=yesterdayPending(), y=p.y; let n=0, mc=0;
  if(apply){
    for(const h of p.habits) if(rv.sel[h.id]===true){ h.log=h.log||{}; h.log[y]=1; mc+=checkHabit(h,y).mc; n++; }
    for(const h of p.free) for(let i=0;i<(rv.sel[h.id]||0);i++){ mc+=tapFree(h,y).mc; n++; }
    for(const x of p.tasks) if(rv.sel[x.id]===true){ x.done=true; mc+=grantTask(x,y).mc; n++; }
  }
  rv.done=todayStr(); closeReview();
  dailyTick(); render();
  if(n) toast(`Ayer: ${n} ${n===1?'marcado':'marcados'} · +${mc} ¢`);
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('rvOk').onclick=()=>answerReview(true);
  document.getElementById('rvNone').onclick=()=>answerReview(false);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&rv.open) answerReview(false); });
}

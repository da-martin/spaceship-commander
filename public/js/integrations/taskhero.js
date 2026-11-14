/* TaskHero conectado: cola de envíos al completar y enlace de la cuenta. */
import { RECENT_MS } from '../config.js';
import { plural, relDays } from '../features/saves.js';
import { thAll } from './taskhero-import.js';
import { save, state } from '../store.js';
import { openAuthModal } from '../sync/auth.js';
import { api, cloud } from '../sync/cloud.js';
import { render } from '../ui/commander.js';
import { LINK_SVG } from '../ui/rows.js';
import { closeSettings } from '../ui/settings.js';
import { toast } from '../ui/toast.js';
import { addDays, dayParse, escapeHtml, todayStr, uid } from '../util.js';

// TaskHero conectado a la cuenta (la clave vive en el servidor). `ready` es false
// si falta la migración 0005; `busy`, mientras se envía la cola.
export const thc = {connected:false, ready:true, timer:null, busy:false, removing:false};
/* ---------- TaskHero: enlace y envíos ---------- */
// Con la cuenta conectada, lo que se completa aquí llega a TaskHero:
// - enlazado (src 'taskhero:<id>', importado o con el mismo nombre): se completa allí;
// - lo demás: su esfuerzo como tracker points.
// Cada envío espera TH_DELAY en una cola de este dispositivo; marcar y desmarcar
// dentro de ese margen no envía nada. La cola no va en la partida: no se exporta
// ni viaja a otros dispositivos, que solo envían lo que se marca en ellos.
export const THQKEY='spaceship-commander:thq';
export const TH_DELAY=RECENT_MS, TH_RETRY=60e3, TH_KEY_RETRY=10*60e3, TH_MAP_TTL=36e5, TH_SENT_DAYS=3, TH_SOURCE='Spaceship Commander';
export const TH_LABEL={habit:'Hábito',task:'Tarea',acc:'Acción rápida'};
export const thBlank=(user)=>({user,connected:false,q:[],sent:{},map:null,err:null,okAt:0,retryAt:0});
export let thq=(()=>{ try{ const o=JSON.parse(localStorage.getItem(THQKEY)); if(o&&Array.isArray(o.q)&&o.sent&&typeof o.sent==='object') return o; }catch{} return thBlank(null); })();
export function thSave(){ try{ localStorage.setItem(THQKEY,JSON.stringify(thq)); }catch{} }
// La cola es de una cuenta: si entra otra en este dispositivo, empieza de cero.
export function thFor(user){ if(thq.user!==user){ thq=thBlank(user); thSave(); } }
export const thIsLinked=(x)=>typeof x?.src==='string'&&x.src.startsWith('taskhero:');
export const thIdOf=(x)=>thIsLinked(x)&&!x.thOff&&x.type!=='neg'?x.src.slice(9):null;
export const thShow=(x)=>thc.connected&&!!thIdOf(x);
export const thActive=()=>!!cloud.user&&thc.connected;
export const thNorm=(t)=>String(t||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');

export function thTrack(x,kind,op,day,ef=0){
  if(!thActive()||!x||x.type==='neg') return;
  thFor(cloud.user.id);
  const q=thq.q;
  // la contraria aún sin enviar del mismo elemento y día se anula con esta
  for(let i=q.length-1;i>=0;i--){
    const e=q[i]; if(e.ref!==x.id||e.day!==day) continue;
    if(e.op!==op){ q.splice(i,1); thSave(); thPaintStatus(); return; }
    break;
  }
  const at=Date.now();
  q.push({id:uid(),ref:x.id,kind:x.kind==='acc'?'acc':kind,type:x.type||null,title:String(x.title||'').slice(0,200),
    src:x.src||null,day,at,ef:+ef||0,op,due:at+TH_DELAY});
  thSave(); thSchedule(); thPaintStatus();
}
export function thSchedule(){
  clearTimeout(thc.timer); thc.timer=null;
  if(!thActive()||thq.user!==cloud.user.id||!thq.q.length) return;
  const next=Math.max(Math.min(...thq.q.map(e=>e.due)),thq.retryAt||0);
  thc.timer=setTimeout(thFlush,Math.max(1000,next-Date.now()));
}
// Hoy: el momento del toque. Del repaso de ayer: ese día a mediodía, lejos del cambio de día de TaskHero.
export function thWhen(e){
  if(e.day===todayStr(new Date(e.at))) return new Date(e.at).toISOString();
  const d=dayParse(e.day); d.setHours(12,0,0,0); return d.toISOString();
}
export async function thPost(path,body){
  try{
    const r=await api('/api/taskhero/'+path,{method:'POST',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    const b=await r.json().catch(()=>null), e=b?.error;
    return {ok:r.ok,status:r.status,th:!!e&&typeof e==='object',code:(e&&typeof e==='object')?e.code:e};
  }catch{ return {ok:false,status:0,th:false,code:'offline'}; }
}
// 'stop': se para y se reintenta más tarde con la entrada intacta. 'drop': se descarta.
export function thOutcome(r,retryable){
  if(r.ok) return 'ok';
  if(r.status===0) return 'stop';                                   // sin red
  if(r.status===401&&!r.th) return 'stop';                          // nuestra sesión caducó
  if(r.th&&(r.status===401||r.status===403)){ thq.err='TaskHero no acepta la clave guardada: vuelve a conectar.'; thq.retryAt=Date.now()+TH_KEY_RETRY; return 'stop'; }
  if(r.code==='not_linked'){ thc.connected=false; thq.connected=false; render(); return 'stop'; }
  if(r.code==='not_ready'){ thc.ready=false; return 'stop'; }
  if(r.status===429||(retryable&&r.status>=500)){ thq.retryAt=Date.now()+TH_RETRY; return 'stop'; }
  thq.err=`TaskHero rechazó un envío (${r.code||r.status}).`;
  return 'drop';
}
export async function thSendOne(e){
  const list=e.kind==='habit'?state.habits:e.kind==='task'?state.tasks:[], it=list.find(y=>y.id===e.ref);
  if(it&&e.op==='+') thLinkOne(it,e.kind);              // por si el mapa llegó después de marcar
  const thId=it?thIdOf(it):(e.src?.startsWith('taskhero:')?e.src.slice(9):null);
  const key=`${e.ref}|${e.day}`, stack=thq.sent[key]||[];
  const note=(v)=>{ stack.push(v); thq.sent[key]=stack; };
  if(e.op==='-'){
    const last=stack.pop(); if(stack.length) thq.sent[key]=stack; else delete thq.sent[key];
    if(last!=='c'||!thId) return 'ok';                    // los puntos enviados no se pueden retirar
    // sin clave de idempotencia: repetirlo podría quitar dos, así que solo se reintenta si no llegó a salir
    const r=await thPost(`tasks/${encodeURIComponent(thId)}/uncomplete`);
    if(r.status===404&&r.th) return 'ok';                 // ya no existe allí
    const out=thOutcome(r,false);
    if(out==='stop') note(last);
    return out;
  }
  if(thId){
    const body={completedAt:thWhen(e),sourceName:TH_SOURCE,idempotencyKey:`spaceship:c:${e.id}`};
    if(e.kind==='habit'&&e.type!=='free') body.onlyIfIncomplete=true;
    const r=await thPost(`tasks/${encodeURIComponent(thId)}/complete`,body);
    if(r.status===404&&r.th&&!e.again){
      // ya no existe en TaskHero: se suelta el enlace y se vuelve a mirar con el mapa nuevo
      if(it&&thIdOf(it)===thId){ delete it.src; save(); render(); }
      e.again=true; return 'again';
    }
    const out=thOutcome(r,true); if(out==='ok') note('c'); return out;
  }
  if(!(e.ef>0)){ note('n'); return 'ok'; }               // toques de más de un libre sin pareja
  const title=it?.title||e.title;
  const out=thOutcome(await thPost('tracker-points',{value:e.ef,description:`${TH_LABEL[e.kind]||'Tarea'}: ${title}`.slice(0,200),
    sourceId:e.ref,sourceName:TH_SOURCE,idempotencyKey:`spaceship:p:${e.id}`}),true);
  if(out==='ok') note('p');
  return out;
}
// `force` (al volver el foco o la red) no espera al reintento, salvo si la clave falló.
export async function thFlush(force=false){
  clearTimeout(thc.timer); thc.timer=null;
  if(!thActive()||thc.busy) return;
  thFor(cloud.user.id);
  const now=Date.now();
  if(thq.retryAt>now&&(thq.err||!force)){ thSchedule(); return; }
  const due=thq.q.filter(e=>e.due<=now).sort((a,b)=>a.at-b.at);
  if(!due.length){ thSchedule(); return; }
  thc.busy=true; thq.retryAt=0;
  try{
    if(due.some(e=>e.op==='+')) await thRefreshMap();
    for(const e of due){
      let out=await thSendOne(e);
      if(out==='again'){ await thRefreshMap(true); out=await thSendOne(e); }
      if(out==='stop'){ if(!(thq.retryAt>Date.now())) thq.retryAt=Date.now()+TH_RETRY; thSave(); break; }
      thq.q=thq.q.filter(y=>y.id!==e.id);
      if(out==='ok'){ thq.okAt=Date.now(); thq.err=null; }
      thSave();
    }
    // las anotaciones de días viejos ya no sirven para deshacer
    const cut=addDays(todayStr(),-TH_SENT_DAYS);
    for(const k of Object.keys(thq.sent)) if(k.slice(-10)<cut) delete thq.sent[k];
  }finally{ thc.busy=false; thSave(); thSchedule(); thPaintStatus(); }
}

// Mapa nombre → id de TaskHero. Al refrescarlo se enlaza lo que coincide, y el
// enlace queda fijo en src: se puede renombrar aquí sin perderlo.
export async function thRefreshMap(force=false){
  if(!thActive()) return;
  thFor(cloud.user.id);
  if(force||!thq.map||Date.now()-thq.map.at>TH_MAP_TTL){
    try{
      const [hs,ts]=await Promise.all([thAll('',{type:'habit',status:'all'}),thAll('',{type:'todo',status:'open'})]);
      const ids=(arr,kind)=>{ const m={}; for(const t of arr) if(t?.type===kind&&typeof t.id==='string'){ const n=thNorm(t.title); if(n&&!(n in m)) m[n]=t.id; } return m; };
      thq.map={at:Date.now(),habits:ids(hs,'habit'),todos:ids(ts,'todo')}; thSave();
    }catch{ /* sin red o sin permiso: se queda el mapa que hubiera */ }
  }
  thLinkAll();
}
export function thUsedIds(){ return new Set([...state.habits,...state.tasks].filter(thIsLinked).map(x=>x.src.slice(9))); }
export function thLinkOne(x,kind,used=thUsedIds()){
  const m=thq.map; if(!m||x.src||x.thOff||x.type==='neg') return false;
  const id=(kind==='habit'?m.habits:m.todos)[thNorm(x.title)];
  if(!id||used.has(id)) return false;                    // un id de TaskHero, un solo elemento de aquí
  x.src='taskhero:'+id; used.add(id); save(); return true;
}
export function thLinkAll(){
  if(!thActive()||!thq.map) return;
  const used=thUsedIds(); let n=0;
  for(const h of state.habits) if(thLinkOne(h,'habit',used)) n++;
  for(const x of state.tasks) if(!x.done&&thLinkOne(x,'task',used)) n++;
  if(n) render();
}

// Al entrar (y al conectar): ¿hay cuenta de TaskHero conectada? Luego mapa y cola.
export async function thInit(){
  if(!cloud.user) return;
  thFor(cloud.user.id);
  thc.connected=!!thq.connected;   // lo último que se supo, mientras responde el servidor
  try{
    const r=await api('/api/taskhero/link');
    if(r.status===503){ thc.ready=false; thc.connected=false; }
    else if(r.ok){ thc.ready=true; thc.connected=!!(await r.json()).connected; }
  }catch{ /* sin red: se queda lo último que se supo */ }
  thq.connected=thc.connected; thSave();
  render(); paintTh();
  if(thc.connected){ await thRefreshMap(); paintTh(); thFlush(); }
}
// Devuelve el mensaje de error, o null si quedó conectada.
export async function thConnect(key){
  let r;
  try{ r=await api('/api/taskhero/link',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({key})}); }
  catch{ return 'Sin conexión. Prueba otra vez.'; }
  const b=await r.json().catch(()=>({}));
  if(!r.ok) return ({bad_key:'TaskHero no acepta esa clave.',upstream:'TaskHero no responde. Prueba más tarde.',throttled:'Demasiados intentos. Prueba dentro de un rato.',
    not_ready:'Falta preparar la base de datos para TaskHero (migración 0005).',unauthorized:'Tu sesión ha caducado. Vuelve a entrar en tu cuenta.'})[b.error]||'No se pudo conectar.';
  thFor(cloud.user.id);
  thc.connected=thq.connected=true; thq.err=null; thq.retryAt=0; thSave();
  render(); paintTh();
  await thRefreshMap(true); paintTh(); thFlush();
  return null;
}
export async function thDisconnect(){
  try{ const r=await api('/api/taskhero/link',{method:'DELETE'}); if(!r.ok) throw 0; }
  catch{ thsMsg('No se pudo desconectar. Prueba otra vez.'); return; }
  thc.connected=false; thc.removing=false; thq.connected=false; thSave(); clearTimeout(thc.timer);
  render(); paintTh(); toast('TaskHero desconectado');
}

export function thsMsg(t){ const m=document.getElementById('thsMsg'); m.textContent=t||''; m.classList.toggle('hidden',!t); }
export const thAgo=(ms)=>{ const m=Math.round((Date.now()-ms)/6e4); return m<1?'hace un momento':m<60?`hace ${m} min`:m<1440?`hace ${Math.round(m/60)} h`:relDays(ms); };
export function thPaintStatus(){
  const el=document.getElementById('thsStatus'); if(!el) return;
  const n=thq.user===cloud.user?.id?thq.q.length:0;
  el.className='mono text-[11px] mt-0.5 '+(thq.err?'text-red-300':'text-slate-400');
  el.textContent=thq.err||[n?`${n} ${n===1?'envío pendiente':'envíos pendientes'}`:'',thq.okAt?`último envío ${thAgo(thq.okAt)}`:(n?'':'sin envíos todavía')].filter(Boolean).join(' · ');
}
export function paintTh(){
  const on=!!cloud.user;
  document.getElementById('thsSignedOut').classList.toggle('hidden',on);
  document.getElementById('thsLogin').classList.toggle('hidden',!cloud.online);
  document.getElementById('thsBox').classList.toggle('hidden',!on);
  if(!on) return;
  if(!thc.ready){ document.getElementById('thsForm').classList.add('hidden'); document.getElementById('thsOn').classList.add('hidden');
    thsMsg('Falta preparar la base de datos para TaskHero (migración 0005). Mientras tanto no se envía nada.'); return; }
  document.getElementById('thsForm').classList.toggle('hidden',thc.connected);
  const box=document.getElementById('thsOn'); box.classList.toggle('hidden',!thc.connected);
  if(!thc.connected){ box.innerHTML=''; return; }
  const hs=state.habits.filter(thIdOf), ts=state.tasks.filter(x=>!x.done&&thIdOf(x));
  const names=(a)=>a.map(x=>`<li class="truncate">${escapeHtml(x.title)}</li>`).join('');
  const btns=thc.removing
    ? `<button type="button" data-ths="ok" class="shrink-0 px-3 h-11 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-200 hover:border-red-600">Desconectar</button>
       <button type="button" data-ths="no" class="shrink-0 px-2.5 h-11 rounded-lg text-xs text-slate-300 hover:text-white">Cancelar</button>`
    : `<button type="button" data-ths="del" class="shrink-0 px-3 h-11 rounded-lg text-xs text-slate-400 hover:text-red-300">Desconectar</button>`;
  box.innerHTML=`<div class="flex items-center gap-1 rounded-lg border ${thc.removing?'border-red-900':'border-[#1f2a3d]'} bg-[#0f1729] pl-3 pr-1">
      <div class="min-w-0 flex-1 py-2"><div class="text-sm">Conectado ✓</div><div id="thsStatus"></div></div>${btns}</div>
    <details class="mt-2 rounded-lg border border-[#1f2a3d] bg-[#0f1729] px-3 py-2">
      <summary class="text-[13px] text-slate-300 cursor-pointer">${LINK_SVG} ${plural(hs.length,'hábito enlazado','hábitos enlazados')} · ${plural(ts.length,'tarea enlazada','tareas enlazadas')}</summary>
      ${hs.length?`<div class="sys-label mt-2 mb-1">Hábitos</div><ul class="text-[13px] text-slate-300 space-y-0.5">${names(hs)}</ul>`:''}
      ${ts.length?`<div class="sys-label mt-2 mb-1">Tareas pendientes</div><ul class="text-[13px] text-slate-300 space-y-0.5">${names(ts)}</ul>`:''}
      ${hs.length||ts.length?'':'<p class="text-[13px] text-slate-400 mt-1.5">Nada enlazado todavía: ningún hábito ni tarea pendiente se llama igual que uno de TaskHero.</p>'}
    </details>`;
  thPaintStatus();
  box.querySelectorAll('[data-ths]').forEach(b=>b.onclick=async()=>{
    const a=b.dataset.ths;
    if(a==='del'){ thc.removing=true; paintTh(); return; }
    if(a==='no'){ thc.removing=false; paintTh(); return; }
    b.disabled=true; await thDisconnect();
  });
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('thsForm').onsubmit=async(e)=>{
    e.preventDefault();
    const inp=document.getElementById('thsKey'), btn=document.getElementById('thsConnect'), key=inp.value.trim();
    if(!key) return;
    thsMsg(''); btn.disabled=true; btn.textContent='Conectando…';
    const err=await thConnect(key);
    btn.disabled=false; btn.textContent='Conectar';
    if(err){ thsMsg(err); return; }
    inp.value=''; toast('TaskHero conectado ✓');
  };
  document.getElementById('thsLogin').onclick=()=>{ closeSettings(); openAuthModal('login'); };
}

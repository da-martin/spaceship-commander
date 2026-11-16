/* Lo que tu juego comparte con la alianza: los hitos que el chat anuncia
 * (ascensos y misiones completadas) y el porcentaje de tu día. Nunca tareas ni
 * hábitos, ni cuántos son. Cada cosa tiene su interruptor en Ajustes. */
import { todayProgress } from '../core/day.js';
import { ally, postEvent, postProgress } from '../sync/alliance.js';
import { cloud } from '../sync/cloud.js';
import { state } from '../store.js';
import { todayStr } from '../util.js';

const OUTKEY='spaceship-commander:ally-out';
const OUT_MAX=20;
const myAlliance=()=>cloud.user&&ally.status==='ready'&&ally.data&&ally.data.alliance;

/* ---------- hitos ---------- */
// Los hitos esperan en una cola de este dispositivo: sin conexión no se pierden.
const readOut=()=>{ try{ const a=JSON.parse(localStorage.getItem(OUTKEY)||'[]'); return Array.isArray(a)?a:[]; }catch{ return []; } };
const writeOut=(a)=>{ try{ localStorage.setItem(OUTKEY,JSON.stringify(a.slice(-OUT_MAX))); }catch{} };
let flushing=false;

// ev: {kind:'rank', rank} | {kind:'mission', topic}
export function shareEvent(ev){
  if(!cloud.user||!state.settings.allyEvents) return;
  if(ally.status==='ready'&&!ally.data.alliance) return;   // sin alianza no hay a quién contárselo
  writeOut([...readOut(),{user:cloud.user.id,ev}]);
  flushEvents();
}
async function flushEvents(){
  if(flushing||!myAlliance()) return;
  flushing=true;
  try{
    for(;;){
      const me=cloud.user&&cloud.user.id, next=readOut().find(x=>x.user===me);
      if(!next) break;
      const res=await postEvent(next.ev);
      if(res.error==='network') break;                     // se reintenta al volver
      // Enviado, o el servidor no lo quiere (ya no hay alianza): en los dos casos sale de la cola.
      const rest=readOut(), i=rest.findIndex(x=>x.user===me&&JSON.stringify(x.ev)===JSON.stringify(next.ev));
      if(i>=0){ rest.splice(i,1); writeOut(rest); }
    }
  } finally { flushing=false; }
}

/* ---------- porcentaje del día ---------- */
// Lo que debería ver la alianza ahora mismo: null si no compartes.
function wanted(){
  if(!state.settings.allyProgress) return null;
  const {done,total}=todayProgress();
  // Hacia abajo: 100 % es solo con todo hecho. Sin nada programado no hay porcentaje.
  return {day:todayStr(),pct:total?Math.floor(done/total*100):null};
}
const same=(a,b)=>(!a&&!b)||(!!a&&!!b&&a.day===b.day&&a.pct===b.pct);
let sending=false, again=false, timer=null, onShown=()=>{};

async function syncProgress(){
  const a=myAlliance(); if(!a) return;
  const me=a.members.find(m=>m.id===cloud.user.id); if(!me) return;
  const want=wanted();
  if(same(me.progress,want)) return;
  if(sending){ again=true; return; }
  sending=true;
  const res=await postProgress(want||{day:null});
  sending=false;
  if(!res.error){ me.progress=want; onShown(); }
  if(again){ again=false; syncProgress(); }
}

// Tras cada guardado: se agrupan los toques seguidos en un solo envío.
export function scheduleShare(){ if(!cloud.user) return; clearTimeout(timer); timer=setTimeout(shareSync,2000); }
// Con la foto de la alianza recién cargada, o al volver la red.
export function shareSync(){ flushEvents(); syncProgress(); }
// alliance-view repinta el progreso cuando el tuyo se ha publicado.
export function onShareShown(fn){ onShown=fn; }

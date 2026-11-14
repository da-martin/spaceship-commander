/* Nube: sincronización de la partida con el Worker (rev optimista). */
import { dailyTick } from '../core/day.js';
import { BACKUPKEY, buildSave } from '../features/saves.js';
import { ical, ICAL_EMPTY, ICALKEY, loadCalEvents, paintCalendars, resetIcal } from '../integrations/calendars.js';
import { paintTh, thc, thInit } from '../integrations/taskhero.js';
import { KEY, normState, setState, state } from '../store.js';
import { closeAuthModal, openAuthModal, paintAccount } from './auth.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';

// Estado de la sesión en la nube. Se declara aquí porque save() lo consulta a
// través de schedulePush() y save() se llama desde todas partes.
// `hold`: hay un selector de partidas esperando respuesta. Mientras esté puesto
// no se sube nada, porque el estado local todavía no es una decisión.
export const cloud = {user:null, rev:0, timer:null, pending:false, busy:false, hold:false, status:'local'};
/* ---------- nube: cuenta y sincronización ---------- */
/* El servidor solo almacena. localStorage sigue siendo la fuente inmediata, así
   que sin cuenta o sin conexión la app se comporta exactamente como antes. */

export const CLOUDKEY='spaceship-commander:cloud';
export const api=(p,o={})=>fetch(p,{credentials:'same-origin',...o});
export const readLink=()=>{ try{ return JSON.parse(localStorage.getItem(CLOUDKEY)||'null'); }catch{ return null; } };
export const writeLink=()=>{ try{ localStorage.setItem(CLOUDKEY,JSON.stringify({user:cloud.user.id,rev:cloud.rev})); }catch{} };
export const stateEmpty=(st)=>!st.tasks.length&&!st.habits.length&&!st.wallet.mc&&!st.cmd.xp;
export const SYNCTEXT={local:'solo en este dispositivo',pending:'guardando…',saving:'guardando…',synced:'guardado en la nube',offline:'sin conexión — se reintenta solo'};

export function setSync(s){ cloud.status=s; paintAccount(); }

// save() nunca espera a la red: marca sucio y agrupa los envíos.
export function schedulePush(){
  if(!cloud.user) return;
  cloud.pending=true; setSync('pending');
  if(cloud.hold) return;               // se sube en cuanto se resuelva el selector
  clearTimeout(cloud.timer); cloud.timer=setTimeout(pushState,1500);
}

export async function pushState(){
  if(!cloud.user||!cloud.pending||cloud.busy||cloud.hold) return;
  cloud.busy=true; cloud.pending=false; setSync('saving');
  try{
    const r=await api('/api/state',{method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({rev:cloud.rev,data:buildSave()})});
    if(r.status===401){ cloud.user=null; setSync('local'); return; }
    // Ni aquí se adopta el rev del servidor: eso es lo que convertía el estado
    // local sin elegir en sucesor legítimo de la partida de la nube. Lo fija
    // adoptCloud() o keepLocal(), es decir, solo una elección.
    if(r.status===409){ const srv=await r.json(); if(!cloud.hold) askChoice(srv); return; }
    if(!r.ok) throw new Error('push '+r.status);
    cloud.rev=(await r.json()).rev; writeLink(); setSync('synced');
  }catch{
    cloud.pending=true; setSync('offline');   // se reintenta al volver la red o el foco
  }finally{ cloud.busy=false; }
}

export async function initCloud(){
  let me;
  try{ const r=await api('/api/me'); if(!r.ok) return; me=await r.json(); }
  catch{ return; }                       // abierto como archivo suelto: modo local
  cloud.user=me.user||null;
  cloud.online=true;                     // hay servidor detrás: se puede entrar
  paintAccount();
  if(cloud.user){ await hydrate(); loadCalEvents(); thInit(); }
}

export async function hydrate(){
  if(cloud.hold) return;                 // ya hay un selector esperando respuesta
  let srv;
  try{ const r=await api('/api/state'); if(!r.ok){ setSync('offline'); return; } srv=await r.json(); }
  catch{ setSync('offline'); return; }

  if(srv.rev===0){                       // cuenta nueva: sube lo de este dispositivo
    cloud.rev=0; cloud.pending=true; await pushState(); return;
  }
  const link=readLink(), linked=link&&link.user===cloud.user.id;

  if(linked&&link.rev===srv.rev){        // este dispositivo ya estaba al día
    cloud.rev=srv.rev;
    setSync(cloud.pending?'pending':'synced');
    if(cloud.pending) pushState();
    return;
  }
  if(linked||stateEmpty(state)) return adoptCloud(srv);  // otro dispositivo escribió después
  askChoice(srv);                        // primera vez aquí y ambas tienen progreso
}

// Mientras el selector espera respuesta, este dispositivo no sube nada y no
// toca cloud.rev. Adoptar el rev del servidor antes de elegir era el fallo:
// convertía la partida local sin elegir en sucesora legítima de la de la nube,
// y el primer save() de fondo —dailyTick() hace uno en cada focus— la
// sobrescribía sin que nadie hubiera decidido nada.
export function askChoice(srv){ cloud.hold=true; openAuthModal('choose',srv); }
// Toda elección levanta la retención y sube ya, sin esperar al rebote de save().
export function resolveChoice(){ cloud.hold=false; clearTimeout(cloud.timer); if(cloud.pending) pushState(); }

export function adoptCloud(srv){
  try{ localStorage.setItem(BACKUPKEY,JSON.stringify({at:Date.now(),data:state})); }catch{}
  setState(normState(srv.data.data));
  cloud.rev=srv.rev; writeLink();
  localStorage.setItem(KEY,JSON.stringify(state));
  cloud.hold=false;
  dailyTick(); render();                 // el tick va después de hidratar, no antes
  closeAuthModal(); cloud.pending?resolveChoice():setSync('synced');
}

export function keepLocal(srv){
  // La partida de la cuenta también se guarda antes de pisarla. El selector
  // promete poder deshacer la elección y hasta ahora solo cumplía en un
  // sentido: al quedarte con la local, la de la cuenta se sobrescribía en el
  // servidor sin dejar copia en ninguna parte.
  try{ localStorage.setItem(BACKUPKEY,JSON.stringify({at:Date.now(),data:srv.data.data})); }catch{}
  cloud.rev=srv.rev; cloud.pending=true; closeAuthModal(); resolveChoice();
}

export async function logout(){
  try{ await api('/api/auth/logout',{method:'POST'}); }catch{}
  localStorage.removeItem(CLOUDKEY);
  cloud.user=null; cloud.rev=0; cloud.pending=false; cloud.hold=false;
  resetIcal();
  // la cola de TaskHero se queda en este dispositivo y sale al volver a entrar con la misma cuenta
  thc.connected=false; clearTimeout(thc.timer);
  closeAuthModal(); setSync('local'); render(); paintCalendars(); paintTh(); toast('Sesión cerrada');
}

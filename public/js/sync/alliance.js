/* Alianza: lo que sabe el servidor de la tuya y las llamadas que la cambian.
 * No se guarda en la partida ni en localStorage: sin conexión no hay alianza. */
import { api, cloud } from './cloud.js';

// `status`: 'idle' sin pedir · 'loading' · 'ready' · 'error' (sin conexión).
// `data` es la foto de GET /api/alliance: {alliance, invites}.
export const ally = { status: 'idle', data: null, seq: 0 };

export function resetAlly(){ ally.status='idle'; ally.data=null; ally.seq++; }

const post=(path,body)=>api('/api/alliance'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});

// Lo que obliga a repintar la vista: quién está y quién está invitado. Los
// contadores de lectura y el progreso de cada uno cambian a menudo y se pintan en su sitio.
const shape=(d)=>JSON.stringify(d,(k,v)=>k==='unread'||k==='lastRead'||k==='progress'?undefined:v);

// Devuelve true si la foto cambió. Una respuesta que llega después de cerrar
// sesión (o de otra petición más nueva) se descarta.
function adopt(seq,data){
  if(seq!==ally.seq) return false;
  const changed=ally.status!=='ready'||shape(data)!==shape(ally.data);
  ally.status='ready'; ally.data=data;
  return changed;
}

export async function loadAlly(){
  if(!cloud.user){ resetAlly(); return true; }
  const seq=++ally.seq, first=!ally.data;
  if(first) ally.status='loading';
  try{
    const r=await api('/api/alliance');
    if(r.status===401){ resetAlly(); return true; }
    if(!r.ok) throw new Error('alliance '+r.status);
    return adopt(seq,await r.json());
  }catch{
    if(seq!==ally.seq) return false;
    // Con una foto ya cargada se sigue enseñando esa: mejor algo viejo que nada.
    if(first){ ally.status='error'; return true; }
    return false;
  }
}

// Una acción: {ok:true} y la foto nueva adoptada, o {ok:false, error}.
export async function allyAct(path,body){
  const seq=++ally.seq;
  try{
    const r=await post(path,body), res=await r.json().catch(()=>({}));
    if(!r.ok) return {ok:false,error:res.error||'network'};
    adopt(seq,res);
    return {ok:true};
  }catch{ return {ok:false,error:'network'}; }
}

export async function searchPlayers(q){
  try{
    const r=await api('/api/alliance/search?q='+encodeURIComponent(q)), res=await r.json().catch(()=>({}));
    if(!r.ok) return {error:res.error||'network'};
    return {results:res.results||[]};
  }catch{ return {error:'network'}; }
}

/* ---------- chat ---------- */

// Devuelven el JSON del servidor, o {error}. 'no_alliance': ya no estás dentro.
async function chatCall(path,opts){
  try{
    const r=await api('/api/alliance'+path,opts), res=await r.json().catch(()=>({}));
    return r.ok?res:{error:res.error||'network'};
  }catch{ return {error:'network'}; }
}
// `q`: '' los últimos · '?after=id' lo nuevo · '?before=id' anteriores.
export const fetchMessages=(q='')=>chatCall('/messages'+q);
export const sendMessage=(body)=>chatCall('/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body})});
export const markRead=(id)=>chatCall('/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});

/* ---------- lo que comparte tu juego ---------- */
const jsonPost=(body)=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
// {day, pct} publica el porcentaje de tu día; {day:null} deja de compartirlo.
export const postProgress=(p)=>chatCall('/progress',jsonPost({day:p.day,pct:p.pct??null}));
// {kind:'rank', rank} | {kind:'mission', topic}: hitos que anuncia el chat.
export const postEvent=(ev)=>chatCall('/event',jsonPost(ev));

/* Alianza: lo que sabe el servidor de la tuya y las llamadas que la cambian.
 * No se guarda en la partida ni en localStorage: sin conexión no hay alianza. */
import { api, cloud } from './cloud.js';

// `status`: 'idle' sin pedir · 'loading' · 'ready' · 'error' (sin conexión).
// `data` es la foto de GET /api/alliance: {alliance, invites}.
export const ally = { status: 'idle', data: null, seq: 0 };

export function resetAlly(){ ally.status='idle'; ally.data=null; ally.seq++; }

const post=(path,body)=>api('/api/alliance'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});

// Devuelve true si la foto cambió. Una respuesta que llega después de cerrar
// sesión (o de otra petición más nueva) se descarta.
function adopt(seq,data){
  if(seq!==ally.seq) return false;
  const changed=ally.status!=='ready'||JSON.stringify(data)!==JSON.stringify(ally.data);
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

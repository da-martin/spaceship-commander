/* Rutas por etapas (docs/plan-misiones-rutas.md, fase D1): la misión sin plazo se
 * divide en tramos. Al acabar cada uno, menos el último, hay un punto de ruta con
 * cartas para elegir el siguiente. `quota` es siempre la suma de los tramos. */
import { LEG_CARDS, LEG_KINDS, LEG_MATS, LEG_REPAIR, LEGS, MATS, MODS } from '../config.js';
import { logShip } from './log.js';
import { state } from '../store.js';
import { pick, todayStr } from '../util.js';

const half=(v)=>Math.max(1,Math.round(v*2)/2);   // medio punto, mínimo 1
export const legLen=(base,kind)=>half(base*(LEG_KINDS[kind]?.mult??1));

// La ruta de un contrato recién aceptado: tramos iguales, el primero directo y los demás sin elegir.
export function newRoute(c){
  const n=LEGS[c.size]; if(!n||c.story) return null;
  const base=c.quota/n;
  return {legs:Array.from({length:n},(_,i)=>({kind:i?null:'direct',base,len:half(base),done:false})),at:0,pick:null};
}
export const routeTotal=(r)=>Math.round(r.legs.reduce((a,l)=>a+l.len,0)*2)/2;
// Dónde acaba el tramo i, en puntos de la misión
export const legEnd=(r,i)=>r.legs.slice(0,i+1).reduce((a,l)=>a+l.len,0);

// Cartas de un punto de ruta: Directo siempre, y el resto sorteado sin repetir.
export function legCards(){
  const rest=Object.keys(LEG_KINDS).filter(k=>k!=='direct'), out=['direct'];
  while(out.length<LEG_CARDS&&rest.length) out.push(rest.splice(Math.floor(Math.random()*rest.length),1)[0]);
  return out;
}

// Lo que da un tramo al completarse (una sola vez: `done` no se deshace).
function legDone(c,l,i){
  const n=c.route.legs.length, lines=[];
  if(l.kind==='mine'){
    for(let k=0;k<LEG_MATS;k++){ const m=pick(MATS); c.reward.mats[m]=(c.reward.mats[m]||0)+1; }
    lines.push(`Yacimiento: +${LEG_MATS} materiales a la recompensa.`);
  }
  if(l.kind==='station'){
    const mods=state.ship.modules, hurt=Object.keys(MODS).filter(k=>mods[k].lv>0&&mods[k].cond<100);
    if(hurt.length){ const k=hurt.reduce((a,b)=>mods[b].cond<mods[a].cond?b:a), before=mods[k].cond; mods[k].cond=Math.min(100,before+LEG_REPAIR); lines.push(`Estación: ${MODS[k].name} +${mods[k].cond-before} %.`); }
    if(c.shield){ c.shield.readyOn=todayStr(); lines.push('Estación: el escudo vuelve a estar listo.'); }
  }
  logShip({kind:'mission',tone:'info',title:`Tramo ${i+1} de ${n} completado`,lines:[...lines,...(i+1<n?['Elige el siguiente tramo en el panel de la misión.']:[])]});
}

// Después de sumar a la misión: marca los tramos terminados y prepara las cartas del
// punto de ruta. Si se termina un tramo sin elegir, cuenta como Directo.
export function checkLegs(c){
  const r=c?.route; if(!r) return;
  while(r.at<r.legs.length-1&&c.progress>=legEnd(r,r.at)){
    const l=r.legs[r.at];
    if(!l.kind){ l.kind='direct'; r.pick=null; }
    if(!l.done){ l.done=true; legDone(c,l,r.at); }
    r.at++;
    if(!r.legs[r.at].kind) r.pick=legCards();
  }
}

// Elegir el tramo en curso entre las cartas. Cambia su distancia y la total.
export function pickLeg(kind){
  const c=state.ship.contract, r=c?.route;
  if(!r?.pick||!r.pick.includes(kind)) return false;
  const l=r.legs[r.at];
  l.kind=kind; l.len=legLen(l.base,kind); r.pick=null;
  c.quota=routeTotal(r);
  if(kind==='short'&&c.shield) c.heavy=true;   // el atajo pasa cerca de la amenaza
  checkLegs(c);
  return true;
}
export const legName=(k)=>LEG_KINDS[k]?.name||'Sin elegir';

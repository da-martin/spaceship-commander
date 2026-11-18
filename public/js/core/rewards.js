/* Economía de Commander: méritos y rango, monedero, y lo que paga o devuelve
 * completar tareas y marcar hábitos. */
import { AREA_RES, EF_MC, effOf, FREE_MC, MODS, payRound, RANKS, RES, ROLES, WAGE_CUT, WEAR_NEG, XP_BONUS } from '../config.js';
import { emit } from './events.js';
import { eff, mod, onComplete, onUndo, wear } from './ship.js';
import { state } from '../store.js';
import { dayParse, todayStr } from '../util.js';

/* ---------- rango y ventajas de la tripulación ---------- */
export const rankIdx=(xp=state.cmd.xp)=>{ let i=0; while(i+1<RANKS.length&&xp>=RANKS[i+1][1]) i++; return i; };
// Devuelve lo que realmente sumó (el Observatorio lo infla): onComplete guarda
// ese valor en g.xp y onUndo resta exactamente eso, sin deriva al desmarcar.
export function addXP(n){
  if(!n) return 0;
  n=Math.round(n*(1+XP_BONUS*eff('spirit')));
  const before=rankIdx(); state.cmd.xp+=n; const after=rankIdx();
  // Un ascenso no es noticia de la nave: es del comandante, y sale donde esté.
  if(after>before) emit('rankUp',after);
  return n;
}
export const subXP=(n)=>{ if(n) state.cmd.xp=Math.max(0,state.cmd.xp-n); };
export const crewActive=()=>{ const t=todayStr(); return state.ship.crew.filter(m=>!m.idle&&m.until>=t); };   // a bordo sin contrato no da bono
// ventaja de una especialidad: la del mejor tripulante a bordo con ese rol (0 si no hay)
export const perk=(role)=>crewActive().reduce((a,m)=>m.role===role?Math.max(a,ROLES[role].eff[m.lv-1]):a,0);
// Salón: el sueldo se guarda en bruto y se rebaja al cobrarlo, así subir el
// módulo abarata también a quien ya está a bordo.
export const wageOf=(base)=>Math.max(1,Math.round(base*(1-WAGE_CUT*eff('social'))));

/* ---------- economía ---------- */
export const addW=(k,n)=>{ state.wallet[k]+=n; };
export const subW=(k,n)=>{ state.wallet[k]=Math.max(0,state.wallet[k]-n); };
export const pickAreaRes=(x)=> (!x.areas||!x.areas.length)?null:AREA_RES[x.areas[Math.floor(Math.random()*x.areas.length)]];
// La recompensa se anuncia donde ocurrió, también fuera de la nave: era lo que
// más se jugaba y lo único que no se veía desde donde se juega.
export const gainText=(g)=> `+${g.mc} ¢${g.res?`  +${1+(g.bonus||0)} ${RES[g.res].sym} ${RES[g.res].name}`:''}`;
// Todo se calcula con los puntos de esfuerzo y se guarda en g.ef: al desmarcar
// se resta lo que se dio, aunque después haya cambiado la dificultad.
// También sirve para las acciones rápidas del Focus (tarea fácil, sin área).
export function grantTask(x,day=todayStr()){
  const ef=effOf(x), g={mc:payRound(EF_MC*ef*(1+perk('quarter')),ef),res:pickAreaRes(x),ef};
  addW('mc',g.mc); if(g.res) addW(g.res,1);
  x.grant=g; x.doneOn=day; onComplete(x,g,day); emit('track',x,'task','+',day,ef); return g;
}
export function revokeTask(x){
  emit('track',x,'task','-',x.doneOn||todayStr());
  delete x.doneOn;
  if(!x.grant) return;
  subW('mc',x.grant.mc); if(x.grant.res) subW(x.grant.res,1);
  onUndo(x.grant); delete x.grant;
}
export function checkHabit(h,k){
  const ef=effOf(h), g={mc:payRound((EF_MC+perk('instructor'))*ef,ef),res:pickAreaRes(h),ef};
  addW('mc',g.mc); if(g.res) addW(g.res,1);
  h.g=h.g||{}; h.g[k]=g; onComplete(h,g,k); emit('track',h,'habit','+',k,ef); return g;
}
export function uncheckHabit(h,k){
  if(h.g?.[k]){ emit('track',h,'habit','-',k); subW('mc',h.g[k].mc); if(h.g[k].res) subW(h.g[k].res,1); onUndo(h.g[k]); delete h.g[k]; }
}
// El primer toque del día fija lo que vale cada toque ese día (g.tap), para que
// −1 reste lo mismo aunque la dificultad cambie a media jornada.
export function freeTap(h,k){ const p=h.g?.[k]; if(p?.tap!==undefined) return p.tap; if(p) return FREE_MC; const ef=effOf(h); return payRound(FREE_MC*ef,ef); }
export function tapFree(h,k){
  const first=(h.log?.[k]||0)===0;
  const g={mc:freeTap(h,k),res:null};
  addW('mc',g.mc);
  // solo el primer registro del día cuenta como actividad (material, contrato, reparación, méritos)
  if(first){ g.res=pickAreaRes(h); if(g.res) addW(g.res,1); g.ef=effOf(h); g.tap=g.mc; h.g=h.g||{}; h.g[k]=g; onComplete(h,g,k); }
  h.log=h.log||{}; h.log[k]=(h.log[k]||0)+1;
  if(h.g?.[k]) h.g[k].at=Date.now();   // último toque: la mecha de la fila marca cuándo se sincroniza
  emit('track',h,'habit','+',k,first?effOf(h):0);   // con pareja, cada toque es una repetición allí
  return g;
}
// Hábito negativo: cada toque daña un módulo y no da nada. Se guarda qué
// módulo y cuánto dañó cada toque (h.g[k].hits) para que −1 lo devuelva exacto.
export function tapNeg(h,k){
  const hit=wear(h,WEAR_NEG*effOf(h));
  h.log=h.log||{}; h.log[k]=(h.log[k]||0)+1;
  h.g=h.g||{}; const g=h.g[k]=h.g[k]||{hits:[]}; (g.hits=g.hits||[]).push(hit);
  return hit;
}
export function untapNeg(h,k){
  h.log=h.log||{}; if(!(h.log[k]>0)) return;
  h.log[k]--;
  const hit=h.g?.[k]?.hits?.pop();
  if(hit&&mod(hit.k)) mod(hit.k).cond=Math.min(100,mod(hit.k).cond+hit.n);
  if(h.log[k]===0){ delete h.log[k]; if(h.g) delete h.g[k]; }
}
export const negText=(hit)=>hit?`−${hit.n} % ${MODS[hit.k].name}`:'Caída anotada';
// Días seguidos sin caer, contando hoy si aún no ha caído.
export function cleanDays(h){
  const t=todayStr(); let last=null;
  for(const [d,n] of Object.entries(h.log||{})) if(n>0&&d<=t&&(!last||d>last)) last=d;
  const from=last||todayStr(new Date(h.createdAt||Date.now()));
  return Math.max(0,Math.round((dayParse(t)-dayParse(from))/864e5)+(last?0:1));   // sin caídas, el día de alta también cuenta
}
export function untapFree(h,k){
  h.log=h.log||{}; if(h.log[k]>0) emit('track',h,'habit','-',k);
  h.log[k]=Math.max(0,(h.log[k]||0)-1);
  subW('mc',freeTap(h,k));
  if(h.log[k]>0&&h.g?.[k]) h.g[k].at=Date.now();
  if(h.log[k]===0&&h.g?.[k]){ if(h.g[k].res) subW(h.g[k].res,1); onUndo(h.g[k]); delete h.g[k]; }
}

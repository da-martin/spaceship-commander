/* Tripulación: candidatos, contratos semanales, sueldos, experiencia y ascensos. */
import { CANDS_N, CREW_DAYS, CREW_FIRST, CREW_LAST, CREW_LV, CREW_XP_DAY, CREW_XP_RUN, RANKS, ROLES } from '../config.js';
import { logShip } from './log.js';
import { rankIdx, subW, wageOf } from './rewards.js';
import { berths, berthsUsable, mod } from './ship.js';
import { fmtCost, modCost } from './shipyard.js';
import { state } from '../store.js';
import { addDays, pick, uid } from '../util.js';

export function genCandidates(){
  const roles=Object.keys(ROLES).sort(()=>Math.random()-0.5).slice(0,CANDS_N);
  // ni nombres ni apellidos repetidos con la tripulación a bordo ni entre candidatos
  const used=(state.ship.crew||[]).map(m=>String(m.name||'').split(' ')), usedF=new Set(used.map(n=>n[0])), usedL=new Set(used.map(n=>n.slice(1).join(' ')));
  const fresh=(a,u)=>{ const f=a.filter(x=>!u.has(x)), v=pick(f.length?f:a); u.add(v); return v; };
  return roles.map(role=>{ const r=Math.random(); return {id:uid(),name:fresh(CREW_FIRST,usedF)+' '+fresh(CREW_LAST,usedL),role,lv:r<0.5?1:r<0.85?2:3}; });
}
// por qué no se puede contratar a un candidato (null si se puede)
export function hireBlock(x){
  const L=CREW_LV[x.lv-1];
  if(rankIdx()<L.rank) return 'Requiere rango '+RANKS[L.rank][0];
  if(state.ship.crew.length>=berths()) return 'Sin litera libre';
  if(state.ship.crew.length>=berthsUsable()) return 'Camarotes dañados · repáralos';
  if(state.wallet.mc<wageOf(L.wage)) return 'Recursos insuficientes';
  return null;
}

/* ---------- experiencia y ascensos ---------- */
// La experiencia es la acumulada desde que entró de aprendiz: al contratar a
// alguien de más nivel empieza con la de su nivel. Se gana solo a bordo y con
// contrato, y nunca asciende sola: el comandante decide si paga el ascenso.
export const nextLv=(m)=>CREW_LV[m.lv]||null;
export const xpReady=(m)=>!m.idle&&!!nextLv(m)&&m.xp>=nextLv(m).xp;
// por qué no se puede ascender (null si se puede); cuesta lo mismo que el sueldo nuevo
export function promoteBlock(m){
  const L=nextLv(m);
  if(!L) return 'Nivel máximo';
  if(m.idle) return 'Sin contrato';
  if(m.xp<L.xp) return `Faltan ${L.xp-m.xp} XP`;
  if(rankIdx()<L.rank) return 'Requiere rango '+RANKS[L.rank][0];
  if(state.wallet.mc<wageOf(L.wage)) return 'Recursos insuficientes';
  return null;
}
// Suma `n` XP a quien siga con contrato y avisa en la bitácora de quien acaba
// de poder ascender. Devuelve a quién se le ha sumado.
export function gainCrewXp(members,n){
  const got=[], ready=[];
  for(const m of members){
    if(m.idle||n<=0) continue;
    const was=xpReady(m); m.xp+=n; got.push(m);
    if(!was&&xpReady(m)) ready.push(m);
  }
  if(ready.length) logShip({kind:'crew',tone:'win',title:ready.length>1?'Tripulantes listos para ascender':'Tripulante listo para ascender',
    lines:ready.map(m=>`${m.name} puede ascender a ${nextLv(m).name.toLowerCase()} · ascenso y sueldo: ${wageOf(nextLv(m).wage)} ¢`)});
  return got;
}
// Días de misión: cada 24 h desde que zarpó suman CREW_XP_DAY. Al terminar
// (`end`) cuenta también el día empezado, sin pasar de los días del plazo.
// c.xpDays lleva los ya pagados, para no darlos dos veces.
export function missionCrewXp(c,end=false){
  if(!c||!Number.isFinite(+c.acceptedAt)) return [];
  const ms=Math.max(0,Math.min(Date.now(),+c.endsAt||Infinity)-c.acceptedAt)/864e5;
  const days=Math.min(+c.days||Infinity,end?Math.max(1,Math.ceil(ms-1e-9)):Math.floor(ms+1e-9));
  const done=Number.isFinite(+c.xpDays)?+c.xpDays:0;
  if(days<=done) return [];
  c.xpDays=days;
  return gainCrewXp(state.ship.crew,(days-done)*CREW_XP_DAY);
}
// Simulación de VR Training terminada: XP para los del escuadrón que sigan a
// bordo. Los holoperfiles de tripulación llevan el id del tripulante tras «c-».
export function trainCrewXp(squadIds){
  const ids=new Set(squadIds);
  return gainCrewXp(state.ship.crew.filter(m=>ids.has('c-'+String(m.id).slice(0,60))),CREW_XP_RUN);
}
// La tripulación se abre al mejorar el Puente. La segunda condición es una red
// de seguridad: crewPayroll() corre desde dailyTick sin depender de la interfaz,
// así que quien ya tenga gente nunca debe quedarse sin panel donde verla.
export const crewUnlocked=()=>mod('bridge').lv>=1||state.ship.crew.length>0;
export const crewHint=()=>`Mejora el Puente a nivel 1 para contratar tripulación · ${fmtCost(modCost('bridge'))}`;
// cobra cada semana vencida mientras haya saldo; si el contrato termina (cancelado o sin ¢),
// el tripulante se va, salvo en misión: entonces sigue a bordo sin bono hasta volver
export function crewPayroll(t){
  const sh=state.ship, notes=[]; let paid=0;
  for(const m of sh.crew){
    if(m.idle) continue;
    while(m.until<t){
      const due=wageOf(m.wage);
      if(!m.cancel&&state.wallet.mc>=due){ subW('mc',due); paid+=due; m.until=addDays(m.until,CREW_DAYS); continue; }
      const why=m.cancel?'termina su contrato':'no había ¢ para su sueldo';
      if(sh.contract){ m.idle=true; notes.push(`${m.name}: ${why}; sigue a bordo sin contrato hasta volver`); }
      else { m.gone=true; notes.push(m.cancel?`${m.name} termina su contrato y se marcha`:`${m.name} se marcha: no había ¢ para su sueldo`); }
      break;
    }
  }
  sh.crew=sh.crew.filter(m=>!m.gone);
  return (paid||notes.length)?{paid,notes,left:notes.length>0}:null;
}
// al volver al Sistema Madre desembarcan los que siguen a bordo sin contrato
// (las noticias del tablón que esperaban a la vuelta las da quien llama)
export function returnHome(){
  const sh=state.ship, off=sh.crew.filter(m=>m.idle);
  if(!off.length) return null;
  sh.crew=sh.crew.filter(m=>!m.idle);
  return `${off.map(m=>m.name).join(', ')} ${off.length>1?'desembarcan':'desembarca'} en el Sistema Madre`;
}

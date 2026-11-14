/* Tripulación: candidatos, contratos semanales y sueldos. */
import { BERTHS, CANDS_N, CREW_DAYS, CREW_FIRST, CREW_LAST, CREW_LV, RANKS, ROLES } from '../config.js';
import { atHome } from './missions.js';
import { rankIdx, subW, wageOf } from './rewards.js';
import { mod } from './ship.js';
import { fmtCost, modCost } from './shipyard.js';
import { fDate } from '../features/focus.js';
import { save, state } from '../store.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';
import { addDays, pick, todayStr, uid } from '../util.js';

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
  if(state.ship.crew.length>=BERTHS) return 'Sin litera libre';
  if(state.wallet.mc<wageOf(L.wage)) return 'Recursos insuficientes';
  return null;
}
// La tripulación se abre al mejorar el Puente. La segunda condición es una red
// de seguridad: crewPayroll() corre desde dailyTick sin depender de la interfaz,
// así que quien ya tenga gente nunca debe quedarse sin panel donde verla.
export const crewUnlocked=()=>mod('bridge').lv>=1||state.ship.crew.length>0;
export const crewHint=()=>`Mejora el Puente a nivel 1 para contratar tripulación · ${fmtCost(modCost('bridge'))}`;
export function hireCrew(id){
  if(!atHome()||!crewUnlocked()) return;
  const sh=state.ship, x=sh.crewBoard.cands.find(c=>c.id===id); if(!x) return;
  const why=hireBlock(x); if(why){ toast(why); return; }
  const wage=CREW_LV[x.lv-1].wage, paid=wageOf(wage);
  subW('mc',paid);
  sh.crew.push({id:x.id,name:x.name,role:x.role,lv:x.lv,wage,until:addDays(todayStr(),CREW_DAYS-1),cancel:false,idle:false});
  sh.crewBoard.cands=sh.crewBoard.cands.filter(c=>c.id!==id);
  state.cmd.stats.hires++;
  save(); render(); toast(`${x.name} se une a la tripulación · −${paid} ¢/sem, se renueva solo`);
}
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
export function toggleCancel(id){
  const m=state.ship.crew.find(c=>c.id===id); if(!m||m.idle) return;
  m.cancel=!m.cancel;
  save(); render(); toast(m.cancel?`${m.name} trabajará hasta el ${fDate(m.until)} y se marchará`:`Contrato de ${m.name} mantenido · se renueva solo`);
}
export function rehireCrew(id){
  const m=state.ship.crew.find(c=>c.id===id); if(!m||!m.idle) return;
  const due=wageOf(m.wage);
  if(state.wallet.mc<due){ toast('Recursos insuficientes'); return; }
  subW('mc',due); Object.assign(m,{until:addDays(todayStr(),CREW_DAYS-1),idle:false,cancel:false});
  save(); render(); toast(`${m.name} vuelve a contrato · −${due} ¢`);
}
export let crewReleasing=null;   // primer toque de «Despedir ya» pide confirmación
export function releaseCrew(id){
  if(!atHome()) return;
  if(crewReleasing!==id){ crewReleasing=id; render(); return; }
  const m=state.ship.crew.find(c=>c.id===id); crewReleasing=null; if(!m) return;
  state.ship.crew=state.ship.crew.filter(c=>c.id!==id);
  save(); render(); toast(`${m.name} deja la nave`);
}

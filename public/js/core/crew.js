/* Tripulación: candidatos, contratos semanales, sueldos, experiencia y ascensos. */
import { CANDS_N, CREW_DAYS, CREW_FIRST, CREW_LAST, CREW_LV, CREW_XP_DAY, CREW_XP_RUN, RANKS, ROLES } from '../config.js';
import { spend } from './books.js';
import { logShip } from './log.js';
import { rankIdx, subW, wageOf } from './rewards.js';
import { berths, berthsUsable, here, herePrep, mod } from './ship.js';
import { fmtCost, modCost } from './shipyard.js';
import { state } from '../store.js';
import { addDays, dayParse, pick, todayStr, uid } from '../util.js';

export function genCandidates(){
  const roles=here().roles.filter(r=>ROLES[r]).sort(()=>Math.random()-0.5).slice(0,CANDS_N);   // los roles de este sistema
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
// trabaja quien tiene el sueldo al día: ni sin contrato (idle) ni con deuda (owed)
export const working=(m)=>!m.idle&&!m.owed;
export const xpReady=(m)=>working(m)&&!!nextLv(m)&&m.xp>=nextLv(m).xp;
// por qué no se puede ascender (null si se puede); cuesta lo mismo que el sueldo nuevo
export function promoteBlock(m){
  const L=nextLv(m);
  if(!L) return 'Nivel máximo';
  if(m.owed) return 'Sueldo pendiente';
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
    if(!working(m)||n<=0) continue;
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
// Los holoperfiles de VR Training llevan el id del tripulante tras «c-».
export const profileId=(m)=>'c-'+String(m.id).slice(0,60);
// Simulación de VR Training terminada: XP para los del escuadrón que sigan a bordo.
export function trainCrewXp(squadIds){
  const ids=new Set(squadIds);
  return gainCrewXp(state.ship.crew.filter(m=>ids.has(profileId(m))),CREW_XP_RUN);
}
// La tripulación se abre al mejorar el Puente. La segunda condición es una red
// de seguridad: crewPayroll() corre desde dailyTick sin depender de la interfaz,
// así que quien ya tenga gente nunca debe quedarse sin panel donde verla.
export const crewUnlocked=()=>mod('bridge').lv>=1||state.ship.crew.length>0;
export const crewHint=()=>`Mejora el Puente a nivel 1 para contratar tripulación · ${fmtCost(modCost('bridge'))}`;
// Sueldo pendiente: quien no cobró se queda en su litera sin trabajar (sin
// bono ni experiencia) y cada día a bordo desde el último pagado suma a su
// deuda la parte diaria del sueldo. m.until sigue siendo el último día pagado.
export const dayWage=(m)=>Math.ceil(wageOf(m.wage)/CREW_DAYS-1e-9);
export const debtDays=(m,t=todayStr())=>m.owed?Math.max(1,Math.round((dayParse(t)-dayParse(m.until))/864e5)):0;
export const debtOf=(m,t=todayStr())=>debtDays(m,t)*dayWage(m);
// Pagar la deuda (que cuenta hasta hoy) y, de una vez, el sueldo de la semana
// siguiente: vuelve al trabajo con el contrato renovado. Devuelve lo pagado, o
// null si no alcanza.
export const settleOf=(m,t=todayStr())=>debtOf(m,t)+wageOf(m.wage);
export function payDebt(m,t=todayStr()){
  const due=settleOf(m,t);
  if(!m.owed||state.wallet.mc<due) return null;
  subW('mc',due); spend(due,'debt',t); Object.assign(m,{owed:false,cancel:false,until:addDays(t,CREW_DAYS)});
  return due;
}
// Cobra cada semana vencida mientras haya saldo. Si no alcanza, el tripulante
// no se va: queda con sueldo pendiente hasta que se le pague o se le despida.
// Si el contrato estaba cancelado se marcha, salvo en misión: entonces sigue
// a bordo sin contrato (ni deuda) hasta volver.
export function crewPayroll(t){
  const sh=state.ship, notes=[]; let paid=0;
  for(const m of sh.crew){
    if(m.idle||m.owed) continue;
    while(m.until<t){
      const due=wageOf(m.wage);
      if(!m.cancel&&state.wallet.mc>=due){ subW('mc',due); spend(due,'wages',t); paid+=due; m.until=addDays(m.until,CREW_DAYS); continue; }
      if(!m.cancel){ m.owed=true; notes.push(`${m.name} no ha cobrado: deja de trabajar y su deuda sube ${dayWage(m)} ¢ al día hasta que le pagues o le despidas`); }
      else if(sh.contract){ m.idle=true; notes.push(`${m.name} termina su contrato; sigue a bordo sin contrato hasta volver`); }
      else { m.gone=true; notes.push(`${m.name} termina su contrato y se marcha`); }
      break;
    }
  }
  sh.crew=sh.crew.filter(m=>!m.gone);
  return (paid||notes.length)?{paid,notes,left:notes.length>0}:null;
}
/* ---------- aviso de impago ---------- */
// Repite crewPayroll los próximos `days` días, de mañana en adelante: mismo
// orden y sueldo entero o nada. Los sueldos se cobran al empezar el día, con el
// saldo que dejó el anterior; `income(día)` es lo que se prevé ganar ese día.
// Sin previsión vale 0: el peor caso, solo con el saldo de ahora (lo que se
// gane hoy queda de margen). Quien no cobra deja de cobrar en la simulación,
// como en el juego, y los demás siguen con el saldo que queda.
// Un cobro por tripulante y día: {day,id,name,due,bal,ok,short,inc,tight,rely}.
// inc: cuánto de `bal` son entradas previstas. tight (justo): cobra contando con
// ellas, pero con el saldo de ahora solo no; rely es lo que necesita de ellas.
export function payForecast(days=CREW_DAYS,income=()=>0,t=todayStr()){
  let bal=state.wallet.mc, inc=0; const out=[];
  const crew=state.ship.crew.filter(m=>working(m)&&!m.cancel).map(m=>({m,until:m.until,out:false}));
  for(let i=1;i<=days;i++){
    const day=addDays(t,i);
    for(const c of crew){
      while(!c.out&&c.until<day){
        const due=wageOf(c.m.wage), ok=bal>=due, tight=ok&&bal-inc<due;
        out.push({day,id:c.m.id,name:c.m.name,due,bal,ok,short:ok?0:due-bal,inc,tight,rely:tight?due-(bal-inc):0});
        if(ok){ bal-=due; c.until=addDays(c.until,CREW_DAYS); } else c.out=true;
      }
    }
    const n=Math.max(0,Math.round(income(day)||0)); bal+=n; inc+=n;
  }
  return out;
}
// Lo que hay que cobrar en esos días si todos cobrasen, para decir cuánto falta en total.
export const payDue=(days=CREW_DAYS,t=todayStr())=>state.ship.crew.filter(m=>working(m)&&!m.cancel)
  .reduce((a,m)=>{ let n=0; for(let u=m.until;u<addDays(t,days);u=addDays(u,CREW_DAYS)) n++; return a+n*wageOf(m.wage); },0);

// Al volver al sistema desembarcan los que siguen a bordo sin contrato y
// los que tienen sueldo pendiente y se despidieron durante la misión (sin cobrar).
// Las noticias del tablón que esperaban a la vuelta las da quien llama.
export function returnHome(){
  const sh=state.ship, leaves=(m)=>m.idle||(m.owed&&m.cancel), off=sh.crew.filter(leaves);
  if(!off.length) return null;
  sh.crew=sh.crew.filter(m=>!leaves(m));
  return `${off.map(m=>m.name).join(', ')} ${off.length>1?'desembarcan':'desembarca'} ${herePrep('en')}`;
}

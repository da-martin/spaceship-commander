/* El salto de un sistema a otro (docs/plan-viajes.md, fase 3).
 *
 * Es un contrato `kind: 'jump'` sin cuota que dura los días de salto. Al zarpar
 * se cancela la misión en curso (cobrando la parte hecha y sin dañar la
 * reputación) y se vacía el tablón; cada 24 h llega un fragmento a la bitácora
 * y, al cumplirse el plazo, la nave llega: cambia de sistema y la señal arranca
 * con una transmisión al momento. Durante el salto no hay tablón, mercado ni
 * astillero (docked() es falso) y no se puede abandonar.
 *
 * Nadie llega aquí mientras TRAVEL_ON sea false: lo lanzará la votación (fase 4). */
import { missionCrewXp, returnHome } from './crew.js';
import { emit } from './events.js';
import { logShip } from './log.js';
import { finishContract } from './missions.js';
import { state } from '../store.js';
import { HOME, SYSTEMS, canJump, jumpDays, sysOf, sysPrep } from '../systems.js';
import { fmtEf, todayStr, uid } from '../util.js';

export const isJump=(c)=>c?.kind==='jump';
export const jumping=()=>isJump(state.ship.contract);
// Fragmento del día `i` (desde 0): el del destino o, si no tiene, el del regreso al Sistema Madre.
export function jumpFragment(c,i){
  const t=sysOf(c.to).travel, home=SYSTEMS[HOME].travel;
  return t[i]||home[i%home.length]||null;
}
const jumpTitle=(c)=>'Salto '+sysPrep(sysOf(c.to),'a');

// Zarpa hacia `to`. Devuelve el contrato de salto, o null si no se puede
// (sistema desconocido, ya estás allí, ya estás saltando o no hay ruta: entre
// dos sistemas que no son el Sistema Madre hay que pasar por él). No guarda.
export function startJump(to,now=new Date()){
  const sh=state.ship, c=sh.contract;
  if(!canJump(sh.system,to)||isJump(c)) return null;
  const lines=[];
  let rew=null;
  if(c){
    // la misión en curso se cancela sin penalización: se cobra la parte hecha, como al expirar
    rew=finishContract(c.quota>0?Math.min(1,c.progress/c.quota):0);
    lines.push(`Misión ${c.topic} cancelada con ${fmtEf(c.progress)}/${c.quota}: cobras la parte hecha, sin daño a la reputación.`);
  }
  const b=sh.board;
  b.offers=[]; b.signal=0; b.sigAt=null; b.news={got:0,lost:0};
  const days=jumpDays(sh.system,to), end=new Date(now); end.setDate(end.getDate()+days);
  const j={id:uid(),kind:'jump',from:sh.system,to,topic:'Salto',flavor:jumpTitle({to}),days,quota:0,progress:0,
    reward:{mc:0},diff:'normal',urgent:false,acceptedOn:todayStr(now),acceptedAt:now.getTime(),endsOn:todayStr(end),endsAt:end.getTime(),told:0};
  sh.contract=j;
  tellJump(now,{rew:rew&&(rew.mc||Object.keys(rew.mats).length)?rew:null,lines});
  return j;
}

// Los fragmentos que tocan: el primero al zarpar (informe grande) y uno cada 24 h.
// `told` cuenta los ya contados, así que varios días sin abrir no repiten ni saltan ninguno.
export function tellJump(now=new Date(),first={}){
  const c=state.ship.contract; if(!isJump(c)) return;
  const due=Math.min(c.days,Math.floor(Math.max(0,now.getTime()-c.acceptedAt)/864e5)+1);
  for(;c.told<due;c.told++){
    const i=c.told, story=jumpFragment(c,i);
    if(i===0) logShip({kind:'travel',big:true,tone:'warn',title:jumpTitle(c),story,rew:first.rew||null,
      lines:[...(first.lines||[]),`Llegada en ${c.days===1?'1 día':c.days+' días'}. Durante el salto no hay tablón, mercado ni astillero.`]});
    else logShip({kind:'travel',title:`${jumpTitle(c)} · día ${i+1} de ${c.days}`,story});
  }
}

// Llega al destino si se ha cumplido el plazo. Devuelve true si llegó. No guarda.
export function arrive(now=Date.now()){
  const sh=state.ship, c=sh.contract;
  if(!isJump(c)||now<c.endsAt) return false;
  tellJump(new Date(c.endsAt-1));   // los fragmentos que faltaran, por si la app estuvo cerrada
  missionCrewXp(c,true);
  sh.contract=null;
  sh.system=Object.hasOwn(SYSTEMS,c.to)?c.to:HOME;
  const sys=sysOf(sh.system), b=sh.board;
  b.offers=[]; b.signal=0; b.sigAt=null;   // tickBoard da la primera transmisión al momento
  logShip({kind:'travel',big:true,tone:'win',title:'Llegada '+sysPrep(sys,'a'),quote:sys.quote||null,story:sys.intro||null,
    lines:[returnHome()].filter(Boolean)});
  emit('jumpArrived',c);
  return true;
}

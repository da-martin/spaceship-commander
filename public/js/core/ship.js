/* Nave: nivel efectivo de los módulos, desgaste y reparación, esfuerzo del día. */
import { AREA_MOD, BERTHS, BOARD_BASE, DIFFS, EF_XP, hasDeadline, HEAL, isAway, MODS, payRound, RES, SELFHEAL, SIGNAL_DAY, SIGNAL_LV, XP_CONTRACT } from '../config.js';
import { returnHome } from './crew.js';
import { emit } from './events.js';
import { logShip } from './log.js';
import { finishContract, logBoardNews, missionStory } from './missions.js';
import { addW, addXP, perk, subW, subXP } from './rewards.js';
import { state } from '../store.js';
import { sysOf, sysPrep } from '../systems.js';
import { dayParse, efRound, plural, todayStr } from '../util.js';

export const mod=(k)=>state.ship.modules[k];
export const eff=(k)=>mod(k).lv*mod(k).cond/100;   // niveles efectivos: el bonus baja con el estado
export const boardCap=()=>BOARD_BASE+Math.floor(eff('bridge'));
export const maxDays=()=>Math.min(7,3+Math.floor(eff('engines')));   // las misiones duran de 2 a este máximo
export const cargoMult=()=>1+0.1*eff('cargo');
// Literas: las hay según el nivel de los Camarotes, así que el desgaste nunca
// echa a nadie de la nave. Lo que sí hace es dejar inservibles las que pasan
// del nivel efectivo: con los Camarotes dañados no se contrata en ellas.
export const berths=()=>BERTHS+mod('quarters').lv;
export const berthsUsable=()=>BERTHS+Math.floor(eff('quarters'));
export const repDamaged=(day=todayStr())=>!!state.ship.board.repUntil&&day<=state.ship.board.repUntil;
export const baseSignal=()=>SIGNAL_DAY+SIGNAL_LV*eff('comms');                      // misiones al día
export const signalRate=(day)=>baseSignal()*(repDamaged(day)?0.5:1);              // con mala reputación, a la mitad
export const msLeft=(c)=>c.endsAt-Date.now();   // el plazo corre en horas reales desde que se acepta

// módulo afectado por un item: el de su área si está construido, si no uno general
export function areaModFor(x){ for(const a of x.areas||[]){ const k=AREA_MOD[a]; if(k&&mod(k).lv>0) return k; } return null; }
export const builtGeneral=()=>Object.keys(MODS).filter(k=>MODS[k].kind==='gen'&&mod(k).lv>0);
export function wear(x,n){
  n=Math.round(n*(1-perk('engineer')));
  let k=areaModFor(x);
  if(!k){ const g=builtGeneral(); if(!g.length) return; k=g[state.ship.rot++%g.length]; }
  const before=mod(k).cond; mod(k).cond=Math.max(0,before-n);
  return before>mod(k).cond?{k,n:before-mod(k).cond}:null;
}
export function healFor(x,ef=1){
  let k=areaModFor(x);
  if(!k){ const g=builtGeneral(); if(!g.length) return null; k=g.reduce((a,b)=>mod(b).cond<mod(a).cond?b:a); }
  const before=mod(k).cond; mod(k).cond=Math.min(100,before+Math.round((HEAL+perk('medic'))*ef));
  return mod(k).cond>before?{k,n:mod(k).cond-before}:null;
}

export function selfHeal(){
  const n=Math.round(SELFHEAL*eff('health')); if(n<=0) return;
  const hurt=Object.keys(MODS).filter(k=>mod(k).lv>0&&mod(k).cond<100);
  if(!hurt.length) return;
  const k=hurt.reduce((a,b)=>mod(b).cond<mod(a).cond?b:a);
  mod(k).cond=Math.min(100,mod(k).cond+n);
}

// Suma puntos de esfuerzo al día y a la misión en curso (solo lo hecho dentro
// de su plazo, si lo tiene). Devuelve el id de la misión si contó, para poder restarlo.
export function addEffort(ef,day=todayStr()){
  const sh=state.ship, c=sh.contract;
  sh.activity[day]=efRound((sh.activity[day]||0)+ef);
  // lo de hoy cuenta hasta la hora del plazo; lo de días pasados (repaso de ayer) si ese día empezó antes del plazo
  if(!c||(c.acceptedOn||'')>day) return null;
  if(hasDeadline(c)&&(day===todayStr()?Date.now()>=c.endsAt:dayParse(day).getTime()>=c.endsAt)) return null;
  c.progress=efRound(c.progress+ef);
  if(c.progress>=c.quota){
    const p=finishContract(1); state.cmd.stats.missions++; p.xp=addXP(XP_CONTRACT);
    logShip({kind:'mission',big:true,tone:'win',title:`Misión ${c.topic} (${(DIFFS[c.diff]||DIFFS.normal).name.toLowerCase()}) completada`,rew:p,story:missionStory(c,'win'),lines:isAway(c)?['De vuelta '+herePrep('en'),returnHome()].filter(Boolean):[]});
    logBoardNews();
    emit('missionWon',c);
  }
  return c.id;
}
// `day`: el día en que se hizo (ayer, si llega desde el repaso de ayer)
export function onComplete(x,g,day=todayStr()){
  const ef=g.ef??1; g.day=day; g.at=Date.now();   // at: cuándo se marcó (lo recién marcado se queda a la vista)
  const h=healFor(x,ef); if(h) g.heal=h;
  // El material extra solo lo da Prospección: los módulos de área ya no suben
  // la ganancia del material que ellos mismos cuestan.
  if(g.res&&Math.random()<perk('prospector')){ addW(g.res,1); g.bonus=1; }
  const c=addEffort(ef,day); if(c) g.c=c;
  g.xp=addXP(payRound(EF_XP*ef,ef));
}
export function onUndo(g){
  if(!g) return;
  const sh=state.ship, t=g.day||todayStr(), ef=g.ef??1;
  sh.activity[t]=Math.max(0,efRound((sh.activity[t]||0)-ef));
  if(g.bonus&&g.res) subW(g.res,g.bonus);
  if(g.xp) subXP(g.xp);
  if(g.heal) mod(g.heal.k).cond=Math.max(0,mod(g.heal.k).cond-g.heal.n);
  if(g.c&&sh.contract?.id===g.c) sh.contract.progress=Math.max(0,efRound(sh.contract.progress-ef));
}

export const rewardText=(r)=>[`${r.mc} ¢`,...Object.entries(r.mats||{}).map(([k,n])=>`${n} ${RES[k].sym}`)].join(' + ');
// Solo lo que bajó en neto, ya contada la Enfermería: si se compensa, no hay noticia.
export function logWear(before,miss){
  const hit=Object.keys(MODS).filter(k=>mod(k).cond<before[k]);
  if(!hit.length) return;
  const why=[miss.habits&&plural(miss.habits,'hábito sin cumplir','hábitos sin cumplir'),miss.tasks&&plural(miss.tasks,'tarea atrasada','tareas atrasadas')].filter(Boolean);
  logShip({kind:'wear',tone:'warn',title:`Desgaste en ${plural(hit.length,'módulo','módulos')}`,
    lines:[hit.map(k=>`${MODS[k].name} ${before[k]} → ${mod(k).cond} %`).join(', '),...(why.length?['Por '+why.join(' y ')]:[])]});
}
// El sistema en el que está la nave, y su nombre con preposición: herePrep('en') → «en el Sistema Madre».
export const here=()=>sysOf(state.ship.system);
export const herePrep=(prep)=>sysPrep(here(),prep);

/* El cambio de día: desgaste de los días sin abrir, sueldos y tablón. */
import { effOf, MODS, WEAR_HABIT, WEAR_TASK } from '../config.js';
import { trimBooks } from './books.js';
import { crewPayroll, genCandidates, missionCrewXp } from './crew.js';
import { isDoneToday, isScheduledOn, isScheduledToday } from './habits.js';
import { logShip, logUpdates } from './log.js';
import { atHome, checkContractEnd, logBoardNews, tickBoard } from './missions.js';
import { logWear, mod, selfHeal, wear } from './ship.js';
import { state } from '../store.js';
import { addDays, dayParse, todayStr, weekStart } from '../util.js';

// El progreso de «Hoy»: hábitos que tocan y tareas con fecha de hoy. Los
// hábitos libres no tienen día y las tareas atrasadas no cuentan: al cerrarlas
// dejan de ser de hoy y el total encogería a media mañana.
export function todayProgress(){
  const t=todayStr();
  const habits=state.habits.filter(h=>h.type!=='free'&&h.type!=='neg'&&isScheduledToday(h));
  const tasks=state.tasks.filter(x=>x.dueDate===t);
  return {done:habits.filter(isDoneToday).length+tasks.filter(x=>x.done).length, total:habits.length+tasks.length};
}

// días pasados sin revisar: desgaste por hábitos fallados y tareas atrasadas
// `miss` cuenta las causas para el aviso de desgaste
export function decayDay(day,miss){
  const start=dayParse(day).getTime(), end=start+864e5;
  for(const h of state.habits){
    if(h.type==='free'||h.type==='neg'||(h.createdAt||0)>=start) continue;
    if(!isScheduledOn(h,day)) continue;
    if((h.log?.[day]||0)<1){ wear(h,WEAR_HABIT*effOf(h)); miss.habits++; }
  }
  for(const x of state.tasks){
    if(!x.dueDate||x.dueDate>=day||(x.createdAt||0)>=end) continue;
    if(x.done&&(!x.doneOn||x.doneOn<=day)) continue;
    wear(x,WEAR_TASK*effOf(x)); miss.tasks++;
  }
}
// Procesa los días que han pasado desde la última vez. No guarda: lo hace quien
// llama (dailyTick, en features/review.js, que antes pide el repaso de ayer).
export function processDays(){
  const sh=state.ship, t=todayStr(), y=addDays(t,-1);
  if(!sh.lastTick||sh.lastTick>y) sh.lastTick=y;
  let day=addDays(sh.lastTick,1); const oldest=addDays(t,-7); if(day<oldest) day=oldest;
  const before={}, miss={habits:0,tasks:0};
  for(const k of Object.keys(MODS)) before[k]=mod(k).cond;
  for(;day<t;day=addDays(day,1)){ decayDay(day,miss); selfHeal(); }   // la Enfermería recupera algo cada día
  sh.lastTick=y;
  logWear(before,miss);
  missionCrewXp(sh.contract);   // experiencia de la tripulación por los días de misión cumplidos
  if(!checkContractEnd()) tickBoard();   // si vence, ya avanza la señal tras dañar la reputación
  // tripulación: sueldos semanales automáticos; el tablón de candidatos se renueva cada domingo
  const pay=crewPayroll(t);
  if(pay) logShip({kind:'crew',tone:pay.left?'warn':'info',title:pay.paid?`Sueldos de la tripulación: −${pay.paid} ¢`:'Tripulación',lines:pay.notes});
  if(sh.crewBoard.week!==weekStart(t)) sh.crewBoard={week:weekStart(t),cands:genCandidates()};
  if(atHome()) logBoardNews();
  const cut=addDays(t,-30); for(const k of Object.keys(sh.activity)) if(k<cut) delete sh.activity[k];
  trimBooks(t);
  logUpdates();   // novedades del juego, una vez por partida
}

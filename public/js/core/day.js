/* El cambio de día: desgaste de los días sin abrir, sueldos y tablón. */
import { effOf, MODS, WEAR_HABIT, WEAR_TASK } from '../config.js';
import { crewPayroll, genCandidates } from './crew.js';
import { atHome, checkContractEnd, logBoardNews, tickBoard } from './missions.js';
import { logWear, mod, selfHeal, wear } from './ship.js';
import { logShip } from '../features/log.js';
import { closeReview, needsReview, openReview, rv } from '../features/review.js';
import { save, state } from '../store.js';
import { addDays, dayParse, todayStr, weekStart } from '../util.js';

// días pasados sin revisar: desgaste por hábitos fallados y tareas atrasadas
// `miss` cuenta las causas para el aviso de desgaste
export function decayDay(day,miss){
  const start=dayParse(day).getTime(), end=start+864e5, dow=dayParse(day).getDay();
  for(const h of state.habits){
    if(h.type==='free'||h.type==='neg'||(h.createdAt||0)>=start) continue;
    if(h.type==='weekly'&&!(h.days||[]).includes(dow)) continue;
    if((h.log?.[day]||0)<1){ wear(h,WEAR_HABIT*effOf(h)); miss.habits++; }
  }
  for(const x of state.tasks){
    if(!x.dueDate||x.dueDate>=day||(x.createdAt||0)>=end) continue;
    if(x.done&&(!x.doneOn||x.doneOn<=day)) continue;
    wear(x,WEAR_TASK*effOf(x)); miss.tasks++;
  }
}
export function dailyTick(){
  // El día de ayer no se procesa hasta repasarlo: lo que se marque como hecho
  // ya no desgasta y cuenta para la misión que vencía ayer.
  if(needsReview()){ openReview(); return; }
  if(rv.open) closeReview();   // otro dispositivo ya lo repasó (llega con la nube)
  const sh=state.ship, t=todayStr(), y=addDays(t,-1);
  if(!sh.lastTick||sh.lastTick>y) sh.lastTick=y;
  let day=addDays(sh.lastTick,1); const oldest=addDays(t,-7); if(day<oldest) day=oldest;
  const before={}, miss={habits:0,tasks:0};
  for(const k of Object.keys(MODS)) before[k]=mod(k).cond;
  for(;day<t;day=addDays(day,1)){ decayDay(day,miss); selfHeal(); }   // la Enfermería recupera algo cada día
  sh.lastTick=y;
  logWear(before,miss);
  if(!checkContractEnd()) tickBoard();   // si vence, ya avanza la señal tras dañar la reputación
  // tripulación: sueldos semanales automáticos; el tablón de candidatos se renueva cada domingo
  const pay=crewPayroll(t);
  if(pay) logShip({kind:'crew',tone:pay.left?'warn':'info',title:pay.paid?`Sueldos de la tripulación: −${pay.paid} ¢`:'Tripulación',lines:pay.notes});
  if(sh.crewBoard.week!==weekStart(t)) sh.crewBoard={week:weekStart(t),cands:genCandidates()};
  if(atHome()) logBoardNews();
  const cut=addDays(t,-30); for(const k of Object.keys(sh.activity)) if(k<cut) delete sh.activity[k];
  save();
}

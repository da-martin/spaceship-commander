/* Hábitos: qué días tocan, si está hecho y la racha. */
import { addDays, dayParse, DOW_NAMES, listY, todayStr } from '../util.js';

/* ---------- habit helpers ---------- */
export const countToday = (h) => h.log?.[todayStr()]||0;
// Mensual: si el mes no tiene ese día (29, 30, 31), toca el último del mes.
export function monthDayHit(mdays,s){
  const d=dayParse(s), last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  return (mdays||[]).some(m=>Math.min(m,last)===d.getDate());
}
// ¿Le toca a `h` el día `s` ('AAAA-MM-DD')? Es la única regla: la usan Hoy, el
// progreso del día (y el de la alianza), la racha, el desgaste y el repaso de ayer.
// Libres y negativos no tienen día: siempre tocan.
export function isScheduledOn(h,s){
  if(h.type==='weekly') return (h.days||[]).includes(dayParse(s).getDay());
  if(h.type==='monthly') return monthDayHit(h.mdays,s);
  return true;
}
export const isScheduledToday = (h) => isScheduledOn(h,todayStr());
// El siguiente día que toca después de `from` (null si no toca en dos meses).
export function nextScheduled(h,from=todayStr()){
  for(let i=1;i<=62;i++){ const s=addDays(from,i); if(isScheduledOn(h,s)) return s; }
  return null;
}
export function isDoneToday(h){ return countToday(h)>=1; }
// Días seguidos cumplidos entre los que tocan. Un mensual mira un año atrás: con
// dos días al mes, 60 días no darían para una racha de más de 4.
export function streak(h){
  let s=0; const d=new Date(), span=h.type==='monthly'?400:60;
  for(let i=0;i<span;i++,d.setDate(d.getDate()-1)){
    const k=todayStr(d);
    if(!isScheduledOn(h,k)) continue;
    if((h.log?.[k]||0)>=1) s++; else break;
  }
  return s;
}
// «días 1 y 15», «día 31»
export const mdaysText = (m) => ((m||[]).length===1?'día ':'días ')+listY((m||[]).map(String));
// Cómo se lee la frecuencia en filas, Focus y repaso.
export function habitKind(h){
  if(h.type==='free') return 'Libre';
  if(h.type==='neg') return 'Negativo';
  if(h.type==='daily') return 'Diario';
  if(h.type==='monthly') return 'Mensual · '+mdaysText(h.mdays);
  return 'Semanal'+((h.days||[]).length?' · '+[1,2,3,4,5,6,0].filter(d=>h.days.includes(d)).map(d=>DOW_NAMES[d]).join(' '):'');
}

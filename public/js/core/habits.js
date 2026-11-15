/* Hábitos: qué toca hoy, si está hecho y la racha. */
import { DOW, todayStr } from '../util.js';

/* ---------- habit helpers ---------- */
export const countToday = (h) => h.log?.[todayStr()]||0;
export function isScheduledToday(h){ if(h.type==='free'||h.type==='neg') return true; if(h.type==='daily') return true; return (h.days||[]).includes(DOW()); }
export function isDoneToday(h){ return countToday(h)>=1; }
export function streak(h){
  let s=0; const d=new Date();
  for(let i=0;i<60;i++){
    const k=todayStr(d);
    if(h.type==='weekly' && !(h.days||[]).includes(d.getDay())){ d.setDate(d.getDate()-1); continue; }
    if((h.log?.[k]||0)>=1) s++; else break;
    d.setDate(d.getDate()-1);
  }
  return s;
}

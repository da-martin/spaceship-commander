/* Parser iCal mínimo: solo lo que pinta la lista (título, día y hora) en la
 * zona horaria del navegador. */
import { todayStr } from '../util.js';

/* iCal: un parser mínimo, solo lo que pinta la lista (título, día y hora).
   Los eventos que se repiten (RRULE y sus excepciones) se ignoran por ahora. */
export const ICS_MAX_EVENTS=500;   // por calendario: la caché vive en localStorage
export const tzFmts=new Map();
// Desfase de una zona IANA en un instante, en ms. Lanza si la zona no existe
// (Outlook manda nombres de Windows): entonces la hora se toma como local.
export function tzOffset(t,tz){
  if(!tzFmts.has(tz)) tzFmts.set(tz,new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'}));
  const p=Object.fromEntries(tzFmts.get(tz).formatToParts(t).map(x=>[x.type,+x.value]));
  return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-t;
}
// Hora de pared en `tz` → instante. Dos pasadas por si en medio hay cambio de hora.
export function zonedTime(y,mo,d,h,mi,tz){
  const wall=Date.UTC(y,mo,d,h,mi);
  try{ const g=wall-tzOffset(wall,tz); return new Date(wall-tzOffset(g,tz)); }
  catch{ return new Date(y,mo,d,h,mi); }
}
// DTSTART en sus tres formas: día completo, UTC (…Z) y hora con TZID (o flotante).
export function icsStart(val,params){
  const prm=(k)=>{ const x=params.find(p=>p.toUpperCase().startsWith(k+'=')); return x?x.slice(k.length+1).replace(/^"|"$/g,''):null; };
  let m=val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(m) return {date:`${m[1]}-${m[2]}-${m[3]}`,time:null};
  m=val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{0,2}(Z?)$/);
  if(!m) return null;
  const [y,mo,d,h,mi]=m.slice(1,6).map(Number), tz=prm('TZID');
  const t=m[6]?new Date(Date.UTC(y,mo-1,d,h,mi)):tz?zonedTime(y,mo-1,d,h,mi,tz):new Date(y,mo-1,d,h,mi);
  if(isNaN(t)) return null;
  return {date:todayStr(t),time:`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`};
}
export const icsUnescape=(v)=>v.replace(/\\([\\,;nN])/g,(_,c)=>c==='n'||c==='N'?' ':c).replace(/\s+/g,' ').trim();
export function parseIcs(text,from,to){
  const out=[];
  let ev=null, depth=0;   // depth: componentes metidos en el VEVENT (VALARM…), que no cuentan
  for(const line of text.replace(/\r\n?/g,'\n').replace(/\n[ \t]/g,'').split('\n')){
    // Los dos puntos dentro de un parámetro entre comillas no separan el valor.
    let i=-1, q=false;
    for(let j=0;j<line.length;j++){ const c=line[j]; if(c==='"') q=!q; else if(c===':'&&!q){ i=j; break; } }
    if(i<0) continue;
    const [name,...params]=line.slice(0,i).split(';'), val=line.slice(i+1), k=name.toUpperCase();
    if(k==='BEGIN'){ if(val.toUpperCase()==='VEVENT'){ ev={}; depth=0; } else if(ev) depth++; continue; }
    if(k==='END'){
      if(ev&&depth){ depth--; continue; }
      if(ev&&val.toUpperCase()==='VEVENT'){
        const s=ev.start&&icsStart(ev.start.val.trim(),ev.start.params);
        if(s&&!ev.recur&&ev.status!=='CANCELLED'&&s.date>=from&&s.date<=to)
          out.push({title:(ev.title||'').slice(0,120)||'(sin título)',...s});
        ev=null;
      }
      continue;
    }
    if(!ev||depth) continue;
    if(k==='SUMMARY') ev.title=icsUnescape(val);
    else if(k==='DTSTART') ev.start={val,params};
    else if(k==='RRULE'||k==='RDATE'||k==='RECURRENCE-ID') ev.recur=true;
    else if(k==='STATUS') ev.status=val.trim().toUpperCase();
  }
  return out.sort((a,b)=>(a.date+(a.time||'')<b.date+(b.time||''))?-1:1).slice(0,ICS_MAX_EVENTS);
}

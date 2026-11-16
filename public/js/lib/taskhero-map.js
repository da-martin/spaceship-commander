/* De TaskHero a la app: cómo se convierte cada hábito y tarea leídos de su API.
 * Sin estado ni vista, para poder probarlo fuera del navegador. */
import { EFFORT, NOTES_MAX } from '../config.js';
import { habitKind } from '../core/habits.js';
import { dayParse, DOW_NAMES, listY, todayStr } from '../util.js';

// Dificultades de TaskHero → las de la app. Una que no conozcamos queda en Normal
// y se apunta en las notas.
export const TH_DIFF_MAP = {micro:'micro',small:'easy',normal:'normal',hard:'hard',epic:'epic'};
export const TH_DIFF = {micro:'Mínima',small:'Pequeña',normal:'Normal',hard:'Difícil',epic:'Épica'};
export const thDiff = (t) => TH_DIFF_MAP[t?.difficulty]||'normal';
export const WEEK_ORDER = [1,2,3,4,5,6,0];
export const dowList = (days,sep=' ') => WEEK_ORDER.filter(d=>days.includes(d)).map(d=>DOW_NAMES[d]).join(sep);
// «AAAA-MM-DD» tal cual; una fecha con hora pasa al día local
export const thDay = (s) => typeof s!=='string' ? null : /^\d{4}-\d{2}-\d{2}$/.test(s) ? (todayStr(dayParse(s))===s?s:null) : Number.isFinite(Date.parse(s)) ? todayStr(new Date(s)) : null;
export const thLong = (d) => dayParse(d).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
export const thDates = (a,max=20) => { const v=(Array.isArray(a)?a:[]).map(thDay).filter(Boolean).sort(); return v.slice(0,max).map(thLong).join(', ')+(v.length>max?` y ${v.length-max} más`:''); };
// 0 = domingo … 6 = sábado, como getDay(); un 7 se toma como domingo (ISO)
export const thDows = (a) => [...new Set((Array.isArray(a)?a:[]).map(d=>d===7?0:d).filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort((x,y)=>x-y);
export const thMdays = (a) => [...new Set((Array.isArray(a)?a:[]).filter(d=>Number.isInteger(d)&&d>=1&&d<=31))].sort((x,y)=>x-y);
export const thTitle = (t) => (typeof t?.title==='string' ? t.title.trim().slice(0,200) : '');

// Con objetivo de una vez al día, lo que tiene equivalente: semanal con todos los
// días → diario, con algunos → semanal, mensual → mensual. Lo demás (varias veces
// al día, objetivo 0, anual, cada X días) no lo tiene: `pick` pide elegir entre
// Libre y Negativo, porque la API de TaskHero no dice si un hábito es negativo.
export function thType(t){
  const s=t.schedule;
  if(t.repsPerDayGoal===1&&s?.mode==='weekly'){
    const d=thDows(s.daysOfWeek);
    if(d.length===7) return {type:'daily',days:null};
    if(d.length) return {type:'weekly',days:d};
  }
  if(t.repsPerDayGoal===1&&s?.mode==='monthly'){
    const m=thMdays(s.daysOfMonth);
    if(m.length) return {type:'monthly',days:null,mdays:m};
  }
  return {type:'free',days:null,pick:true};
}
export function thFreq(s){
  if(s?.mode==='weekly'){ const d=thDows(s.daysOfWeek); return d.length===7?'todos los días':d.length?'semanal: '+dowList(d,', ').toLowerCase():'semanal, sin días'; }
  if(s?.mode==='monthly'){ const d=(s.daysOfMonth||[]).filter(Number.isFinite); return 'mensual: '+(d.length===1?'día ':'días ')+listY(d.map(String)); }
  if(s?.mode==='yearly') return 'anual: '+(s.days||[]).map(x=>`${x.day}/${x.month}`).join(', ')+' (día/mes)';
  if(s?.mode==='everyXDays'){ const d=thDay(s.startingOn); return `cada ${s.intervalDays} días`+(d?` desde el ${thLong(d)}`:''); }
  return s?.mode?String(s.mode):'';
}
// Notas propias primero; si no cabe todo, se recortan ellas y el bloque queda entero.
export function thNotes(t,lines){
  const block=['— Importado de TaskHero —',...lines.filter(Boolean)].join('\n');
  const own=typeof t.notes==='string'?t.notes.trim():'';
  if(!own) return block.slice(0,NOTES_MAX);
  const room=NOTES_MAX-block.length-2;
  if(room<2) return block.slice(0,NOTES_MAX);
  return (own.length>room?own.slice(0,room-1).trimEnd()+'…':own)+'\n\n'+block;
}
// Solo si la dificultad no tiene equivalente: la que sí lo tiene ya va en `diff`.
export const thDiffLine = (t) => t.difficulty&&!TH_DIFF_MAP[t.difficulty]&&`Dificultad: ${TH_DIFF[t.difficulty]||t.difficulty} (${t.difficulty})`;
export const thListLine = (t,lists) => t.listId&&lists.has(t.listId)&&`Lista: ${lists.get(t.listId)}`;
export function thHabit(t,lists=new Map()){
  const {type,days,mdays,pick}=thType(t), o=t.scheduleOverrides||{}, last=thDay(t.lastCompletedAt);
  // _done, _pick y _freq solo sirven a la vista previa: no se guardan
  return {title:thTitle(t),type,days,...(mdays?{mdays}:{}),priority:false,diff:thDiff(t),areas:[],log:{},src:'taskhero:'+t.id,
    _done:t.status==='completed',_pick:!!pick,_freq:thFreq(t.schedule)+(t.repsPerDayGoal==null?', sin objetivo':`, ${t.repsPerDayGoal} al día`),
    notes:thNotes(t,[thDiffLine(t),`Frecuencia: ${thFreq(t.schedule)}`,
      `Repeticiones al día: ${t.repsPerDayGoal==null?'sin objetivo':t.repsPerDayGoal}`,
      o.scheduledFor?.length&&`Días añadidos: ${thDates(o.scheduledFor)}`,
      o.unscheduledFor?.length&&`Días quitados: ${thDates(o.unscheduledFor)}`,
      thListLine(t,lists), t.status==='completed'&&'Estado: completado',
      last&&`Última vez completado: ${thLong(last)}`])};
}
export function thTask(t,lists=new Map()){
  const dates=(t.scheduledFor||[]).map(thDay).filter(Boolean).sort(), last=thDay(t.lastCompletedAt);
  return {title:thTitle(t),dueDate:dates[0]||null,priority:false,diff:thDiff(t),done:false,areas:[],projectId:null,src:'taskhero:'+t.id,
    notes:thNotes(t,[thDiffLine(t),thListLine(t,lists),dates.length>1&&`Fechas programadas: ${thDates(t.scheduledFor)}`,
      last&&`Última vez completada: ${thLong(last)}`])};
}

/* ---------- lo ya importado: qué ha cambiado ---------- */
const sameSched = (a,b) => a.type===b.type
  && JSON.stringify(a.type==='weekly'?[...(a.days||[])].sort():null)===JSON.stringify(b.type==='weekly'?[...(b.days||[])].sort():null)
  && JSON.stringify(a.type==='monthly'?a.mdays||[]:null)===JSON.stringify(b.type==='monthly'?b.mdays||[]:null);
// Diferencias entre lo que hay aquí (`cur`) y lo recién leído (`inc`, de thHabit o
// thTask): la dificultad y, en hábitos, la frecuencia. Nunca el nombre ni las notas,
// que se pueden haber cambiado aquí a propósito. Un hábito sin equivalente (pick)
// no propone frecuencia si aquí ya es Libre o Negativo: eso lo eligió quien importó.
// null si no hay nada que actualizar.
export function thChanges(cur,inc){
  const ch={};
  if((EFFORT[cur.diff]?cur.diff:'normal')!==inc.diff) ch.diff={from:EFFORT[cur.diff]?cur.diff:'normal',to:inc.diff};
  if(inc.type&&!(inc._pick&&(cur.type==='free'||cur.type==='neg'))&&!sameSched(cur,inc)){
    ch.sched={from:habitKind(cur),to:habitKind(inc),type:inc.type,days:inc.days||null,...(inc.mdays?{mdays:inc.mdays}:{})};
  }
  return Object.keys(ch).length?ch:null;
}
// Con historial, un hábito no cambia de positivo a negativo ni al revés: el
// historial de uno se leería al revés en el otro. Devuelve hacia qué lado queda
// fijo ('pos' o 'neg'), o null si se puede elegir.
export const kindLock = (h) => Object.values(h.log||{}).some(n=>n>0) ? (h.type==='neg'?'neg':'pos') : null;

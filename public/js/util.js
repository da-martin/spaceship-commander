/* Utilidades sin estado: fechas en texto 'AAAA-MM-DD', formato y azar. */

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now()+'-'+Math.random().toString(16).slice(2));
export const todayStr = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const fmtDate = (s) => { if(!s) return ''; const [y,m,dd]=s.split('-').map(Number); return new Date(y,m-1,dd).toLocaleDateString('es-ES',{day:'numeric',month:'short'}); };
export const etaDays = (due) => { const [y,m,dd]=due.split('-').map(Number); const a=new Date(y,m-1,dd); const n=new Date(); n.setHours(0,0,0,0); return Math.round((a-n)/864e5); };
export const DOW = () => new Date().getDay();
export const DOW_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
export const efRound = (v) => Math.round(v*10)/10;   // sumas de 0,1 sin restos de coma flotante
export const fmtEf = (v) => (+v||0).toLocaleString('es-ES',{maximumFractionDigits:1});
export const pctTxt = (v) => Math.round(v*100)+'%';
export const clampInt=(v,lo,hi,dflt)=> Number.isFinite(+v)?Math.max(lo,Math.min(hi,Math.floor(+v))):dflt;
export const dayParse=(s)=>{ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
export const addDays=(s,n)=>{ const d=dayParse(s); d.setDate(d.getDate()+n); return todayStr(d); };
export const pick=(a)=>a[Math.floor(Math.random()*a.length)];
/* tripulación */
export const weekStart=(t=todayStr())=>addDays(t,-dayParse(t).getDay());   // domingo de la semana
// precios del mercado: deterministas por día y material
export function hash01(s){
  let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  h^=h>>>16; h=Math.imul(h,0x85ebca6b); h^=h>>>13; h=Math.imul(h,0xc2b2ae35); h^=h>>>16;
  return (h>>>0)/4294967296;
}
// Semanas ISO: empiezan el lunes y la 1 es la del primer jueves del año.
export const isoWeek=(s)=>{ const d=dayParse(s); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const y=d.getFullYear(), j=new Date(y,0,4); return {n:1+Math.round(((d-j)/864e5-3+(j.getDay()+6)%7)/7), year:y}; };
export const mondayOf=(s)=>addDays(s,-((dayParse(s).getDay()+6)%7));

export function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

// Fecha corta con el día de la semana: «sáb 14 nov».
export const FDAY=['dom','lun','mar','mié','jue','vie','sáb'];
export const fDate=(s)=>FDAY[dayParse(s).getDay()]+' '+fmtDate(s);

export const plural=(n,one,many)=>`${n} ${n===1?one:many}`;
// «a, b y c»
export const listY=(a)=>a.length<2?a.join(''):a.slice(0,-1).join(', ')+' y '+a[a.length-1];

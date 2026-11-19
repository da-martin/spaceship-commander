/* Libro de cuentas: los ¢ que entran y salen cada día, por categoría.
 * state.ship.books = {since:'AAAA-MM-DD', days:{'AAAA-MM-DD':{in:{task:40,…}, out:{wages:90,…}}}}
 * Lo que se desmarca se resta del día y la categoría en que se ganó, no de hoy,
 * igual que onUndo con la actividad. Quien llama guarda. */
import { BOOKS, BOOKS_DAYS, FREE_MC } from '../config.js';
import { state } from '../store.js';
import { addDays, todayStr } from '../util.js';

function put(side,cat,n,day){
  n=Math.round(n); if(!n||!BOOKS[side][cat]) return;
  const B=state.ship.books;
  // antes de que hubiera libro no se anotó nada: no hay de dónde restar
  if(n<0&&day<B.since) return;
  const e=B.days[day]||(B.days[day]={in:{},out:{}}), s=e[side];
  s[cat]=Math.max(0,(s[cat]||0)+n);
  if(!s[cat]) delete s[cat];
  if(!Object.keys(e.in).length&&!Object.keys(e.out).length) delete B.days[day];
}
export const earn=(n,cat,day=todayStr())=>put('in',cat,n,day);
export const unearn=(n,cat,day=todayStr())=>put('in',cat,-n,day);
export const spend=(n,cat,day=todayStr())=>put('out',cat,n,day);

const sum=(o)=>Object.values(o||{}).reduce((a,n)=>a+n,0);
export const dayIn=(day)=>sum(state.ship.books.days[day]?.in);
export const dayOut=(day)=>sum(state.ship.books.days[day]?.out);

// Lo de hace más de BOOKS_DAYS días se borra (lo llama processDays).
export function trimBooks(t=todayStr()){
  const cut=addDays(t,-BOOKS_DAYS), d=state.ship.books.days;
  for(const k of Object.keys(d)) if(k<cut) delete d[k];
}

/* ---------- entradas de días pasados ---------- */
// Lo que se puede rehacer de un día sin libro con lo que guarda la partida:
// lo que pagó cada tarea (también las acciones rápidas del Forster), cada hábito,
// cada toque libre y cada misión de la bitácora. No se puede rehacer lo borrado,
// el Pilotaje ni las ventas: sale algo por debajo, nunca por encima.
// n: cuántas tareas, hábitos, toques y misiones; sirve también en los días con libro.
function rebuild(day){
  const cats={}, n={task:0,habit:0,free:0,mission:0};
  const add=(c,mc)=>{ if(mc>0) cats[c]=(cats[c]||0)+mc; };
  for(const x of [...state.tasks,...state.focus.lines.filter(l=>l.kind==='acc')]) if(x.grant?.day===day){ add('task',x.grant.mc); n.task++; }
  for(const h of state.habits){
    const g=h.g?.[day]; if(!g) continue;
    if(h.type==='free'){
      const taps=h.log?.[day]||0; if(!taps) continue;
      // el primer toque fija lo que vale cada toque del día (g.tap); antes de g.tap, los demás valían FREE_MC
      add('free',g.tap!==undefined?g.tap*taps:(g.mc||0)+(taps-1)*FREE_MC); n.free+=taps;
    } else if(g.mc>0){ add('habit',g.mc); n.habit++; }
  }
  for(const e of state.ship.log) if(e.kind==='mission'&&e.day===day&&e.rew?.mc>0){ add('mission',e.rew.mc); n.mission++; }
  return {cats,n};
}
// Primer día con historial: el libro o la actividad más antigua que se guarda.
// Los días anteriores no son días a cero: la partida aún no existía.
export function firstDay(){
  let d=state.ship.books.since;
  for(const k of Object.keys(state.ship.activity)) if(k<d) d=k;
  return d;
}
// Lo que entró un día pasado, por categoría. Antes del libro, rehecho (est).
// El día que empezó el libro solo se anotó desde que se abrió: de cada
// categoría se queda lo mayor entre el libro y lo rehecho.
export function pastIn(day){
  const B=state.ship.books, r=rebuild(day), book={...B.days[day]?.in};
  let cats=book, est=false;
  if(day<=B.since){
    cats={...book};
    for(const [c,v] of Object.entries(r.cats)) if(v>(cats[c]||0)){ cats[c]=v; est=true; }
  }
  return {day,total:sum(cats),cats,n:r.n,mission:cats.mission||0,est};
}

/* ---------- previsión de entradas ---------- */
// Para cada uno de los próximos `days` días, lo que entró el mismo día de la
// semana pasada (ref). El día de la semana de hoy está a medias: para ese se
// usa el de hace dos semanas. Si ese día es anterior a la partida, la media
// de los días que sí hay (avg). Sin ningún día pasado: none, y todo a 0.
// Las misiones cuentan igual; `mission` dice cuánto del total es de una.
export function incomeForecast(days=7,t=todayStr()){
  const start=firstDay(), from=addDays(t,-14)>start?addDays(t,-14):start, have=[];
  for(let d=from; d<t; d=addDays(d,1)) have.push(pastIn(d));
  const mean=(k)=>have.length?Math.round(have.reduce((a,p)=>a+p[k],0)/have.length):0;
  const avg={total:mean('total'),mission:mean('mission'),est:have.some(p=>p.est)};
  const out=[];
  for(let i=1;i<=days;i++){
    const day=addDays(t,i); let ref=addDays(day,-7);
    while(ref>=t) ref=addDays(ref,-7);
    if(ref>=start){ const p=pastIn(ref); out.push({day,ref,total:p.total,mission:p.mission,est:p.est,cats:p.cats,n:p.n,avg:false,none:false}); }
    else out.push({day,ref:null,...avg,cats:null,n:null,avg:have.length>0,none:!have.length,refs:have.map(p=>p.day)});
  }
  return out;
}
// La previsión como función día → ¢, para payForecast.
export const incomeFn=(fc)=>{ const m=Object.fromEntries(fc.map(p=>[p.day,p.total])); return (d)=>m[d]||0; };

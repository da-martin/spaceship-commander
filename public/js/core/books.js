/* Libro de cuentas: los ¢ que entran y salen cada día, por categoría.
 * state.ship.books = {since:'AAAA-MM-DD', days:{'AAAA-MM-DD':{in:{task:40,…}, out:{wages:90,…}}}}
 * Lo que se desmarca se resta del día y la categoría en que se ganó, no de hoy,
 * igual que onUndo con la actividad. Quien llama guarda. */
import { BOOKS, BOOKS_DAYS } from '../config.js';
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

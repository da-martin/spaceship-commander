/* Contabilidad: la semana que viene, día a día. Junta la previsión de
 * entradas (books.js) con los cobros de la tripulación (crew.js) y deja el
 * saldo que quedaría cada día. Solo calcula; lo pinta ui/books-view.js. */
import { BOOKS, CREW_DAYS, WAGE_CUT } from '../config.js';
import { incomeFn, incomeForecast } from './books.js';
import { dayWage, debtOf, payForecast, working } from './crew.js';
import { eff } from './ship.js';
import { state } from '../store.js';
import { addDays, todayStr } from '../util.js';

// Lo que se gastó del libro los últimos 7 días (sin hoy), por categoría.
// Si el libro es más nuevo, desde que empezó (from).
export function lastWeekOut(t=todayStr()){
  const B=state.ship.books, from=addDays(t,-7)>B.since?addDays(t,-7):B.since, cats={};
  for(let d=from; d<t; d=addDays(d,1)) for(const [c,n] of Object.entries(B.days[d]?.out||{})) cats[c]=(cats[c]||0)+n;
  const total=Object.values(cats).reduce((a,n)=>a+n,0);
  // lo que se decide cada vez y no se prevé: todo menos sueldos y deudas
  const voluntary=Object.entries(cats).filter(([c])=>c!=='wages'&&c!=='debt').reduce((a,[,n])=>a+n,0);
  return {from,total,cats,voluntary};
}

// Descuento del Salón en los sueldos, en %.
export const wageCut=()=>Math.round(WAGE_CUT*eff('social')*100);

// Cada día de mañana a dentro de 7: lo previsto que entra (inc), los cobros de
// ese día (pays: los que cobran y los que no), lo que sale (out), quién se
// marcha por contrato cancelado (leave) y el saldo al empezar y al acabar.
// Los sueldos se cobran al empezar el día; lo que se gana ese día, después.
export function weekPlan(t=todayStr()){
  const fc=incomeForecast(CREW_DAYS,t), pays=payForecast(CREW_DAYS,incomeFn(fc),t), now=state.wallet.mc;
  let bal=now;
  const days=fc.map(inc=>{
    const p=pays.filter(x=>x.day===inc.day), out=p.filter(x=>x.ok).reduce((a,x)=>a+x.due,0);
    const leave=state.ship.crew.filter(m=>working(m)&&m.cancel&&addDays(m.until,1)===inc.day);
    const start=bal-out; bal=start+inc.total;
    return {day:inc.day,inc,pays:p,out,unpaid:p.filter(x=>!x.ok).reduce((a,x)=>a+x.due,0),leave,start,end:bal};
  });
  return {
    now, days, end:bal,
    risks:pays.filter(x=>!x.ok), tight:pays.filter(x=>x.tight),
    // los que tienen sueldo pendiente no cobran ningún día: su deuda crece
    debts:state.ship.crew.filter(m=>m.owed).map(m=>({id:m.id,name:m.name,debt:debtOf(m,t),perDay:dayWage(m)})),
    spent:lastWeekOut(t), none:fc.every(f=>f.none)
  };
}

// Un cobro previsto explicado: sueldo base, descuento y de dónde sale el saldo.
export function payDetail(p){
  const m=state.ship.crew.find(x=>x.id===p.id);
  return {...p, base:m?.wage??p.due, cut:wageCut(), lv:m?.lv??1, role:m?.role, paidTo:addDays(p.day,-1),
    paidBefore:state.wallet.mc+p.inc-p.bal, perDay:Math.ceil(p.due/CREW_DAYS-1e-9)};
}

export const inName=(c)=>BOOKS.in[c]||c, outName=(c)=>BOOKS.out[c]||c;
// Hay algo en rojo: un cobro que no llega ni con lo previsto.
export const booksAlert=()=>weekPlan().risks.length>0;

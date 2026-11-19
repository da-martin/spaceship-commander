/* Vista Contabilidad (pestaña de Spaceship, si está activada en Ajustes):
 * los próximos 7 días con las entradas y los gastos previstos y el saldo que
 * quedaría. Cada cifra abre un modal que explica de dónde sale. Los cálculos
 * están en core/forecast.js y core/books.js; aquí solo se pinta. */
import { CREW_LV, ROLES } from '../config.js';
import { firstDay, pastIn } from '../core/books.js';
import { inName, outName, payDetail, weekPlan } from '../core/forecast.js';
import { state } from '../store.js';
import { addDays, escapeHtml, fDate, FDAY, dayParse, plural, todayStr } from '../util.js';
import { uiMode } from './mode.js';

const C=(n)=>`${n}&nbsp;¢`;
const short=(d)=>FDAY[dayParse(d).getDay()]+' '+dayParse(d).getDate();
const when=(d)=>d===addDays(todayStr(),1)?'mañana':fDate(d);
const COUNT={task:['tarea','tareas'],habit:['hábito','hábitos'],free:['toque','toques'],mission:['misión','misiones']};
let plan=null;   // lo último pintado: los modales explican lo que se ve

/* ---------- punto de aviso ---------- */
// Rojo en la pestaña y en el botón Spaceship mientras algún cobro no llegue ni
// con lo previsto. Dentro de la vista sobra; el del botón, dentro de Spaceship.
function paintDots(p){
  const red=state.settings.showBooks&&p&&p.risks.length>0, inShip=['ship','alliance','vr','books'].includes(uiMode);
  document.querySelectorAll('[data-booksdot]').forEach(e=>{
    const tab=e.closest('#shipTabs');
    e.classList.toggle('hidden',!red||(tab?uiMode==='books':inShip));
  });
}
export function paintBooksTab(){ document.getElementById('booksTab').classList.toggle('hidden',!state.settings.showBooks); }

export function renderBooks(){
  plan=state.settings.showBooks?weekPlan():null;
  paintDots(plan);
  if(uiMode!=='books'||!plan) return;
  const p=plan, el=document.getElementById('booksBody');
  el.innerHTML=warnings(p)+summary(p)+days(p);
}

/* ---------- avisos: impago, justo, deudas ---------- */
function warnings(p){
  const out=[];
  for(const r of p.risks) out.push(`<div class="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-red-200">
    <div class="font-semibold">⚠ ${when(r.day)} · ${escapeHtml(r.name)} no cobrará</div>
    <div class="mono text-[11px] text-red-300 mt-0.5">sueldo ${C(r.due)} · saldo previsto ${C(r.bal)} · faltan ${C(r.short)}</div></div>`);
  for(const r of p.tight) out.push(`<div class="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-amber-200">
    <div class="font-semibold">${when(r.day)} · ${escapeHtml(r.name)} cobra si ganas lo de siempre</div>
    <div class="mono text-[11px] text-amber-300 mt-0.5">sueldo ${C(r.due)} · con el saldo de ahora no llega · si antes ganas ${C(r.rely)}</div></div>`);
  for(const d of p.debts) out.push(`<div class="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 mono text-[11px] text-amber-300">
    Deuda pendiente con ${escapeHtml(d.name)}: ${C(d.debt)} y sube ${C(d.perDay)} al día. Se paga en Nave › Tripulación.</div>`);
  return out.length?`<div class="space-y-2 mb-4">${out.join('')}</div>`:'';
}

function summary(p){
  const s=p.spent, since=s.from>addDays(todayStr(),-7);
  return `<section class="panel corner p-4 sm:p-5 mb-4">
    <div class="sys-label">Contabilidad</div>
    <h2 class="text-lg font-bold mt-1">Próximos 7 días</h2>
    <div class="text-sm text-slate-300 mt-2">
      Saldo <span class="mono font-semibold text-amber-200">${C(p.now)}</span>
      <span class="text-slate-500">&nbsp;·&nbsp;</span> en 7 días <span class="mono font-semibold ${p.end<p.now?'text-red-300':'text-amber-200'}">≈ ${C(p.end)}</span>
    </div>
    <div class="mono text-[11px] text-slate-400 mt-1">Gastado ${since?`desde el ${fDate(s.from)}`:'la última semana'}: ${C(s.total)}</div>
    ${p.none?`<p class="mono text-[11px] text-slate-400 border border-dashed border-slate-700 rounded-lg px-3 py-2 mt-3">Aún no hay datos de entradas · vuelve mañana. Mientras, solo se cuentan los sueldos con el saldo de ahora.</p>`:''}
    <p class="mono text-[11px] text-slate-500 mt-2">Pulsa una cifra para ver de dónde sale.</p>
  </section>`;
}

/* ---------- los 7 días ---------- */
function days(p){
  const top=Math.max(1,...p.days.map(d=>Math.max(d.inc.total,d.out+d.unpaid)));
  const bar=(n,cls)=>`<span class="bk-bar ${cls}" style="height:${n?Math.max(4,Math.round(n/top*100)):0}%"></span>`;
  return `<div class="bk-days">${p.days.map(d=>{
    const red=d.unpaid>0, tight=d.pays.some(x=>x.tight), gasto=d.out+d.unpaid, has=d.pays.length||d.leave.length;
    const inTxt=d.inc.none?'—':`+${C(d.inc.total)}${d.inc.est||d.inc.avg?'<span class="text-slate-500">*</span>':''}`;
    const outCls=red?'text-red-300':tight?'text-amber-300':'text-slate-300';
    return `<div class="bk-day panel px-3 py-1.5">
      <div class="bk-date mono text-[13px] ${red?'text-red-300':'text-slate-200'}">${short(d.day)}</div>
      <div class="bk-bars" aria-hidden="true">${bar(d.inc.total,'bg-emerald-400')}${bar(d.out,'bg-amber-400')}${bar(d.unpaid,'bg-red-400')}</div>
      ${d.inc.none?`<span class="bk-num mono text-sm text-slate-500">—</span>`
        :`<button type="button" data-bk="in" data-day="${d.day}" class="bk-num bk-btn mono text-sm text-emerald-300" aria-label="Entradas previstas el ${fDate(d.day)}: ${d.inc.total} ¢">${inTxt}</button>`}
      ${has?`<button type="button" data-bk="out" data-day="${d.day}" class="bk-num bk-btn mono text-sm ${outCls}" aria-label="Gastos previstos el ${fDate(d.day)}: ${gasto} ¢">${gasto?`−${C(gasto)}`:'baja'}${red?' ⚠':''}</button>`
        :`<span class="bk-num mono text-sm text-slate-500">—</span>`}
      <div class="bk-bal mono text-sm ${d.end<0?'text-red-300':'text-amber-200'}">${C(d.end)}</div>
    </div>`;
  }).join('')}</div>
  ${p.days.some(d=>d.inc.est||d.inc.avg)?'<p class="mono text-[11px] text-slate-500 mt-2">* estimado o media: aún no hay una semana entera en el libro.</p>':''}
  <p class="mono text-[11px] text-slate-500 mt-1">Los sueldos se cobran al empezar el día; lo que ganes ese día cuenta para los siguientes.</p>`;
}

/* ---------- modales ---------- */
function openModal(kind,title,body){
  document.getElementById('booksKind').textContent='Contabilidad // '+kind;
  document.getElementById('booksTitle').textContent=title;
  document.getElementById('booksModalBody').innerHTML=body;
  document.getElementById('booksModal').classList.remove('hidden');
  document.getElementById('booksClose').focus();
}
const closeModal=()=>document.getElementById('booksModal').classList.add('hidden');
const line=(a,b,cls='')=>`<div class="flex justify-between gap-3 ${cls}"><span>${a}</span><span class="mono tabular-nums">${b}</span></div>`;

function incomeModal(d){
  const f=d.inc, t=todayStr(), start=firstDay();
  let head, rows='';
  if(f.none) head='Aún no hay datos · vuelve mañana.';
  else if(f.avg) head=`≈ ${C(f.total)} — media de ${plural(f.refs.length,'día','días')}: aún no hay datos del mismo día de la semana pasada.`;
  else head=`≈ ${C(f.total)} — lo que entró el ${fDate(f.ref)}.`;
  if(f.cats){
    const cats=Object.entries(f.cats).sort((a,b)=>b[1]-a[1]);
    rows=cats.length?`<div class="space-y-1 text-sm mt-3">${cats.map(([c,n])=>line(`${inName(c)}${COUNT[c]&&f.n[c]?` <span class="mono text-[11px] text-slate-400">· ${plural(f.n[c],...COUNT[c])}</span>`:''}`,C(n))).join('')}
      ${line('Total',C(f.total),'border-t border-slate-800 pt-1 font-semibold')}</div>`
      :'<p class="text-sm text-slate-400 mt-3">Ese día no entró nada.</p>';
  } else if(f.avg) rows=`<div class="space-y-1 text-sm mt-3">${f.refs.map(r=>line(fDate(r),C(pastIn(r).total))).join('')}${line('Media',C(f.total),'border-t border-slate-800 pt-1 font-semibold')}</div>`;
  const mission=f.mission?`<p class="text-sm text-amber-300 mt-3">Incluye ${C(f.mission)} de ${f.avg?'misiones':'una misión'}: sin ${f.avg?'ellas':'ella'} serían ${C(f.total-f.mission)}.</p>`:'';
  const est=f.est?`<p class="mono text-[11px] text-slate-400 mt-2">Estimado: de antes de que hubiera libro. Se rehace con lo que pagaron tareas, hábitos y misiones; no cuenta tareas borradas, el Pilotaje ni ventas.</p>`:'';
  // la semana pasada, de la más antigua a ayer; la de referencia, marcada
  const week=Array.from({length:7},(_,i)=>addDays(t,i-7)).map(w=>{
    if(w<start) return `<span class="text-slate-600">${short(w)} —</span>`;
    const q=pastIn(w), ref=w===f.ref;
    return `<span class="${ref?'text-cyan-300 font-semibold':'text-slate-400'}">${short(w)} ${q.total}${q.est?' est.':''}</span>`;
  }).join(' · ');
  openModal('Entradas previstas',`Entradas · ${fDate(d.day)}`,`<p class="text-sm text-slate-200">${head}</p>${rows}${mission}${est}
    <div class="mono text-[11px] mt-4 leading-relaxed"><span class="text-slate-500">Semana pasada:</span> ${week}</div>
    <p class="mono text-[11px] text-slate-500 mt-3">Es una previsión: lo que entró el mismo día de la semana pasada. Lo que ganes hoy no cuenta: queda de margen.</p>`);
}

function expenseModal(d){
  const total=d.out+d.unpaid;
  const pays=d.pays.map(p=>{
    const x=payDetail(p), R=ROLES[x.role], lv=CREW_LV[x.lv-1];
    const calc=`<div class="mono text-[11px] text-slate-400 mt-1 space-y-0.5">
      ${line('Saldo ahora',C(state.wallet.mc))}
      ${line(`+ entradas previstas${d.day>addDays(todayStr(),1)?` hasta el ${fDate(addDays(d.day,-1))}`:''}`,C(x.inc))}
      ${x.paidBefore?line('− sueldos que se cobran antes',C(x.paidBefore)):''}
      ${line(`= saldo al empezar el ${fDate(d.day)}`,C(x.bal),'border-t border-slate-800 pt-0.5 text-slate-300')}</div>`;
    const state_=!p.ok?`<div class="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 mt-2"><div class="text-sm font-semibold text-red-300">⚠ No alcanza</div>${calc}
        <p class="text-[13px] text-red-200 mt-1">Faltan ${C(x.short)}${d.day===addDays(todayStr(),1)?': si los ganas hoy, cobra':''}. Si no cobra, deja de trabajar y su deuda sube ${C(x.perDay)} al día.</p></div>`
      :p.tight?`<div class="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 mt-2"><div class="text-sm font-semibold text-amber-300">Justo</div>${calc}
        <p class="text-[13px] text-amber-200 mt-1">Llega si antes ganas ${C(x.rely)}. Con el saldo de ahora solo, no.</p></div>`:'';
    return `<div class="border-t border-slate-800 pt-3 mt-3">
      <div class="text-sm font-semibold">${escapeHtml(x.name)} <span class="mono text-[11px] text-slate-400 font-normal">· ${R?.name||''} · ${lv?.name||''}</span></div>
      <div class="mono text-[11px] text-slate-400 mt-0.5">${C(x.base)}/sem${x.cut?` − ${x.cut} % Salón`:''} = ${C(x.due)} · pagado hasta el ${fDate(x.paidTo)}</div>${state_}</div>`;
  }).join('');
  const leave=d.leave.map(m=>`<p class="text-sm text-slate-300 border-t border-slate-800 pt-3 mt-3">${escapeHtml(m.name)} se marcha: contrato cancelado. No cobra.</p>`).join('');
  const head=!d.pays.length?'Sin sueldos ese día.'
    :d.unpaid&&!d.out?`−${C(total)} — sueldos que se renuevan ese día, y no llegan.`
    :`−${C(total)} — sueldos que se renuevan ese día${d.unpaid?` (${C(d.unpaid)} no llegan)`:''}.`;
  const v=plan.spent;
  openModal('Gastos previstos',`Gastos · ${fDate(d.day)}`,`<p class="text-sm text-slate-200">${head}</p>${pays}${leave}
    <p class="mono text-[11px] text-slate-500 mt-4">No incluye lo que decides cada vez: astillero, reparaciones, mercado ni barridos (${C(v.voluntary)} ${v.from>addDays(todayStr(),-7)?`desde el ${fDate(v.from)}`:'la última semana'}).</p>
    ${Object.keys(v.cats).length?`<div class="mono text-[11px] text-slate-500 mt-1">${Object.entries(v.cats).map(([c,n])=>`${outName(c)} ${n}`).join(' · ')}</div>`:''}`);
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('booksBody').addEventListener('click',e=>{
    const b=e.target.closest('[data-bk]'); if(!b||!plan) return;
    const d=plan.days.find(x=>x.day===b.dataset.day); if(!d) return;
    b.dataset.bk==='in'?incomeModal(d):expenseModal(d);
  });
  document.getElementById('booksClose').onclick=closeModal;
  document.getElementById('booksModal').addEventListener('click',e=>{ if(e.target.id==='booksModal') closeModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
}

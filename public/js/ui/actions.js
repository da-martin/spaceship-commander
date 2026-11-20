/* Lo que hacen los botones de la nave, la tripulación, los proyectos y las listas:
 * aplican la regla de core/, guardan, repintan y avisan. */
import { CREW_DAYS, CREW_LV, hasDeadline, MISSION_BY_ID, MODS, REP_DAYS, RES } from '../config.js';
import { earn, spend } from '../core/books.js';
import { crewUnlocked, hireBlock, nextLv, payDebt, promoteBlock, returnHome } from '../core/crew.js';
import { contractFrom, docked, boardNews, failUrgent, freshOffer, missionsUnlocked, onAccepted, slotsUsed, sweepCost, tickBoard } from '../core/missions.js';
import { isJump } from '../core/travel.js';
import { addW, checkHabit, gainText, grantTask, negText, subW, tapFree, tapNeg, uncheckHabit, wageOf } from '../core/rewards.js';
import { boardCap, herePrep, mod } from '../core/ship.js';
import { buyPrice, canAfford, modCost, onSale, repairQuote, sellOf, yardClosed } from '../core/shipyard.js';
import { dropFocusRef } from '../features/focus.js';
import { emit } from '../core/events.js';
import { save, state } from '../store.js';
import { render } from './commander.js';
import { toast } from './toast.js';
import { view } from './view.js';
import { addDays, fDate, todayStr, uid } from '../util.js';
/* ---------- tripulación ---------- */
export function hireCrew(id){
  if(!docked()||!crewUnlocked()) return;
  const sh=state.ship, x=sh.crewBoard.cands.find(c=>c.id===id); if(!x) return;
  const why=hireBlock(x); if(why){ toast(why); return; }
  const wage=CREW_LV[x.lv-1].wage, paid=wageOf(wage);
  subW('mc',paid); spend(paid,'crew');
  sh.crew.push({id:x.id,name:x.name,role:x.role,lv:x.lv,xp:CREW_LV[x.lv-1].xp,wage,until:addDays(todayStr(),CREW_DAYS-1),cancel:false,idle:false});
  emit('crewJoined',x);
  sh.crewBoard.cands=sh.crewBoard.cands.filter(c=>c.id!==id);
  state.cmd.stats.hires++;
  save(); render(); toast(`${x.name} se une a la tripulación · −${paid} ¢/sem, se renueva solo`);
}
// Ascenso: se paga ya lo mismo que el sueldo nuevo, que se cobra desde la próxima renovación.
export function promoteCrew(id){
  const m=state.ship.crew.find(c=>c.id===id); if(!m) return;
  const why=promoteBlock(m); if(why){ toast(why); return; }
  const L=nextLv(m), paid=wageOf(L.wage);
  subW('mc',paid); spend(paid,'crew'); m.lv++; m.wage=L.wage;
  emit('crewPromoted',m);
  save(); render(); toast(`${m.name} asciende a ${L.name.toLowerCase()} · −${paid} ¢, cobrará ${paid} ¢/sem`,'win');
}
// Con sueldo pendiente y en misión, cancelar es despedirle al volver al sistema.
export function toggleCancel(id){
  const m=state.ship.crew.find(c=>c.id===id); if(!m||m.idle) return;
  m.cancel=!m.cancel;
  save(); render();
  if(m.owed) toast(m.cancel?`${m.name} desembarcará al volver ${herePrep('a')}, sin cobrar la deuda`:`${m.name} sigue a bordo con su deuda`);
  else toast(m.cancel?`${m.name} trabajará hasta el ${fDate(m.until)} y se marchará`:`Contrato de ${m.name} mantenido · se renueva solo`);
}
export function settleDebt(id){
  const m=state.ship.crew.find(c=>c.id===id); if(!m?.owed) return;
  const paid=payDebt(m); if(paid===null){ toast('Recursos insuficientes'); return; }
  save(); render(); toast(`${m.name} cobra la deuda y la semana · −${paid} ¢ · vuelve al trabajo; próximo cobro el ${fDate(addDays(m.until,1))}`);
}
export function rehireCrew(id){
  const m=state.ship.crew.find(c=>c.id===id); if(!m||!m.idle) return;
  const due=wageOf(m.wage);
  if(state.wallet.mc<due){ toast('Recursos insuficientes'); return; }
  subW('mc',due); spend(due,'wages'); Object.assign(m,{until:addDays(todayStr(),CREW_DAYS-1),idle:false,cancel:false});
  save(); render(); toast(`${m.name} vuelve a contrato · −${due} ¢`);
}
export let crewReleasing=null;   // primer toque de «Despedir ya» pide confirmación
export function releaseCrew(id){
  if(!docked()) return;
  if(crewReleasing!==id){ crewReleasing=id; render(); return; }
  const m=state.ship.crew.find(c=>c.id===id); crewReleasing=null; if(!m) return;
  state.ship.crew=state.ship.crew.filter(c=>c.id!==id);
  save(); render(); toast(`${m.name} deja la nave`);
}

/* ---------- tablón y misión en curso ---------- */
/* acciones del tablón, módulos y mercado */
export let offerSailing=null;   // primer toque de «Aceptar y zarpar» pide confirmación
export function acceptOffer(id){
  const sh=state.ship; if(sh.contract||!missionsUnlocked()) return;
  const o=sh.board.offers.find(x=>x.id===id); if(!o) return;
  if(offerSailing!==id){ offerSailing=id; offerDiscarding=null; render(); return; }
  offerSailing=null;
  sh.contract=contractFrom(o);
  sh.board.offers=sh.board.offers.filter(x=>x.id!==id);
  onAccepted(sh.contract);   // capítulo de historia: su relato va a la bitácora
  save(); render(); scrollTo({top:0,behavior:'smooth'});
  const ch=o.story&&MISSION_BY_ID[o.mid];
  toast(`${ch?`Capítulo ${ch.chapter} aceptado: ${ch.title}`:`${hasDeadline(o)?'Misión aceptada':'Misión sin plazo aceptada'}: ${o.topic}`} · zarpas ${herePrep('de')}`);
}
export function abandonContract(){
  const c=state.ship.contract; if(!c||isJump(c)) return;   // el salto no se puede abandonar
  tickBoard();
  if(c.urgent) failUrgent(addDays(todayStr(),REP_DAYS-1));
  state.ship.contract=null; const r=[returnHome(),boardNews()].filter(Boolean).join(' · '); save(); render();
  toast((c.urgent?'Misión urgente abandonada · reputación dañada':'Misión abandonada')+' · de vuelta '+herePrep('en')+(r?' · '+r:''));
}
export function sweep(){
  if(!docked()||!missionsUnlocked()) return;
  tickBoard();
  const b=state.ship.board, cost=sweepCost();
  if(slotsUsed(b)>=boardCap()){ save(); render(); toast('Tablón lleno'); return; }
  if(state.wallet.mc<cost){ toast('Recursos insuficientes'); return; }
  subW('mc',cost); spend(cost,'sweep'); b.signal=0; b.offers.push(freshOffer(b.offers));
  save(); render(); toast(`Barrido de señal: nueva transmisión · −${cost} ¢`);
}
export let offerDiscarding=null;   // primer toque de ✕ pide confirmación
export function discardOffer(id){
  if(offerDiscarding!==id){ offerDiscarding=id; offerSailing=null; render(); return; }
  offerDiscarding=null;
  const b=state.ship.board; if(b.offers.find(o=>o.id===id)?.story) return;   // la historia no se descarta
  b.offers=b.offers.filter(o=>o.id!==id);
  tickBoard(); save(); render(); toast(['Misión descartada',boardNews()].filter(Boolean).join(' · '));
}

/* ---------- proyectos ---------- */
export function addProject(name,due){ const p={id:uid(),name:name.trim().slice(0,80),due:due||null,createdAt:Date.now()}; state.projects.push(p); save(); return p; }
// Borrar un proyecto no borra tareas: las deja sin proyecto.
export function deleteProject(id){
  const n=state.tasks.filter(x=>x.projectId===id).length;
  state.tasks.forEach(x=>{ if(x.projectId===id) x.projectId=null; });
  state.projects=state.projects.filter(p=>p.id!==id);
  if(view.pFilter===id) view.pFilter=null;
  view.projEdit=null; view.projDel=null; save(); render();
  toast(n?`Proyecto eliminado · ${n} ${n===1?'tarea se queda':'tareas se quedan'} sin proyecto`:'Proyecto eliminado');
}

/* ---------- astillero y mercado ---------- */
export function buildMod(k){
  const c=modCost(k); if(!c||!docked()||yardClosed(k)) return;
  if(!canAfford(c)){ toast('Recursos insuficientes'); return; }
  tickBoard();   // la señal acumulada hasta ahora va al ritmo de antes
  for(const [r,n] of Object.entries(c)) subW(r,n); spend(c.mc,'yard');
  const m=mod(k); if(m.lv===0) m.cond=100; m.lv++;
  tickBoard();   // con un hueco más entra la transmisión que esperaba
  save(); render(); toast(`${MODS[k].name} Nv.${m.lv} ✓`);
}
export function repairMod(k){
  const m=mod(k), q=repairQuote(k);
  if(q.pts<=0){ toast('Recursos insuficientes'); return; }
  subW('mc',q.mc); spend(q.mc,'repair'); m.cond+=q.pts; save(); render(); toast(`${MODS[k].name} reparado +${q.pts}%`);
}
export function buyMat(k,n){
  if(!docked()||!onSale(k)) return;
  const c=buyPrice(k)*n; if(state.wallet.mc<c){ toast('Recursos insuficientes'); return; }
  subW('mc',c); spend(c,'buy'); addW(k,n); save(); render(); toast(`+${n} ${RES[k].sym} ${RES[k].name} · −${c} ¢`);
}
export function sellMat(k){
  if(state.wallet[k]<1||!docked()||!onSale(k)) return;
  const p=sellOf(k); subW(k,1); addW('mc',p); earn(p,'sale'); save(); render(); toast(`−1 ${RES[k].sym} · +${p} ¢`);
}

/* ---------- listas de Commander ---------- */
export function toggleHabitToday(h){
  const k=todayStr(); h.log=h.log||{};
  if(h.type==='neg'){ const hit=tapNeg(h,k); save(); render(); toast(negText(hit)); return; }
  if(h.type==='free'){ const g=tapFree(h,k); save(); render(); toast(gainText(g)); return; }
  if((h.log[k]||0)>=1){ uncheckHabit(h,k); h.log[k]=0; }
  else { h.log[k]=1; const g=checkHabit(h,k); save(); render(); toast(gainText(g)); return; }
  save(); render();
}
export function completeTask(x){ x.done=true; const g=grantTask(x); save(); render(); toast(gainText(g)); return g; }
export function deleteTask(id){ state.tasks=state.tasks.filter(y=>y.id!==id); dropFocusRef(id); save(); render(); toast('Tarea eliminada'); }
export function deleteHabit(id){ state.habits=state.habits.filter(y=>y.id!==id); dropFocusRef(id); save(); render(); toast('Hábito eliminado'); }

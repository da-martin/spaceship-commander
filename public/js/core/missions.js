import { AGE_BONUS, DIFFS, effOf, MATS, MISSION_BY_ID, OFFER_TTL, REP_DAYS, SWEEP_MC, URGENT_BONUS, URGENT_P, URGENT_TTL } from '../config.js';
import { returnHome } from './crew.js';
import { addW, perk, subW } from './rewards.js';
import { boardCap, cargoMult, maxDays, mod, repDamaged, signalRate } from './ship.js';
import { fmtCost, modCost } from './shipyard.js';
import { fDate } from '../features/focus.js';
import { logShip } from '../features/log.js';
import { MISSIONS } from '../missions.js';
import { save, state } from '../store.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';
import { addDays, dayParse, fmtEf, pick, todayStr, uid } from '../util.js';

export const RECENT_MAX = 40;   // las últimas misiones que salieron en el tablón no vuelven a salir
// El relato de un final ('win' | 'partial' | 'fail'). Las misiones de antes del
// catálogo no traen `mid`: se buscan por su frase.
export function missionStory(c,kind){
  const m=MISSION_BY_ID[c?.mid]||MISSIONS.find(x=>x.flavor===c?.flavor);
  return m?.[kind]||null;
}

export function finishContract(frac){
  const c=state.ship.contract; if(!c) return null;
  const p={mc:Math.floor(c.reward.mc*frac*cargoMult()*(1+perk('navigator'))),mats:{}};
  addW('mc',p.mc);
  for(const [k,n] of Object.entries(c.reward.mats||{})){ const q=Math.floor(n*frac); if(q){ addW(k,q); p.mats[k]=q; } }
  state.ship.contract=null;
  return p;
}
// Ritmo diario de los últimos 14 días (sin hoy), en puntos de esfuerzo. Se lee del historial real de
// tareas y hábitos, y del contador de la nave para lo que ya no está (tareas
// borradas). Se divide solo entre los días que hay historial: dividir siempre
// entre 14 hundía la media de quien llevaba poco tiempo y las cuotas salían bajas.
export function avgDaily(){
  const t=todayStr(), act=state.ship.activity, hist={};
  let first=t;
  const seen=(d)=>{ if(d&&d<first) first=d; };
  for(const d of Object.keys(act)) if(act[d]>0) seen(d);
  // los puntos que dio cada cosa ese día; si no se guardaron, los de su dificultad actual
  for(const x of state.tasks) if(x.done&&x.doneOn){ hist[x.doneOn]=(hist[x.doneOn]||0)+(x.grant?.ef??effOf(x)); seen(x.doneOn); }
  for(const h of state.habits){
    if(h.type==='neg') continue;
    if(h.createdAt) seen(todayStr(new Date(h.createdAt)));
    for(const [d,n] of Object.entries(h.log||{})) if(n>0){ hist[d]=(hist[d]||0)+(h.g?.[d]?.ef??effOf(h)); seen(d); }
  }
  const span=Math.min(14,Math.max(3,Math.round((dayParse(t)-dayParse(first))/864e5)));
  let s=0;
  for(let i=1;i<=14;i++){ const d=addDays(t,-i); s+=Math.max(act[d]||0,hist[d]||0); }
  return Math.max(1.5,s/span);
}
export function pickDiff(keys=Object.keys(DIFFS)){
  let r=Math.random()*keys.reduce((a,k)=>a+DIFFS[k].w,0);
  for(const k of keys){ r-=DIFFS[k].w; if(r<0) return k; }
  return keys[keys.length-1];
}
// La misión se sortea entre las que no han salido hace poco ni están en el tablón o en curso.
export function pickMission(){
  const sh=state.ship, busy=new Set([...sh.recentMissions,...sh.board.offers.map(o=>o.mid),sh.contract?.mid]);
  const free=MISSIONS.filter(m=>!busy.has(m.id));
  const m=pick(free.length?free:MISSIONS);
  sh.recentMissions=[...sh.recentMissions.filter(id=>id!==m.id),m.id].slice(-RECENT_MAX);
  return m;
}
// la Bodega se aplica al cobrar; las urgentes caducan antes y pagan más (no llegan con mala reputación).
// `safe`: fácil o normal y no urgente, para que el tablón nunca se quede solo con retos.
export function genOffer(day,safe=false){
  const m=pickMission(), topic=m.topic, days=2+Math.floor(Math.random()*(maxDays()-1));
  const diff=safe?pickDiff(['easy','normal']):pickDiff(), D=DIFFS[diff];
  const urgent=!safe&&!repDamaged(day)&&Math.random()<URGENT_P, [lo,hi]=urgent?URGENT_TTL:OFFER_TTL;
  const quota=Math.max(2,Math.round(days*avgDaily()*D.push));
  const mc=Math.round(quota*12*D.pay*(1+0.08*(days-1))*(urgent?1+URGENT_BONUS:1));
  const mats={}, units=1+Math.floor(Math.random()*3)+Math.floor(days/3)+D.mats;
  for(let i=0;i<units;i++){ const k=pick(MATS); mats[k]=(mats[k]||0)+1; }
  return {id:uid(),mid:m.id,topic,flavor:m.flavor,days,quota,diff,reward:{mc,mats},urgent,postedOn:day,expiresOn:addDays(day,lo+Math.floor(Math.random()*(hi-lo+1))-1)};
}
// si en el tablón no queda ninguna fácil o normal sin urgencia, la que llega lo es
export function freshOffer(existing,day=todayStr()){
  const safe=!existing.some(o=>o.diff!=='hard'&&!o.urgent);
  return genOffer(day,safe);   // pickMission ya evita las del tablón y las recientes
}
export const offerAge=(o)=>Math.max(0,Math.round((dayParse(todayStr())-dayParse(o.postedOn))/864e5));
export const agedMc=(o)=>Math.round(o.reward.mc*(1+AGE_BONUS*offerAge(o)));   // la paga sube cada día que sigue en el tablón
// señal en tiempo real, simulada día a día: caducan las viejas y llegan nuevas mientras haya hueco
export function tickBoard(){
  const b=state.ship.board, now=Date.now();
  // Congelado hasta la Antena. Vaciar sigAt en cada tick es lo que evita que al
  // desbloquear se reproduzcan los días acumulados y entren varias de golpe:
  // la primera llamada tras abrirlo cae en la rama de «primera vez» de abajo.
  if(!missionsUnlocked()){ b.sigAt=null; return; }
  if(!b.sigAt){ b.sigAt=now; b.signal=1; }   // primera vez: una transmisión al momento
  let at=Math.min(now,Math.max(b.sigAt,now-7*864e5));
  for(;;){
    const day=todayStr(new Date(at)), end=Math.min(now,dayParse(addDays(day,1)).getTime()), n=b.offers.length;
    b.offers=b.offers.filter(o=>o.expiresOn>=day); b.news.lost+=n-b.offers.length;
    b.signal+=(end-at)/864e5*signalRate(day);
    while(b.signal>=1&&b.offers.length<boardCap()){ b.signal-=1; b.offers.push(freshOffer(b.offers,day)); b.news.got++; }
    b.signal=Math.min(1,b.signal);   // tablón lleno: la barra espera al 100%
    at=end; if(at>=now) break;
  }
  b.sigAt=now;
}
// aviso de lo que llegó o caducó desde el último aviso (en misión se acumula hasta volver)
export function takeBoardNews(){
  const n=state.ship.board.news, r={got:n.got,lost:n.lost};
  n.got=n.lost=0;
  return (r.got||r.lost)?r:null;
}
export function boardText(r){
  const parts=[];
  if(r.got) parts.push(`${r.got} ${r.got===1?'transmisión nueva':'transmisiones nuevas'}`);
  if(r.lost) parts.push(`${r.lost} ${r.lost===1?'caducada':'caducadas'}`);
  return 'Tablón: '+parts.join(' · ');
}
export function boardNews(){ const r=takeBoardNews(); return r?boardText(r):null; }
export function logBoardNews(){ const r=takeBoardNews(); if(r) logShip({kind:'board',...r,title:boardText(r)}); }
export function failUrgent(until){ const b=state.ship.board; if(!b.repUntil||b.repUntil<until) b.repUntil=until; state.cmd.stats.urgentFails++; }

// La misión vence a la hora exacta del plazo: se comprueba en cada tick y cada minuto.
// Devuelve true si terminó. Sin repaso de ayer pendiente: lo marcado allí aún puede contar.
export function checkContractEnd(){
  const sh=state.ship, c=sh.contract;
  if(!c||Date.now()<c.endsAt) return false;
  if(c.urgent) failUrgent(addDays(c.endsOn,REP_DAYS));   // la reputación cae desde el día siguiente al plazo
  tickBoard();
  const home=['De vuelta en el Sistema Madre',returnHome()].filter(Boolean);
  if(c.urgent){
    sh.contract=null;
    logShip({kind:'mission',big:true,tone:'bad',title:`Misión urgente ${c.topic} fallida`,story:missionStory(c,'fail'),
      lines:[`Plazo agotado con ${fmtEf(c.progress)}/${c.quota}: sin cobro.`,`Reputación dañada hasta el ${fDate(sh.board.repUntil)}: la señal llega a la mitad y no hay misiones urgentes.`,...home]});
  } else {
    const p=finishContract(c.progress/c.quota);
    logShip({kind:'mission',big:true,tone:'warn',title:`Misión ${c.topic} expirada`,rew:p,story:missionStory(c,c.progress>0?'partial':'fail'),
      lines:[`Plazo agotado con ${fmtEf(c.progress)}/${c.quota}: cobras la parte hecha.`,...home]});
  }
  return true;
}
export const atHome=()=>!state.ship.contract;   // fuera del Sistema Madre no hay tablón, mercado ni astillero
// Las misiones se abren con la Antena. La segunda condición evita dejar a nadie
// tirado a mitad de una misión si llegara con la Antena sin mejorar.
export const missionsUnlocked=()=>mod('comms').lv>=1||!!state.ship.contract;
export const missionHint=()=>`Mejora la Antena a nivel 1 para recibir misiones · ${fmtCost(modCost('comms'))}`;
/* acciones del tablón, módulos y mercado */
export let offerSailing=null;   // primer toque de «Aceptar y zarpar» pide confirmación
export function acceptOffer(id){
  const sh=state.ship; if(sh.contract||!missionsUnlocked()) return;
  const o=sh.board.offers.find(x=>x.id===id); if(!o) return;
  if(offerSailing!==id){ offerSailing=id; offerDiscarding=null; render(); return; }
  offerSailing=null;
  const now=new Date(), end=new Date(now); end.setDate(end.getDate()+o.days);   // cada día de plazo son 24 h desde ahora
  sh.contract={...o,reward:{...o.reward,mc:agedMc(o)},acceptedOn:todayStr(now),acceptedAt:now.getTime(),endsOn:todayStr(end),endsAt:end.getTime(),progress:0};
  sh.board.offers=sh.board.offers.filter(x=>x.id!==id);
  save(); render(); scrollTo({top:0,behavior:'smooth'}); toast(`Misión aceptada: ${o.topic} · zarpas del Sistema Madre`);
}
export function abandonContract(){
  const c=state.ship.contract; if(!c) return;
  tickBoard();
  if(c.urgent) failUrgent(addDays(todayStr(),REP_DAYS-1));
  state.ship.contract=null; const r=[returnHome(),boardNews()].filter(Boolean).join(' · '); save(); render();
  toast((c.urgent?'Misión urgente abandonada · reputación dañada':'Misión abandonada')+' · de vuelta en el Sistema Madre'+(r?' · '+r:''));
}
// barrido de señal: paga lo que le falta a la barra y la transmisión llega ya
export const sweepCost=()=>Math.max(1,Math.ceil((1-state.ship.board.signal)*SWEEP_MC-1e-9));
export function sweep(){
  if(!atHome()||!missionsUnlocked()) return;
  tickBoard();
  const b=state.ship.board, cost=sweepCost();
  if(b.offers.length>=boardCap()){ save(); render(); toast('Tablón lleno'); return; }
  if(state.wallet.mc<cost){ toast('Recursos insuficientes'); return; }
  subW('mc',cost); b.signal=0; b.offers.push(freshOffer(b.offers));
  save(); render(); toast(`Barrido de señal: nueva transmisión · −${cost} ¢`);
}
export let offerDiscarding=null;   // primer toque de ✕ pide confirmación
export function discardOffer(id){
  if(offerDiscarding!==id){ offerDiscarding=id; offerSailing=null; render(); return; }
  offerDiscarding=null;
  const b=state.ship.board; b.offers=b.offers.filter(o=>o.id!==id);
  tickBoard(); save(); render(); toast(['Misión descartada',boardNews()].filter(Boolean).join(' · '));
}

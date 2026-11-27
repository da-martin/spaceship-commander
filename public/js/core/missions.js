import { AGE_BONUS, DIFFS, effOf, hasDeadline, HEAVY_P, HEAVY_P_ART, HIT, isAway, MATS, MISSION_BY_ID, MODS, OFFER_TTL, REGEN, REP_DAYS, RES, SHIELD_GAP, SIZES, SPEED_BONUS, SWEEP_MC, threatFor, THREATS, TRAIT_ROLL, TRAITS, URGENT_BONUS, WINDOW_MULT, URGENT_P, URGENT_TTL } from '../config.js';
import { missionCrewXp, returnHome } from './crew.js';
import { earn } from './books.js';
import { logShip } from './log.js';
import { addW, perk } from './rewards.js';
import { boardCap, cargoMult, here, herePrep, maxDays, mod, repDamaged, signalRate, wear } from './ship.js';
import { fmtCost, modCost } from './shipyard.js';
import { arrive, isJump, tellJump } from './travel.js';
import { MISSIONS } from '../missions.js';
import { state } from '../store.js';
import { addDays, dayParse, fDate, fmtEf, pick, todayStr, uid } from '../util.js';

export const RECENT_MAX = 40;   // las últimas misiones que salieron en el tablón no vuelven a salir
// El relato de un final ('win' | 'partial' | 'fail'). Las misiones de antes del
// catálogo no traen `mid`: se buscan por su frase.
export function missionStory(c,kind){
  const m=MISSION_BY_ID[c?.mid]||MISSIONS.find(x=>x.flavor===c?.flavor);
  return m?.[kind]||null;
}

// `fast`: llegó dentro de los días de la bonificación de rapidez (+SPEED_BONUS de ¢)
export function finishContract(frac,fast=false){
  const c=state.ship.contract; if(!c) return null;
  const p={mc:Math.floor(c.reward.mc*frac*cargoMult()*(1+perk('navigator'))*(fast?1+SPEED_BONUS:1)),mats:{}};
  if(fast) p.fast=true;
  addW('mc',p.mc); earn(p.mc,'mission');
  for(const [k,n] of Object.entries(c.reward.mats||{})){ const q=Math.floor(n*frac); if(q){ addW(k,q); p.mats[k]=q; } }
  missionCrewXp(c,true);
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
// La misión se sortea del catálogo del sistema, entre las que no han salido hace poco ni están en el tablón o en curso.
// Sin plazo sale cualquiera. Las urgentes, solo las que no son `open: true` (sus finales hablan de plazos).
export function pickMission(urgent=false){
  const sh=state.ship, busy=new Set([...sh.recentMissions,...sh.board.offers.map(o=>o.mid),sh.contract?.mid]);
  const all=here().missions, timed=all.filter(m=>!m.open), cat=urgent&&timed.length?timed:all;
  const free=cat.filter(m=>!busy.has(m.id));
  const m=pick(free.length?free:cat);
  sh.recentMissions=[...sh.recentMissions.filter(id=>id!==m.id),m.id].slice(-RECENT_MAX);
  return m;
}
// La Bodega se aplica al cobrar. Las urgentes son las únicas con plazo: caducan antes y pagan
// más (no llegan con mala reputación). Las demás, sin plazo (genOpenOffer).
// `safe`: fácil o normal y no urgente, para que el tablón nunca se quede solo con retos.
export function genOffer(day,safe=false){
  const urgent=!safe&&!repDamaged(day)&&Math.random()<URGENT_P;
  if(!urgent) return genOpenOffer(day,safe);
  const m=pickMission(true), topic=m.topic, days=2+Math.floor(Math.random()*(maxDays()-1));
  const diff=pickDiff(), D=DIFFS[diff], [lo,hi]=URGENT_TTL;
  // con plazo, la cuota sigue tu ritmo medio, pero la dificultad no la sube
  const quota=Math.max(2,Math.round(days*avgDaily()));
  const mc=Math.round(quota*12*D.pay*(1+0.08*(days-1))*(1+URGENT_BONUS));
  const mats=rollMats(days,D);
  return {id:uid(),kind:'run',mid:m.id,topic,flavor:m.flavor,days,quota,diff,reward:{mc,mats},urgent,postedOn:day,expiresOn:addDays(day,lo+Math.floor(Math.random()*(hi-lo+1))-1)};
}
export function pickSize(){
  let r=Math.random();
  for(const [k,S] of Object.entries(SIZES)){ r-=S.w; if(r<0) return k; }
  return 'mid';
}
// Rasgos (fase C): uno por casilla de TRAIT_ROLL, sin repetir, de los tipos que admite la casilla.
export function rollTraits(diff){
  const out=[];
  for(const kinds of TRAIT_ROLL[diff]||TRAIT_ROLL.normal){
    const pool=Object.keys(TRAITS).filter(k=>kinds.includes(TRAITS[k].kind)&&!out.includes(k));
    if(pool.length) out.push(pick(pool));
  }
  return out;
}
export const hasTrait=(c,k)=>!!c?.traits?.includes(k);
const r2=(v)=>Math.round(v*100)/100;
// Cuánto cuenta para la misión lo que llega de `src` ({kind:'task'|'habit', diff}) el día `day`.
export function traitMult(c,src={},day=todayStr()){
  const kind=src.kind==='habit'?'habit':'task', diff=src.diff||'normal';
  let m=1;
  for(const t of c?.traits||[]){
    if(t==='solar'&&(diff==='hard'||diff==='epic')) m*=1.5;
    else if(t==='window'&&!(c.daily?.[day]>0)) m*=WINDOW_MULT;
    else if(t==='habits') m*=kind==='habit'?1.5:0.5;
    else if(t==='errands') m*=kind==='task'?1.5:0.5;
    else if(t==='armored'&&(diff==='micro'||diff==='easy')) m*=0.5;
  }
  return m;
}
// Tormenta iónica: una caída de un hábito negativo resta sus puntos a la misión. Devuelve
// lo que restó ({c,n}) para que deshacer la caída lo devuelva, o null.
export function stormLoss(h,day=todayStr()){
  const c=state.ship.contract;
  if(!hasTrait(c,'storm')||hasDeadline(c)||(c.acceptedOn||'')>day) return null;
  const n=Math.min(c.progress,effOf(h)); if(!(n>0)) return null;
  c.progress=r2(c.progress-n);
  return {c:c.id,n};
}
export function stormUndo(x){ const c=state.ship.contract; if(x&&c?.id===x.c) c.progress=r2(c.progress+x.n); }
function rollMats(days,D){
  const mats={}, units=1+Math.floor(Math.random()*3)+Math.floor(days/3)+D.mats;
  for(let i=0;i<units;i++){ const k=pick(MATS); mats[k]=(mats[k]||0)+1; }
  return mats;
}
// Misión sin plazo: te saca del sistema como cualquier otra y termina al reunir la cuota (o al abandonarla).
// La cuota es la distancia fija de su tamaño, sin mirar tu ritmo. La paga por punto es la de
// una misión de 1 día y no sube con la espera; llegar en `window` días suma SPEED_BONUS. Nunca es urgente.
export function genOpenOffer(day,safe=false){
  const m=pickMission(), size=pickSize(), S=SIZES[size];
  const diff=safe?pickDiff(['easy','normal']):pickDiff(), D=DIFFS[diff];
  const quota=S.pts, mc=Math.round(quota*12*D.pay);
  const mats=rollMats(S.days,D), [tlo,thi]=OFFER_TTL;
  return {id:uid(),kind:'open',mid:m.id,topic:m.topic,flavor:m.flavor,size,window:S.days,threat:threatFor(m.topic),traits:rollTraits(diff),quota,diff,reward:{mc,mats},urgent:false,postedOn:day,expiresOn:addDays(day,tlo+Math.floor(Math.random()*(thi-tlo+1))-1)};
}
// Historia del sistema: el capítulo pendiente llega al tablón como misión sin plazo,
// media y de dificultad normal. No caduca ni ocupa hueco, y vuelve si se abandona.
export const STORY_TTL='9999-12-31';
export const storyDone=(id=state.ship.system)=>state.ship.story[id]||0;
export const nextChapter=()=>here().story[storyDone(here().id)]||null;
export function storyOffer(day=todayStr()){
  const ch=nextChapter(); if(!ch) return null;
  const S=SIZES.mid, D=DIFFS.normal, quota=S.pts;
  return {id:uid(),kind:'open',story:true,chapter:ch.chapter,mid:ch.id,topic:ch.topic,flavor:ch.flavor,size:'mid',window:S.days,threat:threatFor(ch.topic),quota,diff:'normal',
    reward:{mc:Math.round(quota*12*D.pay),mats:rollMats(S.days,D)},urgent:false,postedOn:day,expiresOn:STORY_TTL};
}
// Las ofertas que ocupan hueco en el tablón (las de historia, no).
export const slotsUsed=(b=state.ship.board)=>b.offers.filter(o=>!o.story).length;
// Al aceptar un capítulo, su relato de entrada va a la bitácora.
export function onAccepted(c){
  const m=c?.story&&MISSION_BY_ID[c.mid];
  if(m) logShip({kind:'mission',tone:'info',title:`Capítulo ${m.chapter}: ${m.title}`,story:m.brief||null});
}
// El contrato que sale de aceptar una oferta. Con plazo, cada día son 24 h desde ahora.
// Sin plazo, `bonusAt` es hasta cuándo cuenta la bonificación de rapidez.
export function contractFrom(o,now=new Date()){
  const c={...o,reward:{...o.reward,mc:agedMc(o)},acceptedOn:todayStr(now),acceptedAt:now.getTime(),progress:0};
  if(!hasDeadline(o)){
    if(o.window) c.bonusAt=now.getTime()+o.window*864e5;
    // amenaza: el escudo empieza cargado y el primer impacto ya se sabe si será fuerte
    if(THREATS[o.threat]) Object.assign(c,{shield:{armed:false,readyOn:c.acceptedOn},heavy:Math.random()<heavyP(c),hits:0,blocked:0});
    if(c.traits?.length) c.daily={};   // puntos que contaron cada día: Ventana de lanzamiento y Regenerativo
    return c;
  }
  const end=new Date(now); end.setDate(end.getDate()+o.days);
  return {...c,endsOn:todayStr(end),endsAt:end.getTime()};
}
// si en el tablón no queda ninguna fácil o normal sin urgencia (sin contar la historia), la que llega lo es
export function freshOffer(existing,day=todayStr()){
  const safe=!existing.some(o=>!o.story&&o.diff!=='hard'&&!o.urgent);
  return genOffer(day,safe);   // pickMission ya evita las del tablón y las recientes
}
export const offerAge=(o)=>Math.max(0,Math.round((dayParse(todayStr())-dayParse(o.postedOn))/864e5));
export const agedMc=(o)=>hasDeadline(o)?Math.round(o.reward.mc*(1+AGE_BONUS*offerAge(o))):o.reward.mc;   // la paga sube cada día que sigue en el tablón (las sin plazo, no)
// señal en tiempo real, simulada día a día: caducan las viejas y llegan nuevas mientras haya hueco
export function tickBoard(){
  const b=state.ship.board, now=Date.now();
  // Congelado hasta la Antena. Vaciar sigAt en cada tick es lo que evita que al
  // desbloquear se reproduzcan los días acumulados y entren varias de golpe:
  // la primera llamada tras abrirlo cae en la rama de «primera vez» de abajo.
  if(!missionsUnlocked()||isJump(state.ship.contract)){ b.sigAt=null; return; }   // también durante el salto
  if(!b.sigAt){ b.sigAt=now; b.signal=1; }   // primera vez: una transmisión al momento
  let at=Math.min(now,Math.max(b.sigAt,now-7*864e5));
  for(;;){
    const day=todayStr(new Date(at)), end=Math.min(now,dayParse(addDays(day,1)).getTime()), n=b.offers.length;
    b.offers=b.offers.filter(o=>o.expiresOn>=day); b.news.lost+=n-b.offers.length;
    b.signal+=(end-at)/864e5*signalRate(day);
    while(b.signal>=1&&slotsUsed(b)<boardCap()){ b.signal-=1; b.offers.push(freshOffer(b.offers,day)); b.news.got++; }
    b.signal=Math.min(1,b.signal);   // tablón lleno: la barra espera al 100%
    at=end; if(at>=now) break;
  }
  b.sigAt=now;
  const ch=nextChapter();
  if(ch&&!b.offers.some(o=>o.story)&&state.ship.contract?.mid!==ch.id){ const o=storyOffer(todayStr(new Date(now))); b.offers.unshift(o); }
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
  if(isJump(c)){ tellJump(); if(!arrive()) return false; tickBoard(); return true; }   // el salto: fragmentos diarios y llegada
  if(!c||!hasDeadline(c)||Date.now()<c.endsAt) return false;
  if(c.urgent) failUrgent(addDays(c.endsOn,REP_DAYS));   // la reputación cae desde el día siguiente al plazo
  tickBoard();
  const home=['De vuelta '+herePrep('en'),returnHome()].filter(Boolean);
  if(c.urgent){
    missionCrewXp(c,true);
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
// Amenaza (docs/plan-misiones.md, fase B): el impacto de la noche que cierra `day`.
// El día en que se acepta no hay impacto. El daño es fijo, no depende del ritmo.
export const hitOf=(c,heavy=c.heavy)=>(HIT[c.diff]||HIT.normal)*(heavy?2:1);
export const heavyP=(c)=>hasTrait(c,'artillery')?HEAVY_P_ART:HEAVY_P;
export function missionNight(day){
  const c=state.ship.contract;
  if(!c||!THREATS[c.threat]||!c.shield||hasDeadline(c)||day<=c.acceptedOn) return;
  const T=THREATS[c.threat], heavy=!!c.heavy, sh=c.shield;
  c.heavy=Math.random()<heavyP(c);   // el siguiente se sortea ya, para poder avisar
  // Regenerativo: un día sin avance, la misión retrocede (el escudo no lo para)
  if(hasTrait(c,'regen')&&!(c.daily?.[day]>0)&&c.progress>0){
    const n=Math.min(c.progress,r2(c.quota*REGEN)); c.progress=r2(c.progress-n);
    logShip({kind:'mission',tone:'warn',title:`Regenerativo: la misión retrocede ${fmtEf(n)} ${n===1?'punto':'puntos'}`,lines:['Un día entero sin avanzar.']});
  }
  if(c.daily) for(const d of Object.keys(c.daily)) if(d<addDays(day,-7)) delete c.daily[d];   // solo hacen falta los últimos días
  if(sh.armed){
    sh.armed=false; sh.readyOn=addDays(day,SHIELD_GAP+1); c.blocked++;
    logShip({kind:'mission',tone:'info',title:`Escudo: impacto${heavy?' fuerte':''} bloqueado`,
      lines:[pick(T.blocks),`Vuelve a estar listo el ${fDate(sh.readyOn)}.`]});
    return;
  }
  c.hits++;
  const w=wear({},hitOf(c,heavy)), lines=[w?pick(T.hits).replace('{m}',MODS[w.k].the):T.hit+'.'];   // sin daño (Ingeniería lo absorbe todo), la frase general
  // Saqueadores: el impacto se lleva 1 material de la recompensa
  const loot=hasTrait(c,'looters')&&Object.keys(c.reward.mats||{}).filter(k=>c.reward.mats[k]>0);
  if(loot&&loot.length){ const k=pick(loot); if(!--c.reward.mats[k]) delete c.reward.mats[k]; lines.push(`Los saqueadores se llevan 1 ${RES[k].sym} ${RES[k].name} de la recompensa.`); }
  logShip({kind:'mission',tone:'warn',title:`${T.name}: impacto${heavy?' fuerte':''}${w?` en ${MODS[w.k].name} −${w.n} %`:''}`,lines});
}
// El escudo bloquea el siguiente impacto. Tras bloquear, se recarga durante SHIELD_GAP impactos.
// Desactivarlo no lo gasta.
export const shieldReady=(c,day=todayStr())=>!!c?.shield&&!c.shield.armed&&day>=c.shield.readyOn;
export function armShield(on=true){
  const c=state.ship.contract; if(!c?.shield) return false;
  if(on&&!shieldReady(c)) return false;
  c.shield.armed=on;
  return true;
}
// Atracado en el sistema: sin contrato, o con uno que no te saca de él. Fuera no hay tablón, mercado ni astillero.
export const docked=()=>!isAway(state.ship.contract);
// Las misiones se abren con la Antena. La segunda condición evita dejar a nadie
// tirado a mitad de una misión si llegara con la Antena sin mejorar.
export const missionsUnlocked=()=>mod('comms').lv>=1||!!state.ship.contract;
export const missionHint=()=>`Mejora la Antena a nivel 1 para recibir misiones · ${fmtCost(modCost('comms'))}`;
// barrido de señal: paga lo que le falta a la barra y la transmisión llega ya
export const sweepCost=()=>Math.max(1,Math.ceil((1-state.ship.board.signal)*SWEEP_MC-1e-9));

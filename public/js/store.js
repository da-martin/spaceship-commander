/* La partida: normalización (también de partidas antiguas), carga y guardado
 * en localStorage. save() avisa con `saved` (la nube programa la subida). */
import { UPDATES } from './config.js';
import { AREAS, BOOKS, CONTRACT_KINDS, CREW_HIRE_MAX, hasDeadline, CREW_LV, DIFFS, EFFORT, HABIT_TYPES, LOG_MAX, MISSION_BY_ID, MODS, NOTES_MAX, OFFER_TTL, ROLES, SIZES } from './config.js';
import { emit, on } from './core/events.js';
import { RECENT_MAX } from './core/missions.js';
import { clampInt, todayStr, uid } from './util.js';
import { normRpg } from './rpg/state.js';
import { HOME, SYSTEMS } from './systems.js';

export const KEY = 'spaceship-commander:v1';
export const SHIP_NAME_MAX = 20;
export const SHIP_NAME_DEFAULT = 'Tu nave';
export function normShipName(x){ return typeof x==='string'?x.replace(/\s+/g,' ').trim().slice(0,SHIP_NAME_MAX).trim():''; }
// Antes, quien no cobraba en misión quedaba «sin contrato» (idle sin cancelar):
// ahora eso es sueldo pendiente. idle queda solo para contratos cancelados.
const owedOf=(m)=>m.owed||(m.idle&&!m.cancel)?{owed:true,idle:false}:{owed:false,idle:!!m.idle};
// Libro de cuentas (core/books.js). Sin libro, empieza hoy: lo de antes no se anotó.
const DAY_RE=/^\d{4}-\d{2}-\d{2}$/;
export function normBooks(b){
  const side=(o,cats)=>{ const r={}; for(const k of Object.keys(cats)){ const n=clampInt(o?.[k],0,1e9,0); if(n) r[k]=n; } return r; };
  const days={};
  for(const [d,e] of Object.entries(b?.days&&typeof b.days==='object'?b.days:{})){
    if(!DAY_RE.test(d)) continue;
    const x={in:side(e?.in,BOOKS.in),out:side(e?.out,BOOKS.out)};
    if(Object.keys(x.in).length||Object.keys(x.out).length) days[d]=x;
  }
  return {since:typeof b?.since==='string'&&DAY_RE.test(b.since)?b.since:todayStr(),days};
}
export function normShip(s){
  const modules={};
  for(const k of Object.keys(MODS)){ const m=s?.modules?.[k]; modules[k]={lv:clampInt(m?.lv,0,5,0),cond:clampInt(m?.cond,0,100,100)}; }
  const c=s?.contract, b=s?.board;
  // partidas de antes del tablón acumulativo: la paga traía la Bodega incluida (ahora se aplica al cobrar)
  const cm=1+0.1*modules.cargo.lv*modules.cargo.cond/100, t=todayStr(), exp=new Date(); exp.setDate(exp.getDate()+OFFER_TTL[0]-1);
  // las de antes de las dificultades se generaron como las normales de ahora (+10%)
  const unCargo=(o,on)=>{ o=o.postedOn?o:{...o,reward:{...o.reward,mc:Math.round((+o.reward?.mc||0)/cm)},postedOn:on}; return DIFFS[o.diff]?o:{...o,diff:'normal'}; };
  // contratos de antes del plazo en horas: vencían a medianoche del último día (aquí aún no existe dayParse)
  const at=(s,plus=0)=>{ const [y,m,d]=String(s).split('-').map(Number); return new Date(y,m-1,d+plus).getTime(); };
  const timed=(c)=>Number.isFinite(+c.endsAt)&&+c.endsAt>0?c:{...c,endsAt:at(c.endsOn,1),acceptedAt:at(c.acceptedOn||c.endsOn)};
  // contratos y ofertas de antes de los viajes: todos eran misiones normales
  const kinded=(o)=>CONTRACT_KINDS[o.kind]?o:{...o,kind:'run'};
  // misiones sin plazo con tamaño (docs/plan-misiones.md): sin un tamaño conocido siguen las reglas de antes
  const sized=(o)=>{
    const {size,window:w,bonusAt,...r}=o;
    if(!SIZES[size]||hasDeadline(o)) return r;
    return {...r,size,window:clampInt(w,1,60,SIZES[size].days),...(Number.isFinite(+bonusAt)&&+bonusAt>0?{bonusAt:+bonusAt}:{})};
  };
  // con plazo hace falta su fin; sin plazo, cuándo se aceptó (la experiencia de la tripulación cuenta desde ahí)
  const normContract=(c)=>!c?null:hasDeadline(c)?(c.endsOn?timed(unCargo(c,c.acceptedOn||t)):null)
    :Number.isFinite(+c.acceptedAt)&&c.acceptedOn?unCargo(c,c.acceptedOn):null;
  return {
    modules,
    name:normShipName(s?.name),
    system:Object.hasOwn(SYSTEMS,s?.system??'')?s.system:HOME,
    // último salto de la alianza ya aplicado (core/travel.js, followJump)
    trip:typeof s?.trip==='string'?s.trip:null,
    // el salto no tiene cuota: vale si su destino existe
    contract:normContract(c&&c.id&&(c.kind==='jump'?Object.hasOwn(SYSTEMS,c.to??''):c.quota>0)?sized(kinded(c)):null),
    board:{
      offers:(Array.isArray(b?.offers)?b.offers:[]).filter(o=>o&&o.id&&o.quota>0&&o.reward&&(!o.story||MISSION_BY_ID[o.mid]?.chapter)).map(o=>o.postedOn?unCargo(o,t):{...unCargo(o,t),expiresOn:todayStr(exp)}).map(kinded).map(sized).map(o=>hasDeadline(o)&&o.days<2?{...o,days:2}:o),   // mínimo 2 días
      signal:Math.min(1,Math.max(0,+b?.signal||0)), sigAt:Number.isFinite(+b?.sigAt)&&+b.sigAt>0?+b.sigAt:null,
      repUntil:typeof b?.repUntil==='string'?b.repUntil:null,
      news:{got:clampInt(b?.news?.got,0,999,0),lost:clampInt(b?.news?.lost,0,999,0)}
    },
    // capítulos de historia hechos en cada sistema
    story:Object.fromEntries(Object.entries(s?.story&&typeof s.story==='object'?s.story:{}).filter(([k])=>Object.hasOwn(SYSTEMS,k)).map(([k,n])=>[k,clampInt(n,0,999,0)]).filter(([,n])=>n>0)),
    activity:(s?.activity&&typeof s.activity==='object')?s.activity:{},
    lastTick:typeof s?.lastTick==='string'?s.lastTick:null,
    rot:clampInt(s?.rot,0,1e9,0),
    crew:(Array.isArray(s?.crew)?s.crew:[]).filter(m=>m&&ROLES[m.role]&&typeof m.name==='string'&&typeof m.until==='string')
      .map(m=>{ const lv=clampInt(m.lv,1,CREW_LV.length,1); return {id:String(m.id||uid()),name:m.name,role:m.role,lv,xp:Math.max(CREW_LV[lv-1].xp,clampInt(m.xp,0,1e7,0)),wage:clampInt(m.wage,0,1e6,CREW_LV[0].wage),until:m.until,cancel:!!m.cancel,...owedOf(m)}; }),
    crewBoard:(s?.crewBoard&&typeof s.crewBoard.week==='string'&&Array.isArray(s.crewBoard.cands))
      ?{week:s.crewBoard.week,cands:s.crewBoard.cands.filter(x=>x&&ROLES[x.role]&&typeof x.name==='string').map(x=>({id:String(x.id||uid()),name:x.name,role:x.role,lv:clampInt(x.lv,1,CREW_HIRE_MAX,1)}))}
      :{week:null,cands:[]},
    log:normLog(s?.log),
    books:normBooks(s?.books),
    updates:(Array.isArray(s?.updates)?s.updates:[]).filter(x=>typeof x==='string').slice(-100),
    recentMissions:(Array.isArray(s?.recentMissions)?s.recentMissions:[]).filter(id=>typeof id==='string'&&MISSION_BY_ID[id]).slice(-RECENT_MAX)
  };
}
// La bitácora va en la partida —y en la nube— para que lo que pasó mientras
// no mirabas sobreviva a recargar. `seen`: ya se avisó al entrar en la nave;
// `read`: ya se abrió en la bitácora (o se aceptó, si es un informe).
export const LOG_KINDS=['mission','crew','wear','board','books','travel','rank'], LOG_TONES=['win','warn','bad','info'];
export function normLog(a){
  const num=(v)=>Number.isFinite(+v)?+v:0;
  return (Array.isArray(a)?a:[]).filter(e=>e&&typeof e.title==='string'&&LOG_KINDS.includes(e.kind)).map(e=>({
    id:String(e.id||uid()), at:num(e.at), day:typeof e.day==='string'?e.day:todayStr(), kind:e.kind,
    big:!!e.big, tone:LOG_TONES.includes(e.tone)?e.tone:'info', title:e.title,
    lines:(Array.isArray(e.lines)?e.lines:[]).filter(x=>typeof x==='string'),
    story:typeof e.story==='string'&&e.story?e.story.slice(0,900):null,
    quote:typeof e.quote==='string'&&e.quote?e.quote.slice(0,200):null,
    rew:e.rew&&typeof e.rew==='object'?{mc:num(e.rew.mc),xp:num(e.rew.xp),mats:e.rew.mats&&typeof e.rew.mats==='object'?e.rew.mats:{}}:null,
    got:num(e.got), lost:num(e.lost), seen:!!e.seen, read:!!e.read
  })).slice(-LOG_MAX);
}
// Una partida nueva ya empieza con lo que anuncian las novedades: no las recibe.
export function freshState(){ return {tasks:[],habits:[],projects:[],wallet:{mc:0,ecos:0,nexos:0,ale:0,bio:0},ship:{...normShip(null),updates:UPDATES.map(u=>u.id)},focus:normFocus(null),cmd:{xp:0,stats:normStats(null)},settings:{...normSettings(null),areaNames:{}},rpg:normRpg(null)}; }
// Protocolo Forster: lista larga persistente (líneas que apuntan a tareas/hábitos o acciones rápidas propias)
export function normFocus(f){
  const lines=(Array.isArray(f?.lines)?f.lines:[]).filter(l=>l&&typeof l.id==='string'&&['task','habit','acc'].includes(l.kind)&&typeof l.ref==='string'&&(l.kind!=='acc'||typeof l.title==='string'))
    .map(l=>({id:l.id,kind:l.kind,ref:l.ref,...(l.kind==='acc'?{title:l.title}:{}),...(l.kind==='acc'&&l.grant&&typeof l.grant==='object'?{grant:l.grant}:{}),dotted:!!l.dotted,status:['progress','done'].includes(l.status)?l.status:null,re:clampInt(l.re,0,999,0),added:Number.isFinite(+l.added)?+l.added:Date.now()}));
  const counts=(o)=>({progress:clampInt(o?.progress,0,1e6,0),done:clampInt(o?.done,0,1e6,0),mc:clampInt(o?.mc,0,1e9,0)});
  return {lines,phase:f?.phase==='work'?'work':'prep',day:typeof f?.day==='string'?f.day:null,workStart:Number.isFinite(+f?.workStart)&&f?.workStart!==null?+f.workStart:null,
    session:counts(f?.session),round:counts(f?.round)};
}
// Ajustes: van en la partida para viajar con la cuenta y con los archivos.
// Solo entran claves conocidas y del tipo de su valor por defecto.
// Contabilidad se llamó showBooks y salió encendida; ahora es showLedger y empieza
// apagada: el nombre viejo se descarta, así que se apaga también en las partidas de antes.
export function normSettings(x){ const d={showStreaks:true,showEvents:true,showProjects:true,badgeEvents:false,allyEvents:true,allyProgress:true,showVR:false,showLedger:false}; if(x) for(const k of Object.keys(d)) if(typeof x[k]===typeof d[k]) d[k]=x[k]; return d; }
// Nombres propios de las áreas: la clave interna (Spirit…) no cambia nunca; vacío = el de siempre.
export const AREA_NAME_MAX = 24;
export function normAreaNames(x){ const d={}; for(const a of AREAS){ const v=typeof x?.[a]==='string'?x[a].trim().slice(0,AREA_NAME_MAX):''; if(v&&v!==a) d[a]=v; } return d; }
export function normWallet(w){ const d={mc:0,ecos:0,nexos:0,ale:0,bio:0}; if(w) for(const k of Object.keys(d)) if(Number.isFinite(+w[k])) d[k]=Math.max(0,Math.floor(+w[k])); return d; }
// Proyectos: lista propia con fecha límite opcional. Los hábitos no llevan
// proyecto: un proyecto se termina y un hábito no.
export function normProjects(a){
  const seen=new Set();
  return (Array.isArray(a)?a:[]).filter(p=>p&&typeof p==='object'&&typeof p.name==='string'&&p.name.trim())
    .map(p=>({id:typeof p.id==='string'&&p.id?p.id:uid(), name:p.name.trim().slice(0,80),
      due:/^\d{4}-\d{2}-\d{2}$/.test(p.due||'')?p.due:null,
      hideTasks:p.hideTasks===true,
      createdAt:Number.isFinite(+p.createdAt)?+p.createdAt:Date.now()}))
    .filter(p=>!seen.has(p.id)&&seen.add(p.id));
}
// normaliza un estado guardado (localStorage o partida importada)
export function normState(s){
  const items=(a)=>Array.isArray(a)?a.filter(x=>x&&typeof x==='object'&&typeof x.title==='string'):[];
  const st={tasks:items(s?.tasks),habits:items(s?.habits)};
  [...st.tasks,...st.habits].forEach(x=>{ if(typeof x.notes==='string'&&x.notes.trim()) x.notes=x.notes.slice(0,NOTES_MAX); else delete x.notes; });
  st.habits.forEach(h=>{ if(!HABIT_TYPES.includes(h.type)) h.type='daily'; });
  // Mensuales: días del mes 1–31, sin repetir y en orden. Sin ninguno válido, pasa a diario.
  st.habits.forEach(h=>{
    if(h.type!=='monthly'){ delete h.mdays; return; }
    const m=[...new Set((Array.isArray(h.mdays)?h.mdays:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=31))].sort((a,b)=>a-b);
    if(m.length) h.mdays=m; else { h.type='daily'; delete h.mdays; }
  });
  // origen de lo importado de otra app ('taskhero:<id>'): evita duplicar al volver a importar
  [...st.tasks,...st.habits].forEach(x=>{ if(typeof x.src!=='string'||!x.src||x.src.length>200) delete x.src; if(x.thOff!==true) delete x.thOff; });
  [...st.tasks,...st.habits].forEach(x=>{ if(!EFFORT[x.diff]) x.diff='normal'; if(!Array.isArray(x.areas)) x.areas=[]; x.areas=[...new Set(x.areas.map(a=>a==='Family'?'Social':a==='Work'?'Craft':a).filter(a=>AREAS.includes(a)))]; });
  st.projects=normProjects(s?.projects);
  // una tarea va en un proyecto como mucho; si el proyecto ya no existe, se queda sin él
  const pids=new Set(st.projects.map(p=>p.id));
  st.tasks.forEach(x=>{ x.projectId=(typeof x.projectId==='string'&&pids.has(x.projectId))?x.projectId:null; });
  st.wallet=normWallet(s?.wallet); st.ship=normShip(s?.ship); st.focus=normFocus(s?.focus); st.settings=normSettings(s?.settings); st.settings.areaNames=normAreaNames(s?.settings?.areaNames);
  // partidas sin rango: los méritos se calculan con el historial (tareas hechas y días de hábito cumplidos)
  // VR Training: el minijuego guarda aquí todo lo suyo y no toca nada más.
  st.rpg=normRpg(s?.rpg);
  st.cmd={xp:Number.isFinite(+s?.cmd?.xp)?Math.max(0,Math.floor(+s.cmd.xp)):retroXP(st),stats:normStats(s?.cmd?.stats)};
  return st;
}
// contadores de la hoja de servicios que no se pueden deducir del historial (empiezan en 0 en partidas antiguas)
export function normStats(x){ const d={missions:0,rounds:0,hires:0,urgentFails:0}; if(x) for(const k of Object.keys(d)) d[k]=clampInt(x[k],0,1e6,0); return d; }
// Usa los valores de antes de las dificultades (tarea 10, hábito 5): solo corre
// una vez, en partidas que aún no tenían méritos.
export function retroXP(st){
  let xp=st.tasks.filter(x=>x.done).length*10;
  for(const h of st.habits) if(h.type!=='neg') xp+=Object.values(h.log||{}).filter(n=>n>=1).length*5;
  return xp;
}
export function load(){ try{ const raw=localStorage.getItem(KEY); if(!raw) return freshState(); return normState(JSON.parse(raw)); }catch{ return freshState(); } }
// La partida en curso. Otros módulos la importan, así que nunca se reasigna:
// para cambiarla entera se sustituye su contenido con setState().
export const state = {};
export function setState(s){ for(const k of Object.keys(state)) delete state[k]; Object.assign(state,s); }
export function save(){ localStorage.setItem(KEY, JSON.stringify(state)); emit('saved'); }

// Nombre visible de un área.
export const areaName=(a)=>state.settings?.areaNames?.[a]||a;

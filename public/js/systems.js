/* Sistemas estelares (docs/plan-viajes.md).
 *
 * Cada jugador está siempre en uno: `state.ship.system`. La ficha decide lo que
 * cambia de un sistema a otro:
 *   name, art  — nombre y artículo («el » para «el Sistema Madre»; '' si no lleva)
 *   quote      — epígrafe del sistema (abre la llegada y la tarjeta de destino)
 *   desc       — texto de la tarjeta de destino
 *   days       — días de salto para llegar; `travel` trae un fragmento por día
 *   intro      — relato de llegada
 *   market     — multiplicador de precio por material; 0 es que allí no se
 *                compra ni se vende. Un material que no aparece vale ×1.
 *   yard       — `mult` multiplica lo que cuesta el astillero (mejoras y
 *                reparaciones); los módulos de `closed` no se pueden mejorar allí.
 *   missions   — catálogo del tablón. Por defecto, las misiones de missions.js
 *                con `system` igual al id (las que no lo llevan son del Sistema
 *                Madre), sin los capítulos de la historia.
 *   story      — capítulos de la historia (misiones con `chapter`), en orden.
 *   roles      — roles que salen en el tablón de tripulación. Por defecto, todos.
 *
 * Los demás sistemas viven en systems/<id>.js. Mientras TRAVEL_ON sea false no
 * se puede viajar a ninguno: `destinations()` no ofrece nada. */
import { ROLES, TRAVEL_ON } from './config.js';
import { MISSIONS, SYSTEM_DATA } from './missions.js';

export const HOME = 'madre';

export function makeSystem(d){
  const mine=MISSIONS.filter(m=>(m.system||HOME)===d.id);
  return {
    id:d.id, name:d.name, art:d.art||'',
    quote:d.quote||'', desc:d.desc||'', days:d.days||0, intro:d.intro||'', travel:d.travel||[],
    market:{...(d.market||{})},
    yard:{mult:1, closed:[], ...(d.yard||{})},
    missions:d.missions||mine.filter(m=>!m.chapter),
    story:d.story||mine.filter(m=>m.chapter).sort((a,b)=>a.chapter-b.chapter),
    roles:d.roles||Object.keys(ROLES)
  };
}

export const SYSTEMS = Object.fromEntries([
  {id:HOME, name:'Sistema Madre', art:'el '},
  ...SYSTEM_DATA.map(({missions,story,...d})=>d)
].map(d=>[d.id,makeSystem(d)]));

export const sysOf = (id) => SYSTEMS[id]||SYSTEMS[HOME];
export const marketMult = (sys,k) => sys.market[k]??1;
// Adónde se puede viajar desde `from`. Vacío mientras los viajes estén cerrados.
export const destinations = (from) => TRAVEL_ON?Object.values(SYSTEMS).filter(s=>s.id!==from):[];
// «en el Sistema Madre», «del Sistema Madre», «al Sistema Madre»; sin artículo, «en Kepler».
export function sysPrep(sys,prep){
  const a=sys.art||'';
  if(a==='el '&&(prep==='de'||prep==='a')) return `${prep}l ${sys.name}`;
  return `${prep} ${a}${sys.name}`;
}

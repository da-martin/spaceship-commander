/* Sistemas estelares (docs/plan-viajes.md).
 *
 * Cada jugador está siempre en uno: `state.ship.system`. La ficha decide lo que
 * cambia de un sistema a otro:
 *   name, art  — nombre y artículo («el » para «el Sistema Madre»; '' si no lleva)
 *   market     — multiplicador de precio por material; 0 es que allí no se
 *                compra ni se vende. Un material que no aparece vale ×1.
 *   yard       — `mult` multiplica lo que cuesta el astillero (mejoras y
 *                reparaciones); los módulos de `closed` no se pueden mejorar allí.
 *   missions   — catálogo del tablón. Por defecto, las misiones de missions.js
 *                con `system` igual al id (las que no lo llevan son del Sistema Madre).
 *   roles      — roles que salen en el tablón de tripulación. Por defecto, todos. */
import { ROLES } from './config.js';
import { MISSIONS } from './missions.js';

export const HOME = 'madre';

export function makeSystem(d){
  return {
    id:d.id, name:d.name, art:d.art||'',
    market:{...(d.market||{})},
    yard:{mult:1, closed:[], ...(d.yard||{})},
    missions:d.missions||MISSIONS.filter(m=>(m.system||HOME)===d.id),
    roles:d.roles||Object.keys(ROLES)
  };
}

export const SYSTEMS = Object.fromEntries([
  {id:HOME, name:'Sistema Madre', art:'el '}
].map(d=>[d.id,makeSystem(d)]));

export const sysOf = (id) => SYSTEMS[id]||SYSTEMS[HOME];
export const marketMult = (sys,k) => sys.market[k]??1;
// «en el Sistema Madre», «del Sistema Madre», «al Sistema Madre»; sin artículo, «en Kepler».
export function sysPrep(sys,prep){
  const a=sys.art||'';
  if(a==='el '&&(prep==='de'||prep==='a')) return `${prep}l ${sys.name}`;
  return `${prep} ${a}${sys.name}`;
}

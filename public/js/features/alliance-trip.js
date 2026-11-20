/* El viaje de la alianza en tu partida (docs/plan-viajes.md, fase 4).
 *
 * La votación vive en el servidor; el salto, en la partida de cada uno. Cuando la
 * foto de la alianza trae una salida que esta partida aún no ha aplicado, se
 * aplica: se cancela la misión en curso, se vacía el tablón y empieza el salto
 * con la hora de salida del servidor. Así funciona aunque la app estuviera
 * cerrada cuando zarpó la alianza (`state.ship.tripId` evita aplicarla dos veces).
 * Sin viajes activados en el servidor, la foto no trae viajes y no pasa nada. */
import { checkContractEnd } from '../core/missions.js';
import { isJump, startJump } from '../core/travel.js';
import { ally } from '../sync/alliance.js';
import { cloud } from '../sync/cloud.js';
import { save, state } from '../store.js';

// Devuelve true si cambió la partida: quien llama repinta.
export function applyAllianceTrip(){
  const a=cloud.user&&ally.status==='ready'&&ally.data&&ally.data.alliance, t=a&&a.trip;
  if(!t||(t.status!=='sailing'&&t.status!=='done')) return false;
  const sh=state.ship;
  if(sh.tripId===t.id) return false;
  sh.tripId=t.id;
  const me=a.members.find(m=>m.id===cloud.user.id);
  // Quien entró después de zarpar ya hizo su propio salto al aceptar la invitación;
  // quien ya está allí (o saltando hacia allí) no tiene nada que hacer.
  const there=sh.system===t.to||(isJump(sh.contract)&&sh.contract.to===t.to);
  if(me&&me.joinedAt<=t.departedAt&&!there&&startJump(t.to,new Date(t.departedAt),{invite:true}))
    checkContractEnd();   // si zarpó hace días, llegan los fragmentos que tocan (o la llegada)
  save();
  return true;
}

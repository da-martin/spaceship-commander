/* VR Training: cargas holo. Salen del esfuerzo del día (state.ship.activity,
 * que ya resta lo desmarcado), con un tope por día y otro de banco. Lo que se
 * gana con el banco lleno espera a que haya hueco ese mismo día.
 * Solo lee el esfuerzo: nunca lo toca. */
import { efRound } from '../util.js';
import { BANK_MAX, CHARGES_DAY, EF_PER_CHARGE } from './config.js';

const points = (activity, day) => Math.max(0, +activity?.[day] || 0);
export const earnedToday = (activity, day) => Math.min(CHARGES_DAY, Math.floor(points(activity, day) / EF_PER_CHARGE + 1e-9));

// Abona en el banco lo ganado hoy que aún no se había abonado. Devuelve cuántas cargas entran.
export function syncEnergy(r, activity, day) {
  const e = r.energy;
  if (e.day !== day) { e.day = day; e.credited = 0; }
  const add = Math.min(earnedToday(activity, day) - e.credited, BANK_MAX - e.bank);
  if (add <= 0) return 0;
  e.bank += add; e.credited += add;
  return add;
}

// La primera simulación es gratis.
export const isFree = (r) => !r.energy.freeUsed;
export const canStart = (r) => isFree(r) || r.energy.bank > 0;
export function spendCharge(r) {
  if (isFree(r)) { r.energy.freeUsed = true; return true; }
  if (r.energy.bank <= 0) return false;
  r.energy.bank--; return true;
}

// Lo que se enseña bajo las cargas.
//   {waiting: n}  cargas ganadas hoy que esperan hueco en el banco
//   {capped}      hoy ya se han ganado todas
//   {left: pts}   puntos de esfuerzo que faltan para la próxima
export function nextCharge(r, activity, day) {
  const earned = earnedToday(activity, day), credited = r.energy.day === day ? r.energy.credited : 0;
  if (earned > credited) return { waiting: earned - credited };
  if (earned >= CHARGES_DAY) return { capped: true };
  return { left: efRound((earned + 1) * EF_PER_CHARGE - points(activity, day)) };
}

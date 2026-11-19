/* VR Training: holoperfiles. Cada tripulante que se contrata en la nave deja
 * uno (nombre, rol y nivel) que se queda aunque se marche. Si vuelve alguien
 * con el mismo nombre y rol, se guarda el nivel más alto.
 * Recibe los datos del tripulante: no lee la nave por su cuenta. */
import { CREW_LV, ROLES } from '../config.js';
import { ROSTER_MAX } from './config.js';

export function addProfile(r, m) {
  if (!m || typeof m.name !== 'string' || !m.name.trim() || !ROLES[m.role]) return false;
  const lv = Math.max(1, Math.min(CREW_LV.length, Math.floor(+m.lv) || 1));
  const same = r.roster.find((x) => x.src === 'crew' && x.name === m.name && x.role === m.role);
  if (same) { if (lv > same.lv) { same.lv = lv; return true; } return false; }
  r.roster.push({ id: 'c-' + String(m.id || m.name).slice(0, 60), name: m.name.slice(0, 40), role: m.role, lv, src: 'crew' });
  // Con el plantel lleno se va el holoperfil de tripulación más antiguo que no esté en juego.
  const busy = new Set(r.run ? r.run.squad.map((x) => x.id) : []);
  while (r.roster.filter((x) => x.src === 'crew').length > ROSTER_MAX) {
    const i = r.roster.findIndex((x) => x.src === 'crew' && !busy.has(x.id));
    if (i < 0) break;
    r.roster.splice(i, 1);
  }
  return true;
}
// La tripulación a bordo, por si se contrató antes de que existieran los holoperfiles.
export const syncCrew = (r, crew) => (Array.isArray(crew) ? crew : []).reduce((n, m) => n + (addProfile(r, m) ? 1 : 0), 0);

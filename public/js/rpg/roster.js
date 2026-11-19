/* VR Training: holoperfiles de la tripulación. El plantel es la tripulación
 * que está a bordo de la nave, además de los de serie: quien se marcha deja
 * de estar, salvo en una simulación a medias, que termina con él.
 * Recibe los datos de la tripulación: no lee la nave por su cuenta. */
import { CREW_LV, ROLES } from '../config.js';

const valid = (m) => m && m.id != null && typeof m.name === 'string' && !!m.name.trim() && !!ROLES[m.role];
const profileOf = (m) => ({ id: 'c-' + String(m.id).slice(0, 60), name: m.name.slice(0, 40), role: m.role,
  lv: Math.max(1, Math.min(CREW_LV.length, Math.floor(+m.lv) || 1)), src: 'crew' });

// Pone el plantel al día con la tripulación a bordo (`crew`): entra quien se
// contrató, sube quien ascendió y sale quien se fue. Devuelve si cambió algo.
export function syncCrew(r, crew) {
  const want = (Array.isArray(crew) ? crew : []).filter(valid).map(profileOf), ids = new Set(want.map((p) => p.id));
  const busy = new Set(r.run ? r.run.squad.map((x) => x.id) : []);
  const playing = r.roster.filter((x) => x.src === 'crew' && !ids.has(x.id) && busy.has(x.id));   // se fue a media simulación
  const roster = [...r.roster.filter((x) => x.src !== 'crew'), ...want, ...playing], have = new Set(roster.map((x) => x.id));
  const lastSquad = r.lastSquad.every((id) => have.has(id)) ? r.lastSquad : [];
  const changed = JSON.stringify(roster) !== JSON.stringify(r.roster) || lastSquad !== r.lastSquad;
  r.roster = roster; r.lastSquad = lastSquad;
  return changed;
}

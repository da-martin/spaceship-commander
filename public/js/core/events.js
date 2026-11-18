/* Avisos de la lógica a la vista. core/ no sabe pintar, avisar ni subir a la nube:
 * emite un aviso y main.js decide quién lo atiende. Los oyentes corren en el
 * acto y en orden, como si fueran una llamada directa.
 *
 *   saved                 la partida se ha guardado en localStorage
 *   log(e) / logged(e)    entrada de bitácora: antes de guardarla (la vista puede
 *                         marcarla como leída) y después (para repintar)
 *   rankUp(i)             ascenso al rango RANKS[i]
 *   missionWon(c)         la misión `c` se ha completado con éxito
 *   track(x, kind, op, day, ef)   algo se ha marcado o desmarcado (cola de TaskHero)
 *   crewJoined(m)         se ha contratado al tripulante `m` (holoperfil de VR Training) */
const listeners = {};
export function on(name, fn){ (listeners[name] ||= []).push(fn); }
export function emit(name, ...args){ for(const fn of listeners[name] || []) fn(...args); }

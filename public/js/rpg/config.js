/* VR Training (Holocubierta): los números del minijuego. Todo ajustable.
 * Nada de rpg/ importa core/ ni store.js: el minijuego recibe lo que lee
 * (esfuerzo del día) y solo escribe en su propio estado (state.rpg). */

// Energía: cada simulación cuesta una carga; las cargas salen del esfuerzo del día.
export const EF_PER_CHARGE = 3;   // puntos de esfuerzo por carga
export const CHARGES_DAY = 3;     // cargas que se pueden ganar en un día
export const BANK_MAX = 3;        // cargas guardadas como máximo

// Una simulación: 10 salas. La 5 es de descanso y la 10, el jefe.
export const ROOMS = 10, REST_AT = 4, BOSS_AT = 9;   // índices desde 0
export const EVENTS_PER_RUN = 8;
export const HP_MAX = 3, SUP_START = 2, ITEMS_MAX = 3, SQUAD = 3;
// Dificultad por tramo: salas 1–3 · 4–6 · 7–9 · jefe.
export const DC = [5, 6, 7, 7];
export const dcOf = (i) => DC[i >= BOSS_AT ? 3 : Math.floor(i / 3)];
// Jefe: hay que superar sus 3 pasos; cada fallo cuesta 1 de vida y se repite el paso.
export const BOSS_STEPS = 3;
// Bono de la tirada: +2 si el rol encaja, y el nivel del holoperfil (1/2/3 → +0/+1/+2).
export const ROLE_BONUS = 2;
export const lvBonus = (lv) => Math.max(0, (lv || 1) - 1);

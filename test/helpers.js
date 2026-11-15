// Utilidades de los tests: reloj y azar fijos, y una partida limpia.
import { mock } from 'node:test';
import { freshState, setState, state } from '../public/js/store.js';

// Reloj parado en `iso` (hora local; los tests corren con TZ=Europe/Madrid).
export function clock(iso) {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date(iso).getTime() });
}

// Math.random repetible (mulberry32).
export function seed(n = 12345) {
  let s = n;
  mock.method(Math, 'random', () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

// Partida nueva con lo que haga falta encima (módulos, monedero…).
export function fresh({ modules = {}, wallet = {} } = {}) {
  const s = freshState();
  for (const [k, v] of Object.entries(modules)) Object.assign(s.ship.modules[k], v);
  Object.assign(s.wallet, wallet);
  setState(s);
  return state;
}

export const clone = (x) => JSON.parse(JSON.stringify(x));

export function restore() { mock.timers.reset(); mock.restoreAll(); }

// El salto entre sistemas (docs/plan-viajes.md, fase 3) y la historia en el tablón.
// Todo esto está oculto: con TRAVEL_ON a false nadie puede lanzar un salto desde la app.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { CREW_XP_DAY } from '../public/js/config.js';
import { checkContractEnd, contractFrom, docked, onAccepted, slotsUsed, STORY_TTL, tickBoard } from '../public/js/core/missions.js';
import { addEffort } from '../public/js/core/ship.js';
import { arrive, jumping, startJump } from '../public/js/core/travel.js';
import { normShip } from '../public/js/store.js';
import { HOME, SYSTEMS, canJump, jumpDays } from '../public/js/systems.js';
import { clock, seed, fresh, restore } from './helpers.js';

beforeEach(() => { clock('2026-11-14T10:00:00'); seed(); });
afterEach(restore);

const H = 36e5;
const ZETA = SYSTEMS.zeta;
// Partida con la Antena (para que haya tablón) y algo de tripulación.
const ready = () => {
  const s = fresh({ modules: { comms: { lv: 1, cond: 100 }, engines: { lv: 3, cond: 100 } } });
  s.ship.crew = [{ id: 'c1', name: 'Lina', role: 'pilot', lv: 1, xp: 0, wage: 10, until: '2026-12-31', cancel: false, idle: false, owed: false }];
  return s;
};
const travelLog = (s) => s.ship.log.filter((e) => e.kind === 'travel');
const run = (over = {}) => ({ id: 'r', kind: 'run', mid: 'exp-nebulosa', topic: 'Exploración', flavor: 'x', diff: 'normal', quota: 10, progress: 4,
  reward: { mc: 100, mats: {} }, urgent: false, postedOn: '2026-11-13', days: 3, ...over });

test('el salto dura los días del destino; para volver al Sistema Madre, los del origen', () => {
  assert.equal(jumpDays(HOME, 'zeta'), 3);
  assert.equal(jumpDays(HOME, 'umbral'), 1);
  assert.equal(jumpDays('betelgeuse', HOME), 5);
  const s = ready();
  const j = startJump('zeta');
  assert.equal(j.kind, 'jump');
  assert.equal(j.from, HOME);
  assert.equal(j.to, 'zeta');
  assert.equal(j.days, 3);
  assert.equal(j.quota, 0);
  assert.equal(j.endsAt - j.acceptedAt, 3 * 24 * H);
  assert.equal(s.ship.system, HOME);   // sigue en el origen hasta llegar
  assert.ok(jumping());
  assert.equal(docked(), false);
});

test('el Sistema Madre es el centro: desde él a cualquiera, y desde los demás solo de vuelta', () => {
  assert.ok(canJump(HOME, 'zeta'));
  assert.ok(canJump('zeta', HOME));
  assert.equal(canJump('zeta', 'canopo'), false);
  assert.equal(canJump('zeta', 'zeta'), false);
  assert.equal(canJump(HOME, 'atlantida'), false);
  const s = ready();
  s.ship.system = 'zeta';
  assert.equal(startJump('canopo'), null);
  assert.ok(startJump(HOME));
});

test('no se salta a un sistema que no existe, al actual ni en pleno salto', () => {
  ready();
  assert.equal(startJump('atlantida'), null);
  assert.equal(startJump('toString'), null);
  assert.equal(startJump(HOME), null);
  assert.ok(startJump('zeta'));
  assert.equal(startJump('canopo'), null);
});

test('al zarpar, la misión en curso se cobra en parte y una urgente no daña la reputación', () => {
  const s = ready();
  s.ship.contract = { ...contractFrom(run({ urgent: true })), progress: 4 };
  const mc = s.wallet.mc, part = Math.floor(s.ship.contract.reward.mc * 0.4);
  startJump('zeta');
  assert.equal(s.wallet.mc - mc, part);   // 4/10 de la paga
  assert.equal(s.ship.board.repUntil, null);
  const dep = travelLog(s)[0];
  assert.equal(dep.big, true);
  assert.equal(dep.rew.mc, part);
  assert.match(dep.lines[0], /cancelada con 4\/10/);
  assert.equal(dep.story, ZETA.travel[0]);
});

test('al zarpar el tablón se vacía, y durante el salto no recibe nada', () => {
  const s = ready();
  tickBoard();
  assert.ok(s.ship.board.offers.length > 0);
  startJump('zeta');
  assert.deepEqual(s.ship.board.offers, []);
  assert.equal(s.ship.board.signal, 0);
  mock.timers.tick(30 * H);
  tickBoard();
  assert.deepEqual(s.ship.board.offers, []);
  assert.equal(s.ship.board.sigAt, null);
});

test('las tareas cuentan en el día pero no en el salto, que no tiene cuota', () => {
  const s = ready();
  startJump('zeta');
  assert.equal(addEffort(2), null);
  assert.equal(s.ship.contract.progress, 0);
  assert.equal(s.ship.activity['2026-11-14'], 2);
});

test('un fragmento al zarpar y otro cada 24 h, sin repetir ni saltar aunque la app esté cerrada', () => {
  const s = ready();
  startJump('zeta');
  assert.equal(travelLog(s).length, 1);
  mock.timers.tick(23 * H); checkContractEnd();
  assert.equal(travelLog(s).length, 1);
  mock.timers.tick(2 * H); checkContractEnd();
  assert.equal(travelLog(s).length, 2);
  checkContractEnd();
  assert.equal(travelLog(s).length, 2);
  mock.timers.tick(24 * H); checkContractEnd();
  const L = travelLog(s);
  assert.equal(L.length, 3);
  assert.deepEqual(L.map((e) => e.story), ZETA.travel);
  assert.equal(L[2].title, 'Salto a Zeta Reticuli · día 3 de 3');
  assert.equal(L[2].big, false);
});

test('la llegada: nuevo sistema, informe con la cita y el relato, y una transmisión al momento', () => {
  const s = ready();
  startJump('zeta');
  mock.timers.tick(3 * 24 * H);   // de golpe: los fragmentos que faltan llegan antes
  assert.equal(checkContractEnd(), true);
  assert.equal(s.ship.system, 'zeta');
  assert.equal(s.ship.contract, null);
  const L = travelLog(s), last = L[L.length - 1];
  assert.equal(L.length, 4);
  assert.equal(last.title, 'Llegada a Zeta Reticuli');
  assert.equal(last.big, true);
  assert.equal(last.quote, ZETA.quote);
  assert.equal(last.story, ZETA.intro);
  const ids = new Set([...ZETA.missions, ...ZETA.story].map((m) => m.id));
  assert.ok(s.ship.board.offers.length >= 2);   // la transmisión y el capítulo 1
  for (const o of s.ship.board.offers) assert.ok(ids.has(o.mid), o.mid);
  assert.equal(s.ship.crew[0].xp, 3 * CREW_XP_DAY);
});

test('antes del plazo no se llega, y el salto no se puede adelantar', () => {
  const s = ready();
  startJump('umbral');
  mock.timers.tick(23 * H);
  assert.equal(arrive(), false);
  assert.equal(checkContractEnd(), false);
  assert.equal(s.ship.system, HOME);
  mock.timers.tick(H);
  assert.equal(checkContractEnd(), true);
  assert.equal(s.ship.system, 'umbral');
});

test('de vuelta al Sistema Madre, con sus fragmentos de regreso', () => {
  const s = ready();
  s.ship.system = 'betelgeuse';
  startJump(HOME);
  mock.timers.tick(5 * 24 * H);
  checkContractEnd();
  assert.equal(s.ship.system, HOME);
  const L = travelLog(s);
  assert.deepEqual(L.slice(0, 5).map((e) => e.story), SYSTEMS[HOME].travel);
  assert.equal(L[5].title, 'Llegada al Sistema Madre');
  assert.equal(L[5].quote, null);
});

/* ---------- la historia del sistema en el tablón ---------- */
const storyOffers = (s) => s.ship.board.offers.filter((o) => o.story);

test('en un sistema con historia, el capítulo pendiente está en el tablón: no caduca ni ocupa hueco', () => {
  const s = ready();
  s.ship.system = 'zeta';
  tickBoard();
  const [o] = storyOffers(s);
  assert.equal(o.mid, 'zr-h01');
  assert.equal(o.chapter, 1);
  assert.equal(o.kind, 'open');
  assert.equal(o.expiresOn, STORY_TTL);
  assert.equal(slotsUsed(), s.ship.board.offers.length - 1);
  mock.timers.tick(20 * 24 * H);
  tickBoard();
  assert.equal(storyOffers(s).length, 1);
  assert.equal(storyOffers(s)[0].id, o.id);
});

test('al completar un capítulo llega el siguiente; al abandonarlo vuelve el mismo', () => {
  const s = ready();
  s.ship.system = 'zeta';
  tickBoard();
  let o = storyOffers(s)[0];
  s.ship.contract = contractFrom(o); s.ship.board.offers = s.ship.board.offers.filter((x) => x.id !== o.id);
  onAccepted(s.ship.contract);
  assert.equal(s.ship.log.at(-1).title, 'Capítulo 1: Carga pesada');
  assert.equal(s.ship.log.at(-1).story, ZETA.story[0].brief);
  tickBoard();
  assert.equal(storyOffers(s).length, 0);   // el capítulo en curso no se repite
  addEffort(o.quota);
  assert.equal(s.ship.story.zeta, 1);
  assert.ok(s.ship.log.some((e) => e.title === 'Capítulo 1 completado: Carga pesada'));
  tickBoard();
  o = storyOffers(s)[0];
  assert.equal(o.mid, 'zr-h02');
  s.ship.contract = contractFrom(o); s.ship.board.offers = s.ship.board.offers.filter((x) => x.id !== o.id);
  s.ship.contract = null;   // abandonada
  tickBoard();
  assert.equal(storyOffers(s)[0].mid, 'zr-h02');
});

test('al terminar la historia no llegan más capítulos, y en el Sistema Madre nunca hay', () => {
  const s = ready();
  s.ship.system = 'zeta';
  s.ship.story.zeta = ZETA.story.length;
  tickBoard();
  assert.equal(storyOffers(s).length, 0);
  s.ship.system = HOME;
  s.ship.story = {};
  s.ship.board.offers = [];
  for (let i = 0; i < 5; i++) { mock.timers.tick(24 * H); tickBoard(); }
  assert.equal(storyOffers(s).length, 0);
});

test('la partida guarda el salto en curso y la historia; descarta lo que no existe', () => {
  const s = ready();
  startJump('canopo');
  const sh = normShip(JSON.parse(JSON.stringify({ ...s.ship, story: { zeta: 3, atlantida: 2, canopo: 0 } })));
  assert.equal(sh.contract.kind, 'jump');
  assert.equal(sh.contract.to, 'canopo');
  assert.equal(sh.contract.told, 1);
  assert.deepEqual(sh.story, { zeta: 3 });
  assert.equal(normShip({ contract: { ...s.ship.contract, to: 'atlantida' } }).contract, null);
  const bad = { id: 'b', kind: 'open', story: true, mid: 'exp-nebulosa', quota: 5, reward: { mc: 1 }, postedOn: '2026-11-14', expiresOn: STORY_TTL };
  assert.deepEqual(normShip({ board: { offers: [bad] } }).board.offers, []);
});

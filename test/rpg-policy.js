// Jugador automático «razonable» de VR Training, para los tests de equilibrio:
// elige la opción con mejor valor esperado, cura a quien está a 1 de vida,
// repite las tiradas malas si le sobran suministros y descansa según le falte.
import { HP_MAX, ITEMS_MAX } from '../public/js/rpg/config.js';
import { ITEMS } from '../public/js/rpg/data.js';
import { alive, bonusFor, canReroll, canUse, choose, dcNow, eventOf, kindOf, optionOf, rest, reroll, resolve, rollItemsFor, startRun, useItem } from '../public/js/rpg/run.js';

// Perder vida pesa más cuanto menos queda.
const hpW = (hp) => hp <= 1 ? 6 : hp === 2 ? 3.5 : 2.5;
function value(run, fx, m) {
  let v = 0;
  if (fx.hp) v += fx.hp < 0 ? fx.hp * hpW(m ? m.hp : 2) : fx.hp * 1.5;
  if (fx.hpAll) v += fx.hpAll < 0 ? alive(run).reduce((a, x) => a - hpW(x.hp), 0) : alive(run).filter((x) => x.hp < HP_MAX).length * 1.5;
  if (fx.sup) v += fx.sup;
  if (fx.item) v += run.items.length < ITEMS_MAX ? 1.5 : 0;
  return v;
}
function probs(bonus, dc) {
  const p = { ok: 0, part: 0, ko: 0 };
  for (let d = 1; d <= 6; d++) p[kindOf(d + bonus, dc)] += 1 / 6;
  return p;
}

function bestPlay(r) {
  const run = r.run, dc = dcNow(run), boss = run.stage === 'boss';
  const opts = boss ? [optionOf(run, 0)] : eventOf(run).opts;
  let best = null;
  const offer = (v, idx, member, items) => { if (!best || v > best.v) best = { v, idx, member, items }; };
  opts.forEach((o, idx) => {
    if (o.safe) {
      if ((o.res.sup || 0) < 0 && run.sup < -o.res.sup) return;
      offer(value(run, o.res, null), idx, null, []);
      return;
    }
    for (const m of alive(run)) {
      // Los objetos de tirada se gastan solo cuando la tirada es difícil; el dado trucado, solo en las muy difíciles.
      const base = bonusFor(r, m.id, o.roles).bonus, hard = dc - base >= 5;
      const items = hard ? rollItemsFor(r, m.id).filter((k) => !ITEMS[k].six || dc - base >= 6).slice(0, 1) : [];
      const { bonus, six } = bonusFor(r, m.id, o.roles, items);
      const p = six ? { ok: 1, part: 0, ko: 0 } : probs(bonus, dc);
      const v = boss
        ? p.ok * 10 + p.part * (10 + value(run, { hp: -1 }, m)) + p.ko * value(run, { hp: -1 }, m)
        : p.ok * value(run, o.ok, m) + p.part * value(run, o.part, m) + p.ko * value(run, o.ko, m);
      offer(v, idx, m.id, items);
    }
  });
  return best;
}

// Juega una simulación entera y devuelve 'win' o 'lose'.
export function playRun(r, esc, squad, rng) {
  const err = startRun(r, esc, squad, rng);
  if (err) throw new Error(err);
  for (let guard = 0; r.run.stage !== 'end'; guard++) {
    if (guard > 500) throw new Error('la simulación no termina');
    const run = r.run;
    if (canUse(run, 'estim')) useItem(r, 'estim');
    for (const k of ['parche', 'botiquin']) if (canUse(run, k) && alive(run).some((m) => m.hp <= 1)) useItem(r, k);
    if (run.stage === 'rest') {
      const missing = alive(run).reduce((a, m) => a + HP_MAX - m.hp, 0);
      rest(r, missing >= 2 ? 'heal' : run.sup < 2 ? 'sup' : 'item', rng);
    } else if (run.stage === 'room' || run.stage === 'boss') {
      const b = bestPlay(r);
      choose(r, b.idx, b.member, b.items, rng);
    } else if (run.stage === 'result') {
      if (canReroll(run) && run.items.includes('baliza')) reroll(r, 'baliza', rng);
      else if (canReroll(run) && run.res.kind === 'ko' && run.sup >= 2) reroll(r, 'sup', rng);
      else resolve(r, rng);
    }
  }
  return r.run.outcome;
}

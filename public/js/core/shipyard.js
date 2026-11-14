/* Astillero y mercado: mejorar y reparar módulos, comprar y vender materiales. */
import { MOD_MAT, MOD_MC, MODS, REPAIR_MC, RES, YARD_CUT } from '../config.js';
import { atHome, tickBoard } from './missions.js';
import { addW, perk, subW } from './rewards.js';
import { eff, mod } from './ship.js';
import { save, state } from '../store.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';
import { hash01, todayStr } from '../util.js';

// Taller: abarata todo lo que se paga en el astillero, su propia mejora incluida.
export const yardMult=()=>1-YARD_CUT*eff('craft');
// Solo los de área piden material; los generales se pagan íntegros en ¢.
export const modCost=(k)=>{ const lv=mod(k).lv; if(lv>=5) return null;
  const c={mc:Math.round(MOD_MC[lv]*(MODS[k].mcMult||1)*yardMult())};
  if(MODS[k].kind==='area') c[MODS[k].res]=MOD_MAT[lv];
  return c; };
export const fmtCost=(c)=>Object.entries(c).map(([k,n])=>`${n} ${RES[k].sym}`).join(' + ');
export const canAfford=(c)=>Object.entries(c).every(([k,n])=>state.wallet[k]>=n);
export function buildMod(k){
  const c=modCost(k); if(!c||!atHome()) return;
  if(!canAfford(c)){ toast('Recursos insuficientes'); return; }
  tickBoard();   // la señal acumulada hasta ahora va al ritmo de antes
  for(const [r,n] of Object.entries(c)) subW(r,n);
  const m=mod(k); if(m.lv===0) m.cond=100; m.lv++;
  tickBoard();   // con un hueco más entra la transmisión que esperaba
  save(); render(); toast(`${MODS[k].name} Nv.${m.lv} ✓`);
}
// Lo que se puede reparar ahora mismo y lo que cuesta. El precio por punto es
// fraccionario (lo baja el Taller), así que solo se redondea el total.
export function repairQuote(k){
  const per=REPAIR_MC*yardMult(), pts=Math.min(100-mod(k).cond,Math.floor(state.wallet.mc/per));
  return {per,pts,mc:Math.ceil(pts*per)};
}
export const repairCost=(k)=>Math.ceil((100-mod(k).cond)*REPAIR_MC*yardMult());
export function repairMod(k){
  const m=mod(k), q=repairQuote(k);
  if(q.pts<=0){ toast('Recursos insuficientes'); return; }
  subW('mc',q.mc); m.cond+=q.pts; save(); render(); toast(`${MODS[k].name} reparado +${q.pts}%`);
}
export const priceOf=(k,d=todayStr())=>Math.round(25*(0.6+hash01(d+':'+k)));
export const sellOf=(k)=>Math.floor(priceOf(k)*0.6);
export const buyPrice=(k)=>Math.max(1,Math.round(priceOf(k)*(1-perk('trader'))));
export function buyMat(k,n){
  if(!atHome()) return;
  const c=buyPrice(k)*n; if(state.wallet.mc<c){ toast('Recursos insuficientes'); return; }
  subW('mc',c); addW(k,n); save(); render(); toast(`+${n} ${RES[k].sym} ${RES[k].name} · −${c} ¢`);
}
export function sellMat(k){
  if(state.wallet[k]<1||!atHome()) return;
  const p=sellOf(k); subW(k,1); addW('mc',p); save(); render(); toast(`−1 ${RES[k].sym} · +${p} ¢`);
}

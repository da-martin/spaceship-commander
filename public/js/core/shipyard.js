/* Astillero y mercado: mejorar y reparar módulos, comprar y vender materiales. */
import { MOD_MAT, MOD_MC, MODS, REPAIR_MC, RES, YARD_CUT } from '../config.js';
import { perk } from './rewards.js';
import { eff, here, mod } from './ship.js';
import { marketMult } from '../systems.js';
import { state } from '../store.js';
import { hash01, todayStr } from '../util.js';

// Taller: abarata todo lo que se paga en el astillero, su propia mejora incluida.
// El sistema también: cada astillero tiene sus precios.
export const yardMult=()=>(1-YARD_CUT*eff('craft'))*here().yard.mult;
// módulos que no se pueden mejorar en este sistema (sí reparar)
export const yardClosed=(k)=>here().yard.closed.includes(k);
// Solo los de área piden material; los generales se pagan íntegros en ¢.
export const modCost=(k)=>{ const lv=mod(k).lv; if(lv>=5) return null;
  const c={mc:Math.round(MOD_MC[lv]*(MODS[k].mcMult||1)*yardMult())};
  if(MODS[k].kind==='area') c[MODS[k].res]=MOD_MAT[lv];
  return c; };
export const fmtCost=(c)=>Object.entries(c).map(([k,n])=>`${n} ${RES[k].sym}`).join(' + ');
export const canAfford=(c)=>Object.entries(c).every(([k,n])=>state.wallet[k]>=n);
// Lo que se puede reparar ahora mismo y lo que cuesta. El precio por punto es
// fraccionario (lo baja el Taller), así que solo se redondea el total.
export function repairQuote(k){
  const per=REPAIR_MC*yardMult(), pts=Math.min(100-mod(k).cond,Math.floor(state.wallet.mc/per));
  return {per,pts,mc:Math.ceil(pts*per)};
}
export const repairCost=(k)=>Math.ceil((100-mod(k).cond)*REPAIR_MC*yardMult());
// El precio del día lo multiplica el sistema; con ×0 allí no se compra ni se vende.
export const onSale=(k)=>marketMult(here(),k)>0;
export const priceOf=(k,d=todayStr())=>Math.round(25*(0.6+hash01(d+':'+k))*marketMult(here(),k));
export const sellOf=(k)=>Math.floor(priceOf(k)*0.6);
export const buyPrice=(k)=>Math.max(1,Math.round(priceOf(k)*(1-perk('trader'))));

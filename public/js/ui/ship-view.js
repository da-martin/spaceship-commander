/* Vista Spaceship: ilustración, sistemas, misión en curso, tablón y pestañas
 * del sistema en el que está la nave. */
import { AGE_BONUS, AREA_COLORS, DIFFS, ENGINE_PUSH, hasDeadline, HIT, LEG_KINDS, LEGS, SHIELD_GAP, THREATS, TRAITS, WINDOW_MULT, isAway, MATS, MISSION_BY_ID, MODS, REP_DAYS, RES, SELFHEAL, SHIP_LV_MAX, SIZES, SPEED_BONUS, WAGE_CUT, XP_BONUS, YARD_CUT } from '../config.js';
import { crewUnlocked } from '../core/crew.js';
import { on } from '../core/events.js';
import { agedMc, hitOf, missionHint, missionsUnlocked, offerAge, shieldReady, slotsUsed, sweepCost } from '../core/missions.js';
import { isJump } from '../core/travel.js';
import { legLen, legName } from '../core/route.js';
import { perk } from '../core/rewards.js';
import { baseSignal, berths, berthsUsable, boardCap, cargoMult, eff, here, herePrep, maxDays, mod, msLeft, repDamaged, rewardText, signalRate } from '../core/ship.js';
import { buyPrice, canAfford, fmtCost, modCost, onSale, priceOf, repairCost, repairQuote, sellOf, yardClosed } from '../core/shipyard.js';
import { SHIP_NAME_DEFAULT, areaName, state } from '../store.js';
import { sysOf, sysPrep } from '../systems.js';
import { abandonContract, acceptOffer, buildMod, buyMat, chooseLeg, discardOffer, offerDiscarding, offerSailing, repairMod, sellMat, sweep, toggleShield } from './actions.js';
import { render } from './commander.js';
import { renderCrew, renderRank } from './crew-view.js';
import { uiMode } from './mode.js';
import { addDays, dayParse, escapeHtml, fDate, fmtEf, pctTxt, todayStr } from '../util.js';

/* ---------- render: nave ---------- */
export const condColor=(c)=>c>=70?'#10b981':c>=35?'#f59e0b':'#ef4444';
export const condBar=(c)=>c>=70?'bg-emerald-400':c>=35?'bg-amber-400':'bg-red-400';
export const btnCls=(ok)=>'px-2 py-2 rounded-lg text-sm font-semibold '+(ok?'bg-cyan-800 hover:bg-cyan-700':'bg-slate-800 text-slate-400 cursor-not-allowed');
/* ---------- nave: ilustración y panel de sistemas ---------- */

// La nave no lleva ni una etiqueta encima: todo el texto vive en el panel de al
// lado. Por eso esta función se puede cambiar por un <img> el día que haya una
// ilustración de verdad, sin tocar nada más.
// Fondo según dónde esté la nave (`scene`):
//   'home'  — en el sistema: asoma el planeta del sistema por la esquina inferior izquierda.
//   'orbit' — capítulo de la historia de un sistema: el planeta del sistema, de cerca, ocupa todo el lateral izquierdo.
//   'away'  — en misión: no hay planeta y las estrellas pasan hacia abajo, como si la nave avanzara.
//   'jump'  — salto entre sistemas: un túnel de luz violeta delante del morro del que brotan las estrellas.
export function shipBackdrop(scene){
  if(scene==='jump') return JUMP_BACKDROP;
  if(scene==='orbit') return orbitBackdrop(state.ship.system);
  if(scene==='home') return homeBackdrop(state.ship.system);
  // Cada capa va dibujada dos veces (y, y-300) para que el bucle no tenga corte.
  // La cercana lleva trazos y va rápida; la lejana, puntos que van despacio.
  const twice=(f,pts)=>pts.map(([x,y])=>f(x,y)+f(x,y-300)).join('');
  const far=twice((x,y)=>`<circle cx="${x}" cy="${y}" r="1.1" fill="#7dd3fc" opacity=".45"/>`,[[38,40],[262,22],[88,150],[230,196],[24,250],[180,280]]);
  const near=twice((x,y)=>`<line x1="${x}" y1="${y}" x2="${x}" y2="${y+12}" stroke="#bae6fd" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`,[[56,90],[246,130],[20,198],[272,250],[70,284]]);
  return `<g class="warp far">${far}</g><g class="warp">${near}</g>`;
}

// Planeta grande, de cerca, con el aspecto del sistema en el que se está. Borde
// derecho en x=88, a un palmo de la nave. No se corre con --planet-x: en el
// recuadro alto taparía los módulos de babor.
//   g     — degradado del planeta, de la cara iluminada a la de sombra
//   atmo  — halo de la atmósfera; edge, el filo del disco
//   blots — manchas (continentes, hielo, dunas, humo) y su color
//   bands — trazos anchos: nubes, vetas, bandas de un gigante gaseoso
//   extra — algo propio (tormentas, el ojo del gigante)
//   far   — lo mismo para el planeta pequeño de la esquina (escena 'home'): su
//           degradado de tres paradas y sus manchas, trazos y extra
const PLANETS={
  // Sistema Madre: océano y continentes verdes
  madre:{ g:['#3a8db0','#1d5878','#0f2f49','#081422'], atmo:'#38bdf8', edge:'#7dd3fc', star:'#7dd3fc',
    blots:{fill:'#2f8f7a',op:.45,d:['M18 40 q22 -14 44 -4 q14 10 2 22 q-20 10 -38 2 q-16 -6 -8 -20Z','M-4 128 q26 -12 52 -2 q12 12 -4 22 q-26 10 -44 -2Z','M30 196 q18 -8 30 4 q2 12 -14 14 q-18 0 -16 -18Z','M-10 250 q30 -10 60 4 q8 12 -10 18 q-30 6 -50 -6Z']},
    bands:[{c:'#e0f2fe',op:.16,w:4,d:['M-20 84 q50 -10 104 6','M-20 176 q50 -8 108 4','M-20 232 q40 -6 96 2']}] ,
    far:{ g:['#2f7fa0','#174565','#0a1a2c'], blots:{fill:'#2f8f7a',op:.5,d:['M6 234 q14 -9 30 -3 q10 6 3 14 q-12 7 -23 2 q-14 -3 -10 -13Z','M48 260 q16 -7 31 2 q6 9 -6 13 q-15 4 -25 -5Z','M6 286 q11 -5 18 2 q-4 8 -18 4Z']},
      bands:[{c:'#e0f2fe',op:.18,w:3,d:['M-10 252 q40 -14 80 -2','M10 300 q36 -10 82 -4']}] } },
  // el Umbral: mar sin orillas y casquetes de hielo, azules celestes y claros
  umbral:{ g:['#c7ecff','#8fd0f2','#3f8fc0','#123553'], atmo:'#bae6fd', edge:'#e0f2fe', star:'#bae6fd',
    blots:{fill:'#f0f9ff',op:.6,d:['M-20 -6 q40 4 76 -2 q14 10 -2 20 q-40 8 -74 -2Z','M-20 290 q44 -10 80 0 q10 12 -8 18 l-72 0Z','M34 112 q12 -6 22 0 q4 8 -8 10 q-14 2 -14 -10Z']},
    bands:[{c:'#ffffff',op:.22,w:3,d:['M-20 70 q50 -8 104 6','M-20 150 q54 -6 108 2','M-20 214 q46 -8 100 4']},{c:'#e0f2fe',op:.14,w:7,d:['M-20 182 q50 -6 106 4']}] ,
    far:{ g:['#b4e4fb','#4f9fcc','#123553'], blots:{fill:'#f0f9ff',op:.65,d:['M-12 214 q30 -10 56 2 q6 10 -10 14 q-26 4 -46 -16Z','M54 268 q10 -5 18 1 q2 7 -8 8 q-10 1 -10 -9Z']},
      bands:[{c:'#ffffff',op:.25,w:2.4,d:['M-10 248 q40 -12 80 -2','M10 292 q36 -8 84 -4']}] } },
  // Canopo: desierto, todo arena, con dunas y sin una nube
  canopo:{ g:['#f2d39b','#d4a463','#8a5a2b','#2a1a0c'], atmo:'#fcd9a0', edge:'#fde5b8', star:'#fde68a',
    blots:{fill:'#a0692f',op:.4,d:['M10 50 q30 -10 56 2 q8 10 -10 14 q-30 4 -46 -16Z','M-10 140 q40 -8 70 4 q6 10 -14 14 q-36 4 -56 -18Z','M24 232 q24 -6 40 4 q0 10 -18 10 q-20 0 -22 -14Z']},
    bands:[{c:'#fff3d6',op:.22,w:1.6,d:['M-20 96 q20 -6 36 0 q20 6 40 0 q18 -5 34 2','M-20 108 q20 -6 36 0 q20 6 40 0 q18 -5 34 2','M-20 186 q22 -6 38 0 q20 6 40 0 q16 -4 32 2','M-20 198 q22 -6 38 0 q20 6 40 0 q16 -4 32 2','M-20 270 q24 -6 40 0 q18 5 36 0']}] ,
    far:{ g:['#eccb8e','#b07f45','#2a1a0c'], blots:{fill:'#9a6430',op:.45,d:['M8 236 q16 -8 30 -2 q8 8 -4 12 q-16 4 -26 -10Z','M50 268 q14 -6 26 2 q2 8 -10 10 q-14 2 -16 -12Z']},
      bands:[{c:'#fff3d6',op:.25,w:1.3,d:['M-10 256 q12 -5 24 0 q12 5 24 0 q12 -5 24 0 q10 4 20 0','M-10 264 q12 -5 24 0 q12 5 24 0 q12 -5 24 0 q10 4 20 0','M4 294 q12 -5 24 0 q12 5 24 0 q12 -5 24 0']}] } },
  // Zeta Reticuli: gris industrial con tintes verdosos, humo y tormentas
  zeta:{ g:['#9aa69a','#5f6b62','#2f3833','#101512'], atmo:'#a3b899', edge:'#c4d1bd', star:'#a7b5a4',
    blots:{fill:'#3a4a36',op:.55,d:['M0 30 q30 -8 52 4 q10 14 -12 18 q-28 4 -40 -22Z','M-14 120 q36 -12 64 2 q10 12 -10 18 q-36 6 -54 -20Z','M20 214 q26 -8 44 4 q4 12 -16 14 q-24 2 -28 -18Z']},
    bands:[{c:'#b5c98f',op:.2,w:6,d:['M-20 76 q50 -14 104 4','M-20 168 q46 -12 106 2','M-20 258 q40 -10 98 0']},{c:'#e2e8dc',op:.12,w:3,d:['M-20 92 q50 -10 100 6','M-20 186 q50 -8 104 6']}],
    extra:`<g fill="none" stroke="#d9e6c8" stroke-linecap="round"><path d="M44 132 q14 -8 20 4 q4 12 -10 14 q-16 0 -16 -14 q2 -20 26 -18" stroke-opacity=".3" stroke-width="2.4"/><path d="M14 280 q10 -6 16 2 q2 8 -8 10 q-12 0 -10 -12" stroke-opacity=".22" stroke-width="2"/></g>
      <path d="M58 44 l-6 12 l6 -2 l-5 12" fill="none" stroke="#d9f99d" stroke-opacity=".45" stroke-width="1.2" stroke-linejoin="round"/>` ,
    far:{ g:['#8e9a8e','#4a564d','#101512'], blots:{fill:'#34432f',op:.6,d:['M4 232 q16 -8 32 -1 q8 8 -6 12 q-18 4 -26 -11Z','M44 270 q16 -6 30 2 q2 9 -12 11 q-16 1 -18 -13Z']},
      bands:[{c:'#b5c98f',op:.24,w:4,d:['M-10 254 q40 -14 82 -2','M8 298 q36 -10 84 -4']}],
      extra:'<path d="M30 262 q8 -5 12 2 q2 7 -6 8 q-9 0 -9 -8 q1 -11 15 -10" fill="none" stroke="#d9e6c8" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/>' } },
  // Betelgeuse: gigante gaseoso en rojos, con alguna banda naranja y un ojo de tormenta
  betelgeuse:{ g:['#f0715a','#c23b2b','#6e1818','#22070a'], atmo:'#f87171', edge:'#fca5a5', star:'#fca5a5',
    bands:[{c:'#7f1d1d',op:.55,w:16,d:['M-20 44 q50 -6 110 2','M-20 152 q50 -4 112 2','M-20 246 q50 -6 110 2']},{c:'#fb923c',op:.4,w:9,d:['M-20 92 q50 -6 112 2','M-20 206 q50 -4 112 2']},{c:'#fecaca',op:.16,w:3,d:['M-20 70 q50 -6 110 2','M-20 124 q50 -4 112 2','M-20 182 q50 -4 112 2','M-20 276 q50 -6 110 2']}],
    extra:'<ellipse cx="38" cy="228" rx="18" ry="8" fill="#fdba74" fill-opacity=".45" stroke="#fed7aa" stroke-opacity=".4" stroke-width="1.2"/><ellipse cx="38" cy="228" rx="9" ry="3.5" fill="#9a3412" fill-opacity=".5"/>' ,
    far:{ g:['#ec6a52','#a8321f','#22070a'],
      bands:[{c:'#7f1d1d',op:.55,w:10,d:['M-10 226 q50 -8 110 2','M-10 278 q50 -6 112 2']},{c:'#fb923c',op:.45,w:6,d:['M-10 250 q50 -6 112 2']},{c:'#fecaca',op:.18,w:2,d:['M-10 240 q50 -6 110 2','M-10 264 q50 -6 112 2','M-10 296 q50 -6 112 2']}],
      extra:'<ellipse cx="44" cy="268" rx="11" ry="5" fill="#fdba74" fill-opacity=".5" stroke="#fed7aa" stroke-opacity=".4" stroke-width="1"/><ellipse cx="44" cy="268" rx="5" ry="2.2" fill="#9a3412" fill-opacity=".55"/>' } },
};
// Manchas, trazos y extra de un planeta (o de su versión lejana), para ir dentro del recorte del disco.
const surface=(P)=>(P.blots?`<g fill="${P.blots.fill}" opacity="${P.blots.op}">${P.blots.d.map(d=>`<path d="${d}"/>`).join('')}</g>`:'')
  +(P.bands||[]).map(b=>`<g fill="none" stroke="${b.c}" stroke-opacity="${b.op}" stroke-width="${b.w}" stroke-linecap="round">${b.d.map(d=>`<path d="${d}"/>`).join('')}</g>`).join('')
  +(P.extra||'');
const planetOf=(sys)=>PLANETS[sys]?sys:'madre';
// En el sistema: el planeta se sale del dibujo y solo se ve el arco de arriba a la derecha.
const homeCache={};
export function homeBackdrop(sys){
  sys=planetOf(sys); if(homeCache[sys]) return homeCache[sys];
  const P=PLANETS[sys], F=P.far, C='cx="-20" cy="330" r="120"';
  return homeCache[sys]=`<defs>
    <radialGradient id="planetG-${sys}" cx=".78" cy=".15" r=".7">${[0,.5,1].map((o,i)=>`<stop offset="${o}" stop-color="${F.g[i]}"/>`).join('')}</radialGradient>
    <radialGradient id="atmoG-${sys}"><stop offset=".87" stop-color="${P.atmo}" stop-opacity="0"/><stop offset=".9" stop-color="${P.atmo}" stop-opacity=".3"/><stop offset="1" stop-color="${P.atmo}" stop-opacity="0"/></radialGradient>
    <clipPath id="planetC-${sys}"><circle ${C}/></clipPath>
  </defs>
  <circle cx="64" cy="58" r="1.6" fill="${P.star}" opacity=".6"/><circle cx="236" cy="86" r="1.2" fill="${P.star}" opacity=".45"/>
  <circle cx="212" cy="228" r="1.5" fill="${P.star}" opacity=".5"/><circle cx="262" cy="160" r="1.1" fill="${P.star}" opacity=".4"/>
  <g style="transform:translateX(var(--planet-x,0px))">
  <circle cx="-20" cy="330" r="134" fill="url(#atmoG-${sys})"/>
  <circle ${C} fill="url(#planetG-${sys})"/>
  <g clip-path="url(#planetC-${sys})">${surface(F)}</g>
  <circle ${C} fill="none" stroke="${P.edge}" stroke-opacity=".45" stroke-width="1.2"/>
  </g>`;
}
const orbitCache={};
export function orbitBackdrop(sys){
  sys=planetOf(sys); if(orbitCache[sys]) return orbitCache[sys];
  const P=PLANETS[sys], C='cx="-340" cy="150"', R=428;
  const star=([x,y])=>`<circle cx="${x}" cy="${y}" r="1.3" fill="${P.star}" opacity=".5"/>`;
  return orbitCache[sys]=`<defs>
    <radialGradient id="bigG-${sys}" cx="54" cy="90" r="492" gradientUnits="userSpaceOnUse">${[0,.22,.55,1].map((o,i)=>`<stop offset="${o}" stop-color="${P.g[i]}"/>`).join('')}</radialGradient>
    <radialGradient id="bigAtmo-${sys}" ${C} r="${R+22}" gradientUnits="userSpaceOnUse"><stop offset=".94" stop-color="${P.atmo}" stop-opacity="0"/><stop offset=".954" stop-color="${P.atmo}" stop-opacity=".35"/><stop offset="1" stop-color="${P.atmo}" stop-opacity="0"/></radialGradient>
    <clipPath id="bigC-${sys}"><circle ${C} r="${R}"/></clipPath>
  </defs>
  ${[[236,86],[212,238],[262,160],[150,26],[280,40],[196,276],[250,12],[290,210]].map(star).join('')}
  <circle ${C} r="${R+22}" fill="url(#bigAtmo-${sys})"/>
  <circle ${C} r="${R}" fill="url(#bigG-${sys})"/>
  <g clip-path="url(#bigC-${sys})">${surface(P)}</g>
  <circle ${C} r="${R}" fill="none" stroke="${P.edge}" stroke-opacity=".5" stroke-width="1.3"/>`;
}

// Túnel del salto: tres capas de trazos que salen de un punto delante del morro
// y crecen hasta salirse, desfasadas para que no haya hueco. Se calcula una vez,
// con un azar fijo: el dibujo solo se repinta si cambia, y sería distinto cada vez.
const JUMP_BACKDROP=(()=>{
  const VX=150, VY=52, cols=['#bae6fd','#c4b5fd','#a5f3fc'];
  let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const layer=()=>Array.from({length:26},(_,i)=>{
    const a=(360*i/26+(rnd()*12-6))*Math.PI/180, r0=18+rnd()*52, L=22+rnd()*38, c=Math.cos(a), sn=Math.sin(a), f=(v)=>v.toFixed(1);
    return `<line x1="${f(VX+r0*c)}" y1="${f(VY+r0*sn)}" x2="${f(VX+(r0+L)*c)}" y2="${f(VY+(r0+L)*sn)}" stroke="${cols[i%3]}" stroke-width="${(1+rnd()*.8).toFixed(1)}" stroke-linecap="round"/>`;
  }).join('');
  const org=`style="transform-origin:${VX}px ${VY}px"`;
  return `<defs><radialGradient id="tunG" cx="${VX}" cy="${VY}" r="260" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e0e7ff" stop-opacity=".55"/><stop offset=".08" stop-color="#818cf8" stop-opacity=".35"/><stop offset=".35" stop-color="#4338ca" stop-opacity=".18"/><stop offset="1" stop-color="#0b1120" stop-opacity="0"/></radialGradient></defs>
    <rect width="300" height="300" fill="url(#tunG)"/>
    <circle cx="${VX}" cy="${VY}" r="26" fill="none" stroke="#a5b4fc" stroke-opacity=".35" stroke-width="1.2" class="jring" ${org}/>
    <circle cx="${VX}" cy="${VY}" r="46" fill="none" stroke="#a5b4fc" stroke-opacity=".2" stroke-width="1" class="jring r2" ${org}/>
    <g class="tun" ${org}>${layer()}</g><g class="tun t2" ${org}>${layer()}</g><g class="tun t3" ${org}>${layer()}</g>`;
})();

// La nave ocupa solo parte del dibujo: deja espacio alrededor (y margen para
// naves más grandes algún día). Escala sobre el centro del lienzo de 300.
export const SHIP_SCALE = 0.65;
// Dónde está la nave para el dibujo: en el sistema, en órbita (capítulo de la
// historia de un sistema), en misión (con plazo o sin él) o saltando a otro sistema.
export const shipScene=(c=state.ship.contract)=>!c?'home':c.kind==='jump'?'jump':c.story?'orbit':'away';
export function shipArt(){
  const m=state.ship.modules, scene=shipScene();
  const tot=Object.values(m).reduce((a,x)=>a+x.lv,0);
  // Todos los módulos existen desde el día uno: una nave necesita puente y
  // motores para volar. El nivel solo decide cuánto crece cada pieza.
  // El estado solo atenúa; el dato exacto lo da el panel.
  const op=k=>(0.45+0.55*m[k].cond/100).toFixed(2);
  const pod=(k,x,y)=>{ const d=x<150?-33:33, c=x+d/2;
    return `<g opacity="${op(k)}"><path d="M${x} ${y} L${x+d} ${y+12} L${x+d} ${y+34} L${x} ${y+28} Z" fill="#16273f" stroke="#3f7f96" stroke-width="1.6"/><circle cx="${c}" cy="${y+22}" r="${3+m[k].lv}" fill="#0e3a4a" stroke="#4fd0e8" stroke-width="1.2"/></g>`; };

  let s=`<svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice" class="block w-full h-auto sm:h-full" role="img" aria-label="Nave de nivel ${tot} de ${SHIP_LV_MAX}, ${scene==='home'?herePrep('en'):scene==='jump'?'saltando a otro sistema':scene==='orbit'?'en órbita, '+herePrep('en'):'en misión'}">
  <defs>
    <linearGradient id="hullG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2d49"/><stop offset=".45" stop-color="#132037"/><stop offset="1" stop-color="#0c1526"/></linearGradient>
    <radialGradient id="exhG"><stop offset="0" stop-color="#cffafe"/><stop offset=".4" stop-color="#22d3ee" stop-opacity=".6"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
    <radialGradient id="skyG"><stop offset="0" stop-color="#1b3a52" stop-opacity=".45"/><stop offset="1" stop-color="#1b3a52" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="150" cy="150" r="128" fill="url(#skyG)"/>${shipBackdrop(scene)}
  <g transform="translate(150 150) scale(${SHIP_SCALE}) translate(-150 -150)">`;

  // Cada sistema construido añade una pieza visible. Eso sí se nota, a
  // diferencia del 12 % de escala que crecía el casco antes.
  {
    const r=8+2*m.engines.lv;
    // En el sistema los motores están apagados: la nave espera a que hagas algo.
    // En el salto, a tope: la estela se alarga.
    const big=scene==='jump'?1.65:1;
    const exh=scene==='home'?'':`<ellipse cx="150" cy="268" rx="${r+4}" ry="${30*big}" fill="url(#exhG)"/><ellipse cx="112" cy="258" rx="${r}" ry="${22*big}" fill="url(#exhG)"/><ellipse cx="188" cy="258" rx="${r}" ry="${22*big}" fill="url(#exhG)"/>`;
    s+=`<g opacity="${op('engines')}">${exh}
    <path d="M104 206 L90 214 L90 246 L104 252 Z" fill="#16273f" stroke="#3f7f96" stroke-width="1.6"/>
    <path d="M196 206 L210 214 L210 246 L196 252 Z" fill="#16273f" stroke="#3f7f96" stroke-width="1.6"/></g>`;
  }

  s+=`<path d="M150 34 L176 92 L184 162 L198 232 L172 254 L128 254 L102 232 L116 162 L124 92 Z" fill="url(#hullG)" stroke="#4fd0e8" stroke-width="2.2"/>
  <path d="M150 52 L168 98 L175 162 L186 224 L168 240 L132 240 L114 224 L125 162 L132 98 Z" fill="none" stroke="#2a4c68" stroke-width="1.2"/>
  <path d="M124 92 L176 92 M116 162 L184 162 M110 214 L190 214" stroke="#2a4c68" stroke-width="1.2"/>`;

  s+=`<g opacity="${op('bridge')}"><path d="M138 62 L162 62 L168 88 L132 88 Z" fill="#0e3a4a" stroke="#7dd3fc" stroke-width="1.4"/><path d="M142 68 L158 68 L161 82 L139 82 Z" fill="#9fe7f5" fill-opacity=".3"/></g>`;
  // El mástil arranca bajo la cabina: si sube más, el plato se dibuja sobre el cristal.
  s+=`<g opacity="${op('comms')}"><line x1="150" y1="118" x2="150" y2="102" stroke="#4fd0e8" stroke-width="1.6"/><ellipse cx="150" cy="100" rx="${7+m.comms.lv}" ry="4" fill="#0e3a4a" stroke="#4fd0e8" stroke-width="1.3"/></g>`;
  // Camarotes: un ojo de buey por litera, las de serie incluidas
  s+=`<g opacity="${op('quarters')}"><rect x="135" y="171" width="30" height="${10+6*Math.ceil(berths()/2)}" rx="4" fill="#16273f" stroke="#3f7f96" stroke-width="1.5"/>${
    Array.from({length:berths()},(_,i)=>`<circle cx="${143+14*(i%2)}" cy="${178+6*Math.floor(i/2)}" r="2" fill="#9fe7f5" fill-opacity=".55"/>`).join('')}</g>`;
  s+=`<g opacity="${op('cargo')}"><rect x="131" y="124" width="38" height="${16+4*m.cargo.lv}" rx="4" fill="#16273f" stroke="#3f7f96" stroke-width="1.5"/><path d="M131 136 L169 136" stroke="#2a4c68" stroke-width="1.2"/></g>`;

  return s+pod('spirit',116,110)+pod('social',184,110)+pod('craft',117,166)+pod('health',183,166)+'</g></svg>';
}

export const SYS_ORDER=['bridge','engines','cargo','comms','quarters','spirit','social','craft','health'];
export function shipSystems(){
  const m=state.ship.modules;
  // Siempre en el orden de la nave: el desgaste se lee en la barra de cada fila.
  return SYS_ORDER.map(k=>{
    const x=m[k], up=x.lv>0, col=condColor(x.cond);
    const pips=[0,1,2,3,4].map(i=>`<i class="block w-2.5 h-1.5 rounded-sm ${i<x.lv?'bg-cyan-300':'bg-slate-700'}"></i>`).join('');
    const label=up?`${MODS[k].name}, nivel ${x.lv} de 5, estado ${x.cond} por ciento`:`${MODS[k].name}, sin mejoras`;
    return `<button type="button" data-slot="${k}" aria-label="${label}" class="flex items-center gap-2.5 px-2.5 py-2 min-h-[44px] rounded-lg border border-[#1f2a3d] bg-[#0f1729] hover:border-cyan-700 text-left">
      <span class="flex-1 min-w-0 text-sm truncate ${up?'text-slate-100':'text-slate-400'}">${MODS[k].name}</span>
      <span class="flex gap-0.5 shrink-0" aria-hidden="true">${pips}</span>
      ${up?`<span class="flex items-center gap-1.5 w-[86px] shrink-0" aria-hidden="true">
        <span class="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden"><i class="block h-full rounded-full" style="width:${x.cond}%;background:${col}"></i></span>
        <span class="mono text-[11px] text-slate-400 w-5 text-right">${x.cond}</span>
      </span>`:`<span class="mono text-[11px] text-slate-400 w-[86px] shrink-0 text-right" aria-hidden="true">sin mejoras</span>`}
    </button>`;
  }).join('');
}
// pestañas del Sistema Madre: se recuerda la última abierta
export const HOMEKEY='spaceship-commander:home';
export const HOME_TABS=['yard','market','missions','crew'];
export let homeTab=(()=>{ try{ const t=localStorage.getItem(HOMEKEY); return HOME_TABS.includes(t)?t:'yard'; }catch{ return 'yard'; } })();
export function showHomeTab(t,scroll=true){
  homeTab=t; try{ localStorage.setItem(HOMEKEY,t); }catch{}
  render();
  if(scroll) document.getElementById('homePanel').scrollIntoView({behavior:'smooth',block:'start'});
}
export function missionLeftTxt(c){
  const ms=Math.max(0,msLeft(c)), h=Math.ceil(ms/36e5);
  return h>48?`quedan ${Math.round(h/24)} días`:ms>=36e5?`quedan ${h} h`:`quedan ${Math.max(1,Math.ceil(ms/6e4))} min`;
}
// un material que no se compra ni se vende en este sistema
function offSale(k,w){
  const r=RES[k], el=document.createElement('div');
  el.className='rounded-xl border border-dashed border-slate-700 bg-slate-900/70 p-3';
  el.innerHTML=`
    <div class="flex items-center gap-2">
      <span class="mono text-[11px] px-1.5 py-0.5 rounded border ${r.chip}">${r.sym} ${r.name}</span>
      <span class="mono text-[11px] text-slate-400 ml-auto">tienes ${w[k]}</span>
    </div>
    <div class="text-sm text-slate-400 mt-2">No se comercia ${herePrep('en')}</div>`;
  return el;
}
const atTxt=(ms)=>{ const d=new Date(ms); return `${fDate(todayStr(d))}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
export const missionEndTxt=(c)=>'hasta '+atTxt(c.endsAt);
// Misiones sin plazo con tamaño: «media · sin plazo» y la bonificación de rapidez
const BONUS_PCT=Math.round(SPEED_BONUS*100);
const openTag=(o)=>(SIZES[o.size]?SIZES[o.size].name.toLowerCase()+' · ':'')+'sin plazo';
// Amenaza y escudo (fase B): el próximo impacto se conoce antes, para decidir cuándo usar el escudo.
function threatBox(c){
  const T=THREATS[c.threat]; if(!T||!c.shield) return '';
  const sh=c.shield, ready=shieldReady(c), heavy=!!c.heavy;
  const dmg=Math.round(hitOf(c)*(1-perk('engineer')));
  const when=c.acceptedOn>=todayStr()?'mañana por la noche':'esta noche';
  const stTxt=sh.armed?'<span class="text-cyan-300">Escudo activo: bloqueará el próximo impacto</span>'
    :ready?'Escudo listo':`Escudo recargando: listo el ${fDate(sh.readyOn)}`;
  const btn=sh.armed?'<button data-shield class="ml-auto text-sm px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-300">Desactivar</button>'
    :`<button data-shield class="${btnCls(ready)} ml-auto" ${ready?'':'disabled'}>Activar escudo</button>`;
  return `<div class="rounded-lg border ${heavy&&!sh.armed?'border-red-800':'border-slate-700'} p-3 mt-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="sys-label">Amenaza</span><span class="font-semibold text-sm">${T.name}</span>
        <span class="mono text-[11px] text-slate-400 ml-auto">${c.hits} ${c.hits===1?'impacto':'impactos'} · ${c.blocked} ${c.blocked===1?'bloqueado':'bloqueados'}</span>
      </div>
      <div class="mono text-[11px] mt-1.5 ${heavy?'text-red-300':'text-slate-300'}">Próximo impacto: ${when}, al cambiar de día · ${heavy?'FUERTE':'normal'} · −${dmg} % a un módulo</div>
      <div class="flex flex-wrap items-center gap-2 mt-2">
        <span class="text-sm text-slate-400">${stTxt}</span>${btn}
      </div>
      <div class="mono text-[11px] text-slate-500 mt-1.5">El escudo bloquea un impacto. Después deja pasar ${SHIELD_GAP} impactos antes de poder usarlo otra vez.</div>
    </div>`;
}
// Rasgos (fase C): chip con el nombre y lo que hace. En la misión en curso, Ventana de
// lanzamiento avisa si lo próximo de hoy aún cuenta doble.
const TRAIT_CHIP={good:'border-emerald-600 text-emerald-300',mid:'border-slate-600 text-slate-300',bad:'border-red-600 text-red-300'};
function traitList(o,live=false){
  const ts=(o.traits||[]).filter(k=>TRAITS[k]); if(!ts.length) return '';
  return `<div class="flex flex-col gap-1 mt-2">${ts.map(k=>{ const T=TRAITS[k];
    const now=live&&k==='window'?(o.daily?.[todayStr()]>0?' · ya usada hoy':' · <span class="text-emerald-300">lo próximo de hoy cuenta ×${WINDOW_MULT}</span>'):'';
    return `<div class="flex flex-wrap items-center gap-x-2 gap-y-1"><span class="mono text-[11px] px-1.5 py-0.5 rounded border ${TRAIT_CHIP[T.kind]}">${T.name.toUpperCase()}</span><span class="mono text-[11px] text-slate-400">${T.desc}${now}</span></div>`; }).join('')}</div>`;
}
// Rutas por etapas (fase D): la tira de tramos y, en un punto de ruta, las cartas del siguiente.
function routeBox(c){
  const r=c.route; if(!r) return '';
  const n=r.legs.length;
  const strip=r.legs.map((l,i)=>{
    const cls=l.done?'border-emerald-800 text-emerald-300':i===r.at?'border-cyan-600 text-cyan-200':'border-slate-700 text-slate-400';
    return `<div class="flex-1 min-w-0 rounded border ${cls} px-1.5 py-1"><div class="mono text-[11px] truncate">${l.done?'✓ ':''}${i+1}. ${legName(l.kind)}</div><div class="mono text-[11px] text-slate-400">${fmtEf(l.len)} pts</div></div>`;
  }).join('');
  const cards=r.pick?`<div class="rounded-lg border border-amber-600 p-3 mt-3">
      <div class="sys-label">Punto de ruta</div>
      <div class="text-sm text-slate-300 mt-1">Elige el tramo ${r.at+1} de ${n}. Lo que hagas mientras tanto ya cuenta; si no eliges, irá directo.</div>
      <div class="grid sm:grid-cols-3 gap-2 mt-2">${r.pick.map(k=>`<button data-leg="${k}" class="text-left rounded-lg border border-slate-700 hover:border-cyan-400 bg-slate-900 p-2">
        <div class="font-semibold text-sm">${LEG_KINDS[k].name}</div>
        <div class="mono text-[11px] text-slate-400 mt-0.5">${fmtEf(legLen(r.legs[r.at].base,k))} puntos · ${LEG_KINDS[k].desc}</div></button>`).join('')}</div>
    </div>`:'';
  return `<div class="flex gap-1 mt-3" aria-label="Ruta de la misión">${strip}</div>${cards}`;
}
function bonusLine(c){
  if(!c.bonusAt) return '';
  return Date.now()<c.bonusAt
    ?`<div class="mono text-[11px] text-emerald-300 mt-1">+${BONUS_PCT} % de ¢ si llegas antes del ${atTxt(c.bonusAt)}</div>`
    :'<div class="mono text-[11px] text-slate-400 mt-1">Sin bonificación de rapidez: al llegar cobras lo normal</div>';
}
export const shortLeft=(c)=>{ const ms=Math.max(0,msLeft(c)), h=Math.ceil(ms/36e5); return h>48?`${Math.round(h/24)}d`:ms>=36e5?`${h}h`:'<1h'; };
export const leftTone=(c)=>msLeft(c)<864e5?'text-amber-300':'text-slate-400';
// Lo que dice la línea de estado y el chip de la cabecera: el salto no tiene puntos.
export const jumpTxt=(c)=>'Salto '+sysPrep(sysOf(c.to),'a');
export const statusTxt=(c)=>isJump(c)?`▶ ${jumpTxt(c)} · ${missionLeftTxt(c)}`:`▶ En misión · ${fmtEf(c.progress)}/${c.quota} · ${hasDeadline(c)?missionLeftTxt(c):'sin plazo'}`;
const chipTxt=(c)=>isJump(c)?jumpTxt(c):`${c.topic} ${fmtEf(c.progress)}/${c.quota}`;
// repinta cada minuto el tiempo que queda, sin volver a pintar toda la pantalla
export function paintMissionLeft(){
  const c=state.ship.contract; if(!hasDeadline(c)) return;
  for(const el of document.querySelectorAll('[data-mission-left]')){
    const k=el.dataset.missionLeft;
    el.textContent=k==='chip'?shortLeft(c):k==='status'?statusTxt(c):`${missionLeftTxt(c)} · ${missionEndTxt(c)}`;
    if(k==='panel') el.className=`mono text-[11px] ${leftTone(c)}`;
  }
}
// El salto: sin cuota ni recompensa, con barra de tiempo y sin botón de abandonar.
function renderJump(c,el,dmg){
  const pct=Math.min(100,Math.max(0,Math.round((Date.now()-c.acceptedAt)/(c.endsAt-c.acceptedAt)*100)));
  el.innerHTML=`
    <div class="sys-label">Situación táctica</div>
    <h2 class="text-lg font-bold mt-1">Salto</h2>
    <div class="flex flex-wrap items-center gap-2 mt-1">
      <h3 class="font-semibold text-violet-200">Rumbo ${escapeHtml(sysPrep(sysOf(c.to),'a'))}</h3>
      <span data-mission-left="panel" class="mono text-[11px] ${leftTone(c)}">${missionLeftTxt(c)} · ${missionEndTxt(c)}</span>
    </div>
    <div class="flex items-center gap-2 mt-3">
      <div class="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-label="Progreso del salto" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="h-full bg-violet-400 rounded-full transition-all" style="width:${pct}%"></div></div>
      <span class="mono text-sm text-violet-200">${pct}%</span>
    </div>
    <p class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 mt-4">Durante el salto no hay tablón, mercado ni astillero, y el salto no se puede interrumpir. Las tareas y los hábitos pagan como siempre${crewUnlocked()?', y la tripulación sigue cobrando su sueldo':''}.</p>
    <div class="sys-label mt-5 mb-2">Reparaciones a bordo</div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">${repairCards(dmg)}</div>`;
  el.querySelectorAll('[data-rep]').forEach(bt=>{ if(!bt.disabled) bt.onclick=()=>repairMod(bt.dataset.rep); });
}
const repairCards=(dmg)=>dmg.map(k=>{ const m=mod(k), rc=repairCost(k), q=repairQuote(k), ok=q.pts>0;
      return `<div id="rep-${k}" class="rounded-xl border ${m.cond>=70?'border-emerald-800':m.cond>=35?'border-amber-700':'border-red-800'} bg-slate-900/70 p-3">
        <div class="flex items-center gap-2"><span class="font-semibold text-sm">${MODS[k].name}</span><span class="mono text-[11px] text-slate-300 ml-auto">${m.cond}%</span></div>
        <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2"><div class="h-full ${condBar(m.cond)} rounded-full" style="width:${m.cond}%"></div></div>
        <button data-rep="${k}" class="${btnCls(ok)} w-full mt-2.5" ${ok?'':'disabled'}>Reparar · ${ok?q.mc:rc} ¢</button>
      </div>`; }).join('')||'<div class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 text-center sm:col-span-2 lg:col-span-4">Todos los módulos construidos están al 100%.</div>';
export function renderMission(c){
  if(isJump(c)){ renderJump(c,document.getElementById('homeMission'),Object.keys(MODS).filter(k=>mod(k).lv>0&&mod(k).cond<100)); return; }
  const w=state.wallet, pct=Math.min(100,Math.round(c.progress/c.quota*100));
  const dmg=Object.keys(MODS).filter(k=>mod(k).lv>0&&mod(k).cond<100);
  const el=document.getElementById('homeMission');
  el.innerHTML=`
    <div class="sys-label">Situación táctica</div>
    <h2 class="text-lg font-bold mt-1">En misión</h2>
    <div class="flex flex-wrap items-center gap-2 mt-1">
      <h3 class="font-semibold text-cyan-100">${c.topic}</h3>${diffChip(c.diff)}${c.urgent?URGENT_CHIP:''}
      ${hasDeadline(c)?`<span data-mission-left="panel" class="mono text-[11px] ${leftTone(c)}">${missionLeftTxt(c)} · ${missionEndTxt(c)}</span>`:`<span class="mono text-[11px] text-slate-400">${openTag(c)}</span>`}
    </div>
    <div class="text-slate-200 mt-1">${c.flavor}</div>
    <div class="flex items-center gap-2 mt-3">
      ${THREATS[c.threat]?`<span class="mono text-[11px] text-slate-400">${THREATS[c.threat].bar}</span>`:''}
      <div class="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-label="${THREATS[c.threat]?.bar||'Progreso de la misión'}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="h-full bg-cyan-400 rounded-full transition-all" style="width:${pct}%"></div></div>
      <span class="mono text-sm text-cyan-200">${fmtEf(c.progress)}/${c.quota}</span>
    </div>
    ${bonusLine(c)}
    ${routeBox(c)}
    ${traitList(c,true)}
    <div class="mono text-[11px] text-slate-400 mt-1.5">Puntos de esfuerzo: fácil 0,5 · normal 1 · difícil 2${c.size&&eff('engines')>0?` · <span class="text-cyan-300">+${Math.round(ENGINE_PUSH*eff('engines')*100)} % de avance por Motores</span>`:''} · recompensa <span class="text-amber-300">${rewardText({mc:Math.floor(c.reward.mc*cargoMult()),mats:c.reward.mats})}</span>${perk('navigator')?` <span class="text-cyan-300">+${pctTxt(perk('navigator'))} ¢ por Navegación</span>`:''} · ${c.urgent?`<span class="text-amber-300">urgente: si falla, sin cobro y reputación dañada ${REP_DAYS} días</span>`:hasDeadline(c)?'si expira, cobro parcial':'sin plazo: termina al reunir la cuota'}</div>
    ${threatBox(c)}
    <p class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 mt-4">Estás fuera ${herePrep('de')}: misiones, ${crewUnlocked()?'tripulantes, ':''}mercado y astillero vuelven a estar disponibles al terminar la misión. ${crewUnlocked()?'La tripulación sigue a bordo y cobra su sueldo cada semana, y el':'El'} tablón sigue recibiendo transmisiones.
      <span class="block mono text-[11px] text-slate-300 mt-2">${boardLine()}</span></p>
    <div class="sys-label mt-5 mb-2">Reparaciones a bordo</div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">${repairCards(dmg)}</div>
    <div class="flex mt-5"><button data-act="abandon" class="ml-auto text-sm px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:border-red-500 text-slate-300">Abandonar misión</button></div>`;
  el.querySelectorAll('[data-rep]').forEach(bt=>{ if(!bt.disabled) bt.onclick=()=>repairMod(bt.dataset.rep); });
  const shb=el.querySelector('[data-shield]'); if(shb&&!shb.disabled) shb.onclick=toggleShield;
  el.querySelectorAll('[data-leg]').forEach(bt=>{ bt.onclick=()=>chooseLeg(bt.dataset.leg); });
  wireAbandon(el.querySelector('[data-act="abandon"]'),c.urgent?'¿Seguro? Sin pago y mala reputación':'¿Seguro? Sin pago');
}
// «Abandonar misión» pide un segundo toque en 3 s
function wireAbandon(ab,sure){
  ab.onclick=()=>{ if(ab.dataset.sure){ abandonContract(); return; } ab.dataset.sure='1'; ab.textContent=sure; ab.classList.add('text-red-300','border-red-700'); setTimeout(()=>{ if(ab.isConnected){ delete ab.dataset.sure; ab.textContent='Abandonar misión'; ab.classList.remove('text-red-300','border-red-700'); } },3000); };
}

export const URGENT_CHIP='<span class="mono text-[11px] px-1.5 py-0.5 rounded border border-amber-600 text-amber-300">URGENTE</span>';
export const diffChip=(d)=>{ const D=DIFFS[d]||DIFFS.normal; return `<span class="mono text-[11px] px-1.5 py-0.5 rounded border ${D.chip}">${D.name.toUpperCase()}</span>`; };
export const fmtNum=(v)=>String(Math.round(v*10)/10).replace('.',',');
export const dayDiff=(s)=>Math.round((dayParse(s)-dayParse(todayStr()))/864e5);
export const expiryTxt=(o)=>{ const l=dayDiff(o.expiresOn); return l<=0?'caduca hoy':l===1?'caduca mañana':`caduca en ${l} días`; };
export const repLeftTxt=()=>{ const l=dayDiff(state.ship.board.repUntil)+1; return l<=1?'último día':`${l} días`; };
export function signalEta(){ const h=(1-state.ship.board.signal)/signalRate(todayStr())*24; return h<1?'menos de 1 h':`~${Math.ceil(h)} h`; }
// línea de solo lectura del tablón para la vista de misión
export function boardLine(){
  const b=state.ship.board, hoy=b.offers.filter(o=>o.expiresOn<=todayStr()).length;
  return `Tablón: ${slotsUsed(b)}/${boardCap()}${hoy?` · ${hoy} ${hoy===1?'caduca':'caducan'} hoy`:''} · señal ${Math.floor(b.signal*100)}%${repDamaged()?` · reputación dañada (${repLeftTxt()})`:''}`;
}
// barra de señal y barrido (se repinta sola cada minuto)
export function paintSignal(){
  const el=document.getElementById('signalBox');
  // No se borra el marcado: esta función también corre sola desde el
  // temporizador de cada minuto, y un id ausente reventaría cada 60 s.
  if(!missionsUnlocked()){ el.innerHTML=`<p class="mono text-[11px] text-slate-400 text-center py-1">${missionHint()}</p>`; return; }
  const b=state.ship.board, cap=boardCap(), full=slotsUsed(b)>=cap, pct=Math.floor(b.signal*100), cost=sweepCost(), ok=!full&&state.wallet.mc>=cost, rep=repDamaged();
  el.innerHTML=`
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="sys-label">Señal</span>
      <span class="mono text-[11px] text-slate-300">Tablón ${slotsUsed(b)}/${cap}</span>
      <span class="mono text-[11px] ${full?'text-amber-300':'text-slate-400'} ml-auto">${full?'Tablón lleno · descarta o acepta una misión':`Próxima transmisión en ${signalEta()}`}</span>
    </div>
    <div class="flex items-center gap-2 mt-2">
      <div class="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-label="Señal hasta la próxima transmisión" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="h-full ${rep?'bg-amber-400':'bg-cyan-400'} rounded-full transition-all" style="width:${pct}%"></div></div>
      <span class="mono text-[11px] text-slate-300 w-9 text-right">${pct}%</span>
    </div>
    ${rep?`<p class="mono text-[11px] text-amber-300 mt-2">Reputación dañada · ${repLeftTxt()}: la señal llega a la mitad y no hay misiones urgentes.</p>`:''}
    <div class="flex flex-wrap items-center gap-2 mt-2.5">
      <span class="mono text-[11px] text-slate-400 flex-1 min-w-[10rem]">${fmtNum(signalRate(todayStr()))} misiones al día · el barrido adelanta la próxima pagando lo que le falta a la barra</span>
      <button id="btnSweep" class="${btnCls(ok)} px-3" ${ok?'':'disabled'}>${full?'Tablón lleno':`⌁ Barrido de señal · ${cost} ¢`}</button>
    </div>`;
  if(ok) document.getElementById('btnSweep').onclick=sweep;
}

export let lastShipArt='', shipArtRO=null;
export function renderShip(){
  const sh=state.ship, c=sh.contract, w=state.wallet;
  // El saldo y la misión solo se enseñan en la nave: fuera, la cabecera queda limpia.
  const chipEl=document.getElementById('shipChip');
  chipEl.style.display=uiMode==='ship'?'':'none';
  chipEl.innerHTML=`¢ ${w.mc}${c?`<span class="hidden sm:inline text-cyan-300"> · ${escapeHtml(chipTxt(c))} · ${hasDeadline(c)?`<span data-mission-left="chip">${shortLeft(c)}</span>`:'sin plazo'}</span>`:''}`;
  if(uiMode!=='ship') return;

  document.getElementById('walletBar').innerHTML=Object.entries(RES).map(([k,r])=>`<span class="mono text-xs px-2 py-1 rounded border ${r.chip}">${r.sym} ${w[k]} <span class="text-slate-400">${r.name}</span></span>`).join('');

  const titleEl=document.getElementById('shipTitle'); titleEl.textContent=sh.name||SHIP_NAME_DEFAULT; titleEl.title=titleEl.textContent;

  renderRank();
  renderCrew();

  // estado: en el Sistema Madre o en misión
  const ss=document.getElementById('shipStatus');
  const away=isAway(c);
  ss.className='ml-auto mono text-[11px] px-2 py-1 rounded-md border '+(away?'border-cyan-600 text-cyan-200 bg-cyan-950/40 hover:border-cyan-400':'border-emerald-700 text-emerald-300 bg-emerald-950/30 hover:border-emerald-500');
  ss.textContent=away?statusTxt(c):'⌂ '+herePrep('En');
  if(away&&hasDeadline(c)) ss.dataset.missionLeft='status'; else delete ss.dataset.missionLeft;
  ss.onclick=()=>document.getElementById('homePanel').scrollIntoView({behavior:'smooth',block:'start'});

  // esquema: tocar un módulo lleva al astillero (o a las reparaciones a bordo en misión)
  const tot=Object.values(sh.modules).reduce((a,m)=>a+m.lv,0);
  document.getElementById('shipLevel').textContent=`Nv. total ${tot}/${SHIP_LV_MAX}`;
  // Solo se repinta si cambia: rehacerla en cada render reiniciaría las estrellas.
  const art=shipArt();
  if(art!==lastShipArt){ document.getElementById('shipArt').innerHTML=art; lastShipArt=art; }
  if(!shipArtRO){
    // En sm+ el recuadro es más alto que ancho y el dibujo (slice) recorta los
    // lados: el planeta se corre lo recortado para seguir asomando igual.
    shipArtRO=new ResizeObserver(([e])=>{ const {width:w,height:h}=e.contentRect;
      e.target.style.setProperty('--planet-x',(h>w&&w>0?(150-150*w/h).toFixed(1):0)+'px'); });
    shipArtRO.observe(document.getElementById('shipArt'));
  }
  const sc=document.getElementById('shipSystems'); sc.innerHTML=shipSystems();
  sc.querySelectorAll('[data-slot]').forEach(g=>g.onclick=()=>{
    const k=g.dataset.slot;
    if(!away&&homeTab!=='yard') showHomeTab('yard',false);
    (document.getElementById((away?'rep-':'mod-')+k)||document.getElementById('homePanel')).scrollIntoView({behavior:'smooth',block:'center'});
  });

  // el sistema o la misión en curso
  const sys=here();
  document.getElementById('homeTitle').textContent='En '+sys.name;
  document.getElementById('homeTabs').setAttribute('aria-label',sys.name);
  document.querySelectorAll('[data-sys]').forEach(e=>{ e.textContent=sys.art+sys.name; });
  document.getElementById('homeDock').classList.toggle('hidden',away);
  document.getElementById('homeMission').classList.toggle('hidden',!away);
  if(away) renderMission(c);
  document.querySelectorAll('#homeTabs [data-tab]').forEach(t=>{ const on=t.dataset.tab===homeTab; t.setAttribute('aria-selected',on); t.tabIndex=on?0:-1; t.onclick=()=>showHomeTab(t.dataset.tab,false); });
  document.querySelectorAll('#homeDock [data-pane]').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==homeTab));

  // misiones
  const b=sh.board;
  paintSignal();
  const ol=document.getElementById('offerList'); ol.innerHTML='';
  const offers=missionsUnlocked()?b.offers:[];   // bloqueado: la pista ya está en #signalBox
  if(missionsUnlocked()&&!offers.length) ol.innerHTML='<div class="text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 text-center sm:col-span-2">No hay misiones en el tablón. Espera la próxima transmisión o haz un barrido de señal.</div>';
  offers.forEach(o=>{
    const sure=offerSailing===o.id, drop=offerDiscarding===o.id, age=hasDeadline(o)?offerAge(o):0, open=!hasDeadline(o), ch=o.story&&MISSION_BY_ID[o.mid], el=document.createElement('div');
    el.className='rounded-xl border '+(o.urgent?'border-amber-700':ch?'border-violet-700':'border-slate-700')+' bg-slate-900/70 p-3';
    el.innerHTML=`
      <div class="flex items-center gap-2">
        ${ch?`<span class="mono text-[11px] px-1.5 py-0.5 rounded border border-violet-600 text-violet-300">HISTORIA · CAPÍTULO ${ch.chapter}</span>`:`<span class="mono text-[11px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-300">${o.topic.toUpperCase()}</span>`}${diffChip(o.diff)}${o.urgent?URGENT_CHIP:''}
        <span class="mono text-[11px] text-slate-400">${open?openTag(o):`${o.days} ${o.days===1?'día':'días'}`}</span>
        ${ch?'':`<button data-drop="${o.id}" aria-label="Descartar misión" class="ml-auto mono text-[11px] px-1.5 py-0.5 rounded border ${drop?'border-red-700 text-red-300':'border-transparent text-slate-400 hover:text-red-300'}">${drop?'¿Descartar?':'✕'}</button>`}
      </div>
      ${ch?`<div class="text-sm font-semibold text-violet-100 mt-1.5">${escapeHtml(ch.title)}</div>`:''}
      <div class="text-sm font-medium mt-1.5">${o.flavor}</div>
      <div class="mono text-[11px] text-slate-400 mt-1">${open?`Reúne ${o.quota} puntos de esfuerzo${LEGS[o.size]&&!o.story?` en ${LEGS[o.size]} tramos`:''}, sin plazo${o.window?` · <span class="text-emerald-300">+${BONUS_PCT} % si llegas en ${o.window} días</span>`:''}`:`Reúne ${o.quota} puntos de esfuerzo en ${o.days===1?'1 día':o.days+' días'}`}</div>
      ${THREATS[o.threat]?`<div class="mono text-[11px] text-slate-400 mt-1">Amenaza: ${THREATS[o.threat].name} · −${HIT[o.diff]||HIT.normal} % a un módulo cada noche</div>`:''}
      ${traitList(o)}
      ${ch?'':`<div class="mono text-[11px] mt-1 ${o.expiresOn<=todayStr()?'text-amber-300':'text-slate-400'}">${expiryTxt(o)}${age?` · <span class="text-emerald-300">+${Math.round(AGE_BONUS*age*100)}% por espera</span>`:''}</div>`}
      ${o.urgent?`<div class="mono text-[11px] text-amber-300 mt-1">Si fallas: sin cobro y reputación dañada ${REP_DAYS} días</div>`:''}
      <div class="flex flex-wrap items-center gap-2 mt-2">
        <span class="mono text-xs text-amber-300">${rewardText({mc:Math.floor(agedMc(o)*cargoMult()),mats:o.reward.mats})}</span>
        <button data-offer="${o.id}" class="ml-auto py-1.5 px-3 rounded-lg text-sm font-semibold ${sure?'bg-cyan-500 text-slate-950 hover:bg-cyan-400':'bg-cyan-700 hover:bg-cyan-600 text-white'}">${sure?'¿Zarpar? Confirmar':'Aceptar y zarpar'}</button>
      </div>`;
    el.querySelector('[data-offer]').onclick=()=>acceptOffer(o.id);
    const dr=el.querySelector('[data-drop]'); if(dr) dr.onclick=()=>discardOffer(o.id);
    ol.appendChild(el);
  });

  // módulos
  const ml=document.getElementById('modList'); ml.innerHTML='';
  for(const [k,def] of Object.entries(MODS)){
    const m=mod(k), up=m.lv>0, closed=yardClosed(k), cost=modCost(k), ok=!closed&&cost&&canAfford(cost), rc=repairCost(k), q=repairQuote(k);
    const effTxt={bridge:`${boardCap()} huecos en el tablón`,engines:`+${Math.round(ENGINE_PUSH*eff(k)*100)}% de avance en misión · urgentes de hasta ${maxDays()} días`,cargo:`+${Math.round(eff(k)*10)}% ¢ en misiones`,comms:`${fmtNum(baseSignal())} misiones/día`,
      quarters:`${berths()} literas`+(berthsUsable()<berths()?` · ${berths()-berthsUsable()} dañada${berths()-berthsUsable()>1?'s':''}`:''),
      spirit:`+${Math.round(XP_BONUS*eff(k)*100)}% de méritos`,social:`−${Math.round(WAGE_CUT*eff(k)*100)}% en los sueldos`,
      craft:`−${Math.round(YARD_CUT*eff(k)*100)}% en el astillero`,health:`+${Math.round(SELFHEAL*eff(k))} de estado al día`}[k];
    const el=document.createElement('div'); el.id='mod-'+k;
    el.className='rounded-xl border p-3 bg-slate-900/70 '+(!up?'border-slate-700':m.cond>=70?'border-emerald-800':m.cond>=35?'border-amber-700':'border-red-800');
    el.innerHTML=`
      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm">${def.name}</span>
        <span class="mono text-[11px] px-1.5 py-0.5 rounded border ${def.kind==='area'?AREA_COLORS[def.area]:'border-slate-600 text-slate-300'}">${def.kind==='area'?escapeHtml(areaName(def.area)):'GENERAL'}</span>
        <span class="mono text-[11px] ${m.lv>=5?'text-emerald-300':'text-slate-400'} ml-auto">${'●'.repeat(m.lv)}${'○'.repeat(5-m.lv)}</span>
      </div>
      <div class="mono text-[11px] text-slate-400 mt-1.5">${def.desc}${def.kind==='area'?' · opcional':''}</div>
      ${up?`<div class="flex items-center gap-2 mt-2">
        <div class="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full ${condBar(m.cond)} rounded-full" style="width:${m.cond}%"></div></div>
        <span class="mono text-[11px] text-slate-300">${m.cond}%</span>
      </div>
      <div class="mono text-[11px] text-cyan-200 mt-1">Ahora: ${effTxt}</div>`:''}
      <div class="flex flex-col gap-1.5 mt-2.5">
        ${m.lv<5&&closed?`<button data-act="build" class="${btnCls(false)}" disabled>No se mejora ${herePrep('en')}</button>`
          :`<button data-act="build" class="${m.lv>=5?'px-2 py-2 rounded-lg text-sm font-semibold bg-emerald-900/40 text-emerald-300 cursor-default':btnCls(ok)}" ${m.lv>=5||!ok?'disabled':''}>${m.lv>=5?'MAX':`Mejorar · ${fmtCost(cost)}`}</button>`}
        ${up&&m.cond<100?`<button data-act="repair" class="${btnCls(q.pts>0)}" ${q.pts>0?'':'disabled'}>Reparar · ${q.pts>0?q.mc:rc} ¢</button>`:''}
      </div>`;
    if(m.lv<5&&ok) el.querySelector('[data-act="build"]').onclick=()=>buildMod(k);
    const rb=el.querySelector('[data-act="repair"]'); if(rb&&q.pts>0) rb.onclick=()=>repairMod(k);
    ml.appendChild(el);
  }

  // mercado
  const mk=document.getElementById('marketList'); mk.innerHTML='';
  const y=addDays(todayStr(),-1);
  for(const k of MATS){
    if(!onSale(k)){ mk.appendChild(offSale(k,w)); continue; }
    const r=RES[k], p0=priceOf(k), p=buyPrice(k), py=priceOf(k,y), sp=sellOf(k);
    const el=document.createElement('div');
    el.className='rounded-xl border border-slate-700 bg-slate-900/70 p-3';
    el.innerHTML=`
      <div class="flex items-center gap-2">
        <span class="mono text-[11px] px-1.5 py-0.5 rounded border ${r.chip}">${r.sym} ${r.name}</span>
        <span class="mono text-[11px] text-slate-400 ml-auto">tienes ${w[k]}</span>
      </div>
      <div class="text-xl font-bold mt-1.5">${p} ¢ ${p<p0?`<span class="mono text-xs font-normal text-slate-400 line-through">${p0} ¢</span> `:''}<span class="mono text-xs font-normal ${p0>py?'text-red-300':p0<py?'text-emerald-300':'text-slate-400'}">${p0>py?'▲':p0<py?'▼':'='}</span></div>
      <div class="mono text-[11px] text-slate-400">ayer ${py} ¢ · venta ${sp} ¢</div>
      <div class="grid grid-cols-3 gap-1.5 mt-2">
        <button data-act="b1" class="${btnCls(w.mc>=p)} px-1" ${w.mc>=p?'':'disabled'}>+1</button>
        <button data-act="b5" class="${btnCls(w.mc>=p*5)} px-1" ${w.mc>=p*5?'':'disabled'}>+5</button>
        <button data-act="s1" class="px-1 py-2 rounded-lg text-sm font-semibold ${w[k]>=1?'bg-slate-800 border border-slate-600 hover:border-amber-500':'bg-slate-800 text-slate-400 cursor-not-allowed'}" ${w[k]>=1?'':'disabled'}>Vender</button>
      </div>`;
    el.querySelector('[data-act="b1"]').onclick=()=>buyMat(k,1);
    el.querySelector('[data-act="b5"]').onclick=()=>buyMat(k,5);
    el.querySelector('[data-act="s1"]').onclick=()=>sellMat(k);
    mk.appendChild(el);
  }
}

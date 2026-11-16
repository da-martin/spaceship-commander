/* Cambio de vista. Hay dos modos en la navegación: Commander (que incluye el
 * Protocolo Forster, 'focus') y Spaceship (con sus pestañas Nave, 'ship', y
 * Alianza, 'alliance'). uiMode sigue siendo la vista concreta. */
import { on } from '../core/events.js';
import { paintFocusClock, requestFocusExit } from '../features/focus.js';
import { shipArrive } from '../features/log.js';
import { enterAlliance, renderAlliance } from './alliance-view.js';
import { render } from './commander.js';
import { view } from './view.js';
import { applyWeeks, setWeeks } from './weeks.js';

/* ---------- mode toggle ---------- */
export const UIKEY = 'spaceship-commander:ui';
export let uiMode = 'commander';
// Pestaña de Spaceship a la que se vuelve al entrar en el modo.
const STABKEY = 'spaceship-commander:stab';
let shipTab = 'ship';
try{ if(localStorage.getItem(STABKEY)==='alliance') shipTab='alliance'; }catch{}
const navMode = (m) => m==='ship'||m==='alliance' ? 'ship' : 'commander';
export function setMode(m){
  uiMode=m; const ship=m==='ship', focus=m==='focus', alliance=m==='alliance';
  document.getElementById('commander-view').classList.toggle('hidden',ship||focus||alliance);
  document.getElementById('spaceship-view').classList.toggle('hidden',!ship);
  document.getElementById('focus-view').classList.toggle('hidden',!focus);
  document.getElementById('alliance-view').classList.toggle('hidden',!alliance);
  document.getElementById('navToggle').classList.toggle('nav-off',focus);
  const fn=document.getElementById('focusNav'); fn.classList.toggle('hidden',!focus); fn.classList.toggle('flex',focus);
  const modeBtn=(id,on)=>{ const b=document.getElementById(id);
    b.className='relative px-3 py-2 text-sm rounded-md '+(on?'bg-cyan-700 text-white font-medium':'text-slate-300 hover:text-white');
    b.setAttribute('aria-pressed',String(on)); };
  const nm=navMode(m);
  modeBtn('btnCommander',nm==='commander'); modeBtn('btnSpaceship',nm==='ship');
  document.querySelectorAll('#bottomNav .bnav').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===nm)));
  document.getElementById('shipTabs').classList.toggle('hidden',nm!=='ship');
  document.querySelectorAll('#shipTabs [data-stab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stab===m)));
  if(nm==='ship') shipTab=m;
  try{ localStorage.setItem(UIKEY,m); if(nm==='ship') localStorage.setItem(STABKEY,m); }catch{}
  view.weeksScreen=false;   // cambiar de modo sale de la pantalla del teléfono; el panel de escritorio se recuerda
  applyWeeks();
  if(ship) shipArrive();   // lo que pasó mientras estabas fuera
  render(); paintFocusClock(); scrollTo(0,0);
  // Al entrar: lo que cambió mientras estabas fuera. Al salir: el punto de aviso vuelve a contar.
  alliance?enterAlliance():renderAlliance();
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  // Commander y Spaceship: en la cabecera (sm+) y en la barra inferior (móvil).
  // Desde el Protocolo Forster, salir pasa por su aviso, que si no se perderían
  // las acciones rápidas. Pulsar el modo en el que ya estás saca de las semanas.
  const goMode=(nm)=>{
    if(nm===navMode(uiMode)){ if(view.weeksScreen) setWeeks(false); return; }
    const m=nm==='ship'?shipTab:'commander';
    uiMode==='focus' ? requestFocusExit(m) : setMode(m);
  };
  document.getElementById('btnCommander').onclick=()=>goMode('commander');
  document.getElementById('btnSpaceship').onclick=()=>goMode('ship');
  document.querySelectorAll('#bottomNav .bnav').forEach(b=>b.onclick=()=>goMode(b.dataset.mode));
  document.querySelectorAll('#shipTabs [data-stab]').forEach(b=>b.onclick=()=>{ if(b.dataset.stab!==uiMode){ setMode(b.dataset.stab); } });
  document.querySelectorAll('#cmdTabs [data-ctab]').forEach(b=>b.onclick=()=>{ view.cmdTab=b.dataset.ctab; render(); scrollTo(0,0); });
  document.getElementById('shipChip').onclick=()=>uiMode==='focus'?requestFocusExit('ship'):setMode('ship');
}

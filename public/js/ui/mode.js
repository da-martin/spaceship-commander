/* Cambio entre Commander, Focus, Spaceship y Alliance. */
import { on } from '../core/events.js';
import { enterFocus, paintFocusClock, requestFocusExit } from '../features/focus.js';
import { shipArrive } from '../features/log.js';
import { enterAlliance } from './alliance-view.js';
import { render } from './commander.js';
import { renderShip } from './ship-view.js';
import { view } from './view.js';
import { applyWeeks, setWeeks } from './weeks.js';

/* ---------- mode toggle ---------- */
export const UIKEY = 'spaceship-commander:ui';
export let uiMode = 'commander';
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
  modeBtn('btnCommander',m==='commander'); modeBtn('btnFocusMode',focus); modeBtn('btnSpaceship',ship); modeBtn('btnAlliance',alliance);
  document.querySelectorAll('#bottomNav .bnav').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===m)));
  try{ localStorage.setItem(UIKEY,m); }catch{}
  view.weeksScreen=false;   // cambiar de modo sale de la pantalla del teléfono; el panel de escritorio se recuerda
  applyWeeks();
  if(ship) shipArrive();   // lo que pasó mientras estabas fuera
  render(); paintFocusClock(); scrollTo(0,0);
  if(alliance) enterAlliance();   // lo que cambió en la alianza mientras estabas fuera
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('btnCommander').onclick=()=>setMode('commander');
  document.getElementById('btnSpaceship').onclick=()=>setMode('ship');
  document.getElementById('btnAlliance').onclick=()=>setMode('alliance');
  // Barra inferior: mismo comportamiento que la cabecera, incluido el aviso de
  // salida del Protocolo Forster, que si no se perderían las acciones rápidas.
  document.querySelectorAll('#bottomNav .bnav').forEach(b=>b.onclick=()=>{
    const m=b.dataset.mode;
    if(m===uiMode){ if(view.weeksScreen) setWeeks(false); return; }   // el modo en el que ya estás saca de las semanas
    if(m==='focus'){ enterFocus(); return; }
    uiMode==='focus' ? requestFocusExit(m) : setMode(m);
  });
  document.querySelectorAll('#cmdTabs [data-ctab]').forEach(b=>b.onclick=()=>{ view.cmdTab=b.dataset.ctab; render(); scrollTo(0,0); });
  document.getElementById('shipChip').onclick=()=>uiMode==='focus'?requestFocusExit('ship'):setMode('ship');
  document.getElementById('sortNave').onclick=()=>{ view.sysSort='nave'; renderShip(); };
  document.getElementById('sortEstado').onclick=()=>{ view.sysSort='estado'; renderShip(); };
}

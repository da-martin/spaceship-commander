/* Modal de ajustes. */
import { loadCalEvents, paintCalendars, showCalMsg } from '../integrations/calendars.js';
import { paintTh, thc, thRefreshMap, thsMsg } from '../integrations/taskhero.js';
import { save, state } from '../store.js';
import { render } from './commander.js';
import { view } from './view.js';

// Ajustes: cada interruptor escribe en state.settings y se ve al momento
export function paintSettings(){
  document.getElementById('setStreaks').setAttribute('aria-checked',String(state.settings.showStreaks));
  document.getElementById('setProjects').setAttribute('aria-checked',String(state.settings.showProjects));
  document.getElementById('setEvents').setAttribute('aria-checked',String(state.settings.showEvents));
  document.getElementById('setBadgeEvents').setAttribute('aria-checked',String(state.settings.badgeEvents));
  paintCalendars(); paintTh();
}
export function openSettings(){ view.calRemoving=null; thc.removing=false; showCalMsg(''); thsMsg(''); paintSettings(); document.getElementById('settingsModal').classList.remove('hidden'); loadCalEvents(); if(thc.connected) thRefreshMap().then(paintTh); }
export function closeSettings(){ document.getElementById('settingsModal').classList.add('hidden'); }

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('miSettings').onclick=openSettings;
  document.getElementById('settingsClose').onclick=closeSettings;
  document.getElementById('settingsModal').addEventListener('click',e=>{ if(e.target.id==='settingsModal') closeSettings(); });
  document.getElementById('setStreaks').onclick=()=>{ state.settings.showStreaks=!state.settings.showStreaks; save(); render(); paintSettings(); };
  document.getElementById('setProjects').onclick=()=>{ state.settings.showProjects=!state.settings.showProjects; save(); render(); paintSettings(); };
  document.getElementById('setEvents').onclick=()=>{ state.settings.showEvents=!state.settings.showEvents; save(); render(); paintSettings(); };
  document.getElementById('setBadgeEvents').onclick=()=>{ state.settings.badgeEvents=!state.settings.badgeEvents; save(); render(); paintSettings(); };
}

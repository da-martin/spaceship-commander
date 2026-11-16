/* Modal de ajustes. */
import { loadCalEvents, paintCalendars, showCalMsg } from '../integrations/calendars.js';
import { paintTh, thc, thRefreshMap, thsMsg } from '../integrations/taskhero.js';
import { AREA_DOT, AREAS } from '../config.js';
import { AREA_NAME_MAX, areaName, normAreaNames, save, state } from '../store.js';
import { escapeHtml } from '../util.js';
import { render } from './commander.js';
import { view } from './view.js';

// Ajustes: cada interruptor escribe en state.settings y se ve al momento
export function paintSettings(){
  document.getElementById('setStreaks').setAttribute('aria-checked',String(state.settings.showStreaks));
  document.getElementById('setProjects').setAttribute('aria-checked',String(state.settings.showProjects));
  document.getElementById('setEvents').setAttribute('aria-checked',String(state.settings.showEvents));
  document.getElementById('setBadgeEvents').setAttribute('aria-checked',String(state.settings.badgeEvents));
  document.getElementById('setAllyProgress').setAttribute('aria-checked',String(state.settings.allyProgress));
  document.getElementById('setAllyEvents').setAttribute('aria-checked',String(state.settings.allyEvents));
  document.getElementById('setAreasSub').textContent=AREAS.map(areaName).join(' · ');
  paintCalendars(); paintTh();
}

// Editar áreas: un campo por área, con su color. Vacío = el nombre original.
function openAreas(){
  document.getElementById('areasList').innerHTML=AREAS.map(a=>`<div class="flex items-center gap-3">
    <span class="rounded-full shrink-0" style="width:16px;height:16px;background:${AREA_DOT[a]};box-shadow:0 0 0 3px ${AREA_DOT[a]}33" aria-hidden="true"></span>
    <label for="areaIn-${a}" class="sr-only">Nombre del área ${a}</label>
    <input id="areaIn-${a}" data-area-in="${a}" type="text" maxlength="${AREA_NAME_MAX}" value="${escapeHtml(state.settings.areaNames[a]||'')}" placeholder="${a}" class="flex-1 min-w-0 h-11 px-3 rounded-lg bg-slate-900 border border-slate-700 text-sm outline-none focus:border-cyan-600" style="border-left:3px solid ${AREA_DOT[a]}">
  </div>`).join('');
  document.getElementById('areasModal').classList.remove('hidden');
  document.querySelector('[data-area-in]').focus();
}
function closeAreas(){ document.getElementById('areasModal').classList.add('hidden'); document.getElementById('setAreas').focus(); }
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
  // save() avisa a alliance-share: al apagar el progreso se borra del servidor.
  document.getElementById('setAllyProgress').onclick=()=>{ state.settings.allyProgress=!state.settings.allyProgress; save(); paintSettings(); };
  document.getElementById('setAreas').onclick=openAreas;
  document.getElementById('areasClose').onclick=closeAreas;
  document.getElementById('areasCancel').onclick=closeAreas;
  document.getElementById('areasModal').addEventListener('click',e=>{ if(e.target.id==='areasModal') closeAreas(); });
  document.getElementById('areasModal').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.stopPropagation(); closeAreas(); } });
  document.getElementById('areasForm').addEventListener('submit',e=>{
    e.preventDefault();
    const raw={}; document.querySelectorAll('[data-area-in]').forEach(i=>raw[i.dataset.areaIn]=i.value);
    state.settings.areaNames=normAreaNames(raw); save(); render(); paintSettings(); closeAreas();
  });
  document.getElementById('setAllyEvents').onclick=()=>{ state.settings.allyEvents=!state.settings.allyEvents; save(); paintSettings(); };
}

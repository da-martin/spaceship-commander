/* Arranque de Spaceship Commander: carga la partida, engancha cada módulo y
 * pone en marcha los relojes. Los demás módulos solo declaran (como mucho leen
 * alguna preferencia de localStorage) y exportan init() si tienen botones. */
import { RANKS } from './config.js';
import { on } from './core/events.js';
import { atHome, checkContractEnd, logBoardNews, tickBoard } from './core/missions.js';
import { onLog, onLogged } from './features/log.js';
import { dailyTick, needsReview } from './features/review.js';
import { loadCalEvents } from './integrations/calendars.js';
import { thFlush, thTrack } from './integrations/taskhero.js';
import { load, save, setState, state } from './store.js';
import { cloud, CLOUDKEY, hydrate, initCloud, pushState, readLink, schedulePush } from './sync/cloud.js';
import { render } from './ui/commander.js';
import { setMode, UIKEY, uiMode } from './ui/mode.js';
import { paintMissionLeft, paintSignal, renderShip } from './ui/ship-view.js';
import { toast } from './ui/toast.js';
import { init as initUiModal } from './ui/modal.js';
import { init as initUiCommander } from './ui/commander.js';
import { init as initFeaturesSaves } from './features/saves.js';
import { init as initUiSettings } from './ui/settings.js';
import { init as initIntegrationsTaskheroModal } from './integrations/taskhero-modal.js';
import { init as initIntegrationsTaskhero } from './integrations/taskhero.js';
import { init as initFeaturesReview } from './features/review.js';
import { init as initFeaturesLog } from './features/log.js';
import { init as initFeaturesFocus } from './features/focus.js';
import { init as initUiMode } from './ui/mode.js';
import { init as initIntegrationsCalendars } from './integrations/calendars.js';
import { init as initSyncAuth } from './sync/auth.js';

// La partida se carga antes de enganchar nada, como cuando todo iba en un solo script.
setState(load());
// Lo que hace la vista cuando la lógica avisa (core/events.js).
on('saved',schedulePush);
on('log',onLog);
on('logged',onLogged);
// Un ascenso no es noticia de la nave: es del comandante, y sale donde esté.
on('rankUp',i=>toast(`★ Ascenso: ahora eres ${RANKS[i][0]}`,'win'));
on('track',thTrack);
// Cada módulo engancha sus botones, en el mismo orden que antes.
initUiModal();
initUiCommander();
initFeaturesSaves();
initUiSettings();
initIntegrationsTaskheroModal();
initIntegrationsTaskhero();
initFeaturesReview();
initFeaturesLog();
initFeaturesFocus();
initUiMode();
initIntegrationsCalendars();
initSyncAuth();

addEventListener('online',()=>{ if(cloud.pending) pushState(); thFlush(true); });
// Dos pestañas del mismo navegador comparten cuenta: al escribir una, la otra
// adopta su rev para no chocar contra sí misma con un 409 falso.
addEventListener('storage',e=>{
  if(e.key!==CLOUDKEY||!cloud.user) return;
  const l=readLink();
  if(l&&l.user===cloud.user.id&&l.rev>cloud.rev) cloud.rev=l.rev;
});
/* ---------- boot ---------- */
dailyTick();
{ const m=localStorage.getItem(UIKEY); setMode(m==='ship'||m==='focus'?m:'commander'); }
// El panel de semanas se anima a partir de aquí, no al pintar el estado guardado.
requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add('weeks-anim')));
addEventListener('focus',()=>{
  dailyTick(); render();
  // Al volver: reintenta lo pendiente, o comprueba si otro dispositivo escribió.
  if(cloud.user){ if(cloud.pending) pushState(); else hydrate(); loadCalEvents(); thFlush(true); }
});
initCloud();
// cada minuto avanza la señal: si llega o caduca algo se guarda y se avisa; si no, solo se repinta la barra
setInterval(()=>{
  // la misión vence a su hora (salvo con el repaso de ayer pendiente: lo marcado allí aún cuenta)
  if(state.ship.contract&&!needsReview()&&checkContractEnd()){ if(atHome()) logBoardNews(); save(); render(); return; }
  paintMissionLeft();
  const b=state.ship.board, before=b.offers.map(o=>o.id).join();
  tickBoard();
  if(b.offers.map(o=>o.id).join()!==before){
    if(atHome()) logBoardNews();
    save(); renderShip();
  } else if(uiMode==='ship'&&atHome()) paintSignal();
},60000);

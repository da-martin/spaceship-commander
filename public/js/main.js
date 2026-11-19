/* Arranque de Spaceship Commander: carga la partida, engancha cada módulo y
 * pone en marcha los relojes. Los demás módulos solo declaran (como mucho leen
 * alguna preferencia de localStorage) y exportan init() si tienen botones. */
import { RANKS } from './config.js';
import { on } from './core/events.js';
import { docked, checkContractEnd, logBoardNews, tickBoard } from './core/missions.js';
import { scheduleShare, shareEvent, shareSync } from './features/alliance-share.js';
import { onLog, onLogged } from './features/log.js';
import { dailyTick, needsReview } from './features/review.js';
import { loadCalEvents } from './integrations/calendars.js';
import { thFlush, thTrack } from './integrations/taskhero.js';
import { load, save, setState, state } from './store.js';
import { syncCrew } from './rpg/roster.js';
import { cloud, CLOUDKEY, hydrate, initCloud, pushState, readLink, schedulePush } from './sync/cloud.js';
import { allianceBoot, init as initUiAllianceView, refreshAlliance } from './ui/alliance-view.js';
import { render } from './ui/commander.js';
import { setMode, SHIP_TABS, UIKEY, uiMode } from './ui/mode.js';
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
import { init as initUiVR } from './ui/vr-view.js';
import { init as initUiBooks } from './ui/books-view.js';
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
// VR Training: cada contratación deja un holoperfil (lo guarda el save() de la contratación).
on('crewJoined',()=>syncCrew(state.rpg,state.ship.crew));
on('crewPromoted',()=>syncCrew(state.rpg,state.ship.crew));
// Lo que comparte tu juego con la alianza: hitos al chat y el porcentaje del día.
on('rankUp',i=>shareEvent({kind:'rank',rank:i}));
on('missionWon',c=>shareEvent({kind:'mission',topic:c.topic}));
on('saved',scheduleShare);
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
initUiBooks();
initUiAllianceView();
initUiVR();
initIntegrationsCalendars();
initSyncAuth();

addEventListener('online',()=>{ if(cloud.pending) pushState(); thFlush(true); shareSync(); });
// Dos pestañas del mismo navegador comparten cuenta: al escribir una, la otra
// adopta su rev para no chocar contra sí misma con un 409 falso.
addEventListener('storage',e=>{
  if(e.key!==CLOUDKEY||!cloud.user) return;
  const l=readLink();
  if(l&&l.user===cloud.user.id&&l.rev>cloud.rev) cloud.rev=l.rev;
});
/* ---------- boot ---------- */
dailyTick();
{ const m=localStorage.getItem(UIKEY); setMode(m==='focus'||SHIP_TABS.includes(m)?m:'commander'); }
// El panel de semanas se anima a partir de aquí, no al pintar el estado guardado.
requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add('weeks-anim')));
addEventListener('focus',()=>{
  dailyTick(); render();
  // Al volver: reintenta lo pendiente, o comprueba si otro dispositivo escribió.
  if(cloud.user){ if(cloud.pending) pushState(); else hydrate(); loadCalEvents(); thFlush(true); refreshAlliance(); }
});
// La alianza se pide al saber quién eres: pinta la vista si estás en ella y el aviso de invitaciones.
initCloud().then(allianceBoot);
// cada minuto avanza la señal: si llega o caduca algo se guarda y se avisa; si no, solo se repinta la barra
setInterval(()=>{
  // la misión vence a su hora (salvo con el repaso de ayer pendiente: lo marcado allí aún cuenta)
  if(state.ship.contract&&!needsReview()&&checkContractEnd()){ if(docked()) logBoardNews(); save(); render(); return; }
  paintMissionLeft();
  const b=state.ship.board, before=b.offers.map(o=>o.id).join();
  tickBoard();
  if(b.offers.map(o=>o.id).join()!==before){
    if(docked()) logBoardNews();
    save(); renderShip();
  } else if(uiMode==='ship'&&docked()) paintSignal();
},60000);

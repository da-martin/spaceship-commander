/* Bitácora de a bordo: las entradas se guardan en la partida (state.ship.log). */
import { LOG_DAYS, LOG_MAX } from '../config.js';
import { emit } from './events.js';
import { boardText } from './missions.js';
import { state } from '../store.js';
import { todayStr, uid } from '../util.js';
// Noticias de la nave: todo va a la bitácora. Dentro de Spaceship lo pequeño
// sale además como aviso y el final de una misión abre su informe; fuera, se
// queda sin ver y se enciende el punto del botón Spaceship. Eso lo decide la
// vista con los avisos log y logged (features/log.js). Quien llama guarda.
export function logShip(e){
  if(!e) return;
  const L=state.ship.log, t=todayStr(), last=L[L.length-1];
  e={id:uid(),at:Date.now(),day:t,big:false,tone:'info',lines:[],story:null,rew:null,got:0,lost:0,seen:false,read:false,...e};
  // el tablón cambia cada pocos minutos: lo que no se ha leído hoy se suma en una sola entrada
  if(e.kind==='board'&&last?.kind==='board'&&!last.read&&last.day===t){
    L.pop(); e={...last,at:e.at,got:last.got+e.got,lost:last.lost+e.lost,seen:false};
    e.title=boardText(e);
  }
  emit('log',e);
  L.push(e);
  const cut=Date.now()-LOG_DAYS*864e5;
  state.ship.log=L.filter(x=>x.at>=cut||!x.read).slice(-LOG_MAX);
  emit('logged',e);
}
export const logText=(e)=>[e.title,...e.lines].join(' · ');

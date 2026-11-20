/* Chat de la alianza. Va por consulta: con la vista abierta se pide lo nuevo
 * cada pocos segundos. La lista se va completando sin repintarse entera, para
 * no mover el desplazamiento ni borrar lo que se está escribiendo. */
import { RANKS } from '../config.js';
import { sysOf, sysPrep } from '../systems.js';
import { ally, fetchMessages, markRead, sendMessage } from '../sync/alliance.js';
import { cloud } from '../sync/cloud.js';
import { escapeHtml, todayStr, addDays } from '../util.js';
import { uiMode } from './mode.js';
import { toast } from './toast.js';

const POLL_MS=4000;
const MSG_MAX=500;
const ERR={ too_long:`El mensaje no puede pasar de ${MSG_MAX} caracteres.`, empty:'', network:'No se pudo enviar. Inténtalo de nuevo.' };

// `allianceId`: de qué alianza son los mensajes cargados. `msgs` va en orden.
// `gen` sube al vaciar: una respuesta que llega tarde de otra alianza se tira.
// `keep`: dónde estaba el desplazamiento antes de repintar la vista entera.
const chat={ keep:null, allianceId:null, msgs:[], more:false, loaded:false, error:false, draft:'', sending:false, busy:false, timer:null, readSent:0, gen:0 };
let onGone=()=>{}, onRoster=()=>{};   // los pone alliance-view: te han sacado / ha cambiado quién está

export function resetChat(){
  clearInterval(chat.timer);
  Object.assign(chat,{allianceId:null,msgs:[],more:false,loaded:false,error:false,draft:'',sending:false,busy:false,timer:null,readSent:0,gen:chat.gen+1});
}
const lastId=()=>chat.msgs.length?chat.msgs[chat.msgs.length-1].id:0;
const watching=()=>uiMode==='alliance'&&!document.hidden&&!!document.getElementById('chatList');

/* ---------- pintar ---------- */
export function chatPanel(){
  return `<section class="panel p-4 sm:p-5">
      <div class="sys-label">Chat</div>
      <div id="chatList" role="log" aria-label="Mensajes de la alianza" tabindex="0" class="mt-3 h-[46vh] min-h-[220px] overflow-y-auto overscroll-contain rounded-lg border border-[#1f2a3d] bg-[#0b1322] px-3 py-3"></div>
      <form id="chatForm" class="flex items-end gap-2 mt-3">
        <textarea id="chatInput" rows="1" maxlength="${MSG_MAX}" placeholder="Escribe un mensaje de ánimo…" aria-label="Mensaje" enterkeyhint="send" class="min-w-0 flex-1 min-h-[44px] max-h-32 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm resize-none"></textarea>
        <button type="submit" class="btn-primary h-11 px-3.5 rounded-lg text-sm font-medium shrink-0">Enviar</button>
      </form>
    </section>`;
}

const hhmm=(t)=>new Date(t).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
function dayLabel(t){
  const d=todayStr(new Date(t)), hoy=todayStr();
  if(d===hoy) return 'Hoy';
  if(d===addDays(hoy,-1)) return 'Ayer';
  return new Date(t).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'});
}
const NOTICE={ join:'se ha unido a la alianza', leave:'ha salido de la alianza', kick:'ya no está en la alianza' };
function msgHtml(m,prev){
  const me=cloud.user&&m.userId===cloud.user.id, name=escapeHtml(m.name||'Alguien');
  const day=!prev||todayStr(new Date(prev.createdAt))!==todayStr(new Date(m.createdAt))
    ? `<div class="text-center mono text-[10px] tracking-widest uppercase text-slate-500 my-3">${dayLabel(m.createdAt)}</div>`:'';
  // Los hitos del juego destacan; quién entra y sale, no.
  if(m.kind==='rank'||m.kind==='mission'){
    const txt=m.kind==='rank'?`★ ${name} asciende a ${escapeHtml(RANKS[+m.body]?.[0]||'un nuevo rango')}`:`◆ ${name} ha completado una misión de ${escapeHtml(m.body)}`;
    return `${day}<div data-mid="${m.id}" class="flex justify-center my-3"><div class="max-w-[90%] text-center text-[13px] px-3 py-1.5 rounded-lg border border-amber-800 bg-amber-950/40 text-amber-200 break-words">${txt}</div></div>`;
  }
  // Los viajes: la propuesta y la salida destacan; lo demás es un aviso.
  const sys=(p)=>escapeHtml(sysPrep(sysOf(m.body),p));
  const TRIP={ trip_propose:`✈ ${name} propone viajar ${sys('a')}`, trip_sail:`✈ La alianza zarpa ${sys('a')}` };
  if(TRIP[m.kind])
    return `${day}<div data-mid="${m.id}" class="flex justify-center my-3"><div class="max-w-[90%] text-center text-[13px] px-3 py-1.5 rounded-lg border border-violet-800 bg-violet-950/40 text-violet-200 break-words">${TRIP[m.kind]}</div></div>`;
  const TRIP_NOTE={ trip_withdraw:`${name} retira la propuesta de viajar ${sys('a')}`, trip_cancel:`Votación cerrada: la alianza no viaja ${sys('a')}`, trip_stay:`${name} se queda ${sys('en')} y sale de la alianza` };
  if(TRIP_NOTE[m.kind]) return `${day}<div data-mid="${m.id}" class="text-center mono text-[11px] text-slate-400 my-2">${TRIP_NOTE[m.kind]}</div>`;
  if(m.kind!=='text')
    return `${day}<div data-mid="${m.id}" class="text-center mono text-[11px] text-slate-400 my-2">${name} ${NOTICE[m.kind]||''}</div>`;
  // Seguidos de la misma persona: el nombre solo va en el primero.
  const follow=!day&&prev&&prev.kind==='text'&&prev.userId===m.userId;
  return `${day}<div data-mid="${m.id}" class="flex ${me?'justify-end':'justify-start'} ${follow?'mt-1':'mt-3'}">
      <div class="max-w-[85%] min-w-0">
        ${!me&&!follow?`<div class="mono text-[11px] text-cyan-300 mb-1 px-1">${name}</div>`:''}
        <div class="rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${me?'bg-cyan-900/60 border border-cyan-800 text-slate-50':'bg-slate-800 border border-slate-700 text-slate-100'}">${escapeHtml(m.body)}<span class="mono text-[10px] text-slate-400 ml-2 align-baseline whitespace-nowrap">${hhmm(m.createdAt)}</span></div>
      </div>
    </div>`;
}
function listHtml(){
  if(!chat.loaded) return `<p class="text-sm text-slate-400 text-center mt-6">${chat.error?'No se pudo cargar el chat. Se reintenta solo.':'Cargando mensajes…'}</p>`;
  const older=chat.more?`<div class="text-center mb-2"><button type="button" id="chatOlder" class="mono text-[11px] px-3 h-9 rounded-md border border-slate-700 text-slate-300 hover:border-cyan-600">Ver mensajes anteriores</button></div>`:'';
  if(!chat.msgs.length) return `<p class="text-sm text-slate-400 text-center mt-6">Aún no hay mensajes. Rompe el hielo.</p>`;
  return older+chat.msgs.map((m,i)=>msgHtml(m,chat.msgs[i-1])).join('');
}
const atBottom=(el)=>el.scrollHeight-el.scrollTop-el.clientHeight<60;
const toBottom=(el)=>{ el.scrollTop=el.scrollHeight; };
function grow(inp){ inp.style.height='auto'; inp.style.height=Math.min(inp.scrollHeight,128)+'px'; }

// Antes de repintar la vista entera: si estabas leyendo arriba, ahí te quedas.
export function keepChatScroll(){
  const el=document.getElementById('chatList');
  chat.keep=el&&chat.loaded?{stick:atBottom(el),fromEnd:el.scrollHeight-el.scrollTop}:null;
}
// Tras repintar la vista: la lista entera, el borrador y abajo del todo.
export function mountChat(){
  const el=document.getElementById('chatList'); if(!el) return;
  el.innerHTML=listHtml();
  if(chat.keep&&!chat.keep.stick) el.scrollTop=el.scrollHeight-chat.keep.fromEnd; else toBottom(el);
  chat.keep=null;
  const inp=document.getElementById('chatInput'); inp.value=chat.draft; grow(inp);
  seen();
}

/* ---------- datos ---------- */
// Lo nuevo se suma por id: el mensaje que acabas de enviar puede llegar también en la consulta.
function add(list){
  const have=new Set(chat.msgs.map(m=>m.id)), fresh=list.filter(m=>!have.has(m.id));
  if(!fresh.length) return [];
  chat.msgs=chat.msgs.concat(fresh).sort((a,b)=>a.id-b.id);
  return fresh;
}
function gone(res){ if(res.error==='no_alliance'){ onGone(); return true; } return false; }

// Marca leído hasta lo último que hay en pantalla, si lo estás mirando.
function seen(){
  const id=lastId(), a=ally.data&&ally.data.alliance;
  if(!a||!chat.loaded||!watching()) return;
  a.unread=0;
  if(id>chat.readSent&&id>(a.lastRead||0)){ chat.readSent=id; a.lastRead=id; markRead(id); }
}

async function loadFirst(){
  if(chat.busy) return;
  chat.busy=true; const gen=chat.gen;
  const res=await fetchMessages();
  if(gen!==chat.gen) return;
  chat.busy=false;
  if(gone(res)) return;
  chat.error=!!res.error;
  if(!res.error){ chat.loaded=true; chat.msgs=res.messages; chat.more=!!res.more; }
  mountChat();
}
async function poll(){
  if(!watching()||chat.busy) return;
  if(!chat.loaded) return loadFirst();
  chat.busy=true; const gen=chat.gen;
  const res=await fetchMessages('?after='+lastId());
  if(gen!==chat.gen) return;
  chat.busy=false;
  if(gone(res)||res.error) return;
  append(add(res.messages));
}
function append(fresh){
  if(!fresh.length) return;
  const el=document.getElementById('chatList'); if(!el) return;
  const stick=atBottom(el)||fresh.some(m=>cloud.user&&m.userId===cloud.user.id&&m.kind==='text');
  const top=el.scrollTop;
  el.innerHTML=listHtml();
  if(stick) toBottom(el); else el.scrollTop=top;
  if(stick) seen();
  if(fresh.some(m=>NOTICE[m.kind]||m.kind.startsWith('trip_'))) onRoster();   // quién está, o cómo va un viaje
}
async function loadOlder(){
  if(chat.busy||!chat.msgs.length) return;
  chat.busy=true; const gen=chat.gen;
  const res=await fetchMessages('?before='+chat.msgs[0].id);
  if(gen!==chat.gen) return;
  chat.busy=false;
  if(gone(res)) return;
  if(res.error){ toast('No se pudieron cargar. Inténtalo de nuevo.'); return; }
  chat.more=!!res.more; add(res.messages);
  // Lo que estabas leyendo se queda donde estaba: se compensa lo que ha crecido por arriba.
  const el=document.getElementById('chatList'); if(!el) return;
  const fromEnd=el.scrollHeight-el.scrollTop;
  el.innerHTML=listHtml(); el.scrollTop=el.scrollHeight-fromEnd;
}
async function send(){
  const inp=document.getElementById('chatInput'), body=inp.value.trim();
  if(!body||chat.sending) return;
  chat.sending=true; const gen=chat.gen;
  const res=await sendMessage(body);
  if(gen!==chat.gen) return;
  chat.sending=false;
  if(gone(res)) return;
  if(res.error){ toast(ERR[res.error]??ERR.network); return; }
  // Solo se vacía si sigue ahí lo enviado: puede que ya estés escribiendo el siguiente.
  const now=document.getElementById('chatInput');
  if(now&&now.value.trim()===body){ now.value=''; chat.draft=''; grow(now); }
  append(add([res.message]));
}

// Lo llama alliance-view al pintar: arranca, sigue o para según haya alianza a la vista.
export function syncChat(){
  const a=ally.data&&ally.data.alliance;
  if(!a||!cloud.user){ if(chat.allianceId) resetChat(); return; }
  if(chat.allianceId!==a.id){ resetChat(); chat.allianceId=a.id; }
  if(!document.getElementById('chatList')) return;
  mountChat();
  if(!chat.loaded) loadFirst(); else poll();
  if(!chat.timer) chat.timer=setInterval(poll,POLL_MS);
}

/* ---------- wiring: lo llama alliance-view en su init() ---------- */
export function initChat(body,hooks){
  onGone=hooks.onGone; onRoster=hooks.onRoster;
  body.addEventListener('submit',e=>{ if(e.target.id==='chatForm'){ e.preventDefault(); send(); } });
  body.addEventListener('input',e=>{ if(e.target.id==='chatInput'){ chat.draft=e.target.value; grow(e.target); } });
  // Intro envía donde hay teclado físico; en el móvil es salto de línea y se envía con el botón.
  body.addEventListener('keydown',e=>{
    if(e.target.id==='chatInput'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(pointer:fine)').matches){ e.preventDefault(); send(); }
  });
  body.addEventListener('click',e=>{ if(e.target.id==='chatOlder') loadOlder(); });
  // Al llegar abajo del todo, lo que quedaba por ver ya está visto.
  body.addEventListener('scroll',e=>{ if(e.target.id==='chatList'&&atBottom(e.target)) seen(); },true);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) poll(); });
}

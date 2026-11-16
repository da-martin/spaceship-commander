/* Vista Alliance: tu alianza, su chat, sus miembros y las invitaciones.
 * No cuelga de render(): se pinta sola cuando cambia lo suyo, para no borrar
 * lo que se está escribiendo en el buscador cada vez que el juego repinta. */
import { ally, allyAct, loadAlly, searchPlayers } from '../sync/alliance.js';
import { openAuthModal } from '../sync/auth.js';
import { cloud } from '../sync/cloud.js';
import { onShareShown, shareSync } from '../features/alliance-share.js';
import { escapeHtml, plural, todayStr } from '../util.js';
import { chatPanel, initChat, keepChatScroll, syncChat } from './alliance-chat.js';
import { uiMode } from './mode.js';
import { toast } from './toast.js';

const ERR={
  bad_name:'El nombre debe tener entre 3 y 30 caracteres.',
  already_in_alliance:'Ese jugador ya está en una alianza.',
  full:'La alianza está completa.',
  too_many_invites:'Hay demasiadas invitaciones pendientes. Retira alguna.',
  no_invite:'Esa invitación ya no existe.',
  no_user:'Ese jugador ya no existe.',
  not_founder:'Solo el fundador puede hacer eso.',
  not_member:'Ese jugador ya no está en la alianza.',
  no_alliance:'Ya no estás en esa alianza.',
  throttled:'Demasiados intentos. Espera unos minutos.',
  network:'No se pudo conectar. Inténtalo de nuevo.',
};

// Lo que solo vive mientras miras la vista: la confirmación pendiente
// ('leave' | 'disband' | 'kick:<id>'), el buscador y sus resultados.
// `known`: ya se sabe si hay sesión (al arrancar aún no).
const ui={ known:false, confirm:null, busy:false, q:'', results:null, searchErr:null, searchTimer:null, searchSeq:0 };
const BG_POLL_MS=30000;
const resetSearch=()=>{ clearTimeout(ui.searchTimer); ui.q=''; ui.results=null; ui.searchErr=null; ui.searchSeq++; };

const btn='px-3 h-11 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-200 hover:border-cyan-600';
const btnDanger='px-3 h-11 rounded-lg text-sm bg-slate-800 border border-red-900 text-red-300 hover:border-red-600';
const row='flex flex-wrap items-center gap-2 min-h-[52px] px-3 py-2 rounded-lg border border-[#1f2a3d] bg-[#0d1526]';
const tag=(txt,cls)=>`<span class="mono text-[10px] px-1.5 py-0.5 rounded border ${cls}">${txt}</span>`;
const note=(txt)=>`<section class="panel corner p-5"><div class="sys-label">Alianza</div><p class="text-slate-300 text-sm mt-2">${txt}</p></section>`;
// Dos pasos para lo que no tiene vuelta atrás, como al quitar un calendario.
const confirmBtns=(key,label,ask)=>ui.confirm===key
  ? `<span class="flex flex-wrap items-center justify-end gap-2 ml-auto"><span class="text-sm text-red-300">${ask}</span><span class="flex gap-2 shrink-0"><button type="button" data-ally="yes" class="${btnDanger}">Sí</button><button type="button" data-ally="no" class="${btn}">No</button></span></span>`
  : `<button type="button" data-ally="ask" data-key="${key}" class="${btnDanger}">${label}</button>`;

// El punto avisa de invitaciones o de mensajes sin leer. Dentro de la vista
// sobra: lo estás viendo.
function paintDots(){
  const d=ally.data, n=!d?0:d.alliance?(uiMode==='alliance'?0:d.alliance.unread):d.invites.length;
  document.querySelectorAll('[data-allydot]').forEach(e=>e.classList.toggle('hidden',!n));
}

export function renderAlliance(){
  paintDots();
  if(uiMode!=='alliance'){ syncChat(); return; }   // sin vista solo se entera de si sigue habiendo alianza
  // Repintar no debe sacarte del campo en el que estás escribiendo.
  const focus=document.activeElement&&['chatInput','allySearch'].includes(document.activeElement.id)?document.activeElement.id:null;
  keepChatScroll();
  paintBody();
  syncChat();   // monta el chat si hay alianza a la vista; si no, lo para
  paintDots();  // el chat acaba de marcar como leído lo que se ve
  const f=focus&&document.getElementById(focus);
  if(f){ f.focus(); f.setSelectionRange(f.value.length,f.value.length); }
}
function paintBody(){
  const body=document.getElementById('allianceBody');
  if(!cloud.user&&!ui.known){ body.innerHTML=note('Cargando…'); return; }
  if(!cloud.user){
    body.innerHTML=cloud.online
      ? `<section class="panel corner p-5">
          <div class="sys-label">Alianza</div>
          <h2 class="text-2xl font-bold mt-1.5">Vuela acompañado</h2>
          <p class="text-slate-300 text-sm mt-2">Una alianza es un grupo de hasta 5 comandantes que se dan apoyo. Tu juego sigue siendo tuyo: nadie ve tus tareas ni tus hábitos.</p>
          <p class="text-slate-400 text-sm mt-2">Para crear una alianza o unirte a una necesitas una cuenta.</p>
          <button type="button" data-ally="login" class="btn-primary h-11 px-4 rounded-lg text-sm font-medium mt-4">Entrar o crear cuenta</button>
        </section>`
      : note('Las alianzas necesitan conexión con el servidor. El resto del juego sigue funcionando igual.');
    return;
  }
  if(ally.status==='error'){
    body.innerHTML=`<section class="panel corner p-5"><div class="sys-label">Alianza</div><p class="text-slate-300 text-sm mt-2">No se pudo conectar. El resto del juego sigue funcionando igual.</p><button type="button" data-ally="retry" class="${btn} mt-4">Reintentar</button></section>`;
    return;
  }
  if(ally.status!=='ready'){ body.innerHTML=note('Cargando…'); return; }
  body.innerHTML=ally.data.alliance?alliancePanel(ally.data.alliance):lobby(ally.data.invites);
  const q=document.getElementById('allySearch');
  if(q){ q.value=ui.q; paintResults(); }
}

function lobby(invites){
  const inv=invites.length?`<section class="panel p-4 sm:p-5">
      <div class="sys-label">Invitaciones</div>
      <ul class="mt-3 space-y-2">${invites.map(i=>`<li class="${row}">
        <span class="min-w-0 flex-1 basis-40"><span class="block text-sm text-slate-100 break-words">${escapeHtml(i.name)}</span><span class="mono text-[11px] text-slate-400">te invita ${escapeHtml(i.invitedBy)} · ${plural(i.members,'miembro','miembros')}</span></span>
        <button type="button" data-ally="accept" data-id="${i.allianceId}" class="btn-primary h-11 px-3.5 rounded-lg text-sm font-medium">Unirme</button>
        <button type="button" data-ally="decline" data-id="${i.allianceId}" class="${btn}">Rechazar</button>
      </li>`).join('')}</ul>
    </section>`:'';
  return `<section class="panel corner p-5">
      <div class="sys-label">Alianza</div>
      <h2 class="text-2xl font-bold mt-1.5">Vuela acompañado</h2>
      <p class="text-slate-300 text-sm mt-2">Una alianza es un grupo de hasta 5 comandantes que se dan apoyo. Tu juego sigue siendo tuyo: nadie ve tus tareas ni tus hábitos.</p>
    </section>
    ${inv}
    <section class="panel p-4 sm:p-5">
      <div class="sys-label">Fundar una alianza</div>
      <form id="allyCreate" class="flex gap-2 mt-3">
        <input id="allyName" type="text" maxlength="30" placeholder="Nombre de la alianza" autocomplete="off" class="min-w-0 flex-1 h-11 px-3 rounded-lg bg-slate-900 border border-slate-700 text-sm">
        <button type="submit" class="btn-primary h-11 px-3.5 rounded-lg text-sm font-medium shrink-0">Fundar</button>
      </form>
      <p class="text-slate-400 text-xs mt-2">Serás el fundador y podrás invitar a otros comandantes por su nombre.</p>
    </section>`;
}

function alliancePanel(a){
  const me=cloud.user.id, founder=a.founderId===me, full=a.members.length>=a.max;
  const members=a.members.map(m=>`<li class="${row}">
      <span class="min-w-0 flex-1 basis-24 flex flex-wrap items-center gap-2"><span class="text-sm text-slate-100 break-words">${escapeHtml(m.name)}</span>${m.id===a.founderId?tag('FUNDADOR','border-amber-700 text-amber-300'):''}${m.id===me?tag('TÚ','border-cyan-800 text-cyan-300'):''}</span>
      <span data-prog="${m.id}" class="shrink-0">${progHtml(m)}</span>
      ${founder&&m.id!==me?confirmBtns('kick:'+m.id,'Expulsar','¿Expulsar?'):''}
    </li>`).join('');
  const pending=a.invites.length?`<div class="sys-label mt-5">Invitaciones pendientes</div>
    <ul class="mt-3 space-y-2">${a.invites.map(i=>`<li class="${row}">
      <span class="min-w-0 flex-1 basis-40"><span class="block text-sm text-slate-100 break-words">${escapeHtml(i.name)}</span><span class="mono text-[11px] text-slate-400">invitación de ${escapeHtml(i.invitedBy)}</span></span>
      <button type="button" data-ally="cancel" data-id="${i.userId}" class="${btn}">Retirar</button>
    </li>`).join('')}</ul>`:'';
  const invite=full
    ? `<p class="text-slate-400 text-sm mt-3">La alianza está completa.</p>`
    : `<input id="allySearch" type="search" maxlength="24" placeholder="Nombre del comandante (mínimo 3 letras)" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Buscar comandantes por nombre" class="w-full h-11 px-3 mt-3 rounded-lg bg-slate-900 border border-slate-700 text-sm">
       <div id="allyResults" class="mt-2" aria-live="polite"></div>`;
  return `<section class="panel corner p-4 sm:p-5">
      <div class="sys-label">Alianza</div>
      <div class="flex flex-wrap items-end gap-x-3 gap-y-1 mt-1.5">
        <h2 class="text-2xl sm:text-3xl font-bold leading-none break-words min-w-0">${escapeHtml(a.name)}</h2>
        <span class="mono text-sm text-slate-400">${plural(a.members.length,'miembro','miembros')} de ${a.max}</span>
      </div>
    </section>
    ${chatPanel()}
    <section class="panel p-4 sm:p-5">
      <div class="sys-label">Miembros</div>
      <ul class="mt-3 space-y-2">${members}</ul>
      ${pending}
    </section>
    <section class="panel p-4 sm:p-5">
      <div class="sys-label">Invitar</div>
      ${invite}
    </section>
    <section class="flex flex-wrap items-center justify-end gap-2">
      ${confirmBtns('leave','Salir de la alianza',a.members.length===1?'Eres el último: la alianza desaparecerá. ¿Salir?':founder?'El cargo de fundador pasará al más antiguo. ¿Salir?':'¿Salir de la alianza?')}
      ${founder&&a.members.length>1?confirmBtns('disband','Disolver','Se disolverá para todos. ¿Seguro?'):''}
    </section>`;
}

// El día de cada uno: solo el porcentaje. Si lo publicado no es de hoy, aún no ha abierto el juego.
function progHtml(m){
  const p=m.progress;
  if(!p) return '';
  const dim=(t)=>`<span class="mono text-[11px] text-slate-500">${t}</span>`;
  if(p.day!==todayStr()) return dim('sin actividad hoy');
  if(p.pct===null) return dim('día libre');
  const full=p.pct>=100;
  return `<span class="flex items-center gap-2" title="Progreso de hoy"><span class="block w-16 sm:w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true"><span class="block h-full rounded-full ${full?'bg-emerald-400':'bg-cyan-500'}" style="width:${p.pct}%"></span></span><span class="mono text-xs tabular-nums w-10 text-right ${full?'text-emerald-300':'text-slate-300'}">${p.pct}%</span><span class="sr-only">de su día</span></span>`;
}
// Cambia a menudo: se pinta en su sitio, sin repintar la vista.
function paintProgress(){
  const a=ally.data&&ally.data.alliance; if(!a) return;
  for(const m of a.members){ const el=document.querySelector(`[data-prog="${m.id}"]`); if(el) el.innerHTML=progHtml(m); }
}

const STATUS={member:'Ya está en tu alianza',invited:'Invitado',taken:'En otra alianza'};
function paintResults(){
  const box=document.getElementById('allyResults'); if(!box) return;
  if(ui.searchErr){ box.innerHTML=`<p class="text-sm text-red-300">${ERR[ui.searchErr]||ERR.network}</p>`; return; }
  if(!ui.results){ box.innerHTML=''; return; }
  if(!ui.results.length){ box.innerHTML=`<p class="text-sm text-slate-400">Ningún comandante empieza por «${escapeHtml(ui.q.trim())}».</p>`; return; }
  box.innerHTML=`<ul class="space-y-2">${ui.results.map(u=>`<li class="${row}">
      <span class="min-w-0 flex-1 basis-40 text-sm text-slate-100 break-words">${escapeHtml(u.name)}</span>
      ${u.status==='free'
        ? `<button type="button" data-ally="invite" data-id="${u.id}" class="btn-primary h-11 px-3.5 rounded-lg text-sm font-medium">Invitar</button>`
        : `<span class="mono text-[11px] text-slate-400">${STATUS[u.status]||''}</span>`}
    </li>`).join('')}</ul>`;
}

function onSearchInput(v){
  ui.q=v; ui.searchErr=null; clearTimeout(ui.searchTimer);
  const q=v.trim(), seq=++ui.searchSeq;
  if(q.length<3){ ui.results=null; paintResults(); return; }
  ui.searchTimer=setTimeout(()=>runSearch(q,seq),300);
}
async function runSearch(q,seq){
  const res=await searchPlayers(q);
  if(seq!==ui.searchSeq) return;       // ya se ha escrito otra cosa
  ui.results=res.results||null; ui.searchErr=res.error||null;
  paintResults();
}

async function act(path,body,done){
  if(ui.busy) return;
  ui.busy=true;
  const res=await allyAct(path,body);
  ui.busy=false; ui.confirm=null;
  if(!res.ok){
    toast(ERR[res.error]||ERR.network);
    // Lo que se ve ya no es verdad (otro se adelantó): se vuelve a pedir.
    if(res.error!=='network'&&res.error!=='throttled') await loadAlly();
  } else if(done) toast(done);
  renderAlliance();
  return res.ok;
}

// Entrar en la vista, volver a la app o cambiar de cuenta: se pide la foto y
// se repinta solo si cambió, para no pisar el buscador.
export async function refreshAlliance(){
  if(!ui.known) return;
  if(!cloud.user){ ui.confirm=null; resetSearch(); renderAlliance(); return; }
  const pending=loadAlly();
  if(ally.status==='loading') renderAlliance();
  const changed=await pending;
  paintDots(); paintProgress();   // sin leer y progreso: cambian sin que cambie nada más
  shareSync();                    // y lo tuyo: hitos en cola y tu porcentaje, si no están al día
  if(changed){
    renderAlliance();
    // Los resultados dicen quién está invitado o dentro: con la foto nueva ya no valen.
    const q=ui.q.trim(); if(q.length>=3&&document.getElementById('allySearch')) runSearch(q,++ui.searchSeq);
  }
}

// Al entrar en la vista: primero lo que ya se sabe, y de fondo lo que haya cambiado.
export function enterAlliance(){ renderAlliance(); return refreshAlliance(); }
// main.js lo llama cuando initCloud() ha terminado de preguntar quién eres.
export function allianceBoot(){ ui.known=true; return refreshAlliance(); }

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  const body=document.getElementById('allianceBody');
  // La foto de la alianza se mira de vez en cuando: fuera de la vista, para el
  // punto de aviso; dentro, para el progreso de cada uno. El chat va aparte.
  setInterval(()=>{ if(cloud.user&&!document.hidden) refreshAlliance(); },BG_POLL_MS);
  onShareShown(paintProgress);
  initChat(body,{
    onGone:()=>{ toast('Ya no estás en esa alianza'); refreshAlliance(); },   // expulsado o disuelta
    onRoster:refreshAlliance,                                                // alguien ha entrado o salido
  });
  body.addEventListener('click',async e=>{
    const b=e.target.closest('[data-ally]'); if(!b) return;
    const a=b.dataset.ally, id=b.dataset.id;
    if(a==='login') return openAuthModal('login');
    if(a==='retry'){ ally.data=null; return refreshAlliance(); }
    if(a==='ask'){ ui.confirm=b.dataset.key; return renderAlliance(); }
    if(a==='no'){ ui.confirm=null; return renderAlliance(); }
    if(a==='yes'){
      const k=ui.confirm||'';
      if(k==='leave'){ if(await act('/leave',null,'Has salido de la alianza')) resetSearch(); }
      else if(k==='disband'){ if(await act('/disband',null,'Alianza disuelta')) resetSearch(); }
      else if(k.startsWith('kick:')) await act('/kick',{userId:k.slice(5)},'Expulsado de la alianza');
      return;
    }
    if(a==='accept') return act('/accept',{allianceId:id},'Te has unido a la alianza ✓');
    if(a==='decline') return act('/decline',{allianceId:id},'Invitación rechazada');
    if(a==='cancel'){
      if(await act('/invite/cancel',{userId:id},'Invitación retirada')&&ui.results){
        const u=ui.results.find(x=>x.id===id); if(u&&u.status==='invited'){ u.status='free'; paintResults(); }
      }
      return;
    }
    if(a==='invite'){
      // El resultado se marca antes de repintar: el buscador conserva lo escrito.
      const u=ui.results&&ui.results.find(x=>x.id===id);
      if(await act('/invite',{userId:id},'Invitación enviada ✓')&&u){ u.status='invited'; paintResults(); }
    }
  });
  body.addEventListener('input',e=>{ if(e.target.id==='allySearch') onSearchInput(e.target.value); });
  body.addEventListener('submit',async e=>{
    if(e.target.id!=='allyCreate') return;
    e.preventDefault();
    const name=document.getElementById('allyName').value.trim();
    if(name.length<3){ toast(ERR.bad_name); return; }
    await act('',{name},'Alianza fundada ✓');
  });
}

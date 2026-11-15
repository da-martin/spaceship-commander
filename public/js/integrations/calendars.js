/* Calendarios iCal: el Worker guarda las URL y reenvía cada .ics; aquí se
 * parsea y se pinta. */
import { parseIcs } from '../lib/ics.js';
import { openAuthModal } from '../sync/auth.js';
import { api, cloud } from '../sync/cloud.js';
import { render } from '../ui/commander.js';
import { closeSettings } from '../ui/settings.js';
import { toast } from '../ui/toast.js';
import { view } from '../ui/view.js';
import { addDays, escapeHtml, mondayOf, todayStr } from '../util.js';

// Eventos de los calendarios iCal, ya parseados: {at, user, calendars:[{id, name, events, error, okAt}]}.
// Es caché de este dispositivo, no partida: se borra al cerrar sesión.
export const ICALKEY='spaceship-commander:ical';
export const ICAL_EMPTY={at:0,user:null,calendars:[]};
export let ical=(()=>{ try{ return JSON.parse(localStorage.getItem(ICALKEY))||ICAL_EMPTY; }catch{ return ICAL_EMPTY; } })();
export const saveIcal=()=>{ try{ localStorage.setItem(ICALKEY,JSON.stringify(ical)); }catch{} };
export const resetIcal=()=>{ ical=ICAL_EMPTY; try{ localStorage.removeItem(ICALKEY); }catch{} };
/* ---------- calendarios iCal ---------- */
/* El servidor guarda las URL y reenvía cada .ics sin parsearlo; aquí se parsea,
   se convierte a la zona de este dispositivo y se guarda en ICALKEY. */
export const CAL_STALE=36e5;   // una hora
export const CAL_ERR={bad_url:'Pega una dirección que empiece por https:// o webcal://.',
  not_ical:'Esa dirección no es un calendario iCal. En Google usa la «Dirección secreta en formato iCal», no la que sale en el navegador.',
  upstream:'No se pudo descargar el calendario. Revisa la dirección.',too_large:'El calendario pesa más de 2 MB.',
  too_many:'Ya tienes 10 calendarios conectados.',duplicate:'Ese calendario ya está conectado.',throttled:'Demasiados intentos. Prueba dentro de un rato.'};
// Sin `force`, solo descarga si la caché es de otra cuenta o tiene más de una hora.
export async function loadCalEvents(force=false){
  if(!cloud.user||view.calBusy) return;
  const mine=ical.user===cloud.user.id;
  if(!force&&mine&&Date.now()-ical.at<CAL_STALE) return;
  view.calBusy=true;
  try{
    const r=await api('/api/calendars'); if(!r.ok) return;
    const {calendars}=await r.json();
    const prev=new Map((mine?ical.calendars:[]).map(c=>[c.id,c]));
    const from=mondayOf(todayStr()), to=addDays(from,90);
    const got=await Promise.allSettled(calendars.map(async c=>{
      const x=await api(`/api/calendars/${encodeURIComponent(c.id)}/ics`);
      if(!x.ok) throw new Error(x.status);
      return parseIcs(await x.text(),from,to);
    }));
    // Si uno falla, conserva los eventos que tenía y lo dice en Ajustes.
    ical={at:Date.now(),user:cloud.user.id,calendars:calendars.map((c,i)=>got[i].status==='fulfilled'
      ? {id:c.id,name:c.name,events:got[i].value,error:null,okAt:Date.now()}
      : {id:c.id,name:c.name,events:prev.get(c.id)?.events||[],error:'no se pudo descargar',okAt:prev.get(c.id)?.okAt||null})};
    view.calBusy=false;   // antes de pintar: si no, una lista vacía diría «Cargando…»
    saveIcal(); render(); paintCalendars();
  }catch{ /* sin conexión: se reintenta al volver el foco */ }
  finally{ view.calBusy=false; }
}

export function paintCalendars(){
  const on=!!cloud.user;
  document.getElementById('calSignedOut').classList.toggle('hidden',on);
  document.getElementById('calLogin').classList.toggle('hidden',!cloud.online);
  document.getElementById('calBox').classList.toggle('hidden',!on);
  const list=document.getElementById('calList'), cals=on&&ical.user===cloud.user.id?ical.calendars:[];
  if(!cals.length){ list.innerHTML=`<div class="text-xs text-slate-400 border border-dashed border-slate-700 rounded-lg p-3 text-center">${view.calBusy?'Cargando calendarios…':'Ningún calendario conectado todavía.'}</div>`; return; }
  list.innerHTML=cals.map(c=>{
    const meta=c.error
      ? `<span class="text-red-300">${c.error}${c.okAt?` · se muestran los de ${new Date(c.okAt).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}`:''}</span>`
      : `${c.events.length} ${c.events.length===1?'evento':'eventos'} en 13 semanas`;
    const btns=view.calRemoving===c.id
      ? `<button type="button" data-cr="ok" data-id="${c.id}" class="shrink-0 px-3 h-11 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-200 hover:border-red-600">Quitar</button>
         <button type="button" data-cr="no" class="shrink-0 px-2.5 h-11 rounded-lg text-xs text-slate-300 hover:text-white">Cancelar</button>`
      : `<button type="button" data-cr="del" data-id="${c.id}" aria-label="Quitar ${escapeHtml(c.name)}" class="shrink-0 w-11 h-11 grid place-items-center rounded-lg text-slate-400 hover:text-red-300">✕</button>`;
    return `<div class="flex items-center gap-1 rounded-lg border ${view.calRemoving===c.id?'border-red-900':'border-[#1f2a3d]'} bg-[#0f1729] pl-3 pr-1">
      <div class="min-w-0 flex-1 py-2">
        <div class="text-sm truncate">${escapeHtml(c.name)}</div>
        <div class="mono text-[11px] text-slate-400 mt-0.5">${meta}</div>
      </div>${btns}</div>`;
  }).join('');
  // Quitar pide dos toques, como despedir tripulación o descartar ofertas.
  list.querySelectorAll('[data-cr]').forEach(b=>b.onclick=async()=>{
    const a=b.dataset.cr;
    if(a==='del'){ view.calRemoving=b.dataset.id; paintCalendars(); return; }
    if(a==='no'){ view.calRemoving=null; paintCalendars(); return; }
    b.disabled=true;
    try{
      const r=await api(`/api/calendars/${encodeURIComponent(b.dataset.id)}`,{method:'DELETE'});
      if(!r.ok&&r.status!==404) throw new Error(r.status);
      view.calRemoving=null; toast('Calendario quitado'); await loadCalEvents(true);
    }catch{ b.disabled=false; showCalMsg('No se pudo quitar. Prueba otra vez.'); }
  });
}
export function showCalMsg(t){ const m=document.getElementById('calMsg'); m.textContent=t||''; m.classList.toggle('hidden',!t); }

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('calForm').onsubmit=async(e)=>{
    e.preventDefault();
    const inp=document.getElementById('calUrl'), btn=document.getElementById('calAdd'), url=inp.value.trim();
    if(!url) return;
    showCalMsg(''); btn.disabled=true; btn.textContent='Añadiendo…';
    try{
      const r=await api('/api/calendars',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok){ showCalMsg(CAL_ERR[b.error]||'No se pudo añadir el calendario.'); return; }
      inp.value=''; toast(`«${b.calendar.name}» conectado`); await loadCalEvents(true);
    }catch{ showCalMsg('Sin conexión. Prueba otra vez.'); }
    finally{ btn.disabled=false; btn.textContent='+ Añadir'; }
  };
  document.getElementById('calLogin').onclick=()=>{ closeSettings(); openAuthModal('login'); };
}

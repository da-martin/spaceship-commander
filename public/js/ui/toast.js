/* Avisos breves en la parte inferior de la pantalla. */

// Dos niveles, porque un ascenso de rango no puede verse igual que «Proyecto
// eliminado». El nivel 'win' se queda más tiempo y se pinta en ámbar; si justo
// detrás llega un aviso normal —el «+10 ¢» de la misma acción—, se le suma en
// vez de pisarlo.
export const TOAST_BASE='fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg text-sm text-center max-w-[calc(100vw-32px)] border ';
// `onTap` (opcional) hace el aviso pulsable: lleva a donde habla el mensaje
// —p. ej. a la bitácora— y se queda un poco más para dar tiempo a tocarlo.
export function toast(msg,level,onTap){
  if(!msg) return;
  const el=document.getElementById('toast'), win=level==='win';
  if(!win && el._win && !el.classList.contains('hidden')){ el.textContent+=' · '+msg; return; }
  el.textContent=msg; el._win=win;
  el.className=TOAST_BASE+(win?'bg-amber-950 border-amber-600 text-amber-100 font-semibold':'bg-slate-900 border-slate-700')
    +(onTap?' cursor-pointer hover:border-cyan-600':'');
  el.onclick=onTap?()=>{ clearTimeout(el._t); el.classList.add('hidden'); onTap(); }:null;
  clearTimeout(el._t);
  const ms=win?4000:(msg.length>40?3500:1800);
  el._t=setTimeout(()=>el.classList.add('hidden'),onTap?Math.max(ms,5000):ms);
}

/* Avisos breves en la parte inferior de la pantalla. */

// Dos niveles, porque un ascenso de rango no puede verse igual que «Proyecto
// eliminado». El nivel 'win' se queda más tiempo y se pinta en ámbar; si justo
// detrás llega un aviso normal —el «+10 ¢» de la misma acción—, se le suma en
// vez de pisarlo.
export const TOAST_BASE='fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg text-sm text-center max-w-[calc(100vw-32px)] border ';
export function toast(msg,level){
  if(!msg) return;
  const el=document.getElementById('toast'), win=level==='win';
  if(!win && el._win && !el.classList.contains('hidden')){ el.textContent+=' · '+msg; return; }
  el.textContent=msg; el._win=win;
  el.className=TOAST_BASE+(win?'bg-amber-950 border-amber-600 text-amber-100 font-semibold':'bg-slate-900 border-slate-700');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.add('hidden'),win?4000:(msg.length>40?3500:1800));
}

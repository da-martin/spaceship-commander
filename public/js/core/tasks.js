/* Acciones sobre tareas y hábitos que se disparan desde las listas. */
import { checkHabit, gainText, grantTask, negText, tapFree, tapNeg, uncheckHabit } from './rewards.js';
import { dropFocusRef } from '../features/focus.js';
import { save, state } from '../store.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';
import { todayStr } from '../util.js';

export function toggleHabitToday(h){
  const k=todayStr(); h.log=h.log||{};
  if(h.type==='neg'){ const hit=tapNeg(h,k); save(); render(); toast(negText(hit)); return; }
  if(h.type==='free'){ const g=tapFree(h,k); save(); render(); toast(gainText(g)); return; }
  if((h.log[k]||0)>=1){ uncheckHabit(h,k); h.log[k]=0; }
  else { h.log[k]=1; const g=checkHabit(h,k); save(); render(); toast(gainText(g)); return; }
  save(); render();
}

export function completeTask(x){ x.done=true; const g=grantTask(x); save(); render(); toast(gainText(g)); return g; }
export function deleteTask(id){ state.tasks=state.tasks.filter(y=>y.id!==id); dropFocusRef(id); save(); render(); toast('Tarea eliminada'); }
export function deleteHabit(id){ state.habits=state.habits.filter(y=>y.id!==id); dropFocusRef(id); save(); render(); toast('Hábito eliminado'); }

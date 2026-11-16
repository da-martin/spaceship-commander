/* Modal de la clave de TaskHero: se abre desde Ajustes › Integración con TaskHero,
 * para importar o para conectar. Va por encima de Ajustes, que sigue abierto. */
import { paintTh, thc, thConnect } from './taskhero.js';
import { thMsg, thReset, thStartRead } from './taskhero-import.js';
import { toast } from '../ui/toast.js';

const HELP_IMPORT='Trae tus hábitos y tus tareas pendientes con su nombre, su frecuencia y su fecha. Lo demás (dificultad, lista, notas…) va a las notas de cada uno. Antes de importar ves la lista y eliges qué entra.';
const HELP_CONNECT='Con TaskHero conectado, lo que completes aquí se completa también allí si está enlazado: lo importado de allí y lo que se llame igual (lleva el icono de enlace). Lo demás envía su esfuerzo como tracker points: Micro 0,1 · Fácil 0,5 · Normal 1 · Difícil 2 · Épica 3. Sale 30 s después de marcar; si lo desmarcas antes, no se envía nada. La clave se guarda en el servidor, en tu cuenta.';

let mode=null;   // 'import' | 'connect' mientras está abierto
const $=(id)=>document.getElementById(id);

export function openThModal(m){
  mode=m;
  const imp=m==='import', linked=thc.connected;
  thReset();
  $('thmTitle').textContent=imp?'Importar de TaskHero':'Conectar TaskHero';
  $('thHelp').textContent=imp
    ? HELP_IMPORT+' '+(linked?'Usa la clave de la cuenta conectada.':'La clave solo se usa para esta lectura y no se guarda, salvo que marques «Conectar también».')
    : HELP_CONNECT;
  $('thNegWarn').classList.toggle('hidden',!imp);
  $('thKey').value='';
  $('thLinkToo').checked=false;
  $('thLinkRow').classList.toggle('hidden',!imp||linked||!thc.ready);
  // Conectado, importar no pide clave: lee directamente con la guardada.
  $('thForm').classList.toggle('hidden',imp&&linked);
  $('thRead').textContent=imp?'Leer':'Conectar';
  $('thModal').classList.remove('hidden');
  if(imp&&linked) thStartRead('');
  else $('thKey').focus();
}
export function closeThModal(){
  if(!mode) return;
  mode=null;
  $('thModal').classList.add('hidden');
  $('thKey').value='';
  thReset();
  paintTh();   // lo importado puede haber quedado enlazado
}

async function connect(key){
  const btn=$('thRead');
  btn.disabled=true; btn.textContent='Conectando…';
  const err=await thConnect(key);
  btn.disabled=false; btn.textContent='Conectar';
  if(err){ thMsg(err); return; }
  closeThModal(); toast('TaskHero conectado ✓');
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  $('thsImport').onclick=()=>openThModal('import');
  $('thsConnect').onclick=()=>openThModal('connect');
  $('thmClose').onclick=closeThModal;
  $('thModal').addEventListener('click',e=>{ if(e.target.id==='thModal') closeThModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeThModal(); });
  $('thForm').onsubmit=(e)=>{
    e.preventDefault();
    const key=$('thKey').value.trim();
    if(!key&&!(mode==='import'&&thc.connected)){ thMsg('Pega tu clave de API de TaskHero.'); $('thKey').focus(); return; }
    if(mode==='connect') connect(key); else thStartRead(key);
  };
}

/* Exportar e importar la partida (archivo o código) y deshacer la carga. */
import { dailyTick } from './review.js';
import { normState, save, setState, state } from '../store.js';
import { render } from '../ui/commander.js';
import { toast } from '../ui/toast.js';
import { plural, todayStr } from '../util.js';

/* ---------- guardar / cargar partida ---------- */
export const BACKUPKEY = 'spaceship-commander:backup', EXPKEY = 'spaceship-commander:lastExport';
export const b64enc=(bytes)=>{ let s=''; for(let i=0;i<bytes.length;i+=0x8000) s+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(s); };
export const b64dec=(str)=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
export const pipeBytes=async(bytes,stream)=>new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
export const userErr=(msg)=>Object.assign(new Error(msg),{user:true});
export function buildSave(){ return {app:'spaceship-commander',v:1,savedAt:new Date().toISOString(),data:state}; }
export async function toCode(obj){
  const bytes=new TextEncoder().encode(JSON.stringify(obj));
  if(typeof CompressionStream==='function') return 'SC1z:'+b64enc(await pipeBytes(bytes,new CompressionStream('gzip')));
  return 'SC1:'+b64enc(bytes);
}
// acepta el JSON del archivo, un código SC1z: (gzip) o SC1: (sin comprimir)
export async function parseSave(text){
  text=(text||'').trim();
  if(!text) throw userErr('Pega un código o elige un archivo.');
  let obj;
  try{
    if(text.startsWith('{')) obj=JSON.parse(text);
    else{
      const m=text.replace(/\s+/g,'').match(/^SC1(z?):(.+)$/);
      if(!m) throw userErr('Código no válido.');
      let bytes=b64dec(m[2]);
      if(m[1]){
        if(typeof DecompressionStream!=='function') throw userErr('Este navegador no puede leer códigos comprimidos.');
        bytes=await pipeBytes(bytes,new DecompressionStream('gzip'));
      }
      obj=JSON.parse(new TextDecoder().decode(bytes));
    }
  }catch(e){ throw e.user?e:userErr('Código no válido.'); }
  if(obj?.app!=='spaceship-commander'||!obj.data||!Array.isArray(obj.data.tasks)||!Array.isArray(obj.data.habits))
    throw userErr('No es una partida de Spaceship Commander.');
  return obj;
}
export function readBackup(){ try{ const b=JSON.parse(localStorage.getItem(BACKUPKEY)); return b?.data?b:null; }catch{ return null; } }
export const relDays=(ms)=>{ const d=Math.floor((Date.now()-ms)/864e5); return d<=0?'hoy':d===1?'ayer':`hace ${d} días`; };
export const fmtStamp=(ms)=>new Date(ms).toLocaleString('es-ES',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
export const summary=(st)=>`${plural(st.tasks.length,'tarea','tareas')} · ${plural(st.habits.length,'hábito','hábitos')} · ¢ ${st.wallet.mc} · nave Nv. ${Object.values(st.ship.modules).reduce((a,m)=>a+m.lv,0)}/40`;
export function markExport(){ try{ localStorage.setItem(EXPKEY,String(Date.now())); }catch{} paintSaveModal(); }

export function exportFile(){
  const blob=new Blob([JSON.stringify(buildSave(),null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`spaceship-commander-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  markExport(); toast('Archivo descargado ✓');
}
export async function copyCode(){
  const code=await toCode(buildSave()), ta=document.getElementById('exportCode');
  ta.value=code; ta.classList.remove('hidden'); markExport();
  try{ await navigator.clipboard.writeText(code); toast('Código copiado ✓'); }
  catch{ ta.focus(); ta.select(); toast('Copia el código seleccionado'); }
}

export let pendingSave=null;
export async function reviewSave(text){
  const msg=document.getElementById('importMsg'), pv=document.getElementById('importPreview');
  msg.classList.add('hidden'); pv.classList.add('hidden'); pendingSave=null;
  try{ pendingSave=await parseSave(text); }
  catch(e){ msg.textContent=e.message; msg.classList.remove('hidden'); return; }
  const at=Date.parse(pendingSave.savedAt);
  pv.innerHTML=`<div class="rounded-xl border border-cyan-700 bg-cyan-950/30 p-3">
    <div class="mono text-[11px] tracking-[.18em] text-cyan-300">PARTIDA ENCONTRADA</div>
    <div class="text-sm font-medium mt-1">Guardada ${Number.isFinite(at)?'el '+fmtStamp(at):'(fecha desconocida)'}</div>
    <div class="mono text-[11px] text-slate-300 mt-1">${summary(normState(pendingSave.data))}</div>
    <div class="text-xs text-amber-200 mt-2">Reemplazará tu partida actual (${summary(state)}). Se guarda una copia por si quieres deshacer.</div>
    <div class="flex gap-2 mt-3">
      <button data-act="cancel" class="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm">Cancelar</button>
      <button data-act="apply" class="flex-1 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold">Reemplazar mi partida</button>
    </div>
  </div>`;
  pv.classList.remove('hidden');
  pv.querySelector('[data-act="cancel"]').onclick=()=>{ pendingSave=null; pv.classList.add('hidden'); };
  pv.querySelector('[data-act="apply"]').onclick=()=>applySave(pendingSave);
}
export function applySave(sv){
  try{ localStorage.setItem(BACKUPKEY,JSON.stringify({at:Date.now(),data:state})); }catch{}
  setState(normState(sv.data)); save(); dailyTick(); render();
  closeSaveModal(); toast('Partida cargada ✓');
}
export function undoLoad(){
  const b=readBackup(); if(!b) return;
  setState(normState(b.data)); localStorage.removeItem(BACKUPKEY); save(); dailyTick(); render();
  paintSaveModal(); toast('Carga deshecha ✓');
}
export function paintSaveModal(){
  const le=Number(localStorage.getItem(EXPKEY));
  document.getElementById('lastExport').textContent='Última exportación en este dispositivo: '+(le?relDays(le):'nunca');
  const b=readBackup();
  document.getElementById('undoRow').classList.toggle('hidden',!b);
  if(b) document.getElementById('btnUndoLoad').textContent=`↶ Deshacer última carga (copia del ${fmtStamp(b.at)})`;
}
export function openSaveModal(){
  pendingSave=null;
  for(const id of ['importMsg','importPreview','exportCode']) document.getElementById(id).classList.add('hidden');
  document.getElementById('importCode').value='';
  paintSaveModal(); document.getElementById('saveModal').classList.remove('hidden');
}
export function closeSaveModal(){ document.getElementById('saveModal').classList.add('hidden'); }

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('miSave').onclick=openSaveModal;
  document.getElementById('saveClose').onclick=closeSaveModal;
  document.getElementById('saveModal').addEventListener('click',e=>{ if(e.target.id==='saveModal') closeSaveModal(); });
  document.getElementById('btnExportFile').onclick=exportFile;
  document.getElementById('btnCopyCode').onclick=copyCode;
  document.getElementById('btnPickFile').onclick=()=>document.getElementById('importFile').click();
  document.getElementById('importFile').onchange=async(e)=>{ const f=e.target.files[0]; e.target.value=''; if(f) reviewSave(await f.text()); };
  document.getElementById('btnReview').onclick=()=>reviewSave(document.getElementById('importCode').value);
  document.getElementById('btnUndoLoad').onclick=undoLoad;
}

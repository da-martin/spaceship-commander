/* Cuenta: modal de entrada, registro y cambio de contraseña. */
import { fmtStamp, summary } from '../features/saves.js';
import { loadCalEvents } from '../integrations/calendars.js';
import { thInit } from '../integrations/taskhero.js';
import { normState, state } from '../store.js';
import { adoptCloud, api, cloud, hydrate, keepLocal, logout, SYNCTEXT } from './cloud.js';
import { toast } from '../ui/toast.js';

export function paintAccount(){
  const item=document.getElementById('miAccount');
  item.style.display=(cloud.user||cloud.online)?'flex':'none';
  document.getElementById('miAccountName').textContent=cloud.user?(cloud.user.name||'Comandante'):'Entrar';
  document.getElementById('miAccountSub').textContent=cloud.user?(SYNCTEXT[cloud.status]||''):'Sincroniza tu partida entre dispositivos';
  // Un punto sobre el botón: si el estado de guardado vive solo dentro del menú,
  // dejas de enterarte de que algo no se guardó.
  const dot=document.getElementById('menuDot');
  const aviso=cloud.user&&cloud.status==='offline', curso=cloud.user&&(cloud.status==='pending'||cloud.status==='saving');
  dot.classList.toggle('hidden',!(aviso||curso));
  dot.style.background=aviso?'#fbbf24':'#22d3ee';
  document.getElementById('btnMenu').title=cloud.user?`${cloud.user.name} · ${SYNCTEXT[cloud.status]||''}`:'Menú';
  document.getElementById('footerNote').textContent=cloud.user
    ? 'PARTIDA EN LA NUBE // '+cloud.user.name.toUpperCase()
    : 'DATOS LOCALES // LOCALSTORAGE · SIN CUENTA';
}

export const mkEl=(tag,cls,txt)=>{ const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };
// Cerrar levanta SIEMPRE la retención: si quedara puesta, este dispositivo
// dejaría de sincronizar en silencio y volvería a preguntar en cada arranque.
export let authMode=null, authForced=null;
export const closeAuthModal=()=>{ cloud.hold=false; authMode=null; authForced=null; document.getElementById('authModal').classList.add('hidden'); };
// El selector de partidas no se descarta: mientras no se elija no hay vínculo,
// así que cerrarlo solo aplaza el problema hasta el siguiente arranque. Las dos
// opciones son reversibles desde «Deshacer», de modo que no hay nada de lo que
// escapar. Tampoco se descarta el paso de elegir contraseña tras entrar con una
// clave de las de antes: la sesión ya está abierta en el servidor, pero aquí no
// se adopta la cuenta hasta tener contraseña.
export const dismissAuth=()=>{ if(authMode!=='choose'&&!authForced) closeAuthModal(); };

export const AUTHERR={
  invalid_login:'Usuario o contraseña incorrectos.',
  name_taken:'Ese nombre ya está cogido. Prueba con otro.',
  bad_name:'El nombre debe tener entre 3 y 24 caracteres: letras, números, espacios, punto o guion.',
  bad_password:'La contraseña debe tener al menos 8 caracteres.',
  wrong_password:'La contraseña actual no es correcta.',
  mismatch:'Las dos contraseñas no coinciden.',
  throttled:'Demasiados intentos. Espera unos minutos y vuelve a probar.',
};
export const authInput=(type,autocomplete,placeholder)=>{
  const i=mkEl('input','w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm');
  Object.assign(i,{type,autocomplete,placeholder,spellcheck:false,autocapitalize:'off'}); return i;
};
export const authBtn=(txt)=>{ const b=mkEl('button','w-full px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-medium',txt); b.type='submit'; return b; };
// Envía un formulario de cuenta y devuelve el JSON si fue bien; si no, pinta el
// error y devuelve null. El botón vuelve a su texto en ambos casos.
export async function authPost(path,payload,go,err,busy){
  const label=go.textContent;
  go.disabled=true; go.textContent=busy; err.classList.add('hidden');
  let r,res={};
  try{ r=await api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); res=await r.json().catch(()=>({})); }
  catch{}
  go.disabled=false; go.textContent=label;
  if(r?.ok) return res;
  err.textContent=AUTHERR[res.error]||'No se pudo conectar. Inténtalo de nuevo.'; err.classList.remove('hidden');
  return null;
}
export const authFail=(err,code)=>{ err.textContent=AUTHERR[code]; err.classList.remove('hidden'); };

export function openAuthModal(mode,srv,forced=null){
  authMode=mode; authForced=forced;
  document.getElementById('authClose').classList.toggle('hidden',mode==='choose'||!!forced);
  const body=document.getElementById('authBody'); body.innerHTML='';
  const title=document.getElementById('authTitle');

  if(mode==='login'||mode==='signup'){
    const nuevo=mode==='signup';
    title.textContent=nuevo?'Crear cuenta':'Entrar';
    const tabs=mkEl('div','flex gap-2'); tabs.setAttribute('role','tablist');
    for(const [m,label] of [['login','Entrar'],['signup','Crear cuenta']]){
      const t=mkEl('button','ctab flex-1 text-sm',label); t.type='button';
      t.setAttribute('role','tab'); t.setAttribute('aria-selected',String(m===mode));
      t.onclick=()=>{ if(m!==mode) openAuthModal(m); };
      tabs.appendChild(t);
    }
    body.appendChild(tabs);
    body.appendChild(mkEl('p','text-sm text-slate-400',nuevo
      ? 'Elige un nombre y una contraseña. Tu partida se guardará en la nube y podrás seguirla en otro dispositivo. Sin cuenta la app funciona igual, pero solo en este navegador.'
      : 'Entra con tu nombre y tu contraseña para seguir tu partida en este dispositivo.'));

    // Un <form> de verdad, con autocomplete, para que el gestor de contraseñas
    // ofrezca guardarla y rellenarla.
    const form=mkEl('form','space-y-3'); form.noValidate=true;
    const user=authInput('text','username',nuevo?'Nombre (3–24 caracteres)':'Nombre');
    user.name='username'; user.maxLength=nuevo?24:60;
    const pass=authInput('password',nuevo?'new-password':'current-password',nuevo?'Contraseña (mínimo 8 caracteres)':'Contraseña');
    pass.name='password';
    const err=mkEl('p','text-sm text-rose-400 hidden');
    const go=authBtn(nuevo?'Crear cuenta':'Entrar');
    form.append(user,pass,err,go);
    if(!nuevo) form.appendChild(mkEl('p','text-xs text-slate-500','¿Te pasaron una clave de acceso? Escríbela como contraseña y después elegirás una nueva.'));

    form.onsubmit=async(e)=>{
      e.preventDefault();
      const name=user.value.trim(), password=pass.value;
      if(!name||!password) return;
      if(nuevo&&password.length<8) return authFail(err,'bad_password');
      const res=await authPost(nuevo?'/api/auth/signup':'/api/auth/login',{name,password},go,err,nuevo?'Creando…':'Comprobando…');
      if(!res) return;
      pass.value='';
      // Clave de las de antes: primero la contraseña. Hasta entonces cloud.user
      // sigue vacío, así que nada se sube ni salta el selector de partidas.
      if(res.needsPassword) return openAuthModal('password',null,res.user);
      cloud.user=res.user;
      closeAuthModal(); paintAccount(); toast(nuevo?'Cuenta creada ✓':'Sesión iniciada ✓');
      await hydrate();                   // sube la partida local o pregunta cuál conservar
      loadCalEvents(); thInit();
    };
    body.appendChild(form);
    setTimeout(()=>user.focus(),30);
  }

  if(mode==='password'){
    const who=forced||cloud.user, conActual=who.hasPassword;
    title.textContent=conActual?'Cambiar contraseña':'Elige una contraseña';
    body.appendChild(mkEl('p','text-sm text-slate-400',forced
      ? `Hola, ${who.name}. Tu clave de acceso deja de hacer falta: elige una contraseña y a partir de ahora entrarás con tu nombre y ella.`
      : conActual
        ? 'Se cerrará la sesión en tus otros dispositivos.'
        : 'Ahora entras con tu clave de acceso. Ponle una contraseña a tu cuenta y la clave dejará de valer.'));
    const form=mkEl('form','space-y-3'); form.noValidate=true;
    // Oculto: le dice al gestor de contraseñas de qué cuenta es la nueva.
    const user=authInput('text','username',''); user.value=who.name; user.className='hidden'; user.tabIndex=-1;
    const cur=conActual?authInput('password','current-password','Contraseña actual'):null;
    const p1=authInput('password','new-password','Contraseña nueva (mínimo 8 caracteres)');
    const p2=authInput('password','new-password','Repite la contraseña nueva');
    const err=mkEl('p','text-sm text-rose-400 hidden');
    const go=authBtn('Guardar contraseña');
    form.append(...[user,cur,p1,p2,err,go].filter(Boolean));
    form.onsubmit=async(e)=>{
      e.preventDefault();
      if(cur&&!cur.value) return cur.focus();
      if(p1.value.length<8) return authFail(err,'bad_password');
      if(p1.value!==p2.value) return authFail(err,'mismatch');
      const res=await authPost('/api/auth/password',{current:cur?.value,password:p1.value},go,err,'Guardando…');
      if(!res) return;
      cloud.user=res.user;
      closeAuthModal(); paintAccount(); toast('Contraseña guardada ✓');
      if(forced) await hydrate();
    };
    body.appendChild(form);
    setTimeout(()=>(cur||p1).focus(),30);
  }

  if(mode==='account'){
    title.textContent=cloud.user.name||'Tu cuenta';
    body.appendChild(mkEl('p','text-sm text-slate-400',cloud.user.hasPassword
      ? 'Entras con tu nombre y tu contraseña.'
      : 'Tu cuenta aún entra con la clave de acceso de antes. Ponle una contraseña para no depender de ella.'));
    body.appendChild(mkEl('p','text-sm text-slate-300','Estado: '+(SYNCTEXT[cloud.status]||cloud.status)));
    const pw=mkEl('button','w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm',cloud.user.hasPassword?'Cambiar contraseña':'Ponle contraseña');
    pw.onclick=()=>openAuthModal('password');
    const out=mkEl('button','w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm','Cerrar sesión');
    out.onclick=logout; body.append(pw,out);
  }

  if(mode==='choose'){
    title.textContent='Dos partidas distintas';
    body.appendChild(mkEl('p','text-sm text-slate-400','Este dispositivo y tu cuenta tienen progreso diferente. Elige cuál conservar: la otra queda como copia de seguridad y puedes deshacerlo desde Guardar / cargar partida.'));
    const opt=(label,txt,cls,fn)=>{
      const w=mkEl('div','rounded-lg border border-slate-700 p-3 space-y-2');
      w.appendChild(mkEl('div','sys-label',label));
      w.appendChild(mkEl('div','text-sm text-slate-300',txt));
      const b=mkEl('button','w-full px-3 py-2 rounded-lg text-sm font-medium '+cls,'Usar esta');
      b.onclick=fn; w.appendChild(b); return w;
    };
    body.appendChild(opt('EN ESTE DISPOSITIVO',summary(state),'bg-slate-800 border border-slate-700 text-slate-200',()=>keepLocal(srv)));
    body.appendChild(opt('EN TU CUENTA · '+fmtStamp(srv.updatedAt),summary(normState(srv.data.data)),'bg-cyan-700 hover:bg-cyan-600 text-white',()=>adoptCloud(srv)));
  }
  document.getElementById('authModal').classList.remove('hidden');
}

/* ---------- wiring: lo llama main.js al arrancar ---------- */
export function init(){
  document.getElementById('miAccount').onclick=()=>openAuthModal(cloud.user?'account':'login');
  // El cierre al pulsar fuera y con Escape ya es global para todo .gear-menu
  document.getElementById('btnMenu').onclick=(e)=>{
    e.stopPropagation();
    const m=document.getElementById('hdrMenu');
    document.querySelectorAll('.gear-menu').forEach(x=>{ if(x!==m) x.classList.add('hidden'); });
    const abierto=m.classList.toggle('hidden')===false;
    document.getElementById('btnMenu').setAttribute('aria-expanded',String(abierto));
  };
  document.getElementById('hdrMenu').onclick=()=>{ document.getElementById('btnMenu').setAttribute('aria-expanded','false'); };
  document.getElementById('authClose').onclick=dismissAuth;
  document.getElementById('authModal').addEventListener('click',e=>{ if(e.target.id==='authModal') dismissAuth(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') dismissAuth(); });
}

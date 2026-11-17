/* Tablas y constantes del juego: recursos, módulos, rangos, roles, dificultades.
 * Solo datos (y funciones de una línea sobre ellos): no importa nada de la app. */
import { MISSIONS } from './missions.js';
import { pctTxt } from './util.js';

export const AREAS = ['Spirit','Social','Craft','Health'];
// Las áreas eran cuatro bordes de color compitiendo con el ámbar de la
// prioridad y el cian de la acción. Ahora son etiqueta gris con un punto: se
// siguen distinguiendo y dejan de pedir turno. AREA_COLORS se queda para el
// astillero, donde la pastilla del módulo sí es el único color de la tarjeta.
export const AREA_COLORS = {Spirit:'border-violet-700 text-violet-300',Social:'border-pink-700 text-pink-300',Craft:'border-cyan-700 text-cyan-300',Health:'border-emerald-700 text-emerald-300'};
export const AREA_DOT = {Spirit:'#8b5cf6',Social:'#ec4899',Craft:'#06b6d4',Health:'#10b981'};

/* ---------- gamificación: recursos ---------- */
export const RES = {
  mc:  {name:'Megacréditos', sym:'¢', chip:'border-amber-700 text-amber-300'},
  ecos:{name:'Ecos',         sym:'∿', chip:'border-violet-700 text-violet-300', area:'Spirit'},
  nexos:{name:'Nexos',       sym:'⋈', chip:'border-pink-700 text-pink-300', area:'Social'},
  ale: {name:'Aleaciones',   sym:'⎔', chip:'border-cyan-700 text-cyan-300', area:'Craft'},
  bio: {name:'Biomasa',      sym:'❀', chip:'border-emerald-700 text-emerald-300', area:'Health'}
};
export const AREA_RES = {Spirit:'ecos',Social:'nexos',Craft:'ale',Health:'bio'};
export const MATS = ['ecos','nexos','ale','bio'];

/* ---------- nave: módulos y contratos (todos los números ajustables) ---------- */
// Los generales se pagan solo con ¢: las áreas son opcionales y no deben cerrar
// el paso a lo esencial (el Puente abre la tripulación; la Antena, las misiones).
// Los de área son el único sumidero de materiales, y a cambio dan ventajas
// generales que sirvan etiquetes o no por áreas.
export const MODS = {
  bridge: {name:'Puente',       kind:'gen',  mcMult:1.2, desc:'+1 hueco en el tablón de misiones por nivel'},
  engines:{name:'Motores',      kind:'gen',  desc:'+1 día de duración máx. de misión por nivel'},
  cargo:  {name:'Bodega',       kind:'gen',  desc:'+10% ¢ en recompensas de misión por nivel'},
  comms:  {name:'Antena',       kind:'gen',  mcMult:0.5, desc:'+0,5 misiones al día en el tablón por nivel'},
  spirit: {name:'Observatorio', kind:'area', area:'Spirit', res:'ecos',  desc:'+8% de méritos por nivel'},
  social: {name:'Salón',        kind:'area', area:'Social', res:'nexos', desc:'−8% en los sueldos de la tripulación por nivel'},
  craft:  {name:'Taller',       kind:'area', area:'Craft',  res:'ale',   desc:'−10% en el coste ¢ del astillero por nivel'},
  health: {name:'Enfermería',   kind:'area', area:'Health', res:'bio',   desc:'+1 punto de estado al día por nivel en el módulo más dañado'}
};
// Sigue haciendo falta para repartir desgaste y reparación, no para ganar material.
export const AREA_MOD = {Spirit:'spirit',Social:'social',Craft:'craft',Health:'health'};
export const MOD_MC = [60,125,250,500,1000], MOD_MAT = [1,2,4,6,9];
export const REPAIR_MC = 2, HEAL = 2, WEAR_HABIT = 5, WEAR_TASK = 2;
// Cada caída de un hábito negativo (× puntos de esfuerzo). Menos que fallar un
// hábito diario: se puede caer varias veces el mismo día.
export const WEAR_NEG = 3;
export const NOTES_MAX = 4000;   // notas de tareas y hábitos (texto plano)
export const HABIT_TYPES = ['daily','weekly','monthly','free','neg'];
// ventajas de los módulos de área, por nivel efectivo
export const XP_BONUS = 0.08, WAGE_CUT = 0.08, YARD_CUT = 0.10, SELFHEAL = 1;
// tablón: las misiones llegan con la señal y esperan hasta que caducan (días contando el de llegada)
export const BOARD_BASE = 3, SIGNAL_DAY = 1, SIGNAL_LV = 0.5, SWEEP_MC = 15, OFFER_TTL = [3,6], AGE_BONUS = 0.05;
export const URGENT_P = 0.2, URGENT_TTL = [1,2], URGENT_BONUS = 0.5, REP_DAYS = 3;
// dificultad: cuánto pide sobre tu ritmo (push), ¢ por unidad de cuota (pay),
// material extra (mats) y probabilidad de salir (w)
export const DIFFS = {
  easy:  {name:'Fácil',   push:0.95, pay:0.85, mats:0, w:0.30, chip:'border-emerald-600 text-emerald-300'},
  normal:{name:'Normal',  push:1.10, pay:1,    mats:0, w:0.45, chip:'border-cyan-600 text-cyan-300'},
  hard:  {name:'Difícil', push:1.25, pay:1.3,  mats:1, w:0.25, chip:'border-red-600 text-red-300'},
};
// bitácora de a bordo: lo leído se borra pasados LOG_DAYS días, y nunca hay más de LOG_MAX entradas
export const LOG_MAX = 60, LOG_DAYS = 30;
// Dificultad de tareas y hábitos: vale puntos de esfuerzo, la unidad de todo lo
// que se gana al completar y de las cuotas de misión. 1 punto = lo que daba un
// hábito normal. Las acciones rápidas del Focus cuentan como tareas fáciles.
// Micro (0,1) no llega a 1 ¢ ni a 1 mérito con el redondeo de abajo: cuenta
// como hábito o tarea hecha, da material y suma 0,1 a la misión.
export const EFFORT = {micro:0.1, easy:0.5, normal:1, hard:2, epic:3};
export const EFFORT_NAME = {micro:'Micro', easy:'Fácil', normal:'Normal', hard:'Difícil', epic:'Épica'};
export const EF_MC = 5, EF_XP = 5, FREE_MC = 2;   // ¢ y méritos por punto; ¢ por toque de hábito libre (× puntos)
export const EF_PROGRESS = 0.1;                   // puntos de cada Progreso en el Protocolo Forster
export const effOf = (x) => x?.kind==='acc' ? EFFORT.easy : (EFFORT[x?.diff]||1);
// Lo fácil redondea ¢ y méritos hacia abajo (2,5 → 2); lo demás, a la más cercana.
export const payRound = (v,ef) => ef<1 ? Math.floor(v+1e-9) : Math.round(v);

/* ---------- rango del comandante: méritos que no se gastan ---------- */
export const XP_PROGRESS = 1, XP_ROUND = 5, XP_CONTRACT = 25;   // tareas y hábitos: EF_XP por punto de esfuerzo
export const RANKS = [['Cadete',0],['Guardiamarina',100],['Alférez',250],['Teniente',500],['Capitán de corbeta',900],['Capitán de fragata',1500],
  ['Capitán de navío',2400],['Comodoro',3700],['Contraalmirante',5500],['Vicealmirante',8000],['Almirante',11500]];

/* ---------- tripulación: contratos semanales prepagados ---------- */
export const BERTHS = 2, CANDS_N = 4, CREW_DAYS = 7;
// nivel del tripulante: salario semanal y rango mínimo del comandante para contratarlo
export const CREW_LV = [{name:'Aprendiz',wage:45,rank:0},{name:'Oficial',wage:90,rank:2},{name:'Élite',wage:150,rank:4}];
export const ROLES = {
  quarter:   {code:'INT', name:'Intendencia',   eff:[.15,.25,.4], desc:(v)=>`+${pctTxt(v)} ¢ en tareas completadas`},
  instructor:{code:'INS', name:'Instrucción',   eff:[1,2,3],      desc:(v)=>`+${v} ¢ por punto de esfuerzo en hábitos diarios o semanales`},
  engineer:  {code:'ING', name:'Ingeniería',    eff:[.25,.4,.55], desc:(v)=>`−${pctTxt(v)} de desgaste en los módulos`},
  medic:     {code:'MNT', name:'Mantenimiento', eff:[1,2,3],      desc:(v)=>`+${v}% de reparación extra al completar`},
  navigator: {code:'NAV', name:'Navegación',    eff:[.15,.25,.4], desc:(v)=>`+${pctTxt(v)} ¢ al cobrar misiones`},
  prospector:{code:'PRO', name:'Prospección',   eff:[.15,.25,.35],desc:(v)=>`${pctTxt(v)} de prob. de material extra`},
  trader:    {code:'COM', name:'Comercio',      eff:[.1,.15,.2],  desc:(v)=>`−${pctTxt(v)} al comprar en el mercado`},
  pilot:     {code:'PIL', name:'Pilotaje',      eff:[1,2,3],      desc:(v)=>`+${v} ¢ por Progreso en el Protocolo Forster`}
};
export const CREW_FIRST = [
  'Lina','Tomás','Aiko','Rafa','Noor','Iker','Sasha','Marta','Kofi','Elena','Darío','Yuki','Inés','Omar','Vega','Leo','Nadia','Bruno','Zara','Hugo','Mei','Pau','Ada','Teo',
  'Amara','Bastian','Carmen','Dmitri','Esme','Farid','Greta','Hiro','Imani','Jonás','Kalani','Lucía','Malik','Nerea','Oskar','Priya','Quim','Rosa','Santi','Talia',
  'Ulises','Valentina','Wen','Ximena','Yago','Zoe','Anouk','Benicio','Chiara','Diego','Emeka','Freya','Gael','Hana','Ilya','Jade','Kenji','Leire','Mateo','Nia',
  'Olga','Pablo','Raúl','Selma','Tariq','Uma','Víctor','Wanda','Yara','Álex'
];
export const CREW_LAST = [
  'Okafor','Ibarra','Tanaka','Volkov','Reyes','Lindqvist','Moreau','Haddad','Santos','Kowalski','Nakamura','Ferrer','Adeyemi','Castell','Novak','Quiroga',
  'Abara','Bianchi','Cardona','Dubois','Echeverría','Fonseca','Gallardo','Herrera','Ivanova','Jensen','Kaur','Larsen','Mendoza','Nkosi','Orozco','Petrova',
  'Quintero','Rossi','Salgado','Toledo','Uribe','Valdés','Weber','Xiong','Yamada','Zamora','Almeida','Bergström','Chen','Duarte','Esposito','Fischer',
  'García','Hoshino','Iglesias','Jovanović','Kim','Lozano','Mbeki','Navarro','Olsen','Park','Rahman','Sato','Torres','Varga','Wójcik','Zubiri'
];
// El catálogo de misiones vive en missions.js (MISSIONS).
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map(m=>[m.id,m]));
// Lo recién marcado se queda en su sitio RECENT_MS antes de irse a Completados:
// da tiempo a ver que se marcó y a desmarcarlo si fue sin querer. Es el mismo
// margen que espera la cola de TaskHero, así que lo que aún se ve marcado no ha
// salido. La hora va en la recompensa (g.at), y por eso vale también al recargar
// o al marcar en otro dispositivo. Libres y negativos no se pliegan nunca: se
// tocan varias veces al día.
export const RECENT_MS = 15e3;

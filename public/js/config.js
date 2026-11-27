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
  bridge:  {name:'Puente',      the:'el Puente',      kind:'gen',  mcMult:1.2, desc:'+1 hueco en el tablón de misiones por nivel'},
  engines: {name:'Motores',     the:'los Motores',    kind:'gen',  desc:'+6% de avance en misión por nivel; urgentes de hasta 1 día más'},
  cargo:   {name:'Bodega',      the:'la Bodega',      kind:'gen',  desc:'+10% ¢ en recompensas de misión por nivel'},
  comms:   {name:'Antena',      the:'la Antena',      kind:'gen',  mcMult:0.5, desc:'+0,5 misiones al día en el tablón por nivel'},
  quarters:{name:'Camarotes',   the:'los Camarotes',  kind:'gen',  desc:'+1 litera para la tripulación por nivel'},
  spirit:  {name:'Observatorio', the:'el Observatorio', kind:'area', area:'Spirit', res:'ecos',  desc:'+8% de méritos por nivel'},
  social:  {name:'Salón',       the:'el Salón',       kind:'area', area:'Social', res:'nexos', desc:'−8% en los sueldos de la tripulación por nivel'},
  craft:   {name:'Taller',      the:'el Taller',      kind:'area', area:'Craft',  res:'ale',   desc:'−10% en el coste ¢ del astillero por nivel'},
  health:  {name:'Enfermería',  the:'la Enfermería',  kind:'area', area:'Health', res:'bio',   desc:'+1 punto de estado al día por nivel en el módulo más dañado'}
};
export const SHIP_LV_MAX = Object.keys(MODS).length*5;   // nivel total de la nave con todo al máximo
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
// Tipos de contrato. `away`: mientras dura estás fuera del sistema (sin tablón, mercado ni astillero).
// `deadline`: vence a una hora (endsAt); sin plazo, termina solo al reunir la cuota o al abandonarla.
export const CONTRACT_KINDS = {run:{away:true,deadline:true}, open:{away:true,deadline:false}, jump:{away:true,deadline:true}};
export const isAway=(c)=>!!c&&CONTRACT_KINDS[c.kind]?.away!==false;          // sin tipo conocido: fuera, por si acaso
export const hasDeadline=(c)=>!!c&&CONTRACT_KINDS[c.kind]?.deadline!==false;
// Misiones sin plazo (docs/plan-misiones.md): todas las no urgentes. Su distancia
// es fija en puntos según el tamaño, no depende del ritmo: hacer más no agranda las
// siguientes. Calibradas a 10 puntos al día: a ese ritmo se llega con un día de margen
// sobre `days`, los días desde que la aceptas en los que la paga sube SPEED_BONUS.
export const SIZES = {
  short:{name:'Corta', pts:15, days:3, w:0.35},
  mid:  {name:'Media', pts:30, days:4, w:0.45},
  long: {name:'Larga', pts:60, days:7, w:0.20},
};
export const SPEED_BONUS = 0.25;
export const ENGINE_PUSH = 0.06;   // Motores: avance extra en misión por nivel efectivo
// Amenazas de las misiones sin plazo (fase B): cada noche de misión, un impacto de daño fijo
// (HIT, puntos de estado según la dificultad; ×2 si es fuerte) en un módulo general.
// `bar`: lo que mide la barra de progreso; `hit`: la frase del impacto en la bitácora.
// `hits`: frases del impacto, con {m} = el módulo dañado con su artículo; `blocks`: las del escudo.
export const THREATS = {
  pirates:  {name:'Piratas', bar:'Casco enemigo', hit:'Los piratas abren fuego contra la nave', topics:['Escolta','Patrulla'], hits:[
    'Un misil pirata estalla junto a {m}.',
    'Una corbeta pirata sale de detrás de un asteroide y dispara contra {m}.',
    'Dos cazas piratas pasan rozando el casco y ametrallan {m}.',
    'La tripulación rechaza un abordaje pirata, pero los asaltantes dejan cargas de corte en {m}.',
  ], blocks:[
    'Los piratas abren fuego, pero el escudo desvía cada disparo.',
    'Un misil pirata estalla contra el escudo sin llegar a tocar el casco.',
  ]},
  asteroids:{name:'Lluvia de asteroides', bar:'Mineral extraído', hit:'Una lluvia de asteroides golpea la nave', topics:['Minería'], hits:[
    'Una roca del tamaño de un carguero roza el casco y golpea {m}.',
    'Una lluvia de fragmentos repiquetea durante horas sobre {m}.',
    'Un asteroide se parte en dos delante de la proa y un trozo alcanza {m}.',
    'El campo de escombros se cierra de golpe y una piedra atraviesa el blindaje cerca de {m}.',
  ], blocks:[
    'Las rocas rebotan contra el escudo como granizo.',
    'Un asteroide se deshace en polvo al chocar con el escudo.',
  ]},
  radiation:{name:'Radiación', bar:'Distancia', hit:'Una tormenta de radiación azota la nave', topics:['Exploración','Reconocimiento'], hits:[
    'Una tormenta de radiación azota la nave y fríe los circuitos de {m}.',
    'Un pulso de partículas atraviesa el blindaje y deja sin energía {m}.',
    'La radiación sube de golpe y satura los sensores de {m}.',
    'Una llamarada estelar barre el casco y castiga {m}.',
  ], blocks:[
    'El escudo absorbe la tormenta de radiación.',
    'La llamarada choca contra el escudo y se disipa.',
  ]},
  structure:{name:'Fallos estructurales', bar:'Rescate', hit:'Un fallo estructural sacude la nave', topics:['Rescate'], hits:[
    'Un mamparo cede con un crujido cerca de {m}.',
    'Una vibración recorre la nave y abre una grieta junto a {m}.',
    'Se suelta un soporte del casco y golpea {m}.',
    'Al maniobrar, los restos de la nave rescatada chocan contra {m}.',
  ], blocks:[
    'El campo del escudo sujeta el casco justo cuando un mamparo empieza a ceder.',
    'El escudo mantiene la presión mientras la tripulación sella una grieta.',
  ]},
  saboteurs:{name:'Saboteadores', bar:'Distancia', hit:'Los saboteadores dañan la nave', topics:['Transporte','Chárter'], hits:[
    'Alguien ha manipulado los conductos de {m}.',
    'Un bulto de la carga resulta ser un explosivo y estalla junto a {m}.',
    'Un pasajero desaparece después de cortar los cables de {m}.',
    'Un virus en el ordenador de a bordo desajusta {m}.',
  ], blocks:[
    'Los sensores del escudo detectan el sabotaje a tiempo y aíslan la zona.',
    'El escudo contiene la explosión de una carga trampa.',
  ]},
};
export const threatFor = (topic) => Object.keys(THREATS).find(k=>THREATS[k].topics.includes(topic)) || 'radiation';
export const HIT = {easy:4, normal:6, hard:8};
export const HEAVY_P = 0.3;     // probabilidad de que el siguiente impacto sea fuerte (se avisa antes)
export const SHIELD_GAP = 2;    // tras bloquear, impactos que pasan antes de poder volver a usar el escudo
// Rasgos de las misiones sin plazo (fase C): cambian cuánto cuenta el esfuerzo PARA LA MISIÓN
// (¢, méritos y material no cambian). `kind`: good (favorable), mid (neutro) o bad (adverso).
export const TRAITS = {
  solar:    {name:'Viento solar',           kind:'good', desc:'Lo Difícil y lo Épico cuenta ×1,5'},
  window:   {name:'Ventana de lanzamiento', kind:'good', desc:'Lo primero que completas cada día cuenta ×2'},
  habits:   {name:'Ruta de hábitos',        kind:'mid',  desc:'Los hábitos cuentan ×1,5 y las tareas ×0,5'},
  errands:  {name:'Ruta de encargos',       kind:'mid',  desc:'Las tareas cuentan ×1,5 y los hábitos ×0,5'},
  armored:  {name:'Blindado',               kind:'bad',  desc:'Lo Micro y lo Fácil cuenta ×0,5'},
  regen:    {name:'Regenerativo',           kind:'bad',  desc:'Una noche sin avance, la misión retrocede un 10 %'},
  storm:    {name:'Tormenta iónica',        kind:'bad',  desc:'Cada caída de un hábito negativo resta sus puntos a la misión'},
  looters:  {name:'Saqueadores',            kind:'bad',  desc:'Cada impacto sin bloquear quita 1 material de la recompensa'},
  artillery:{name:'Artillería pesada',      kind:'bad',  desc:'Los impactos fuertes salen la mitad de las veces'},
};
// Rasgos por dificultad: fácil, 1 favorable; normal, 1 neutro o adverso; difícil, 2 adversos.
export const TRAIT_ROLL = {easy:[['good']], normal:[['mid','bad']], hard:[['bad'],['bad']]};
export const REGEN = 0.1, HEAVY_P_ART = 0.5, WINDOW_MULT = 2;   // Ventana de lanzamiento: lo primero del día
// Rutas por etapas (docs/plan-misiones-rutas.md, fase D): tramos por tamaño y tipos de tramo.
// El primero siempre es directo; al acabar cada uno se elige el siguiente entre LEG_CARDS cartas,
// y Directo sale siempre. `mult`: distancia del tramo sobre la base.
export const LEGS = {short:2, mid:3, long:4};
export const LEG_KINDS = {
  direct: {name:'Directo',             mult:1,   desc:'Sin sorpresas'},
  short:  {name:'Maniobra arriesgada', mult:0.7, desc:'Un 30 % más corta, pero el próximo impacto será fuerte'},
  mine:   {name:'Yacimiento',          mult:1.3, desc:'Un 30 % más largo; al completarlo, +2 materiales a la recompensa'},
  station:{name:'Parada técnica',      mult:1.3, desc:'Un 30 % más larga; al completarla, repara un 10 % el módulo más dañado y recarga el escudo'},
};
export const LEG_CARDS = 3, LEG_MATS = 2, LEG_REPAIR = 10;
// Viajes a otros sistemas (docs/plan-viajes.md): cerrados hasta que estén el salto y la votación.
export const TRAVEL_ON = false;
export const URGENT_P = 0.2, URGENT_TTL = [1,2], URGENT_BONUS = 0.5, REP_DAYS = 3;
// dificultad: ¢ por unidad de cuota (pay), material extra (mats) y probabilidad
// de salir (w). Nunca sube la cuota: pedir más que tu ritmo hacía que el listón no parase de subir.
export const DIFFS = {
  easy:  {name:'Fácil',   pay:0.85, mats:0, w:0.30, chip:'border-emerald-600 text-emerald-300'},
  normal:{name:'Normal',  pay:1,    mats:0, w:0.45, chip:'border-cyan-600 text-cyan-300'},
  hard:  {name:'Difícil', pay:1.3,  mats:1, w:0.25, chip:'border-red-600 text-red-300'},
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

/* ---------- libro de cuentas: ¢ que entran y salen cada día (state.ship.books) ---------- */
// Solo los Megacréditos. Se guardan BOOKS_DAYS días, como la actividad de la nave.
export const BOOKS = {
  in: {task:'Tareas', habit:'Hábitos', free:'Hábitos libres', mission:'Misiones', forster:'Protocolo Forster', sale:'Venta de material'},
  out:{wages:'Sueldos', crew:'Contratos y ascensos', debt:'Deudas', yard:'Astillero', repair:'Reparaciones', buy:'Compra de material', sweep:'Barrido de señal'}
};
export const BOOKS_DAYS = 30;
export const BOOKS_WEEKS = 4;   // la previsión de cada día: media de ese día de la semana en las últimas 4 semanas

/* ---------- rango del comandante: méritos que no se gastan ---------- */
export const XP_PROGRESS = 1, XP_ROUND = 5, XP_CONTRACT = 25;   // tareas y hábitos: EF_XP por punto de esfuerzo
export const RANKS = [['Cadete',0],['Guardiamarina',100],['Alférez',250],['Teniente',500],['Capitán de corbeta',900],['Capitán de fragata',1500],
  ['Capitán de navío',2400],['Comodoro',3700],['Contraalmirante',5500],['Vicealmirante',8000],['Almirante',11500]];

/* ---------- tripulación: contratos semanales prepagados ---------- */
// BERTHS: literas de serie; los Camarotes suman una más por nivel
export const BERTHS = 2, CANDS_N = 4, CREW_DAYS = 7;
// nivel del tripulante: salario semanal, rango mínimo del comandante para contratarlo
// o ascenderlo, y experiencia acumulada desde la que puede ascender a él.
// Se contrata hasta CREW_HIRE_MAX: a Élite solo se llega ascendiendo.
export const CREW_LV = [{name:'Aprendiz',wage:45,rank:0,xp:0},{name:'Veterano',wage:90,rank:2,xp:100},{name:'Oficial',wage:150,rank:4,xp:350},{name:'Élite',wage:225,rank:6,xp:850}];
export const CREW_HIRE_MAX = 3;
// experiencia del tripulante: por día de misión con contrato y por simulación de VR Training terminada
export const CREW_XP_DAY = 10, CREW_XP_RUN = 2;
export const ROLES = {
  quarter:   {code:'INT', name:'Intendencia',   eff:[.15,.25,.4,.55], desc:(v)=>`+${pctTxt(v)} ¢ en tareas completadas`},
  instructor:{code:'INS', name:'Instrucción',   eff:[1,2,3,4],      desc:(v)=>`+${v} ¢ por punto de esfuerzo en hábitos diarios o semanales`},
  engineer:  {code:'ING', name:'Ingeniería',    eff:[.25,.4,.55,.7], desc:(v)=>`−${pctTxt(v)} de desgaste en los módulos`},
  medic:     {code:'MNT', name:'Mantenimiento', eff:[1,2,3,4],      desc:(v)=>`+${v}% de reparación extra al completar`},
  navigator: {code:'NAV', name:'Navegación',    eff:[.15,.25,.4,.55], desc:(v)=>`+${pctTxt(v)} ¢ al cobrar misiones`},
  prospector:{code:'PRO', name:'Prospección',   eff:[.15,.25,.35,.45],desc:(v)=>`${pctTxt(v)} de prob. de material extra`},
  trader:    {code:'COM', name:'Comercio',      eff:[.1,.15,.2,.25],  desc:(v)=>`−${pctTxt(v)} al comprar en el mercado`},
  pilot:     {code:'PIL', name:'Pilotaje',      eff:[1,2,3,4],      desc:(v)=>`+${v} ¢ por Progreso en el Protocolo Forster`}
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
// Novedades del juego: cada una llega una vez a la bitácora de cada partida que
// ya existía (state.ship.updates guarda los id ya avisados; las nuevas las traen todas).
export const UPDATES = [
  {id:'crew-xp-2026-11', kind:'crew', title:'Novedades: experiencia y ascensos', lines:[
    'Hay un nivel nuevo. Los niveles son ahora Aprendiz, Veterano, Oficial y Élite. Tus tripulantes conservan su nivel con otro nombre: los Oficiales pasan a llamarse Veteranos y los Élite, Oficiales.',
    'A Élite no se llega contratando, solo ascendiendo. Cobra 225 ¢/sem y da el mayor bonus de su rol.',
    'La tripulación con el sueldo al día gana experiencia: +10 XP por cada día de misión y +2 XP por cada simulación de VR Training terminada.',
    'Al llegar a 100, 350 y 850 XP aparece la opción de ascender. Pide el rango de comandante del nivel y cuesta lo mismo que el sueldo nuevo, que se cobra a partir de entonces.',
    'Si no hay ¢ para un sueldo, el tripulante ya no se marcha. Se queda en su litera sin trabajar y su deuda sube cada día. Puedes pagarle la deuda y la semana siguiente de una vez, o despedirle sin pagarle: en el Sistema Madre, o al volver si estás de misión.',
    'En VR Training solo entrenan tu tripulación a bordo y los holoperfiles de serie; los antiguos tripulantes ya no aparecen. Quien no cobra puede jugar, pero no gana experiencia.',
  ]},
  {id:'ledger-2026-11', kind:'books', title:'Novedad: Contabilidad', lines:[
    'Una pestaña nueva en Spaceship con los próximos 7 días: lo que prevés ganar, los sueldos que se cobran y el saldo que quedaría. Cada cifra explica de dónde sale.',
    'Viene apagada. Actívala en Ajustes › Contabilidad.',
    'El aviso de impago de la tripulación sale siempre, en Nave: en rojo si un sueldo no llega ni con lo que sueles ganar, en ámbar si llega solo si ganas lo de siempre.',
  ]},
  {id:'missions-2026-11', kind:'mission', title:'Novedades: misiones sin plazo', lines:[
    'Las misiones ya no tienen plazo. Cada una es una distancia fija en puntos de esfuerzo: corta (15), media (30) o larga (60). Termina cuando la reúnes, tardes lo que tardes.',
    'La dificultad ya no sube los puntos que pide una misión: cambia la paga y el material. Hacer más tampoco agranda las misiones siguientes.',
    'Si llegas en los días que marca la misión (3, 4 o 7 desde que la aceptas), cobras un 25 % más. Si tardas más, no pasa nada: cobras lo normal.',
    'Las urgentes siguen igual: tienen plazo, pagan más y, si fallan, dañan la reputación.',
    'Los Motores suman un 6 % por nivel a lo que avanzas en las misiones sin plazo. En las urgentes siguen alargando el plazo máximo.',
    'Las misiones que ya tenías en marcha o en el tablón terminan con las reglas de antes.',
  ]},
  {id:'missions-threats-2026-11', kind:'mission', title:'Novedades: amenazas y escudo', lines:[
    'Cada misión sin plazo trae una amenaza según su tipo: piratas, lluvia de asteroides, radiación, fallos estructurales o saboteadores.',
    'Cada noche de misión, al cambiar de día, la amenaza golpea la nave: un 4 %, 6 % u 8 % de estado en un módulo según la dificultad. El día en que aceptas no hay impacto.',
    'Antes de cada impacto ya sabes si será fuerte: hace el doble de daño.',
    'Con el escudo bloqueas el próximo impacto. Después deja pasar dos impactos antes de poder usarlo otra vez, así que guárdalo para los fuertes. Desactivarlo no lo gasta.',
    'Ir despacio nunca hace fallar una misión: solo desgasta más la nave. Ingeniería reduce el daño y los módulos se reparan como siempre.',
    'Las misiones que ya tenías en marcha no tienen amenaza.',
  ]},
  {id:'missions-traits-2026-11', kind:'mission', title:'Novedades: rasgos de misión', lines:[
    'Las misiones sin plazo traen rasgos que cambian cuánto cuenta lo que haces para la misión. Las ¢, los méritos y el material de cada tarea o hábito no cambian.',
    'Fáciles: un rasgo a favor, como Viento solar (lo Difícil y lo Épico cuenta ×1,5) o Ventana de lanzamiento (lo primero de cada día cuenta ×2).',
    'Normales: un rasgo neutro o en contra, como Ruta de hábitos (los hábitos cuentan ×1,5 y las tareas ×0,5).',
    'Difíciles: dos rasgos en contra, como Blindado (lo Micro y lo Fácil cuenta la mitad), Regenerativo (una noche sin avance, la misión retrocede un 10 %), Tormenta iónica, Saqueadores o Artillería pesada.',
    'Los ves en el tablón antes de aceptar y en el panel de la misión. Los capítulos de historia no traen rasgos.',
  ]},
  {id:'missions-route-2026-11', kind:'mission', title:'Novedades: rutas por etapas', lines:[
    'Las misiones sin plazo se dividen en tramos: la corta en 2, la media en 3 y la larga en 4. El primero siempre es directo.',
    'Al acabar cada tramo eliges el siguiente entre 3 cartas: Directo (sin sorpresas), Maniobra arriesgada (un 30 % más corta, pero el próximo impacto será fuerte), Yacimiento (un 30 % más largo, con 2 materiales más) o Parada técnica (un 30 % más larga, repara un 10 % el módulo más dañado y recarga el escudo).',
    'Elegir cambia la distancia total, así que también cuenta para la bonificación de rapidez.',
    'Nada se bloquea: si no eliges, lo que haces sigue sumando, y el tramo cuenta como Directo.',
    'Los capítulos de historia y las misiones que ya tenías en marcha no tienen tramos.',
  ]},
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

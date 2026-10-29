#!/usr/bin/env node
/**
 * Crea (o rota) la clave de acceso de una persona.
 *
 *   node scripts/invite.mjs "Ana"            # base de producción
 *   node scripts/invite.mjs --local "Ana"    # base local de desarrollo
 *   node scripts/invite.mjs --list           # quién está dado de alta
 *   node scripts/invite.mjs --yes "Ana"      # sin preguntar (para scripts)
 *
 * La clave se imprime UNA sola vez: en la base solo queda su SHA-256.
 *
 * Si el nombre ya existe se le rota la clave —la anterior deja de valer y se
 * cierran sus sesiones abiertas— sin tocar su partida. Si no existe, pregunta
 * antes de crear a nadie: una errata en el nombre crearía un usuario nuevo con
 * la partida vacía, que es el error caro de este comando.
 */

import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const DB = 'spaceship-commander';

const args = process.argv.slice(2);
const local = args.includes('--local');
const assumeYes = args.includes('--yes') || args.includes('-y');
const list = args.includes('--list');
const name = args.filter((a) => !a.startsWith('-')).join(' ').trim();
const target = local ? '--local' : '--remote';
const dónde = local ? 'base local' : 'PRODUCCIÓN';

// wrangler d1 execute no acepta parámetros, así que los valores se interpolan.
// Doblar las comillas simples es lo que evita que un apóstrofo rompa el SQL.
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function d1(sql, { read = false } = {}) {
  let out;
  try {
    out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB, target, ...(read ? ['--json'] : []), '--command', sql], {
      stdio: ['inherit', 'pipe', 'pipe'],
    }).toString();
  } catch (err) {
    console.error(`\nNo se pudo hablar con la ${dónde}.\n`);
    console.error((err.stderr || err.stdout || err.message).toString().trim());
    process.exit(1);
  }
  if (!read) return null;
  const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1);
  try {
    return JSON.parse(json).flatMap((r) => r.results ?? []);
  } catch {
    console.error('\nNo entendí la respuesta de la base de datos.\n');
    process.exit(1);
  }
}

// Una sola interfaz para todas las preguntas: cerrar y reabrir readline deja
// stdin pausado y la segunda pregunta se quedaría colgada sin leer nada.
let rl = null;
const closeRl = () => { rl?.close(); rl = null; };

async function confirm(question, defaultYes) {
  if (assumeYes) return true;
  if (!process.stdin.isTTY) {
    console.error(`\n${question}\nHace falta confirmarlo: ejecútalo en una terminal, o añade --yes si sabes lo que haces.`);
    process.exit(1);
  }
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  let a;
  try {
    a = (await rl.question(`${question} ${defaultYes ? '[S/n]' : '[s/N]'} `)).trim().toLowerCase();
  } catch {
    // Ctrl+D o stdin cerrado. Se sale en vez de devolver un valor: responder
    // «no» a la pregunta de la errata significaría crear el usuario duplicado.
    closeRl();
    console.log('\n\n  Cancelado. No se ha tocado nada.\n');
    process.exit(0);
  }
  if (!a) return defaultYes;
  return ['s', 'si', 'sí', 'y', 'yes'].includes(a);
}

// Una pregunta con varias salidas, en vez de encadenar sí/no: así el caso de
// la errata se resuelve de una vez y no hay una segunda pregunta escondida.
async function choose(question, options, def) {
  if (assumeYes) return def;
  if (!process.stdin.isTTY) {
    console.error(`\n${question}\nHace falta decidirlo: ejecútalo en una terminal, o añade --yes para quedarte con la opción por defecto.`);
    process.exit(1);
  }
  console.log('');
  for (const [k, label] of options) console.log(`    [${k}] ${label}${k === def ? '   ← por defecto' : ''}`);
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  let a;
  try {
    a = (await rl.question(`\n  ${question} `)).trim().toLowerCase();
  } catch {
    closeRl();
    console.log('\n\n  Cancelado. No se ha tocado nada.\n');
    process.exit(0);
  }
  // Ante una respuesta que no reconozco, la opción por defecto es la segura.
  return options.find(([k]) => k === a)?.[0] ?? def;
}

const users = d1('SELECT id, name FROM users ORDER BY name;', { read: true });

if (list) {
  console.log(`\n  Dados de alta en ${dónde}:\n`);
  console.log(users.length ? users.map((u) => `    · ${u.name}`).join('\n') : '    (nadie todavía)');
  console.log('');
  process.exit(0);
}

if (!name) {
  console.error('Falta el nombre.\n  node scripts/invite.mjs "Ana"\n  node scripts/invite.mjs --list');
  process.exit(1);
}
if (name.length > 60) {
  console.error('El nombre no puede pasar de 60 caracteres.');
  process.exit(1);
}

// El nombre es la identidad: de él depende a qué partida se engancha la clave.
const exact = users.find((u) => u.name === name);
const similar = users.find((u) => u.name.toLowerCase() === name.toLowerCase());

let rotate = exact ?? null;
let crearNuevo = false;

if (!exact && similar) {
  // Casi siempre es una errata de mayúsculas, y crear un usuario nuevo aquí
  // dejaría a esa persona entrando a una partida vacía.
  console.log(`\n  Ya existe «${similar.name}», y tú escribiste «${name}».`);
  const c = await choose('¿Qué hago?', [
    ['r', `rotarle la clave a «${similar.name}» (conserva su partida)`],
    ['c', `crear un usuario nuevo «${name}», con la partida vacía`],
    ['x', 'cancelar'],
  ], 'r');
  if (c === 'x') {
    closeRl();
    console.log('\n  Cancelado. No se ha tocado nada.\n');
    process.exit(0);
  }
  if (c === 'r') rotate = similar;
  else crearNuevo = true;              // elegido a conciencia: no repreguntar
}

if (!rotate && !crearNuevo) {
  console.log(`\n  «${name}» no está dado de alta en ${dónde}.`);
  if (users.length) console.log(`  Ahora mismo hay: ${users.map((u) => u.name).join(', ')}`);
  if (!(await confirm('  ¿Crear un usuario nuevo con la partida vacía?', false))) {
    closeRl();
    console.log('\n  Cancelado. No se ha tocado nada.\n');
    process.exit(0);
  }
}

closeRl();   // sin esto el proceso se quedaría abierto esperando stdin

const key = 'sc_' + randomBytes(32).toString('base64url');
const keyHash = createHash('sha256').update(key).digest('hex');

if (rotate) {
  // Conservar el id es lo que mantiene la partida: saves.user_id apunta a él.
  d1(`UPDATE users SET key_hash = ${q(keyHash)} WHERE id = ${q(rotate.id)};
      DELETE FROM sessions WHERE user_id = ${q(rotate.id)};`);
} else {
  d1(`INSERT INTO users (id, name, key_hash, created_at)
      VALUES (${q(randomUUID())}, ${q(name)}, ${q(keyHash)}, ${Date.now()});`);
}

const quién = rotate ? rotate.name : name;
console.log(`
  ${rotate ? 'Clave rotada' : 'Usuario creado'} para ${quién} (${dónde}):

    ${key}
${rotate ? '\n  La clave anterior ya no vale y sus sesiones abiertas se han cerrado.\n  Su partida sigue intacta.' : '\n  Empieza con la partida vacía.'}

  Cópiala ahora: no se vuelve a mostrar y no se guarda en ningún sitio.
  Mándasela en privado — quien la tenga entra a su partida.
`);

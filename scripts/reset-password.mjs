#!/usr/bin/env node
/**
 * Pone una contraseña temporal a quien haya olvidado la suya.
 *
 *   node scripts/reset-password.mjs "Ana"            # base de producción
 *   node scripts/reset-password.mjs --local "Ana"    # base local de desarrollo
 *   node scripts/reset-password.mjs --list           # quién tiene cuenta
 *   node scripts/reset-password.mjs --yes "Ana"      # sin preguntar (para scripts)
 *
 * Las cuentas se crean solas desde la app. Esto solo sirve para recuperar una:
 * no hay correo al que mandar un enlace. La contraseña temporal se imprime UNA
 * sola vez. Se cierran sus sesiones abiertas y no se toca su partida. La
 * persona entra con ella y la cambia desde su cuenta.
 *
 * El hash sale de src/password.js, el mismo código que usa el Worker.
 */

import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../src/password.js';

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

// Una sola interfaz de readline, y cerrarla antes de salir: si no, el proceso
// se queda abierto esperando stdin.
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
    // Ctrl+D o stdin cerrado: se cancela sin tocar nada.
    closeRl();
    console.log('\n\n  Cancelado. No se ha tocado nada.\n');
    process.exit(0);
  }
  if (!a) return defaultYes;
  return ['s', 'si', 'sí', 'y', 'yes'].includes(a);
}

const users = d1('SELECT id, name, pass_hash IS NOT NULL AS has_pw FROM users ORDER BY name;', { read: true });

if (list) {
  console.log(`\n  Cuentas en ${dónde}:\n`);
  console.log(users.length
    ? users.map((u) => `    · ${u.name}${u.has_pw ? '' : '   (aún entra con su clave de antes)'}`).join('\n')
    : '    (nadie todavía)');
  console.log('');
  process.exit(0);
}

if (!name) {
  console.error('Falta el nombre.\n  node scripts/reset-password.mjs "Ana"\n  node scripts/reset-password.mjs --list');
  process.exit(1);
}

// Como en el login: «ana» y «Ana» son la misma cuenta.
const user = users.find((u) => u.name.toLowerCase() === name.toLowerCase());
if (!user) {
  console.error(`\n  No hay ninguna cuenta «${name}» en ${dónde}.`);
  if (users.length) console.error(`  Ahora mismo hay: ${users.map((u) => u.name).join(', ')}`);
  console.error('');
  process.exit(1);
}

const sigue = await confirm(`\n  ¿Poner una contraseña temporal a «${user.name}» (${dónde}) y cerrar sus sesiones?`, true);
closeRl();   // sin esto el proceso se quedaría abierto esperando stdin
if (!sigue) {
  console.log('\n  Cancelado. No se ha tocado nada.\n');
  process.exit(0);
}

// 12 caracteres al azar: es temporal y se cambia en cuanto entre.
const temporal = randomBytes(9).toString('base64url');

// Conservar el id es lo que mantiene la partida: saves.user_id apunta a él.
d1(`UPDATE users SET pass_hash = ${q(await hashPassword(temporal))} WHERE id = ${q(user.id)};
    DELETE FROM sessions WHERE user_id = ${q(user.id)};
    DELETE FROM auth_throttle WHERE k = ${q('login:user:' + user.name.toLowerCase())};`);

console.log(`
  Contraseña temporal para ${user.name} (${dónde}):

    ${temporal}

  Sus sesiones abiertas se han cerrado. Su partida sigue intacta.

  Cópiala ahora: no se vuelve a mostrar y no se guarda en ningún sitio.
  Mándasela en privado y dile que la cambie en Menú → su nombre → Cambiar contraseña.
`);

#!/usr/bin/env node
/**
 * Crea (o rota) la clave de acceso de una persona.
 *
 *   node scripts/invite.mjs "Ana"            # base de producción
 *   node scripts/invite.mjs --local "Ana"    # base local de desarrollo
 *
 * La clave se imprime UNA sola vez: en la base solo queda su SHA-256.
 * Si el nombre ya existe se le rota la clave —la anterior deja de valer y se
 * cierran sus sesiones abiertas— sin tocar su partida.
 */

import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const DB = 'spaceship-commander';

const args = process.argv.slice(2);
const local = args.includes('--local');
const name = args.filter((a) => !a.startsWith('--')).join(' ').trim();

if (!name) {
  console.error('Falta el nombre.\n  node scripts/invite.mjs "Ana"\n  node scripts/invite.mjs --local "Ana"');
  process.exit(1);
}
if (name.length > 60) {
  console.error('El nombre no puede pasar de 60 caracteres.');
  process.exit(1);
}

const key = 'sc_' + randomBytes(32).toString('base64url');
const keyHash = createHash('sha256').update(key).digest('hex');

// wrangler d1 execute no acepta parámetros, así que el nombre se interpola.
// Doblar las comillas simples es lo que evita que un apóstrofo rompa el SQL.
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const sql = `
INSERT INTO users (id, name, key_hash, created_at)
VALUES (${q(randomUUID())}, ${q(name)}, ${q(keyHash)}, ${Date.now()})
ON CONFLICT(name) DO UPDATE SET key_hash = excluded.key_hash;
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE name = ${q(name)});
`.trim();

try {
  execFileSync('npx', ['wrangler', 'd1', 'execute', DB, local ? '--local' : '--remote', '--command', sql], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });
} catch (err) {
  console.error('\nNo se pudo escribir en la base de datos.\n');
  console.error((err.stderr || err.stdout || err.message).toString().trim());
  process.exit(1);
}

const dónde = local ? 'base local' : 'PRODUCCIÓN';
console.log(`
  Clave creada para ${name} (${dónde}):

    ${key}

  Cópiala ahora: no se vuelve a mostrar y no se guarda en ningún sitio.
  Mándasela en privado — quien la tenga entra a su partida.
  Para anularla, vuelve a ejecutar este comando con el mismo nombre.
`);

// La regla de la fase 2: core/, store.js, util.js, config.js y lib/ no dependen de la vista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../public/js/', import.meta.url);
const dir = (d) => readdirSync(new URL(d + '/', root)).map((f) => d + '/' + f);
const rpg = dir('rpg');
const pure = ['util.js', 'config.js', 'store.js', 'missions.js', ...dir('core'), ...dir('lib'), ...rpg];
const imports = (f) => [...readFileSync(new URL(f, root), 'utf8').matchAll(/^import .* from '(.*)';$/gm)].map((m) => m[1]);

test('el núcleo no importa nada de ui/, features/, sync/ ni integrations/', () => {
  for (const f of pure) {
    const src = readFileSync(new URL(f, root), 'utf8');
    const bad = [...src.matchAll(/^import .* from '(.*)';$/gm)].map((m) => m[1]).filter((p) => /(^|\/)(ui|features|sync|integrations)\//.test(p));
    assert.deepEqual(bad, [], `${f} importa ${bad.join(', ')}`);
  }
});

test('el núcleo no toca el DOM', () => {
  for (const f of pure) {
    const code = readFileSync(new URL(f, root), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(document|window)\.|\btoast\(|\brender\(/, f);
  }
});

test('el núcleo se puede importar fuera del navegador', async () => {
  for (const f of pure) await import(new URL(f, root));
});

// VR Training es un minijuego aparte: lee lo que le pasan y solo escribe en state.rpg.
test('rpg/ no importa la partida ni las reglas del juego principal', () => {
  for (const f of rpg) {
    const bad = imports(f).filter((p) => /(^|\/)(core|ui|features|sync|integrations)\/|store\.js$/.test(p));
    assert.deepEqual(bad, [], `${f} importa ${bad.join(', ')}`);
    const code = readFileSync(new URL(f, root), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(addW|subW|addXP|subXP)\(|\bstate\.(wallet|ship|cmd|tasks|habits|projects|focus)\b/, f);
  }
});

test('el juego principal no depende de VR Training (salvo store.js, que normaliza su parte)', () => {
  for (const f of pure.filter((f) => !f.startsWith('rpg/') && f !== 'store.js')) {
    const bad = imports(f).filter((p) => /(^|\/)rpg\//.test(p));
    assert.deepEqual(bad, [], `${f} importa ${bad.join(', ')}`);
  }
  assert.deepEqual(imports('store.js').filter((p) => p.includes('rpg/')), ['./rpg/state.js']);
});

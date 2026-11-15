// La regla de la fase 2: core/, store.js, util.js, config.js y lib/ no dependen de la vista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../public/js/', import.meta.url);
const pure = ['util.js', 'config.js', 'store.js', 'missions.js', ...readdirSync(new URL('core/', root)).map((f) => 'core/' + f), ...readdirSync(new URL('lib/', root)).map((f) => 'lib/' + f)];

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

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';

const cache = new Map();
function moduleUrl(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full);
  const compiled = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const linked = compiled.replace(
    /from ['"]([^'"]+)['"]/g,
    (_, specifier) => {
      if (specifier.startsWith('@/')) return `from '${moduleUrl(specifier.replace('@/', ''))}'`;
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(full), specifier);
        return `from '${moduleUrl(fs.existsSync(resolved) ? resolved : `${resolved}.ts`)}'`;
      }
      return `from '${specifier}'`;
    },
  );
  const url = 'data:text/javascript;base64,' + Buffer.from(linked).toString('base64');
  cache.set(full, url);
  return url;
}

const { parseNuuvemResult } = await import(moduleUrl('lib/connectors/nuuvem.ts'));
const { getEnebaResult, getKinguinResult } = await import(moduleUrl('lib/connectors/keyshops.ts'));
const { recordConfirmedPrice, getStoredHistory } = await import(moduleUrl('lib/price-history-store.ts'));

let checks = 0;
function equal(actual, expected) {
  assert.deepEqual(actual, expected);
  checks++;
}

const fixture = (name) => fs.readFileSync(path.join('tests/fixtures', name), 'utf8');
const good = parseNuuvemResult(
  fixture('nuuvem-watch-dogs-2-deluxe.html'),
  'Watch Dogs 2 Deluxe Edition',
  'https://www.nuuvem.com/br-pt/item/watch-dogs-2-deluxe-edition',
);
equal(good.status, 'confirmed');
equal(good.offer.price, 17.99);
equal(good.offer.originalPrice, 89.99);
equal(good.offer.currency, 'BRL');
equal(good.offer.launcher, 'Ubisoft Connect');

equal(
  parseNuuvemResult(
    fixture('nuuvem-watch-dogs-2-deluxe.html').replace('content="BRL"', 'content="USD"'),
    'Watch Dogs 2 Deluxe Edition',
    'https://www.nuuvem.com/br-pt/item/watch-dogs-2-deluxe-edition',
  ).status,
  'no-offer',
);
equal(
  parseNuuvemResult(
    fixture('nuuvem-watch-dogs-2-deluxe.html'),
    'Watch Dogs 2',
    'https://www.nuuvem.com/br-pt/item/watch-dogs-2-deluxe-edition',
  ).status,
  'no-offer',
);
equal(
  parseNuuvemResult(
    fixture('nuuvem-watch-dogs-2-dlc.html'),
    'Watch Dogs 2',
    'https://www.nuuvem.com/br-pt/item/watch-dogs-2-season-pass',
  ).status,
  'no-offer',
);
equal(
  parseNuuvemResult(
    fixture('nuuvem-watch-dogs-2-deluxe.html').replace('1799', '1899'),
    'Watch Dogs 2 Deluxe Edition',
    'https://www.nuuvem.com/br-pt/item/watch-dogs-2-deluxe-edition',
  ).status,
  'parser-error',
);
equal((await getEnebaResult({ appId: 1, title: 'Game', canonicalTitle: 'Game' })).status, 'not-integrated');
equal((await getKinguinResult({ appId: 1, title: 'Game', canonicalTitle: 'Game' })).status, 'not-integrated');

recordConfirmedPrice(1, 'Game', good);
recordConfirmedPrice(1, 'Game', good);
equal(getStoredHistory(1, 365).length, 1);
recordConfirmedPrice(1, 'Game', {
  ...good,
  offer: { ...good.offer, price: 9.99, verifiedAt: new Date(Date.now() + 1000).toISOString() },
});
equal(getStoredHistory(1, 365).length, 2);

console.log(`connectors-history: ${checks} checks passed`);

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import { moduleUrl } from './load-ts.mjs';
import { sqliteD1 } from './sqlite-d1.mjs';
import os from 'node:os';
const { parseNuuvemResult } = await import(
  moduleUrl('lib/connectors/nuuvem.ts')
);
const { getEnebaResult, getKinguinResult } = await import(
  moduleUrl('lib/connectors/keyshops.ts')
);
const { recordConfirmedPrice, getStoredHistory } = await import(
  moduleUrl('lib/price-history-store.ts')
);

let checks = 0;
function equal(actual, expected) {
  assert.deepEqual(actual, expected);
  checks++;
}

const fixture = (name) =>
  fs.readFileSync(path.join('tests/fixtures', name), 'utf8');
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
    fixture('nuuvem-watch-dogs-2-deluxe.html').replace(
      'content="BRL"',
      'content="USD"',
    ),
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
equal(
  (await getEnebaResult({ appId: 1, title: 'Game', canonicalTitle: 'Game' }))
    .status,
  'not-integrated',
);
equal(
  (await getKinguinResult({ appId: 1, title: 'Game', canonicalTitle: 'Game' }))
    .status,
  'not-integrated',
);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'safeloot-db-'));
const dbPath = path.join(directory, 'history.sqlite');
let db = sqliteD1(dbPath);
for (const file of fs
  .readdirSync('drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  db.sqlite.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
const originalNow = Date.now;
const clock = originalNow();
Date.now = () => clock + 10000;
const offer = {
  ...good,
  offer: { ...good.offer, verifiedAt: new Date(clock).toISOString() },
};
await recordConfirmedPrice(1, 'Game', offer, db);
await recordConfirmedPrice(1, 'Game', offer, db);
equal((await getStoredHistory(1, 365, db)).length, 1);
await recordConfirmedPrice(
  1,
  'Game',
  {
    ...offer,
    offer: { ...offer.offer, verifiedAt: new Date(clock + 1000).toISOString() },
  },
  db,
);
equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM price_history').get().n, 1);
equal((await getStoredHistory(1, 365, db)).length, 2);
await recordConfirmedPrice(
  1,
  'Game',
  {
    ...offer,
    offer: {
      ...offer.offer,
      price: 9.99,
      verifiedAt: new Date(clock + 2000).toISOString(),
    },
  },
  db,
);
await recordConfirmedPrice(
  1,
  'Game',
  {
    ...offer,
    offer: { ...offer.offer, verifiedAt: new Date(clock + 3000).toISOString() },
  },
  db,
);
equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM price_history').get().n, 3);
await recordConfirmedPrice(
  1,
  'Game',
  { ...offer, offer: { ...offer.offer, currency: 'USD' } },
  db,
);
await recordConfirmedPrice(1, 'Game', { ...offer, status: 'no-offer' }, db);
equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM price_history').get().n, 3);
db.sqlite.close();
db = sqliteD1(dbPath);
equal((await getStoredHistory(1, 365, db)).length, 4); // Survives a database restart.
equal((await getStoredHistory(999, 365, db)).length, 0);
const { authorizeAdmin } = await import(moduleUrl('lib/admin-auth.ts'));
equal(
  authorizeAdmin(new Request('https://test/api/cron/prices'), '')?.status,
  503,
);
equal(
  authorizeAdmin(new Request('https://test/api/cron/prices'), 'secret')?.status,
  401,
);
equal(
  authorizeAdmin(
    new Request('https://test/api/cron/prices', {
      headers: { Authorization: 'Bearer wrong' },
    }),
    'secret',
  )?.status,
  401,
);
equal(
  authorizeAdmin(
    new Request('https://test/api/cron/prices', {
      headers: { Authorization: 'Bearer secret' },
    }),
    'secret',
  ),
  null,
);
const { recordSourceHealth, getSourceHealth } = await import(
  moduleUrl('lib/source-health.ts')
);
await recordSourceHealth(
  {
    store: 'Nuuvem',
    status: 'confirmed',
    responded: true,
    durationMs: 42,
    checkedAt: new Date(clock).toISOString(),
  },
  db,
);
equal((await getSourceHealth(db))[0].status, 'confirmed');
const { collectPrices } = await import(moduleUrl('lib/price-collection.ts'));
const collected = await collectPrices(db, async (appId, title) => {
  await recordConfirmedPrice(
    appId,
    title,
    {
      ...offer,
      offer: {
        ...offer.offer,
        price: 8.99,
        verifiedAt: new Date(clock + 4000).toISOString(),
      },
    },
    db,
  );
  return { collection: { recorded: 1, persistenceFailures: 0 } };
});
equal(collected.recorded, 1);
equal(collected.failed, 0);
equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM price_history').get().n, 4);
equal(
  db.sqlite.prepare('SELECT COUNT(*) AS n FROM collection_runs').get().n,
  1,
);
db.sqlite.close();
Date.now = originalNow;
console.log(`connectors-history: ${checks} checks passed`);

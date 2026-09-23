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
const { resolveNuuvemAppId } = await import(
  moduleUrl('lib/discovery.ts')
);
equal(resolveNuuvemAppId('resident-evil-4-remake', 'Resident Evil 4 Remake'), 2050650);
equal(resolveNuuvemAppId('resident-evil-4-remake-deluxe-edition', 'Resident Evil 4 Remake Deluxe Edition'), 2050650);
equal(resolveNuuvemAppId('resident-evil-4-deluxe-edition', 'Resident Evil 4 Deluxe Edition'), 254700);
equal(resolveNuuvemAppId('cyberpunk-2077', 'Cyberpunk 2077'), 1091500);
equal(resolveNuuvemAppId('totally-unknown-game-xyz', 'Unknown'), undefined);

const { parseGogOffers, parseHypeOffers } = await import(
  moduleUrl('lib/store-connectors.ts')
);
const { parseGamersGateOffers } = await import(
  moduleUrl('lib/regional-prices.ts')
);

const gogMulti = [
  { id: '1', title: 'The Witcher 3: Wild Hunt - Game of the Year Edition', slug: 'the_witcher_3_wild_hunt_game_of_the_year_edition', price: { finalMoney: { amount: '39.99', currency: 'BRL' } } },
  { id: '2', title: 'The Witcher 3: Wild Hunt', slug: 'the_witcher_3_wild_hunt', price: { finalMoney: { amount: '29.99', currency: 'BRL' } } },
];
const gogResult = parseGogOffers(gogMulti, 'The Witcher 3: Wild Hunt');
equal(gogResult.length, 1);
equal(gogResult[0].finalPrice, 29.99);

const hypeProduct1 = { id: 1, name: 'Hades', platform: { name: 'Steam' }, link: '/br/hades', isAvailable: true, currentPrice: 20, originalPrice: 40, priceCurrency: 'BRL' };
const hypeProduct2 = { id: 2, name: 'Hades - Deluxe Edition', platform: { name: 'Steam' }, link: '/br/hades-deluxe', isAvailable: true, currentPrice: 35, originalPrice: 55, priceCurrency: 'BRL' };
const hypeHtml = `<product-card-component data-product="${JSON.stringify(hypeProduct1).replaceAll('"', '&quot;')}"></product-card-component><product-card-component data-product="${JSON.stringify(hypeProduct2).replaceAll('"', '&quot;')}"></product-card-component>`;
const hypeResult = parseHypeOffers(hypeHtml, 'Hades');
equal(hypeResult.length, 1);
equal(hypeResult[0].finalPrice, 20);

const ggHtml = `<div class="product--item" data-id="1" data-name="Celeste" data-price="15.00" data-currency="BRL" data-url="/pt/product/celeste/"><span class="catalog-item--full-price">R$ 30.00</span></div><div class="product--item" data-id="2" data-name="Celeste - Deluxe Edition" data-price="25.00" data-currency="BRL" data-url="/pt/product/celeste-deluxe/"><span class="catalog-item--full-price">R$ 50.00</span></div>`;
const ggResult = parseGamersGateOffers(ggHtml, 'Celeste');
equal(ggResult.length, 1);
equal(ggResult[0].finalPrice, 15.00);

const { resultToOffer } = await import(moduleUrl('lib/connectors/types.ts'));
const validOffer = {
  store: 'GOG',
  status: 'confirmed',
  offer: {
    price: 29.99,
    originalPrice: 25.00,
    currency: 'BRL',
    discount: 0,
    productUrl: 'https://www.gog.com/game/the_witcher_3',
    region: 'Brasil',
    available: true,
    verifiedAt: new Date(Date.now() + 5000).toISOString(),
  }
};
const parsedOffer = resultToOffer(validOffer);
equal(parsedOffer !== null, true);
equal(parsedOffer.finalPrice, 29.99);
equal(parsedOffer.originalPrice, 29.99);

db.sqlite.close();
Date.now = originalNow;
console.log(`connectors-history: ${checks} checks passed`);

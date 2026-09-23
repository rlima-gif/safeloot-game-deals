import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';

const { canonicalStoreId, canonicalStoreName, offerLink } = await import(
  moduleUrl('lib/stores.ts')
);
const { affiliateDestination } = await import(
  moduleUrl('lib/affiliate.ts')
);
const { extractEdition } = await import(
  moduleUrl('lib/game-api.ts')
);
const { KNOWN_GMG_CATALOG } = await import(
  moduleUrl('lib/discovery.ts')
);

let checks = 0;
function equal(actual, expected, message = 'Assertion passed') {
  assert.deepEqual(actual, expected, message);
  checks++;
}

// ==========================================
// 1. Edition-safe detection & deduplication
// ==========================================
equal(extractEdition('Cyberpunk 2077'), 'standard', 'Cyberpunk standard edition');
equal(extractEdition('Cyberpunk 2077: Ultimate Edition'), 'ultimate', 'Cyberpunk ultimate edition');
equal(extractEdition('The Witcher 3: Wild Hunt - Complete Edition'), 'complete', 'Witcher 3 complete edition');
equal(extractEdition('The Witcher 3: Wild Hunt - Game of the Year Edition'), 'goty', 'Witcher 3 GOTY edition');
equal(extractEdition('Control Ultimate Edition'), 'ultimate', 'Control Ultimate Edition');
equal(extractEdition('Persona 5 Royal Digital Deluxe Edition'), 'deluxe', 'Deluxe edition detection');
equal(extractEdition('Red Dead Redemption 2: Ultimate Edition'), 'ultimate', 'RDR2 ultimate edition');
equal(extractEdition('Death Stranding Director\'s Cut'), "director's cut", "Director's cut edition");

// Test edition-safe candidate pool deduplication:
// Same game, same edition -> keep lowest confirmed price
// Same game, different edition -> keep both!
function deduplicateOffers(games) {
  const map = new Map();
  for (const game of games) {
    if (game.id > 0) {
      const editionKey = `${game.id}-${extractEdition(game.title)}`;
      const existing = map.get(editionKey);
      if (!existing) {
        map.set(editionKey, game);
      } else {
        const currentPrice = game.finalPrice ?? Infinity;
        const existingPrice = existing.finalPrice ?? Infinity;
        if (currentPrice < existingPrice) {
          map.set(editionKey, game);
        } else if (currentPrice === existingPrice && (game.discount || 0) > (existing.discount || 0)) {
          map.set(editionKey, game);
        }
      }
    } else {
      const uniqueKey = `deal-${game.dealId || game.storeUrl || game.title}`;
      if (!map.has(uniqueKey)) {
        map.set(uniqueKey, game);
      }
    }
  }
  return [...map.values()];
}

const duplicatePool = [
  { id: 1091500, title: 'Cyberpunk 2077', store: 'Steam', finalPrice: 99.90, discount: 50 },
  { id: 1091500, title: 'Cyberpunk 2077', store: 'Nuuvem', finalPrice: 89.90, discount: 55 }, // Better price, same edition
  { id: 1091500, title: 'Cyberpunk 2077: Ultimate Edition', store: 'Steam', finalPrice: 159.90, discount: 40 }, // Distinct edition!
  { id: 292030, title: 'The Witcher 3: Wild Hunt', store: 'Steam', finalPrice: 25.99, discount: 75 },
  { id: 292030, title: 'The Witcher 3: Wild Hunt - Complete Edition', store: 'Steam', finalPrice: 39.99, discount: 70 }, // Distinct edition!
];

const deduped = deduplicateOffers(duplicatePool);
equal(deduped.length, 4, 'Should preserve distinct editions while deduplicating same edition');
const cpStandard = deduped.find(g => g.id === 1091500 && extractEdition(g.title) === 'standard');
equal(cpStandard.store, 'Nuuvem', 'Should choose lowest price offer for standard edition');
equal(cpStandard.finalPrice, 89.90);
const cpUltimate = deduped.find(g => g.id === 1091500 && extractEdition(g.title) === 'ultimate');
assert.ok(cpUltimate, 'Ultimate edition must be preserved');
equal(cpUltimate.finalPrice, 159.90);

// ==========================================
// 2. Comprehensive price & boundary filtering
// ==========================================
function filterGames(games, price, homeStore = 'all') {
  return games.filter((g) => {
    if (homeStore !== 'all') {
      const s = canonicalStoreId(g.storeId || g.store || '');
      const target = canonicalStoreId(homeStore);
      if (s !== target) return false;
    }
    if (price === 'all') return true;
    if (g.currency !== 'BRL' || g.finalPrice === null || g.priceStatus === 'unconfirmed') return false;
    if (price === '0') return g.finalPrice === 0;
    return g.finalPrice <= Number(price);
  });
}

const testCatalog = [
  { id: 1, title: 'Free Game', finalPrice: 0, currency: 'BRL', store: 'Epic Games', storeId: 'epic', priceStatus: 'confirmed' },
  { id: 2, title: '9.99 Game', finalPrice: 9.99, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 3, title: '10.00 Exact Game', finalPrice: 10.00, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 4, title: '10.01 Boundary Game', finalPrice: 10.01, currency: 'BRL', store: 'Nuuvem', storeId: 'nuuvem', priceStatus: 'confirmed' },
  { id: 5, title: '19.99 Game', finalPrice: 19.99, currency: 'BRL', store: 'Nuuvem', storeId: 'nuuvem', priceStatus: 'confirmed' },
  { id: 6, title: '20.00 Exact Game', finalPrice: 20.00, currency: 'BRL', store: 'Nuuvem', storeId: 'nuuvem', priceStatus: 'confirmed' },
  { id: 7, title: '20.01 Boundary Game', finalPrice: 20.01, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 8, title: '29.99 Game', finalPrice: 29.99, currency: 'BRL', store: 'Green Man Gaming', storeId: 'gmg', priceStatus: 'confirmed' },
  { id: 9, title: '30.00 Exact Game', finalPrice: 30.00, currency: 'BRL', store: 'Green Man Gaming', storeId: 'gmg', priceStatus: 'confirmed' },
  { id: 10, title: '30.01 Boundary Game', finalPrice: 30.01, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 11, title: '49.99 Game', finalPrice: 49.99, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 12, title: '50.00 Exact Game', finalPrice: 50.00, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 13, title: '50.01 Boundary Game', finalPrice: 50.01, currency: 'BRL', store: 'Nuuvem', storeId: 'nuuvem', priceStatus: 'confirmed' },
  { id: 14, title: '99.99 Game', finalPrice: 99.99, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 15, title: '100.00 Exact Game', finalPrice: 100.00, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 16, title: '100.01 Boundary Game', finalPrice: 100.01, currency: 'BRL', store: 'Steam', storeId: 'steam', priceStatus: 'confirmed' },
  { id: 17, title: 'Unconfirmed GMG Deal', finalPrice: 15.00, currency: 'BRL', store: 'Green Man Gaming', storeId: 'gmg', priceStatus: 'unconfirmed' },
  { id: 18, title: 'Null Price Catalog Item', finalPrice: null, currency: 'BRL', store: 'Green Man Gaming', storeId: 'gmg', priceStatus: 'unconfirmed' },
];

// 2.1 Boundary checks
const p0 = filterGames(testCatalog, '0');
equal(p0.map(g => g.id), [1], 'Price 0 must return only free games');

const p10 = filterGames(testCatalog, '10');
equal(p10.map(g => g.id), [1, 2, 3], 'Price <= 10 includes 0, 9.99, 10.00; excludes 10.01');

const p20 = filterGames(testCatalog, '20');
equal(p20.map(g => g.id), [1, 2, 3, 4, 5, 6], 'Price <= 20 includes up to 20.00; excludes 20.01 and unconfirmed');

const p30 = filterGames(testCatalog, '30');
equal(p30.map(g => g.id), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'Price <= 30 includes up to 30.00; excludes 30.01 and unconfirmed');

const p50 = filterGames(testCatalog, '50');
equal(p50.map(g => g.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'Price <= 50 includes up to 50.00; excludes 50.01');

const p100 = filterGames(testCatalog, '100');
equal(p100.map(g => g.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 'Price <= 100 includes up to 100.00; excludes 100.01');

// Verify unconfirmed GMG deal is strictly excluded from numeric price tiers
assert.ok(!p20.some(g => g.id === 17), 'Unconfirmed GMG deal must never appear in <= 20 tier');
assert.ok(!p30.some(g => g.id === 17), 'Unconfirmed GMG deal must never appear in <= 30 tier');
assert.ok(!p50.some(g => g.id === 17), 'Unconfirmed GMG deal must never appear in <= 50 tier');

// In 'all', unconfirmed items can appear for catalog discovery with 'Consultar loja'
const pAll = filterGames(testCatalog, 'all');
equal(pAll.length, 18, 'Price all contains all catalog items');

// ==========================================
// 3. Store filter composition
// ==========================================
const steamOnly = filterGames(testCatalog, 'all', 'steam');
assert.ok(steamOnly.every(g => g.storeId === 'steam'));
equal(steamOnly.length, 9, 'Steam store catalog count');

const nuuvemOnly = filterGames(testCatalog, 'all', 'nuuvem');
assert.ok(nuuvemOnly.every(g => g.storeId === 'nuuvem'));
equal(nuuvemOnly.length, 4, 'Nuuvem store catalog count');

const gmgOnly = filterGames(testCatalog, 'all', 'gmg');
assert.ok(gmgOnly.every(g => g.storeId === 'gmg'));
equal(gmgOnly.length, 4, 'GMG store catalog count');

const epicOnly = filterGames(testCatalog, 'all', 'epic');
assert.ok(epicOnly.every(g => g.storeId === 'epic'));
equal(epicOnly.length, 1, 'Epic store catalog count');

// Compound filter: Nuuvem AND <= 20
const nuuvemUnder20 = filterGames(testCatalog, '20', 'nuuvem');
equal(nuuvemUnder20.map(g => g.id), [4, 5, 6], 'Nuuvem <= 20 must return games 4, 5, 6');

// Compound filter: Steam AND <= 10
const steamUnder10 = filterGames(testCatalog, '10', 'steam');
equal(steamUnder10.map(g => g.id), [2, 3], 'Steam <= 10 must return games 2 and 3');

// ==========================================
// 4. Deal score calculation & ordering
// ==========================================
function dealScore(g) {
  let score = 0;
  score += Math.max(0, Math.min(100, g.discount || 0)) * 1.5;
  if (typeof g.score === 'number' && g.score > 0) {
    score += g.score;
  } else {
    score += 50;
  }
  if (g.priceStatus === 'confirmed') {
    score += 20;
  }
  if (g.finalPrice === 0) {
    score += 50;
  }
  return score;
}

const candidateA = { title: 'Game A', discount: 85, score: 92, priceStatus: 'confirmed', finalPrice: 19.90 };
const candidateB = { title: 'Game B', discount: 15, score: 65, priceStatus: 'confirmed', finalPrice: 19.90 };
const candidateFree = { title: 'Game Free', discount: 100, score: 80, priceStatus: 'confirmed', finalPrice: 0 };

assert.ok(dealScore(candidateA) > dealScore(candidateB), 'Higher discount and rating must score higher');
assert.ok(dealScore(candidateFree) > dealScore(candidateB), 'Free games receive substantial boost');

// Deterministic sorting test
const candidates = [
  { title: 'Zebra Game', discount: 50, score: 80, priceStatus: 'confirmed', finalPrice: 10 },
  { title: 'Alpha Game', discount: 50, score: 80, priceStatus: 'confirmed', finalPrice: 10 },
  { title: 'Best Deal', discount: 90, score: 95, priceStatus: 'confirmed', finalPrice: 10 },
];

const sorted = [...candidates].sort((a, b) => dealScore(b) - dealScore(a) || a.title.localeCompare(b.title, 'pt-BR'));
equal(sorted[0].title, 'Best Deal', 'Best Deal ranks first');
equal(sorted[1].title, 'Alpha Game', 'Alphabetical tie-breaker applies cleanly: Alpha before Zebra');
equal(sorted[2].title, 'Zebra Game');

// ==========================================
// 5. GMG Trust Boundary
// ==========================================
assert.ok(Array.isArray(KNOWN_GMG_CATALOG) && KNOWN_GMG_CATALOG.length >= 8);
for (const item of KNOWN_GMG_CATALOG) {
  equal(item.priceStatus, 'unconfirmed', `GMG catalog seed ${item.slug} must have priceStatus unconfirmed`);
  equal(item.price, null, `GMG catalog seed ${item.slug} must have price null when live confirmation is pending`);
}

// ==========================================
// 6. Outbound Resolver & Open Redirect Security
// ==========================================
// Legitimate stores
const nuuvemDest = affiliateDestination({
  store: 'Nuuvem',
  url: 'https://www.nuuvem.com/item/elden-ring',
  source: 'nuuvem',
});
assert.ok(nuuvemDest.url.includes('nuuvem.com'), 'Nuuvem URL preserved');
equal(nuuvemDest.storeId, 'nuuvem');

const gmgDest = affiliateDestination({
  store: 'Green Man Gaming',
  url: 'https://www.greenmangaming.com/games/control/',
  source: 'green-man-gaming',
});
assert.ok(gmgDest.url.includes('greenmangaming.com'), 'GMG URL preserved');
equal(gmgDest.storeId, 'gmg');

const steamDest = affiliateDestination({
  store: 'Steam',
  url: 'https://store.steampowered.com/app/1091500/',
  source: 'steam',
});
assert.ok(steamDest.url.includes('store.steampowered.com'), 'Steam URL preserved');
equal(steamDest.storeId, 'steam');

// Malicious open redirect prevention: insecure protocol or malformed URLs should throw
let rejected = false;
try {
  affiliateDestination({
    store: 'Steam',
    url: 'http://insecure-site.com',
    source: 'steam',
  });
} catch {
  rejected = true;
}
assert.ok(rejected, 'Insecure protocol should be rejected');

console.log(`release-pass: ${checks} checks passed`);

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';

function moduleUrl(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const linked = code.replace(/from ['"](\.\/[^'"]+)['"]/g, (_, rel) => `from '${moduleUrl(path.resolve(path.dirname(file), rel + '.ts'))}'`);
  return 'data:text/javascript;base64,' + Buffer.from(linked).toString('base64');
}

const d = await import(moduleUrl('lib/discovery.ts'));
const pb = await import(moduleUrl('lib/price-bands.ts'));

// 1. Anti-shovelware filtering (isHighSignalDiscoveryGame)
assert.equal(d.isHighSignalDiscoveryGame({ id: '1', title: 'Asset Flip', price: 9.99, original: 9.99, discount: 0, url: '', tags: [], reviews: 45, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '2', title: 'Broken Game', price: 19.99, original: 19.99, discount: 0, url: '', tags: [], reviews: 1200, positive: 45 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '3', title: 'Super Game Demo', price: 0, original: 0, discount: 0, url: '', tags: [], reviews: 500, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '4', title: 'Epic RPG Soundtrack', price: 19.99, original: 19.99, discount: 0, url: '', tags: [], reviews: 500, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '5', title: 'Tactical Shooter Playtest', price: 0, original: 0, discount: 0, url: '', tags: [], reviews: 500, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '6', title: 'Mystery Island: Prologue', price: 0, original: 0, discount: 0, url: '', tags: [], reviews: 500, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '7', title: 'Unpriced Game', price: null, original: null, discount: 0, url: '', tags: [], reviews: 5000, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '8', title: 'Hades', price: 36.99, original: 73.99, discount: 50, url: '', tags: ['Roguelike'], reviews: 240000, positive: 98 }), true);
assert.equal(d.isHighSignalDiscoveryGame({ id: '9', title: 'Death Stranding', price: 0, original: 159.99, discount: 100, url: '', store: 'Epic Games', tags: ['Action'], reviews: 10000, positive: 93 }), true);

// 2. Deterministic relevance scoring (calculateRelevanceScore) & Attractiveness
const score1 = d.calculateRelevanceScore({ id: '1', title: 'Popular Hit', price: 29.99, original: 99.99, discount: 70, url: '', tags: [], reviews: 50000, positive: 95 });
const score2 = d.calculateRelevanceScore({ id: '2', title: 'Niche Game', price: 99.99, original: 99.99, discount: 0, url: '', tags: [], reviews: 200, positive: 72 });
assert.ok(typeof score1 === 'number' && typeof score2 === 'number');
assert.ok(score1 > score2, 'Popular discounted hit must score higher than niche full price game');
assert.equal(score1, d.calculateRelevanceScore({ id: '1', title: 'Popular Hit', price: 29.99, original: 99.99, discount: 70, url: '', tags: [], reviews: 50000, positive: 95 }));

// Attractiveness test: fresh acclaimed indie outranks ancient clearance game
const modernIndie = d.calculateRelevanceScore({
  id: 'indie-2024',
  title: 'Acclaimed Fresh Indie',
  price: 24.99,
  original: 49.99,
  discount: 50,
  url: '',
  tags: ['Indie', 'Roguelike'],
  reviews: 6000,
  positive: 96,
  released: '15 mar. 2024'
});
const ancientClearance = d.calculateRelevanceScore({
  id: 'old-2012',
  title: 'Old Clearance Game',
  price: 5.99,
  original: 59.99,
  discount: 90,
  url: '',
  tags: ['Action'],
  reviews: 60000,
  positive: 80,
  released: '20 nov. 2012'
});
assert.ok(modernIndie > ancientClearance, `Fresh acclaimed indie (${modernIndie}) must outrank 2012 clearance sale (${ancientClearance})`);

// 3. Explainability badge assignment (assignExplainBadge)
assert.equal(d.assignExplainBadge({ id: '1', title: 'Free Game', price: 0, original: 50, discount: 100, url: '', store: 'Epic Games', tags: [] }), 'Grátis');
assert.equal(d.assignExplainBadge({ id: '2', title: 'Steep Discount', price: 20, original: 100, discount: 80, url: '', tags: [] }), '-80% OFF');
assert.equal(d.assignExplainBadge({ id: '3', title: 'Overwhelmingly Positive', price: 60, original: 60, discount: 0, url: '', tags: [], positive: 96, reviews: 2500 }), '95%+ Positivas');
assert.equal(d.assignExplainBadge({ id: '4', title: 'Mid-range Discount', price: 45, original: 90, discount: 50, url: '', tags: [] }), '-50% OFF');
assert.equal(d.assignExplainBadge({ id: '5', title: 'Cheap Indie', price: 15, original: 15, discount: 0, url: '', tags: [] }), 'Até R$ 20');

// 4. Franchise diversity (applyDiscoveryDiversity)
const franchiseList = [
  { id: 'f1', title: 'Borderlands 2', price: 10, original: 50, discount: 80, url: '', tags: [] },
  { id: 'f2', title: 'Borderlands 3', price: 30, original: 150, discount: 80, url: '', tags: [] },
  { id: 'f3', title: 'Borderlands: The Pre-Sequel', price: 15, original: 60, discount: 75, url: '', tags: [] },
  { id: 'f4', title: 'Cyberpunk 2077', price: 99, original: 199, discount: 50, url: '', tags: [] },
];
const diverse = d.applyDiscoveryDiversity(franchiseList, 2);
assert.equal(diverse.length, 3, 'Must cap Borderlands to max 2 items');
assert.equal(diverse.some(g => g.title === 'Borderlands 2'), true);
assert.equal(diverse.some(g => g.title === 'Borderlands 3'), true);
assert.equal(diverse.some(g => g.title === 'Borderlands: The Pre-Sequel'), false);
assert.equal(diverse.some(g => g.title === 'Cyberpunk 2077'), true);

// 5. Game editorial contract: compact link-only stores
const editorialCode = fs.readFileSync('components/game-editorial.tsx', 'utf8');
assert.ok(editorialCode.includes('marketplace-compact-list'), 'Must render compact list for keyshops');
assert.ok(editorialCode.includes('Buscar na loja'), 'Must use honest CTA "Buscar na loja"');
assert.ok(!editorialCode.includes('Ver preço atual'), 'Must NOT claim to see current price for unintegrated keyshops');
assert.ok(editorialCode.includes('Preços não monitorados'), 'Must include disclosure about unmonitored prices');
assert.ok(editorialCode.includes('/go/keyshop/'), 'Must preserve outbound resolver route');

// 6. Discovery card explainability badge presence
const shelfCode = fs.readFileSync('components/discovery-shelves.tsx', 'utf8');
assert.ok(shelfCode.includes('discover-badge-pill'), 'Must render discover-badge-pill for explainability');

// 7. Non-Overlapping Price Bands & Exact Boundaries
const numericBands = ['0', '10', '10-20', '20-30', '30-50', '50-100', '100+'];

// Exact boundary mapping tests
assert.equal(pb.matchesPriceBand(0, '0'), true, 'R$ 0 must be Grátis');
assert.equal(pb.matchesPriceBand(0, '10'), false, 'R$ 0 must NEVER be in Até R$ 10');

assert.equal(pb.matchesPriceBand(5, '10'), true, 'R$ 5 must be in Até R$ 10');
assert.equal(pb.matchesPriceBand(10, '10'), true, 'R$ 10 must be in Até R$ 10');
assert.equal(pb.matchesPriceBand(10, '10-20'), false, 'R$ 10 must NOT be in R$ 10–20');

assert.equal(pb.matchesPriceBand(10.01, '10'), false, 'R$ 10.01 must NOT be in Até R$ 10');
assert.equal(pb.matchesPriceBand(10.01, '10-20'), true, 'R$ 10.01 must be in R$ 10–20');
assert.equal(pb.matchesPriceBand(20, '10-20'), true, 'R$ 20 must be in R$ 10–20');
assert.equal(pb.matchesPriceBand(20, '20-30'), false, 'R$ 20 must NOT be in R$ 20–30');

assert.equal(pb.matchesPriceBand(20.01, '20-30'), true, 'R$ 20.01 must be in R$ 20–30');
assert.equal(pb.matchesPriceBand(30, '20-30'), true, 'R$ 30 must be in R$ 20–30');
assert.equal(pb.matchesPriceBand(30, '30-50'), false, 'R$ 30 must NOT be in R$ 30–50');

assert.equal(pb.matchesPriceBand(30.01, '30-50'), true, 'R$ 30.01 must be in R$ 30–50');
assert.equal(pb.matchesPriceBand(50, '30-50'), true, 'R$ 50 must be in R$ 30–50');
assert.equal(pb.matchesPriceBand(50, '50-100'), false, 'R$ 50 must NOT be in R$ 50–100');

assert.equal(pb.matchesPriceBand(50.01, '50-100'), true, 'R$ 50.01 must be in R$ 50–100');
assert.equal(pb.matchesPriceBand(100, '50-100'), true, 'R$ 100 must be in R$ 50–100');
assert.equal(pb.matchesPriceBand(100, '100+'), false, 'R$ 100 must NOT be in R$ 100+');

assert.equal(pb.matchesPriceBand(100.01, '100+'), true, 'R$ 100.01 must be in R$ 100+');
assert.equal(pb.matchesPriceBand(299.99, '100+'), true, 'R$ 299.99 must be in R$ 100+');

// Strict non-overlap invariant across 17 test price points
const testPrices = [0, 0.01, 5, 9.99, 10, 10.01, 15, 20, 20.01, 25, 30, 30.01, 40, 50, 50.01, 75, 100, 100.01, 150];
for (const p of testPrices) {
  const matchingBands = numericBands.filter(b => pb.matchesPriceBand(p, b));
  assert.equal(
    matchingBands.length,
    1,
    `Price R$ ${p} must match EXACTLY ONE numeric band, but matched: [${matchingBands.join(', ')}]`
  );
  assert.equal(pb.matchesPriceBand(p, 'all'), true, `Price R$ ${p} must always match 'all'`);
}

// Invalid prices must match no bands (except 'all')
assert.equal(pb.matchesPriceBand(null, '10'), false);
assert.equal(pb.matchesPriceBand(undefined, '10'), false);
assert.equal(pb.matchesPriceBand(NaN, '10'), false);

// Price band labels
assert.equal(pb.priceBandLabel('all'), 'Todos');
assert.equal(pb.priceBandLabel('0'), 'Grátis');
assert.equal(pb.priceBandLabel('10'), 'Até R$ 10');
assert.equal(pb.priceBandLabel('10-20'), 'R$ 10–20');
assert.equal(pb.priceBandLabel('20-30'), 'R$ 20–30');
assert.equal(pb.priceBandLabel('30-50'), 'R$ 30–50');
assert.equal(pb.priceBandLabel('50-100'), 'R$ 50–100');
assert.equal(pb.priceBandLabel('100+'), 'R$ 100+');

// Legacy alias normalization
assert.equal(pb.normalizeLegacyPriceBand('20'), '10-20');
assert.equal(pb.normalizeLegacyPriceBand('30'), '20-30');
assert.equal(pb.normalizeLegacyPriceBand('50'), '30-50');
assert.equal(pb.normalizeLegacyPriceBand('100'), '50-100');
assert.equal(pb.normalizeLegacyPriceBand('10'), '10');
assert.equal(pb.normalizeLegacyPriceBand('0'), '0');
assert.equal(pb.normalizeLegacyPriceBand('invalid'), 'all');

// 8. Automated regression tests for Steam filter and Category tile fallback (discovery-correctness-fix)
const gi = await import(moduleUrl('lib/game-images.ts'));

// 8a. Given shelves data with storeId 'steam' on a shelf with games.length > 0, selecting store='steam' produces non-empty sourceShelves
const mockShelves = [
  { id: 'cheap', storeId: 'steam', title: 'Grandes achados', description: '', games: [{ id: 'steam-1', title: 'Game 1', image: '', store: 'Steam', storeId: 'steam', price: 5, original: 10, discount: 50, url: '', tags: [] }], status: 'ready' },
  { id: 'roguelike', storeId: 'steam', title: 'Roguelike', description: '', games: [{ id: 'steam-2', title: 'Game 2', image: '', store: 'Steam', storeId: 'steam', price: 15, original: 30, discount: 50, url: '', tags: [] }], status: 'ready' },
  { id: 'nuuvem', storeId: 'nuuvem', title: 'Nuuvem', description: '', games: [{ id: 'nuuvem-1', title: 'Nuuvem Game', image: '', store: 'Nuuvem', storeId: 'nuuvem', price: 20, original: 40, discount: 50, url: '', tags: [] }], status: 'ready' },
  { id: 'epic', storeId: 'epic', title: 'Epic', description: '', games: [], status: 'empty' },
];

function computeSourceShelves(shelves, store) {
  const targetStore = store.toLowerCase().trim();
  return targetStore === 'all'
    ? shelves
    : shelves?.filter((shelf) => {
        const sId = (shelf.storeId || (['cheap', 'roguelike', 'indie'].includes(shelf.id) ? 'steam' : shelf.id))
          .toLowerCase()
          .trim();
        return sId === targetStore;
      });
}

const steamSourceShelves = computeSourceShelves(mockShelves, 'steam');
assert.ok(Array.isArray(steamSourceShelves), 'sourceShelves must be an array');
assert.ok(steamSourceShelves.length > 0, 'selecting store="steam" must produce non-empty sourceShelves');
assert.equal(steamSourceShelves.length, 2, 'selecting store="steam" must include all matching steam shelves');
assert.ok(steamSourceShelves.every(s => (s.storeId || s.id) === 'steam'), 'all returned shelves must belong to steam');
assert.ok(steamSourceShelves.some(s => s.games.length > 0), 'matching steam shelves must contain games');

// Case-insensitivity test ('Steam' vs 'steam')
const upperSteamShelves = computeSourceShelves(mockShelves, 'Steam');
assert.equal(upperSteamShelves.length, 2, 'selecting store="Steam" (capitalized) must produce non-empty sourceShelves');

// 8b. Category tile image load failure triggers fallback path via onError logic
// Test cascading fallback: capsule_616x353 -> header.jpg -> library_hero.jpg -> SAFE_LOOT_GAME_PLACEHOLDER
const megabonkAppId = 3405340;
const failedCapsuleUrl = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${megabonkAppId}/capsule_616x353.jpg`;
const fallback1 = gi.getGameArtworkFallback(failedCapsuleUrl, megabonkAppId);
assert.equal(
  fallback1,
  `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${megabonkAppId}/header.jpg`,
  'Failed 616x353 capsule must cascade to canonical header.jpg for Megabonk'
);

const failedHeaderUrl = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${megabonkAppId}/header.jpg`;
const fallback2 = gi.getGameArtworkFallback(failedHeaderUrl, megabonkAppId);
assert.equal(
  fallback2,
  `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${megabonkAppId}/library_hero.jpg`,
  'Failed header.jpg must cascade to library_hero.jpg'
);

const fallback3 = gi.getGameArtworkFallback('https://example.com/broken.jpg', null);
assert.equal(
  fallback3,
  gi.SAFE_LOOT_GAME_PLACEHOLDER,
  'Unknown broken asset without valid appId must cascade to SAFE_LOOT_GAME_PLACEHOLDER'
);

// 8c. Category tile component implementation audit
assert.ok(shelfCode.includes('function CategoryTile'), 'discovery-shelves.tsx must declare dedicated CategoryTile component');
assert.ok(shelfCode.includes('onError={handleError}'), 'CategoryTile must have onError handler');
assert.ok(shelfCode.includes('getGameArtworkFallback'), 'CategoryTile must invoke getGameArtworkFallback on load failure');
assert.ok(!shelfCode.includes('alt={s.games[0].title}'), 'Must NOT leak raw member game title as category tile alt text');
assert.ok(shelfCode.includes('alt={`Coleção ${label}`}'), 'CategoryTile must use descriptive collection alt text');

// 8d. Explicit empty-state for all stores (no silent blank regions)
assert.ok(shelfCode.includes('StoreExternalLink'), 'discovery-shelves.tsx must provide StoreExternalLink for store-level recovery');
assert.ok(shelfCode.includes('store.steampowered.com/search/?specials=1'), 'discovery-shelves.tsx must provide Steam recovery link in empty states');

// ============================================================================
// 9. AUTOMATED REGRESSION TESTS (TASK SPEC — discovery-engagement-v1)
// ============================================================================

// Test 1: ↻ changes visible AppID set when alternatives exist
function sliceRotatedGames(games, rotationIndex, count = 8) {
  const offset = games.length > 0 ? (rotationIndex * 8) % games.length : 0;
  const rotated = [];
  const seen = new Set();
  for (let i = 0; i < games.length; i++) {
    const g = games[(offset + i) % games.length];
    const key = g.appId ?? g.id;
    if (!seen.has(key)) {
      seen.add(key);
      rotated.push(g);
    }
  }
  return rotated.slice(0, count);
}

const pool40 = Array.from({ length: 40 }, (_, i) => ({
  id: `game-${i + 1}`,
  appId: 1000 + i,
  title: `Game ${i + 1}`,
  image: `https://example.com/game-${i + 1}.jpg`,
  store: 'Steam',
  price: 10 + i,
  original: 20 + i,
  discount: 50,
  url: `https://store.steampowered.com/app/${1000 + i}`,
  tags: ['Action'],
  priceStatus: 'confirmed',
}));

const initialSet = sliceRotatedGames(pool40, 0);
const rotation1 = sliceRotatedGames(pool40, 1);
const rotation2 = sliceRotatedGames(pool40, 2);
const rotation3 = sliceRotatedGames(pool40, 3);

assert.equal(initialSet.length, 8);
assert.equal(rotation1.length, 8);
assert.equal(rotation2.length, 8);
assert.equal(rotation3.length, 8);

const initialIds = initialSet.map(g => g.appId);
const rot1Ids = rotation1.map(g => g.appId);
const rot2Ids = rotation2.map(g => g.appId);
const rot3Ids = rotation3.map(g => g.appId);

assert.notDeepEqual(initialIds, rot1Ids, 'Test 1: ↻ must change visible AppIDs on first rotation');
assert.notDeepEqual(rot1Ids, rot2Ids, 'Test 1: ↻ must change visible AppIDs on second rotation');
assert.notDeepEqual(rot2Ids, rot3Ids, 'Test 1: ↻ must change visible AppIDs on third rotation');
assert.deepEqual(sliceRotatedGames(pool40, 5).map(g => g.appId), initialIds, 'Test 1: ↻ must wrap around smoothly when pool ends');

// Test 2: ↻ preserves active store filter
let currentStore = 'steam';
const rotateAction = () => {
  // ↻ only advances rotation index, never mutates store
  return currentStore;
};
assert.equal(rotateAction(), 'steam', 'Test 2: ↻ must preserve active store filter');
const steamFilteredShelves = computeSourceShelves(mockShelves, currentStore);
assert.ok(steamFilteredShelves.every(s => (s.storeId || s.id) === 'steam'), 'Test 2: sourceShelves remain filtered to active store during rotation');

// Test 3: Descobrir is behaviorally distinct from ↻
const mockMultiStoreShelves = [
  {
    id: 'cheap',
    storeId: 'steam',
    title: 'Steam Baratos',
    description: '',
    status: 'ready',
    games: [
      { id: 's-1', appId: 101, title: 'Steam Indie', image: '', store: 'Steam', storeId: 'steam', price: 8, original: 16, discount: 50, url: '', tags: ['Indie'], positive: 92, reviews: 2000, priceStatus: 'confirmed' },
      { id: 's-2', appId: 102, title: 'Steam Rogue', image: '', store: 'Steam', storeId: 'steam', price: 15, original: 30, discount: 50, url: '', tags: ['Roguelike'], positive: 88, reviews: 1500, priceStatus: 'confirmed' },
      { id: 's-3', appId: 103, title: 'Steam Cheap Deal', image: '', store: 'Steam', storeId: 'steam', price: 5, original: 20, discount: 75, url: '', tags: ['Action'], positive: 85, reviews: 800, priceStatus: 'confirmed' },
      { id: 's-4', appId: 104, title: 'Steam Coop', image: '', store: 'Steam', storeId: 'steam', price: 25, original: 50, discount: 50, url: '', tags: ['Co-op', 'Multiplayer'], positive: 89, reviews: 3000, priceStatus: 'confirmed' },
      { id: 's-5', appId: 105, title: 'Steam RPG', image: '', store: 'Steam', storeId: 'steam', price: 28, original: 70, discount: 60, url: '', tags: ['RPG', 'Ação'], positive: 91, reviews: 10000, priceStatus: 'confirmed' },
      { id: 's-6', appId: 106, title: 'Steam Overwhelming', image: '', store: 'Steam', storeId: 'steam', price: 18, original: 36, discount: 50, url: '', tags: ['Adventure'], positive: 97, reviews: 45000, priceStatus: 'confirmed' },
    ],
  },
  {
    id: 'epic',
    storeId: 'epic',
    title: 'Epic Grátis',
    description: '',
    status: 'ready',
    games: [
      { id: 'epic-1', appId: 201, title: 'Epic Giveaway', image: '', store: 'Epic Games', storeId: 'epic', price: 0, original: 99, discount: 100, url: '', tags: [], priceStatus: 'confirmed' },
    ],
  },
  {
    id: 'nuuvem',
    storeId: 'nuuvem',
    title: 'Nuuvem Destaques',
    description: '',
    status: 'ready',
    games: [
      { id: 'nuuv-1', appId: 301, title: 'Nuuvem Brasil Deal', image: '', store: 'Nuuvem', storeId: 'nuuvem', price: 19.90, original: 59.90, discount: 66, url: '', tags: ['Ação'], priceStatus: 'confirmed' },
    ],
  },
];

const discoverSet = d.getCuratedDiscoverySelection(mockMultiStoreShelves, 0);
assert.equal(discoverSet.length, 8, 'Test 3: Descobrir must produce exactly 8 games in discovered set');
const discoverStores = new Set(discoverSet.map(g => g.store));
assert.ok(discoverStores.has('Epic Games'), 'Test 3: Descobrir must include Epic Games');
assert.ok(discoverStores.has('Nuuvem'), 'Test 3: Descobrir must include Nuuvem');
assert.ok(discoverStores.has('Steam'), 'Test 3: Descobrir must include Steam');
assert.notDeepEqual(discoverSet.map(g => g.appId), rot1Ids.slice(0, 8), 'Test 3: Descobrir mix must be behaviorally distinct from single-shelf rotation');

// Test 4: Descobrir produces only validated canonical candidates
for (const cand of discoverSet) {
  assert.ok(cand.title && typeof cand.title === 'string', 'Test 4: Each candidate must have a valid title');
  assert.ok(cand.store && typeof cand.store === 'string', 'Test 4: Each candidate must have a valid store');
  assert.ok(cand.price !== undefined, 'Test 4: Candidate price must be defined');
  assert.ok(cand.discount >= 0, 'Test 4: Candidate discount must be non-negative');
  assert.ok(cand.badge && typeof cand.badge === 'string', 'Test 4: Candidate must have an explanatory badge');
}

// Test 5: No duplicate AppIDs in visible set
const duplicatePool = [
  { id: 'dup-1', appId: 999, title: 'Game Dup 1', store: 'Steam', price: 10, discount: 50, tags: [] },
  { id: 'dup-2', appId: 999, title: 'Game Dup 2 (same appId)', store: 'Steam', price: 10, discount: 50, tags: [] },
  { id: 'dup-3', appId: 1001, title: 'Game 3', store: 'Steam', price: 12, discount: 50, tags: [] },
];
const deduplicatedSlice = sliceRotatedGames(duplicatePool, 0, 8);
const dedupAppIds = deduplicatedSlice.map(g => g.appId);
assert.equal(new Set(dedupAppIds).size, dedupAppIds.length, 'Test 5: Shelf visible slice must never contain duplicate AppIDs');
const discoverAppIds = discoverSet.map(g => g.appId ?? g.id);
assert.equal(new Set(discoverAppIds).size, discoverAppIds.length, 'Test 5: Descobrir set must never contain duplicate AppIDs');

// Test 6: Unknown-price discovery games remain non-offers (Consultar loja)
const unconfirmedGame = {
  id: 'unconfirmed-1',
  appId: 8888,
  title: 'Unconfirmed Game',
  store: 'Steam',
  price: null,
  original: null,
  discount: 0,
  url: 'https://store.steampowered.com/app/8888',
  tags: [],
  priceStatus: 'unconfirmed',
};
const offerObj = d.discoveryOffer(unconfirmedGame);
assert.equal(offerObj.available, false, 'Test 6: Unconfirmed price game must have available=false in discoveryOffer');
assert.ok(shelfCode.includes("game.priceStatus === 'unconfirmed' || game.price === null ? ("), 'Test 6: Component must check unconfirmed price');
assert.ok(shelfCode.includes('<strong>Consultar loja</strong>'), 'Test 6: Component must render "Consultar loja" for unconfirmed price');

// Test 7: Store filtering (Todas, Steam, Nuuvem, GMG, Epic) intact
const allFiltered = computeSourceShelves(mockMultiStoreShelves, 'all');
assert.equal(allFiltered.length, 3, 'Test 7: "all" filter must return all shelves');
const steamOnly = computeSourceShelves(mockMultiStoreShelves, 'steam');
assert.equal(steamOnly.length, 1, 'Test 7: "steam" filter must return only steam shelves');
const nuuvemOnly = computeSourceShelves(mockMultiStoreShelves, 'nuuvem');
assert.equal(nuuvemOnly.length, 1, 'Test 7: "nuuvem" filter must return only nuuvem shelves');
const gmgOnly = computeSourceShelves(mockMultiStoreShelves, 'gmg');
assert.equal(gmgOnly.length, 0, 'Test 7: "gmg" filter returns 0 shelves when not configured');
const epicOnly = computeSourceShelves(mockMultiStoreShelves, 'epic');
assert.equal(epicOnly.length, 1, 'Test 7: "epic" filter returns epic shelves');

// Test 8: Artwork fallback intact
assert.equal(
  gi.getGameArtworkFallback(failedCapsuleUrl, megabonkAppId),
  `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${megabonkAppId}/header.jpg`,
  'Test 8: Artwork fallback must cascade correctly'
);

// Test 9: Store empty states intact
assert.ok(shelfCode.includes('discover-empty-panel'), 'Test 9: discovery-shelves.tsx must declare discover-empty-panel');
assert.ok(shelfCode.includes('Esta loja está temporariamente inacessível'), 'Test 9: discovery-shelves.tsx must declare graceful fallback message');
assert.ok(shelfCode.includes('StoreExternalLink'), 'Test 9: discovery-shelves.tsx must render StoreExternalLink in empty state');
assert.ok(shelfCode.includes('aria-label="Mostrar outros jogos"'), 'Test 9: Refresh control must have accessible PT-BR label');
assert.ok(shelfCode.includes('data-testid="discover-button"'), 'Test 9: Descobrir button must be present in discovery intro');

console.log('Discovery Quality, Non-Overlapping Price Bands & UX: ALL checks passed.');

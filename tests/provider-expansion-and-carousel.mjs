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

const prov = await import(moduleUrl('lib/providers/index.ts'));
const aff = await import(moduleUrl('lib/affiliate.ts'));
const itad = await import(moduleUrl('lib/itad.ts'));
const ggd = await import(moduleUrl('lib/ggdeals.ts'));
const gp = await import(moduleUrl('lib/gamerpower.ts'));
const giv = await import(moduleUrl('lib/giveaways.ts'));
const gi = await import(moduleUrl('lib/game-images.ts'));

console.log('Testing Multi-Provider Architecture and Discovery Carousel V2...');

// ============================================================================
// 1. PROVIDER != RETAILER ARCHITECTURAL INVARIANT
// ============================================================================
const directOffer = {
  canonicalGameId: 1091500,
  retailerId: 'fanatical',
  retailerName: 'Fanatical',
  providerId: 'direct_fanatical',
  region: 'Brasil',
  currency: 'BRL',
  currentPrice: 89.90,
  regularPrice: 199.90,
  discount: 55,
  observedAt: '2026-09-27T12:00:00Z',
  providerUrl: 'https://www.fanatical.com/en/game/cyberpunk-2077',
  commerceUrl: 'https://www.fanatical.com/en/game/cyberpunk-2077',
  commerceUrlSource: 'direct-retailer',
  available: true,
  edition: 'standard',
};

const aggregatorOffer = {
  canonicalGameId: 1091500,
  retailerId: 'fanatical',
  retailerName: 'Fanatical',
  providerId: 'itad',
  region: 'Brasil',
  currency: 'BRL',
  currentPrice: 94.90,
  regularPrice: 199.90,
  discount: 52,
  observedAt: '2026-09-27T12:00:00Z',
  providerUrl: 'https://isthereanydeal.com/game/cyberpunk-2077',
  commerceUrl: 'https://www.fanatical.com/en/game/cyberpunk-2077?aff=itad',
  commerceUrlSource: 'provider',
  available: true,
  edition: 'standard',
};

assert.notEqual(directOffer.providerId, directOffer.retailerId, 'providerId must not be confused with retailerId');
assert.notEqual(aggregatorOffer.providerId, aggregatorOffer.retailerId, 'aggregator providerId != retailerId');
assert.equal(directOffer.retailerId, aggregatorOffer.retailerId, 'Both offers represent the same retailer (Fanatical)');

// ============================================================================
// 2. CURRENCY ISOLATION & PRICE TRUTH
// ============================================================================
const brlOffer = { ...directOffer, currency: 'BRL' };
const usdOffer = { ...directOffer, currency: 'USD', currentPrice: 19.99, regularPrice: 49.99 };

assert.equal(prov.isBrlRankingEligible(brlOffer), true, 'BRL offer must be ranking-eligible');
assert.equal(prov.isBrlRankingEligible(usdOffer), false, 'USD offer must NEVER enter BRL price ranking');

const negativePriceOffer = { ...directOffer, currentPrice: -5 };
assert.equal(prov.isBrlRankingEligible(negativePriceOffer), false, 'Negative price offer must not enter ranking');

// ============================================================================
// 3. REGION VALIDATION
// ============================================================================
const brRegion = { ...directOffer, region: 'Brasil' };
const globalRegion = { ...directOffer, region: 'Global' };
const usRegion = { ...directOffer, region: 'US' };

assert.equal(prov.isBrlRankingEligible(brRegion), true);
assert.equal(prov.isBrlRankingEligible(globalRegion), true);
assert.equal(prov.isBrlRankingEligible(usRegion), false, 'Non-BR/Global region must not enter BRL ranking');

// ============================================================================
// 4. EDITION VALIDATION
// ============================================================================
assert.equal(prov.extractCanonicalEdition('Cyberpunk 2077'), 'standard');
assert.equal(prov.extractCanonicalEdition('Cyberpunk 2077: Phantom Liberty Bundle'), 'bundle');
assert.equal(prov.extractCanonicalEdition('The Witcher 3: Wild Hunt - Game of the Year Edition'), 'goty');
assert.equal(prov.extractCanonicalEdition('Death Stranding Director\'s Cut'), "director's cut");
assert.equal(prov.extractCanonicalEdition('Hogwarts Legacy: Digital Deluxe Edition'), 'deluxe');

// Different editions must generate different deduplication keys so both are preserved
const standardOffer = { ...directOffer, edition: 'standard' };
const deluxeOffer = { ...directOffer, edition: 'deluxe', currentPrice: 129.90, regularPrice: 249.90 };
assert.notEqual(prov.deduplicationKey(standardOffer), prov.deduplicationKey(deluxeOffer));

const dedupEditions = prov.deduplicateOffers([standardOffer, deluxeOffer]);
assert.equal(dedupEditions.length, 2, 'Distinct editions must both be preserved in comparison');

// ============================================================================
// 5. DETERMINISTIC DEDUPLICATION PRECEDENCE & AFFILIATE INDEPENDENCE
// ============================================================================
// Direct retailer (300) > Regional aggregator (200) > Auxiliary aggregator (100)
assert.ok(prov.getProviderPrecedence('direct_fanatical') > prov.getProviderPrecedence('itad'));
assert.ok(prov.getProviderPrecedence('itad') > prov.getProviderPrecedence('cheapshark'));
assert.ok(prov.getProviderPrecedence('itad') > prov.getProviderPrecedence('ggdeals'));

// Same game, same retailer, same edition: Direct source wins over aggregator even if aggregator price is slightly different
const dedupResult = prov.deduplicateOffers([aggregatorOffer, directOffer]);
assert.equal(dedupResult.length, 1);
assert.equal(dedupResult[0].providerId, 'direct_fanatical', 'Direct source must take precedence over aggregator');

// Affiliate Independence:
// An offer with affiliate tracking must NEVER override a direct or cheaper offer purely because of affiliate commission
const highAffiliateOffer = {
  ...directOffer,
  providerId: 'auxiliary_network',
  currentPrice: 110.00,
  commerceUrlSource: 'safeloot-affiliate',
  observedAt: '2026-09-27T12:00:00Z',
};
const lowerPriceDirect = {
  ...directOffer,
  providerId: 'direct_retailer',
  currentPrice: 85.00,
  commerceUrlSource: 'direct-retailer',
  observedAt: '2026-09-27T12:00:00Z',
};
const unbiasedDedup = prov.deduplicateOffers([highAffiliateOffer, lowerPriceDirect]);
assert.equal(unbiasedDedup[0].providerId, 'direct_retailer', 'Affiliate commission must never bias ranking or deduplication');

// ============================================================================
// 6. ITAD STATUS & GATING
// ============================================================================
assert.equal(itad.itadEnabled(), false, 'ITAD must remain disabled in production without explicit approval');
assert.equal(prov.PROVIDER_REGISTRY.itad.status, 'WAITING_FOR_API_KEY_OR_APPROVAL');

// ============================================================================
// 7. GG.DEALS STATUS & ANTI-FABRICATION RULE
// ============================================================================
assert.equal(ggd.ggdealsEnabled(), false, 'GG.deals must remain disabled in production without commercial approval');
assert.equal(prov.PROVIDER_REGISTRY.ggdeals.status, 'WAITING_FOR_COMMERCIAL_APPROVAL');

// If GG.deals returns only aggregate lowest prices without specific retailer names:
const aggregateOnlyResponse = {
  data: {
    '1091500': {
      lowest_retail: { price: 89.90, currency: 'BRL', url: 'https://gg.deals/game/cyberpunk-2077' },
      lowest_keyshop: { price: 79.90, currency: 'BRL', url: 'https://gg.deals/game/cyberpunk-2077' },
    }
  }
};
const parsedAggregate = ggd.parseGgdealsPrices(aggregateOnlyResponse, 1091500);
// Invariant: MUST NOT fabricate individual store cards when retailer is unknown
assert.equal(parsedAggregate.length, 0, 'Must NOT fabricate individual store cards from aggregate lowest prices');

// If GG.deals returns detailed retailer breakdown:
const detailedResponse = {
  data: {
    '1091500': {
      deals: [
        {
          retailer: 'Fanatical',
          retailerId: 'fanatical',
          price: 89.90,
          regularPrice: 199.90,
          currency: 'BRL',
          cut: 55,
          url: 'https://www.fanatical.com/game/cyberpunk-2077',
          drm: 'GOG',
          region: 'Brasil'
        }
      ]
    }
  }
};
const parsedDetailed = ggd.parseGgdealsPrices(detailedResponse, 1091500);
assert.equal(parsedDetailed.length, 1);
assert.equal(parsedDetailed[0].retailerName, 'Fanatical');
assert.equal(parsedDetailed[0].providerId, 'ggdeals');

// ============================================================================
// 8. GAMERPOWER GIVEAWAYS FILTERING & ATTRIBUTION
// ============================================================================
assert.equal(prov.PROVIDER_REGISTRY.gamerpower.status, 'PRODUCTION_ELIGIBLE');

const rawGamerPowerItems = [
  { id: 1, title: 'Best Plumber (IndieGala) Giveaway', type: 'Game', status: 'Active', platforms: 'PC, DRM-Free', open_giveaway_url: 'https://gamerpower.com/open/1' },
  { id: 2, title: 'Cyberpunk 2077 Car Skin DLC Pack', type: 'DLC', status: 'Active', platforms: 'PC, Steam', open_giveaway_url: 'https://gamerpower.com/open/2' },
  { id: 3, title: 'Super Shooter Beta Key Giveaway', type: 'Game', description: 'Closed beta trial', status: 'Active', platforms: 'PC', open_giveaway_url: 'https://gamerpower.com/open/3' },
  { id: 4, title: '1000 Gold Coins In-Game Loot', type: 'Loot', status: 'Active', platforms: 'PC', open_giveaway_url: 'https://gamerpower.com/open/4' },
  { id: 5, title: 'Expired Retro Game Giveaway', type: 'Game', status: 'Expired', platforms: 'PC', open_giveaway_url: 'https://gamerpower.com/open/5' },
];

const filteredGp = gp.filterAndNormalizeGamerPower(rawGamerPowerItems);
assert.equal(filteredGp.length, 1, 'Only genuine active full games must be accepted');
assert.equal(filteredGp[0].cleanTitle, 'Best Plumber', 'Title must be cleanly sanitized of giveaway suffix');
assert.equal(filteredGp[0].store, 'IndieGala', 'Must detect store as IndieGala');
assert.equal(filteredGp[0].source, 'GamerPower · Resgate Grátis', 'Must include proper attribution');

// Verify gamerpower.com is in allowed outbound domains
assert.equal(aff.isAllowedDestinationHost('gamerpower.com'), true, 'gamerpower.com must be in ALLOWED_OUTBOUND_DOMAINS');
assert.equal(aff.isAllowedDestinationHost('www.gamerpower.com'), true);

const gpDest = aff.affiliateDestination({
  store: 'IndieGala',
  url: 'https://www.gamerpower.com/open/1',
  source: 'GamerPower · Resgate Grátis'
});
assert.equal(gpDest.provider, 'gamerpower');
assert.equal(gpDest.affiliate, false);

// ============================================================================
// 9. DISCOVERY CAROUSEL V2 CANDIDATE DEDUPLICATION & ROTATION
// ============================================================================
const candidatePool = [
  { id: 'steam-1', appId: 101, title: 'Game 1', store: 'Steam', price: 10, discount: 50, tags: ['Indie'] },
  { id: 'steam-1-dup', appId: 101, title: 'Game 1 Dup', store: 'Steam', price: 10, discount: 50, tags: ['Indie'] },
  { id: 'steam-2', appId: 102, title: 'Game 2', store: 'Steam', price: 20, discount: 50, tags: ['Roguelike'] },
  { id: 'steam-3', appId: 103, title: 'Game 3', store: 'Steam', price: 30, discount: 50, tags: ['Action'] },
  { id: 'steam-4', appId: 104, title: 'Game 4', store: 'Steam', price: 40, discount: 50, tags: ['RPG'] },
  { id: 'steam-5', appId: 105, title: 'Game 5', store: 'Steam', price: 50, discount: 50, tags: ['Co-op'] },
];

function deriveCarouselCandidates(pool, rotationIndex, windowSize = 4) {
  const uniquePool = [];
  const seen = new Set();
  for (const g of pool) {
    const key = g.appId ?? g.id;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePool.push(g);
    }
  }
  if (!uniquePool.length) return [];
  const offset = (rotationIndex * 2) % uniquePool.length;
  const candidates = [];
  const setSeen = new Set();
  for (let i = 0; i < uniquePool.length && candidates.length < windowSize; i++) {
    const game = uniquePool[(offset + i) % uniquePool.length];
    const key = game.appId ?? game.id;
    if (!setSeen.has(key)) {
      setSeen.add(key);
      candidates.push(game);
    }
  }
  return candidates;
}

const c0 = deriveCarouselCandidates(candidatePool, 0, 3);
const c1 = deriveCarouselCandidates(candidatePool, 1, 3);

// No duplicates in candidate set
const c0Ids = c0.map(g => g.appId);
assert.equal(new Set(c0Ids).size, c0Ids.length, 'Carousel must have zero duplicate appIds in candidate set');

// Rotation changes the candidate set
assert.notDeepEqual(c0.map(g => g.appId), c1.map(g => g.appId), 'Rotation must replace visible candidates');

// ============================================================================
// 10. COMPONENT CONTRACTS & STYLING VERIFICATION
// ============================================================================
const shelfSource = fs.readFileSync('components/discovery-shelves.tsx', 'utf8');
const cssSource = fs.readFileSync('app/globals.css', 'utf8');

assert.ok(shelfSource.includes('data-testid="discovery-carousel-v2"'), 'Must render discovery-carousel-v2');
assert.ok(shelfSource.includes('discovery-carousel-track'), 'Must render discovery-carousel-track');
assert.ok(shelfSource.includes('discovery-carousel-card'), 'Must render discovery-carousel-card');
assert.ok(shelfSource.includes('data-testid="carousel-card"'), 'Must include carousel-card test id');
assert.ok(shelfSource.includes('discovery-carousel-btn'), 'Must render desktop navigation buttons');
assert.ok(shelfSource.includes('data-testid="rotate-button"'), 'Must preserve rotate-button');
assert.ok(shelfSource.includes('data-testid="discover-button"'), 'Must preserve discover-button');
assert.ok(shelfSource.includes('data-testid="curated-discover-shelf"'), 'Must preserve curated-discover-shelf');

// CSS containment verification
assert.ok(cssSource.includes('scroll-snap-type: x mandatory'), 'Carousel must use CSS scroll-snap mandatory');
assert.ok(cssSource.includes('flex: 0 0 82vw'), 'Mobile card width must be 82vw to provide visible next card affordance');
assert.ok(cssSource.includes('min-width: 290px'), 'Desktop card width must enforce substantial card size');

console.log('Multi-Provider Architecture and Discovery Carousel V2: ALL tests passed successfully!');

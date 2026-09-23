import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';

const { getSafeLootPriceIntelligence, priceInsights } = await import(
  moduleUrl('lib/price-insights.ts')
);
const { stores, findStore, canonicalStoreId, offerKind } = await import(
  moduleUrl('lib/stores.ts')
);

let checks = 0;
function equal(actual, expected, message = 'Assertion passed') {
  assert.deepEqual(actual, expected, message);
  checks++;
}

const now = 1758585600000; // Reference timestamp: Sept 23, 2025
const day = 86400000;

// ==========================================
// 1. SafeLoot Price Intelligence: Empty points / Initial state
// ==========================================
const emptyIntel = getSafeLootPriceIntelligence([], {
  finalPrice: 59.99,
  discount: 0,
  store: 'Steam',
}, [], now);

equal(emptyIntel.lowestRecorded, null, 'No history points returns null lowestRecorded');
equal(emptyIntel.monitoredSince, null, 'No history points returns null monitoredSince');
equal(emptyIntel.totalObservations, 0, 'Zero observations');
equal(emptyIntel.isLowestRecorded, true, 'Current price is benchmark when no prior history');
equal(emptyIntel.differenceFromLowest, 0, 'Zero difference from benchmark');
equal(emptyIntel.advice.badge, 'regular_price', 'Regular price badge when discount is 0');
equal(emptyIntel.advice.score, 5.5, 'Default score 5.5');

// ==========================================
// 2. SafeLoot Price Intelligence: Lowest recorded detection & matching
// ==========================================
const historyPoints = [
  { date: now - 30 * day, price: 99.90, store: 'Steam' },
  { date: now - 15 * day, price: 49.90, store: 'Steam' }, // historical lowest
  { date: now - 5 * day, price: 79.90, store: 'Nuuvem' },
];

// Case A: Current price equals the lowest recorded price
const lowestIntel = getSafeLootPriceIntelligence(historyPoints, {
  finalPrice: 49.90,
  discount: 50,
  store: 'Steam',
}, [], now);

equal(lowestIntel.lowestRecorded.price, 49.90, 'Lowest recorded price is 49.90');
equal(lowestIntel.lowestRecorded.store, 'Steam', 'Lowest recorded store is Steam');
equal(lowestIntel.isLowestRecorded, true, 'Identifies current offer is at lowest recorded price');
equal(lowestIntel.differenceFromLowest, 0, 'Difference from lowest is 0');
equal(lowestIntel.percentageAboveLowest, 0, '0% above lowest');
equal(lowestIntel.advice.badge, 'lowest_ever', 'Badge is lowest_ever');
equal(lowestIntel.advice.score, 9.5, 'Score is 9.5 for lowest recorded with >= 50% discount');
assert.ok(lowestIntel.advice.explanation.includes('menor patamar'), 'Honest explanation mentions lowest level observed');

// Case B: Current price is above the lowest recorded price
const aboveLowestIntel = getSafeLootPriceIntelligence(historyPoints, {
  finalPrice: 79.90,
  discount: 20,
  store: 'Steam',
}, [], now);

equal(aboveLowestIntel.isLowestRecorded, false, 'Current offer is not lowest recorded');
equal(Math.round(aboveLowestIntel.differenceFromLowest * 100) / 100, 30.00, 'Difference is 30.00 BRL');
equal(aboveLowestIntel.percentageAboveLowest, 60.1, 'Percentage above lowest is ~60.1%');
equal(aboveLowestIntel.advice.badge, 'wait', 'Recommends waiting when significantly above lowest');
assert.ok(aboveLowestIntel.advice.explanation.includes('R$ 30,00'), 'Mentions exact BRL difference in explanation');

// ==========================================
// 3. Multi-Store Intelligence: Partner cheaper than Steam today
// ==========================================
const multiStoreOffers = [
  { store: 'Steam', finalPrice: 89.90, discount: 50, currency: 'BRL', available: true, region: 'Brasil', kind: 'official' },
  { store: 'Nuuvem', finalPrice: 69.90, discount: 61, currency: 'BRL', available: true, region: 'Brasil', kind: 'official' }, // R$ 20 cheaper!
  { store: 'Green Man Gaming', finalPrice: 74.90, discount: 58, currency: 'BRL', available: true, region: 'Brasil', kind: 'official' },
];

const crossStoreIntel = getSafeLootPriceIntelligence([], {
  store: 'Steam',
  finalPrice: 89.90,
  discount: 50,
}, multiStoreOffers, now);

assert.ok(crossStoreIntel.cheaperStoreThanSteam !== null, 'Detects cheaper store than Steam');
equal(crossStoreIntel.cheaperStoreThanSteam.store, 'Nuuvem', 'Cheaper store is Nuuvem');
equal(crossStoreIntel.cheaperStoreThanSteam.savingsBrl, 20.00, 'Savings is R$ 20,00');
equal(crossStoreIntel.advice.badge, 'better_store', 'Badge highlights better store');
equal(crossStoreIntel.advice.label, 'Mais barato na Nuuvem', 'Label specifies Nuuvem');
equal(crossStoreIntel.bestOfferToday.price, 69.90, 'Best offer today is 69.90');
equal(crossStoreIntel.storeSpreadBrl, 20.00, 'Spread between highest and lowest is 20.00');

// ==========================================
// 4. Genuine Sale Expiration
// ==========================================
const expiringOffer = {
  store: 'Steam',
  finalPrice: 29.90,
  discount: 75,
  expiresAt: now + 48 * 3600000, // 48 hours in the future
};

const expirationIntel = getSafeLootPriceIntelligence([], expiringOffer, [expiringOffer], now);
equal(expirationIntel.hoursUntilExpiration, 48, '48 hours remaining');
assert.ok(expirationIntel.saleExpiresAt.startsWith('2025-'), 'Outputs valid ISO timestamp');

// ==========================================
// 5. Free Game Handling
// ==========================================
const freeOffer = {
  store: 'Epic Games',
  finalPrice: 0,
  discount: 100,
  expiresAt: now + 72 * 3600000,
};

const freeIntel = getSafeLootPriceIntelligence([], freeOffer, [freeOffer], now);
equal(freeIntel.advice.badge, 'great_deal');
equal(freeIntel.advice.score, 10);
equal(freeIntel.advice.label, 'Jogo 100% Grátis');

// ==========================================
// 6. Price Radar / Target-Price Delta Logic
// ==========================================
function evaluateTarget(currentPrice, targetPrice) {
  if (targetPrice === null || !Number.isFinite(targetPrice) || targetPrice <= 0) {
    return { hasTarget: false };
  }
  const isReached = currentPrice !== null && currentPrice <= targetPrice;
  const delta = currentPrice !== null ? currentPrice - targetPrice : null;
  return {
    hasTarget: true,
    isReached,
    delta: delta !== null ? Math.round(delta * 100) / 100 : null,
    savingsBelowTarget: isReached && delta < 0 ? Math.round(Math.abs(delta) * 100) / 100 : 0,
  };
}

// Case A: Target reached with savings
const targetReached = evaluateTarget(18.74, 25.00);
equal(targetReached.hasTarget, true);
equal(targetReached.isReached, true, '18.74 is below 25.00 target');
equal(targetReached.delta, -6.26);
equal(targetReached.savingsBelowTarget, 6.26, 'Saved R$ 6.26 below target');

// Case B: Exactly on target
const targetExact = evaluateTarget(20.00, 20.00);
equal(targetExact.isReached, true, 'Exact target reached');
equal(targetExact.delta, 0);

// Case C: Target pending
const targetPending = evaluateTarget(45.00, 30.00);
equal(targetPending.isReached, false, '45.00 has not reached 30.00 target');
equal(targetPending.delta, 15.00, 'Faltam R$ 15,00');

// ==========================================
// 7. Retailer Trust & Classification
// ==========================================
equal(offerKind({ store: 'Steam' }), 'official', 'Steam is official');
equal(offerKind({ store: 'Nuuvem' }), 'official', 'Nuuvem is official');
equal(offerKind({ store: 'Green Man Gaming' }), 'official', 'GMG is official');
equal(offerKind({ store: 'Epic Games' }), 'official', 'Epic is official');
equal(offerKind({ store: 'GOG' }), 'official', 'GOG is official');
equal(offerKind({ store: 'Hype' }), 'official', 'Hype is official');

equal(offerKind({ store: 'Eneba' }), 'key', 'Eneba is key marketplace');
equal(offerKind({ store: 'CDKeys' }), 'key', 'CDKeys is key marketplace');
equal(offerKind({ store: 'Kinguin' }), 'key', 'Kinguin is key marketplace');
equal(offerKind({ store: 'G2A' }), 'key', 'G2A is key marketplace');

const gmgStore = findStore('gmg');
assert.ok(gmgStore, 'GMG found in store directory');
equal(gmgStore.active, true, 'GMG is marked active');
equal(gmgStore.kind, 'official', 'GMG is official');
equal(gmgStore.status, 'Preços em reais', 'GMG status is Preços em reais');

// ==========================================
// 8. Recent Price Drop and New Historical Lowest
// ==========================================
const dropHistory = [
  { date: now - 10 * day, price: 150.00, store: 'Steam' },
  { date: now - 3 * day, price: 120.00, store: 'Steam' },
];

// Test recent price drop from 120 to 90
const dropIntel = getSafeLootPriceIntelligence(dropHistory, {
  finalPrice: 90.00,
  discount: 40,
  store: 'Steam',
}, [], now);

equal(dropIntel.isNewLowestRecorded, true, '90.00 is new lowest recorded');
assert.ok(dropIntel.recentPriceDrop !== null, 'Detects recent price drop');
equal(dropIntel.recentPriceDrop.dropBrl, 30.00, 'Drop amount is R$ 30,00');
equal(dropIntel.recentPriceDrop.dropPercent, 25, 'Drop percentage is 25%');
equal(dropIntel.advice.badge, 'lowest_ever', 'Badge is lowest_ever for new record low');

// Test drop when not a new record low (historical lowest was 40, price dropped from 120 to 80)
const nonRecordHistory = [
  { date: now - 60 * day, price: 40.00, store: 'Steam' },
  { date: now - 10 * day, price: 120.00, store: 'Steam' },
];
const dropOnlyIntel = getSafeLootPriceIntelligence(nonRecordHistory, {
  finalPrice: 80.00,
  discount: 33,
  store: 'Steam',
}, [], now);

equal(dropOnlyIntel.isNewLowestRecorded, false, '80.00 is not new lowest recorded');
assert.ok(dropOnlyIntel.recentPriceDrop !== null, 'Detects recent drop from 120 to 80');
equal(dropOnlyIntel.recentPriceDrop.dropBrl, 40.00, 'Drop is 40.00');
equal(dropOnlyIntel.recentPriceDrop.dropPercent, 33, 'Drop is 33%');
equal(dropOnlyIntel.advice.badge, 'price_dropped', 'Badge is price_dropped');

// ==========================================
// 9. Backwards compatibility for priceInsights
// ==========================================
equal(priceInsights([], 50, 50, now), null, 'Empty points returns null');
equal(priceInsights([{ date: now - day, price: 50 }], 50, 50, now), null, 'Single point returns null');

const fullHistory = [
  { date: now - 100 * day, price: 100 },
  { date: now - 60 * day, price: 50 },
  { date: now - 30 * day, price: 100 },
];
const legacyInsight = priceInsights(fullHistory, 100, 0, now);
assert.ok(legacyInsight !== null, 'Sufficient history returns legacy insight');
equal(legacyInsight.low, 50);
equal(legacyInsight.difference, 50);

console.log(`price-intelligence: ${checks} checks passed`);

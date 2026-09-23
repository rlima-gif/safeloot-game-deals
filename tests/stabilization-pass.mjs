import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';

const { canonicalStoreId, canonicalStoreName, findStore, offerLink } = await import(
  moduleUrl('lib/stores.ts')
);
const { affiliateDestination } = await import(
  moduleUrl('lib/affiliate.ts')
);
const { resolveNuuvemAppId, KNOWN_GMG_SLUGS } = await import(
  moduleUrl('lib/discovery.ts')
);

let checks = 0;
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}

// ==========================================
// 1. Price filtering logic & boundary checks
// ==========================================
function filterGames(games, price) {
  return games.filter((g) => {
    if (price === 'all') return true;
    if (g.currency !== 'BRL' || g.finalPrice === null) return false;
    if (price === '0') return g.finalPrice === 0;
    return g.finalPrice <= Number(price);
  });
}

const mockGames = [
  { id: 1, title: 'Free Game', finalPrice: 0, currency: 'BRL' },
  { id: 2, title: 'Cheap 1', finalPrice: 4.99, currency: 'BRL' },
  { id: 3, title: 'Cheap Boundary', finalPrice: 10.00, currency: 'BRL' },
  { id: 4, title: 'Just Above 10', finalPrice: 10.01, currency: 'BRL' },
  { id: 5, title: 'Mid 20 Boundary', finalPrice: 20.00, currency: 'BRL' },
  { id: 6, title: 'Just Above 20', finalPrice: 20.01, currency: 'BRL' },
  { id: 7, title: 'Thirty Boundary', finalPrice: 30.00, currency: 'BRL' },
  { id: 8, title: 'Fifty Boundary', finalPrice: 50.00, currency: 'BRL' },
  { id: 9, title: 'Hundred Boundary', finalPrice: 100.00, currency: 'BRL' },
  { id: 10, title: 'Expensive', finalPrice: 299.00, currency: 'BRL' },
  { id: 11, title: 'USD Game', finalPrice: 5.00, currency: 'USD' },
  { id: 12, title: 'Null Price Game', finalPrice: null, currency: 'BRL' },
];

// 'all' includes all valid games with prices or without
equal(filterGames(mockGames, 'all').length, 12, "Filter 'all' should include all games");

// '0' (Grátis)
const free = filterGames(mockGames, '0');
equal(free.length, 1);
equal(free[0].id, 1);

// '10' (Até R$ 10)
const under10 = filterGames(mockGames, '10');
equal(under10.map(g => g.id), [1, 2, 3], "Até R$ 10 includes 0, 4.99, and 10.00, but not 10.01 or USD");

// '20' (Até R$ 20)
const under20 = filterGames(mockGames, '20');
equal(under20.map(g => g.id), [1, 2, 3, 4, 5], "Até R$ 20 includes games up to 20.00");

// '30' (Até R$ 30)
const under30 = filterGames(mockGames, '30');
equal(under30.map(g => g.id), [1, 2, 3, 4, 5, 6, 7], "Até R$ 30 includes games up to 30.00");

// '50' (Até R$ 50)
const under50 = filterGames(mockGames, '50');
equal(under50.map(g => g.id), [1, 2, 3, 4, 5, 6, 7, 8], "Até R$ 50 includes games up to 50.00");

// '100' (Até R$ 100)
const under100 = filterGames(mockGames, '100');
equal(under100.map(g => g.id), [1, 2, 3, 4, 5, 6, 7, 8, 9], "Até R$ 100 includes games up to 100.00");

// Verify that USD games and null prices are excluded from BRL filters
assert(!under100.some(g => g.id === 11), "USD games excluded from BRL budget filters");
assert(!under100.some(g => g.id === 12), "Null price games excluded from budget filters");

// ==========================================
// 2. Canonical retailer identity
// ==========================================
equal(canonicalStoreId('Steam'), 'steam');
equal(canonicalStoreId('steam'), 'steam');
equal(canonicalStoreId('Nuuvem'), 'nuuvem');
equal(canonicalStoreId('nuuvem'), 'nuuvem');
equal(canonicalStoreId('Green Man Gaming'), 'gmg');
equal(canonicalStoreId('gmg'), 'gmg');
equal(canonicalStoreId('green-man-gaming'), 'gmg');
equal(canonicalStoreId('Epic Games'), 'epic');
equal(canonicalStoreId('epic'), 'epic');
equal(canonicalStoreId('epic-games'), 'epic');
equal(canonicalStoreId('GOG'), 'gog');
equal(canonicalStoreId('gog'), 'gog');
equal(canonicalStoreId('Hype Games'), 'hype');
equal(canonicalStoreId('hype'), 'hype');
equal(canonicalStoreId('hype-games'), 'hype');
equal(canonicalStoreId('GamersGate'), 'gamersgate');
equal(canonicalStoreId('gamersgate'), 'gamersgate');
equal(canonicalStoreId('Kinguin'), 'kinguin');
equal(canonicalStoreId('Eneba'), 'eneba');

equal(canonicalStoreName('gmg'), 'Green Man Gaming');
equal(canonicalStoreName('steam'), 'Steam');
equal(canonicalStoreName('nuuvem'), 'Nuuvem');
equal(canonicalStoreName('epic'), 'Epic Games');

// ==========================================
// 3. Nuuvem and GMG slug resolution
// ==========================================
equal(resolveNuuvemAppId('lego-marvels-avengers-deluxe-edition'), 405310);
equal(resolveNuuvemAppId('middle-earth-shadow-of-war-definitive-edition'), 356190);
equal(resolveNuuvemAppId('resident-evil-4-remake'), 2050650);
equal(resolveNuuvemAppId('death-stranding-directors-cut'), 1850570);
equal(resolveNuuvemAppId('hogwarts-legacy-deluxe-edition'), 990080);
equal(resolveNuuvemAppId('minecraft-java-and-bedrock-edition'), undefined, 'Non-steam games remain undefined without fake IDs');

equal(KNOWN_GMG_SLUGS['trials-of-mana'], 924980);
equal(KNOWN_GMG_SLUGS['cities-skylines-ii'], 949230);
equal(KNOWN_GMG_SLUGS['tactics-ogre-reborn'], 1451090);
equal(KNOWN_GMG_SLUGS['planetary-annihilation-titans'], 386070);

// ==========================================
// 4. Outbound destination resolver
// ==========================================
// Aggregator links preserved
const itadOffer = {
  store: 'Steam',
  url: 'https://store.steampowered.com/app/1091500/?ref=itad',
  source: 'IsThereAnyDeal — catálogo oficial',
};
const resolvedItad = affiliateDestination(itadOffer);
equal(resolvedItad.affiliate, true);
equal(resolvedItad.url, 'https://store.steampowered.com/app/1091500/?ref=itad');
equal(resolvedItad.provider, 'itad');
equal(resolvedItad.storeId, 'steam');

const csOffer = {
  store: 'Fanatical',
  url: 'https://www.fanatical.com/en/game/cyberpunk-2077?aff=cs',
  source: 'CheapShark — mercado global',
};
const resolvedCs = affiliateDestination(csOffer);
equal(resolvedCs.affiliate, true);
equal(resolvedCs.provider, 'cheapshark');
equal(resolvedCs.storeId, 'fanatical');

// Direct store link without aggregator
const directOffer = {
  store: 'Nuuvem',
  url: 'https://www.nuuvem.com/br-pt/item/lego-dc-super-villains-deluxe',
  source: 'Catálogo direto da loja',
};
const resolvedDirect = affiliateDestination(directOffer);
equal(resolvedDirect.affiliate, false);
equal(resolvedDirect.url, 'https://www.nuuvem.com/br-pt/item/lego-dc-super-villains-deluxe');
equal(resolvedDirect.provider, 'nuuvem');
equal(resolvedDirect.storeId, 'nuuvem');

// Offer link helper generates canonical URLs
const liveOffer = {
  id: 'nuuvem-12345',
  gameId: 405310,
  gameTitle: "LEGO Marvel's Avengers",
  store: 'Nuuvem',
  finalPrice: 6.49,
  originalPrice: 129.99,
  discount: 95,
  currency: 'BRL',
  region: 'Brasil',
  url: 'https://www.nuuvem.com/br-pt/item/lego-marvels-avengers',
  source: 'Nuuvem',
};
const link = offerLink(liveOffer);
equal(link, `/go/nuuvem/nuuvem-12345?appid=405310&title=LEGO%20Marvel's%20Avengers`);

console.log(`stabilization-pass: ${checks} checks passed`);

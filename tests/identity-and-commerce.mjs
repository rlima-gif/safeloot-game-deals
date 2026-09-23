import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';

const { isAllowedDestinationHost, affiliateDestination, logOutboundClick } = await import(
  moduleUrl('lib/affiliate.ts')
);
const { KNOWN_NUUVEM_SLUGS, KNOWN_GMG_SLUGS } = await import(
  moduleUrl('lib/discovery.ts')
);
const { parseGogOffers } = await import(
  moduleUrl('lib/store-connectors.ts')
);

console.log('--- Running Identity, Commerce, and News Editorial Tests ---');

// 1. Host Allowlist Tests (Open Redirect Protection)
assert.equal(isAllowedDestinationHost('store.steampowered.com'), true, 'steampowered.com must be allowed');
assert.equal(isAllowedDestinationHost('www.nuuvem.com'), true, 'nuuvem.com must be allowed');
assert.equal(isAllowedDestinationHost('gog.com'), true, 'gog.com must be allowed');
assert.equal(isAllowedDestinationHost('catalog.gog.com'), true, 'subdomain of gog.com must be allowed');
assert.equal(isAllowedDestinationHost('store.epicgames.com'), true, 'epicgames.com must be allowed');
assert.equal(isAllowedDestinationHost('hype.games'), true, 'hype.games must be allowed');
assert.equal(isAllowedDestinationHost('greenmangaming.com'), true, 'greenmangaming.com must be allowed');
assert.equal(isAllowedDestinationHost('awin1.com'), true, 'awin1.com affiliate network must be allowed');

// Attack vectors: must all fail closed
assert.equal(isAllowedDestinationHost('evil.com'), false, 'evil.com must be blocked');
assert.equal(isAllowedDestinationHost('steampowered.com.attacker.com'), false, 'subdomain spoofing must be blocked');
assert.equal(isAllowedDestinationHost('nuuvem.com.br.fake.io'), false, 'fake domain must be blocked');
assert.equal(isAllowedDestinationHost('not-gog.com'), false, 'suffix collision must be blocked');
assert.equal(isAllowedDestinationHost('localhost'), false, 'localhost must be blocked');

// 2. affiliateDestination Open Redirect Rejection
assert.throws(() => {
  affiliateDestination({
    store: 'Steam',
    url: 'https://evil.com/phishing',
    source: 'Steam Store',
  });
}, /Domínio de destino não autorizado/, 'Must throw on unapproved destination host');

assert.throws(() => {
  affiliateDestination({
    store: 'Steam',
    url: 'http://store.steampowered.com/app/10',
    source: 'Steam Store',
  });
}, /Destino inválido/, 'Must reject insecure http');

const legitDest = affiliateDestination({
  store: 'Steam',
  url: 'https://store.steampowered.com/app/646570/Slay_the_Spire/',
  source: 'Steam Store',
});
assert.equal(legitDest.url, 'https://store.steampowered.com/app/646570/Slay_the_Spire/');
assert.equal(legitDest.storeId, 'steam');

// 3. Privacy-Preserving Click Logging (No PII)
const logs = [];
const origLog = console.log;
console.log = (msg) => logs.push(msg);
try {
  logOutboundClick({
    store: 'Steam',
    storeId: 'steam',
    appId: 646570,
    gameTitle: 'Slay the Spire',
    affiliate: false,
    provider: 'steam',
  });
} finally {
  console.log = origLog;
}

assert.equal(logs.length, 1);
const parsedLog = JSON.parse(logs[0]);
assert.equal(parsedLog.type, 'safeloot_outbound_click');
assert.equal(parsedLog.store, 'Steam');
assert.equal(parsedLog.appId, 646570);
assert.equal(parsedLog.gameTitle, 'Slay the Spire');
assert.equal('ip' in parsedLog, false, 'IP address must NEVER be logged');
assert.equal('userAgent' in parsedLog, false, 'User agent must NEVER be logged');
assert.equal('headers' in parsedLog, false, 'Headers must NEVER be logged');
assert.equal('userId' in parsedLog, false, 'User ID must NEVER be logged');

// 4. Canonical Slug Identity Invariants
// LEGO Marvel's Avengers Steam AppID is 405310 (408000 is Cinderella Escape! R12)
assert.equal(KNOWN_NUUVEM_SLUGS['lego-marvels-avengers'], 405310, 'lego-marvels-avengers must map to 405310');
// Mortal Kombat 1 is 1971870 (1971800 is unmapped/incorrect)
assert.equal(KNOWN_NUUVEM_SLUGS['mortal-kombat-1'], 1971870, 'mortal-kombat-1 must map to 1971870');
// Enshrouded is 1203620 (1203630 was incorrect)
assert.equal(KNOWN_NUUVEM_SLUGS['enshrouded'], 1203620, 'enshrouded must map to 1203620');
// GMG Slug mappings
assert.equal(KNOWN_GMG_SLUGS['tactics-ogre-reborn'], 1451090, 'tactics-ogre-reborn must map to 1451090');
assert.equal(KNOWN_GMG_SLUGS['visions-of-mana'], 2490990, 'visions-of-mana must map to 2490990');
assert.equal(KNOWN_GMG_SLUGS['live-a-live'], 2014380, 'live-a-live must map to 2014380');

// Ambiguous bundles must NOT be present in single-game catalog maps
assert.equal(KNOWN_NUUVEM_SLUGS['batman-arkham-collection'], undefined, 'Bundles must be excluded from single-game AppID map');
assert.equal(KNOWN_NUUVEM_SLUGS['silent-hill-townfall'], undefined, 'Unreleased games with no Steam page must be unmapped');

// 5. GOG Catalog Parsing Invariant
const sampleGogProducts = [
  {
    id: '12345',
    title: 'Slay the Spire',
    slug: 'slay_the_spire',
    price: {
      finalMoney: { amount: '47.49', currency: 'BRL' },
      baseMoney: { amount: '47.49', currency: 'BRL' },
    },
  },
  {
    id: '12346',
    title: 'Slay the Spire - Soundtrack',
    slug: 'slay_the_spire_soundtrack',
    price: {
      finalMoney: { amount: '12.39', currency: 'BRL' },
      baseMoney: { amount: '12.39', currency: 'BRL' },
    },
  },
];

const gogOffers = parseGogOffers(sampleGogProducts, 'Slay the Spire');
assert.equal(gogOffers.length, 1, 'Must pick exactly 1 best matching offer');
assert.equal(gogOffers[0].store, 'GOG');
assert.equal(gogOffers[0].finalPrice, 47.49);
assert.equal(gogOffers[0].currency, 'BRL');
assert.equal(gogOffers[0].url, 'https://www.gog.com/en/game/slay_the_spire?countryCode=BR&currencyCode=BRL');

// GOG rejecting invalid currency
const invalidCurrencyGog = [
  {
    id: '999',
    title: 'Cyberpunk 2077',
    slug: 'cyberpunk_2077',
    price: {
      finalMoney: { amount: '59.99', currency: 'USD' },
    },
  },
];
assert.deepEqual(parseGogOffers(invalidCurrencyGog, 'Cyberpunk 2077'), [], 'Must reject non-BRL GOG offers');

console.log('Identity, Commerce, and News Editorial Tests: ALL 24 CHECKS PASSED ✅');

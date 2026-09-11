import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';

function moduleUrl(file) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const linked = compiled.replace(
    /from ['"](\.\/[^'"]+)['"]/g,
    (_, relative) =>
      `from '${moduleUrl(path.resolve(path.dirname(file), relative + '.ts'))}'`,
  );
  return (
    'data:text/javascript;base64,' + Buffer.from(linked).toString('base64')
  );
}
const { parseItadPrices, getItadOffers } = await import(
  moduleUrl('lib/itad.ts')
);
const { criticUrl, officialTrailer } = await import(
  moduleUrl('lib/game-media.ts')
);
const { parseHistory, getHistory } = await import(moduleUrl('lib/history.ts'));
const { parseGogOffers, parseHypeOffers } = await import(
  moduleUrl('lib/store-connectors.ts')
);
let checks = 0;
function equal(actual, expected) {
  assert.deepEqual(actual, expected);
  checks++;
}
const deal = {
  shop: { id: 50, name: 'Nuuvem' },
  price: { amount: 29.9, currency: 'BRL' },
  regular: { amount: 59.9, currency: 'BRL' },
  cut: 50,
  voucher: null,
  expiry: null,
  url: 'https://isthereanydeal.com/link/example/?affiliate=preserved',
};
const parse = (overrides) =>
  parseItadPrices([{ id: 'game', deals: [{ ...deal, ...overrides }] }], 'game');
equal(parse({})[0].finalPrice, 29.9);
equal(parse({})[0].url, deal.url);
equal(parseItadPrices([{ id: 'different', deals: [deal] }], 'game'), []);
for (const change of [
  { price: { amount: 10, currency: 'USD' } },
  { price: { amount: '10', currency: 'BRL' } },
  { price: { amount: -1, currency: 'BRL' } },
  { price: { amount: NaN, currency: 'BRL' } },
  { voucher: 'COUPON' },
  { expiry: '2020-01-01' },
  { expiry: 'invalid' },
  { url: 'javascript:alert(1)' },
  { url: 'https://user:pass@example.com' },
  { shop: { id: 1, name: 'Kinguin' } },
])
  equal(parse(change), []);
equal(parse({ price: { amount: 0, currency: 'BRL' } })[0].finalPrice, 0);
equal(
  parseItadPrices(
    [
      {
        id: 'game',
        deals: [deal, { ...deal, price: { amount: 20, currency: 'BRL' } }],
      },
    ],
    'game',
  ).length,
  1,
);
equal(
  criticUrl('http://www.metacritic.com/game/cyberpunk-2077/'),
  'https://www.metacritic.com/game/cyberpunk-2077/',
);
equal(criticUrl('https://metacritic.com.evil.example/game/'), undefined);
equal(criticUrl('javascript:alert(1)'), undefined);
equal(officialTrailer(1091500)?.videoId, 'BO8lX3hDU30');
equal(officialTrailer(999999999), undefined);
const rows = [
  {
    timestamp: '2026-08-01T00:00:00Z',
    shop: { id: 61 },
    deal: { price: { amount: 39.9, currency: 'BRL' } },
  },
];
equal(
  parseHistory([
    ...rows,
    { ...rows[0], shop: { id: 50 } },
    { ...rows[0], timestamp: 'invalid' },
    { ...rows[0], deal: { price: { amount: 5, currency: 'USD' } } },
  ]),
  [{ date: Date.parse(rows[0].timestamp), price: 39.9 }],
);
const oldApproved = process.env.ITAD_USE_APPROVED;
process.env.ITAD_USE_APPROVED = 'false';
equal(await getItadOffers(1091500), []);
equal((await getHistory(1091500, 90)).status, 'not-configured');
if (oldApproved === undefined) delete process.env.ITAD_USE_APPROVED;
else process.env.ITAD_USE_APPROVED = oldApproved;
const gogFixture = '../../outputs/gog-source.txt';
if (fs.existsSync(gogFixture)) {
  const products = JSON.parse(fs.readFileSync(gogFixture, 'utf8')).products;
  equal(parseGogOffers(products, 'Cyberpunk 2077')[0].currency, 'BRL');
  equal(parseGogOffers(products, 'Cyberpunk 2077 Deluxe'), []);
}
const hype = {
  id: 1,
  name: 'Hades',
  platform: { name: 'Steam' },
  link: '/br/hades',
  isAvailable: true,
  currentPrice: 25,
  originalPrice: 50,
  priceCurrency: 'BRL',
};
const html = (product) =>
  '<product-card-component data-product="' +
  JSON.stringify(product).replaceAll('"', '&quot;') +
  '">';
equal(parseHypeOffers(html(hype), 'Hades')[0].finalPrice, 25);
for (const change of [
  { priceCurrency: 'USD' },
  { isAvailable: false },
  { name: 'Hades II' },
  { platform: { name: 'Xbox' } },
  { currentPrice: -1 },
  { link: 'https://evil.example/' },
])
  equal(parseHypeOffers(html({ ...hype, ...change }), 'Hades'), []);
for (const url of [
  '/api/history?appid=0',
  '/api/history?appid=1091500&days=4',
  '/api/offers?appid=-1',
  '/api/search?q=a',
])
  equal((await fetch('http://localhost:3000' + url)).status, 400);
const response = await fetch(
  'http://localhost:3000/api/offers?appid=1091500&title=Cyberpunk%202077',
);
equal(response.status, 200);
const live = await response.json();
equal(live.game.trailer.videoId, 'BO8lX3hDU30');
equal(
  live.offers
    .filter((offer) => offer.currency === 'BRL')
    .every((offer) => offer.region === 'Brasil' && offer.finalPrice >= 0),
  true,
);
const { priceInsights } = await import(moduleUrl('lib/price-insights.ts'));
const { affiliateDestination } = await import(moduleUrl('lib/affiliate.ts'));
const { offerKind, offerLink, offerCost } = await import(
  moduleUrl('lib/stores.ts')
);
const now = Date.now(),
  day = 86400000;
equal(priceInsights([], 50, 50, now), null);
equal(priceInsights([{ date: now - day, price: 50 }], 50, 50, now), null);
const historical = [
  { date: now - 100 * day, price: 100 },
  { date: now - 60 * day, price: 50 },
  { date: now - 30 * day, price: 100 },
];
const insight = priceInsights(historical, 100, 0, now);
equal(Math.round(insight.avg90 * 100) / 100, 83.33);
equal(insight.avg30, 100);
equal(insight.low, 50);
equal(insight.difference, 50);
equal(insight.drops, 1);
equal(offerKind({ store: 'Eneba' }), 'key');
equal(offerKind({ store: 'Steam' }), 'official');
equal(offerKind({ store: 'Unknown supplier' }), 'unknown');
equal(offerCost({ finalPrice: 10, totalPrice: 12 }), 12);
const steam = live.offers.find((offer) => offer.store === 'Steam');
const go = await fetch('http://localhost:3000' + offerLink(steam), {
  redirect: 'manual',
});
equal(go.status, 302);
equal(new URL(go.headers.get('location')).hostname, 'store.steampowered.com');
equal(
  (
    await fetch(
      'http://localhost:3000/go/steam/fake?appid=0&url=https://evil.example',
      { redirect: 'manual' },
    )
  ).status,
  400,
);
const oldTracking = process.env.STORE_AFFILIATES_JSON;
process.env.STORE_AFFILIATES_JSON = JSON.stringify({
  steam: {
    affiliate_id: 'test',
    tracking_parameters: { ref: '{affiliate_id}' },
  },
});
equal(affiliateDestination(steam).affiliate, true);
equal(new URL(affiliateDestination(steam).url).searchParams.get('ref'), 'test');
equal(
  affiliateDestination({
    ...steam,
    source: 'IsThereAnyDeal',
    url: 'https://isthereanydeal.com/link/exact/?affiliate=original',
  }).url,
  'https://isthereanydeal.com/link/exact/?affiliate=original',
);
if (oldTracking === undefined) delete process.env.STORE_AFFILIATES_JSON;
else process.env.STORE_AFFILIATES_JSON = oldTracking;
const { parseNuuvemOffer } = await import(moduleUrl('lib/nuuvem.ts'));
const nuuvemHtml = fs.readFileSync('../../outputs/nuuvem-re4.html', 'utf8');
const nuuvemUrl = 'https://www.nuuvem.com/br-pt/item/resident-evil-4-remake';
equal(parseNuuvemOffer(nuuvemHtml, 'Resident Evil 4', nuuvemUrl)[0].finalPrice, 32.99);
equal(parseNuuvemOffer(nuuvemHtml, 'Resident Evil 4 (2005)', nuuvemUrl), []);
equal(parseNuuvemOffer(nuuvemHtml.replaceAll('product__purchasable', 'unavailable'), 'Resident Evil 4', nuuvemUrl), []);
equal(parseNuuvemOffer(nuuvemHtml.replaceAll('content="BRL"', 'content="USD"'), 'Resident Evil 4', nuuvemUrl), []);
equal(parseNuuvemOffer(nuuvemHtml.replaceAll('content="32.99"', 'content="33.99"'), 'Resident Evil 4', nuuvemUrl), []);
equal(parseNuuvemOffer(nuuvemHtml.replaceAll('Windows', 'Xbox'), 'Resident Evil 4', nuuvemUrl), []);
equal(parseNuuvemOffer(nuuvemHtml, 'Resident Evil 4', 'https://evil.example/br-pt/item/resident-evil-4-remake'), []);
equal(parseNuuvemOffer(nuuvemHtml, 'Resident Evil 4', 'bad-url'), []);
const nuuvemLive=await (await fetch('http://localhost:3000/api/offers?appid=2050650&title=Resident%20Evil%204')).json();
const nuuvemOffer=nuuvemLive.offers.find(offer=>offer.store==='Nuuvem');
equal(nuuvemOffer.currency,'BRL');
const nuuvemRedirect=await fetch('http://localhost:3000'+offerLink(nuuvemOffer),{redirect:'manual'});
equal(nuuvemRedirect.status,302);
equal(nuuvemRedirect.headers.get('location'),nuuvemUrl);
console.log(`${checks} integration checks passed.`);

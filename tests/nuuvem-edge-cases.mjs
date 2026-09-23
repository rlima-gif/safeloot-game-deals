import fs from 'node:fs';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
const {
  parseNuuvemResult,
  parseNuuvemCandidates,
  fetchNuuvemHtml,
  getNuuvemResult,
} = await import(moduleUrl('lib/connectors/nuuvem.ts'));
const { parseNuuvemDiscovery, resolveNuuvemAppId } = await import(moduleUrl('lib/discovery.ts'));
const { resultToOffer } = await import(moduleUrl('lib/connectors/types.ts'));
const html = fs.readFileSync(
  'tests/fixtures/nuuvem-watch-dogs-2-deluxe.html',
  'utf8',
);
const url = 'https://www.nuuvem.com/br-pt/item/catalog-slug-unrelated-to-title';
let checks = 0;
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
const parse = (
  content,
  title = 'Watch Dogs 2 Deluxe Edition',
  destination = url,
) => parseNuuvemResult(content, title, destination);
eq(parse(html).status, 'confirmed');
eq(parse(html.replace('Windows', 'PlayStation 5')).status, 'no-offer');
eq(
  parse(html.replace('product__available', 'product__soldout')).status,
  'unavailable',
);
eq(parse(html.replace('2099-01-01', '2000-01-01')).status, 'no-offer');
eq(parse('<html>New store layout</html>').status, 'parser-error');
eq(parse(html, 'Watch Dogs 2').status, 'no-offer');
eq(
  parse(
    html.replaceAll('Watch Dogs 2 Deluxe Edition', 'Resident Evil 4 Remake'),
    'Resident Evil 4',
  ).status,
  'no-offer',
);
eq(
  parse(
    html,
    'Watch Dogs 2 Deluxe Edition',
    'https://www.nuuvem.com.evil.test/br-pt/item/game',
  ).status,
  'parser-error',
);
eq(
  parse(
    html,
    'Watch Dogs 2 Deluxe Edition',
    'https://user:pass@www.nuuvem.com/br-pt/item/game',
  ).status,
  'parser-error',
);
eq(
  parseNuuvemCandidates(
    '<a href="https://www.nuuvem.com/br-pt/item/actual-slug">Game</a><a href="https://evil.test/br-pt/item/game">Other</a>',
  ),
  ['https://www.nuuvem.com/br-pt/item/actual-slug'],
);
eq(
  parse(
    html.replaceAll(
      'Watch Dogs 2 Deluxe Edition',
      'Watch_Dogs 2: Deluxe Edition',
    ),
  ).status,
  'confirmed',
);
eq(
  parse(
    html.replaceAll(
      'Watch Dogs 2 Deluxe Edition',
      'Watch_Dogs 2: Deluxe Edition',
    ),
    'Watch_Dogs 2',
  ).status,
  'no-offer',
);
eq(
  parse(
    html.replaceAll(
      'Watch Dogs 2 Deluxe Edition',
      'The Elder Scrolls V Skyrim: Special Edition',
    ),
    'The Elder Scrolls V: Skyrim Special Edition',
  ).status,
  'confirmed',
);
const realFetch = globalThis.fetch;
try {
  const requested = [];
  globalThis.fetch = async (target) => {
    requested.push(target instanceof Request ? target.url : target.toString());
    return new Response(
      html.replaceAll('Watch Dogs 2 Deluxe Edition', 'Resident Evil 4 Remake'),
    );
  };
  const mapped = await getNuuvemResult({
    appId: 2050650,
    title: 'Resident Evil 4',
    canonicalTitle: 'Resident Evil 4',
    kind: 'game',
  });
  eq(mapped.status, 'confirmed');
  eq(requested, ['https://www.nuuvem.com/br-pt/item/resident-evil-4-remake']);
  requested.length = 0;
  globalThis.fetch = async (target) => {
    requested.push(target instanceof Request ? target.url : target.toString());
    return new Response(
      (target instanceof Request ? target.url : target.toString()).includes(
        '/catalog/',
      )
        ? '<a href="https://www.nuuvem.com/br-pt/item/actual-catalog-slug">Game</a>'
        : html.replaceAll(
            'Watch Dogs 2 Deluxe Edition',
            'The Elder Scrolls V Skyrim: Special Edition',
          ),
    );
  };
  const discovered = await getNuuvemResult({
    appId: 489830,
    title: 'The Elder Scrolls V: Skyrim Special Edition',
    canonicalTitle: 'The Elder Scrolls V: Skyrim Special Edition',
    kind: 'game',
  });
  eq(discovered.status, 'confirmed');
  eq(
    requested[0],
    'https://www.nuuvem.com/br-pt/catalog/page/1/search/The%20Elder%20Scrolls%20V%20Skyrim%20Special%20Edition',
  );
  eq(
    discovered.offer.productUrl,
    'https://www.nuuvem.com/br-pt/item/actual-catalog-slug',
  );
} finally {
  globalThis.fetch = realFetch;
}

let calls = 0;
try {
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://evil.test/steal' },
    });
  };
  await assert.rejects(() => fetchNuuvemHtml(url), /inseguro/);
  checks++;
  eq(calls, 1);
  globalThis.fetch = async (_url, { signal }) => {
    signal.throwIfAborted();
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }),
    );
  };
  await assert.rejects(
    () => fetchNuuvemHtml(url, AbortSignal.abort(new Error('timeout'))),
    /timeout/,
  );
  checks++;
} finally {
  globalThis.fetch = realFetch;
}

// --- Nuuvem Discovery & Catalog Edge Cases ---
// 1. Virtual currency / gift card exclusion
const mockDiscoveryHtml = `
  <a href="https://www.nuuvem.com/br-pt/item/2840-vp-gift-card">
    <article class="product__purchasable">
      <ul class="platform-tags"><li>Windows</li></ul>
      <div data-default-tracker-product-tracking-data-param="{&quot;name&quot;:&quot;2840 VP + 245 Bônus - Valorant&quot;,&quot;id&quot;:&quot;123&quot;,&quot;currency&quot;:&quot;BRL&quot;,&quot;url&quot;:&quot;https://www.nuuvem.com/br-pt/item/2840-vp-gift-card&quot;,&quot;image_url&quot;:&quot;https://assets.nuuvem.com/vp.jpg&quot;}"></div>
      <div data-price="{&quot;v&quot;:10990}"></div>
      <div data-base-price="{&quot;v&quot;:10990}"></div>
    </article>
  </a>
  <a href="https://www.nuuvem.com/br-pt/item/resident-evil-2">
    <article class="product__purchasable">
      <ul class="platform-tags"><li>Windows</li></ul>
      <div data-default-tracker-product-tracking-data-param="{&quot;name&quot;:&quot;Resident Evil 2&quot;,&quot;id&quot;:&quot;456&quot;,&quot;currency&quot;:&quot;BRL&quot;,&quot;url&quot;:&quot;https://www.nuuvem.com/br-pt/item/resident-evil-2&quot;,&quot;image_url&quot;:&quot;https://assets.nuuvem.com/re2.jpg&quot;}"></div>
      <div data-price="{&quot;v&quot;:3990}"></div>
      <div data-base-price="{&quot;v&quot;:15990}"></div>
    </article>
  </a>
  <a href="https://www.nuuvem.com/br-pt/item/moedas-apex-legends">
    <article class="product__purchasable">
      <ul class="platform-tags"><li>Windows</li></ul>
      <div data-default-tracker-product-tracking-data-param="{&quot;name&quot;:&quot;1000 Moedas Apex Legends&quot;,&quot;id&quot;:&quot;789&quot;,&quot;currency&quot;:&quot;BRL&quot;,&quot;url&quot;:&quot;https://www.nuuvem.com/br-pt/item/moedas-apex-legends&quot;,&quot;image_url&quot;:&quot;https://assets.nuuvem.com/coins.jpg&quot;}"></div>
      <div data-price="{&quot;v&quot;:4900}"></div>
      <div data-base-price="{&quot;v&quot;:4900}"></div>
    </article>
  </a>
`;

const parsedDeals = parseNuuvemDiscovery(mockDiscoveryHtml);
eq(parsedDeals.length, 1);
eq(parsedDeals[0].title, 'Resident Evil 2');
eq(parsedDeals[0].appId, 883710);
eq(parsedDeals[0].price, 39.90);
eq(parsedDeals[0].original, 159.90);

// 2. resolveNuuvemAppId slug normalization
eq(resolveNuuvemAppId('resident-evil-2-deluxe-edition', 'Resident Evil 2 Deluxe Edition'), 883710);
eq(resolveNuuvemAppId('cyberpunk-2077-ultimate-edition', 'Cyberpunk 2077'), 1091500);
eq(resolveNuuvemAppId('hogwarts-legacy-pc', 'Hogwarts Legacy'), 990080);
eq(resolveNuuvemAppId('unknown-game-slug-xyz', 'Unknown Game'), undefined);

// 3. resultToOffer activationInBrazil logic
const offerBrasil = resultToOffer({
  store: 'Nuuvem',
  status: 'confirmed',
  offer: {
    price: 50,
    originalPrice: 100,
    currency: 'BRL',
    region: 'Brasil',
    productUrl: 'https://nuuvem.com/re2',
    available: true,
    verifiedAt: new Date().toISOString(),
  },
});
eq(offerBrasil.activationInBrazil, true);

const offerGlobal = resultToOffer({
  store: 'GamersGate',
  status: 'confirmed',
  offer: {
    price: 45,
    originalPrice: 90,
    currency: 'BRL',
    region: 'Global',
    productUrl: 'https://gamersgate.com/re2',
    available: true,
    verifiedAt: new Date().toISOString(),
  },
});
eq(offerGlobal.activationInBrazil, true);

const offerLatam = resultToOffer({
  store: 'Hype Games',
  status: 'confirmed',
  offer: {
    price: 48,
    originalPrice: 95,
    currency: 'BRL',
    region: 'LATAM',
    productUrl: 'https://hype.games/re2',
    available: true,
    verifiedAt: new Date().toISOString(),
  },
});
eq(offerLatam.activationInBrazil, true);

const offerUS = resultToOffer({
  store: 'US Store',
  status: 'confirmed',
  offer: {
    price: 15,
    originalPrice: 30,
    currency: 'USD',
    region: 'US',
    productUrl: 'https://us.store/re2',
    available: true,
    verifiedAt: new Date().toISOString(),
  },
});
eq(offerUS.activationInBrazil, false);

console.log(`nuuvem-edge-cases: ${checks} checks passed`);


// Audit live production offers from https://safeloot.safeloot.workers.dev
const BASE_URL = 'https://safeloot.safeloot.workers.dev';

const testGames = [
  { appId: 646570, name: 'Slay the Spire' },
  { appId: 1091500, name: 'Cyberpunk 2077' },
  { appId: 292030, name: 'The Witcher 3: Wild Hunt' },
  { appId: 405310, name: "LEGO Marvel's Avengers" },
  { appId: 1971870, name: 'Mortal Kombat 1' },
  { appId: 1203620, name: 'Enshrouded' },
];

async function checkGame(game) {
  const start = Date.now();
  const url = `${BASE_URL}/api/offers?appid=${game.appId}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const duration = Date.now() - start;
    if (!res.ok) {
      return { game: game.name, appId: game.appId, status: res.status, error: `HTTP ${res.status}`, duration };
    }
    const data = await res.json();
    const confirmedBrlOffers = (data.offers || []).filter(o => o.currency === 'BRL');
    const stores = confirmedBrlOffers.map(o => ({
      store: o.store,
      finalPrice: o.finalPrice,
      originalPrice: o.originalPrice,
      discount: o.discount,
      launcher: o.launcher,
      edition: o.edition,
      region: o.region,
      url: o.url,
      source: o.source,
      verifiedAt: o.verifiedAt,
    }));
    return {
      game: game.name,
      appId: game.appId,
      resolvedTitle: data.game?.title,
      status: 200,
      duration,
      sources: data.sources || [],
      coverage: data.coverage || [],
      confirmedBrlCount: confirmedBrlOffers.length,
      offers: stores,
    };
  } catch (err) {
    return { game: game.name, appId: game.appId, status: 0, error: err.message, duration: Date.now() - start };
  }
}

async function main() {
  console.log(`Auditing Production Multi-Store Offers against ${BASE_URL}...`);
  for (const g of testGames) {
    console.log(`\n--- Querying ${g.name} (AppID: ${g.appId}) ---`);
    const res = await checkGame(g);
    console.log(`Status: ${res.status} (${res.duration}ms)`);
    if (res.error) {
      console.log(`Error: ${res.error}`);
      continue;
    }
    console.log(`Resolved Authoritative Title: "${res.resolvedTitle}"`);
    console.log(`Sources Listed:`, res.sources);
    console.log(`Confirmed BRL Offers (${res.confirmedBrlCount}):`);
    for (const o of res.offers) {
      console.log(`  - [${o.store}] R$ ${o.finalPrice.toFixed(2)} (Reg: R$ ${o.originalPrice.toFixed(2)}, -${o.discount}%) | Launcher: ${o.launcher} | Region: ${o.region}`);
      console.log(`    URL: ${o.url}`);
      console.log(`    VerifiedAt: ${o.verifiedAt}`);
    }
    console.log(`Coverage Diagnostic:`);
    for (const c of res.coverage) {
      console.log(`  - ${c.store}: status=${c.status || c.available} ${c.diagnostic ? `(${c.diagnostic})` : ''} ${c.productUrl ? `[url: ${c.productUrl}]` : ''}`);
    }
  }
}

main().catch(console.error);

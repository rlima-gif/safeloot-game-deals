// Measure real price coverage on production
const BASE_URL = 'https://safeloot.safeloot.workers.dev';

async function measure() {
  console.log('Fetching surfaced games from /api/highlights...');
  const highlightsRes = await fetch(`${BASE_URL}/api/highlights`, { signal: AbortSignal.timeout(10000) });
  if (!highlightsRes.ok) throw new Error(`HTTP ${highlightsRes.status}`);
  const highlights = await highlightsRes.json();
  const featured = highlights.featured || [];
  const trending = highlights.trending || [];
  const allSurfaced = [...featured, ...trending];

  // Also include key audited games to ensure multi-store scope
  const auditedIds = [646570, 1091500, 292030, 405310, 1971870, 1203620];
  const uniqueAppIds = new Set(allSurfaced.map(g => g.id || g.appId).filter(id => Number.isInteger(id) && id > 0));
  for (const id of auditedIds) uniqueAppIds.add(id);

  console.log(`Total unique candidate games in sample scope: ${uniqueAppIds.size}`);

  // Query /api/offers for a representative sample (e.g. 20 games) to measure multi-store rate
  const sampleIds = Array.from(uniqueAppIds).slice(0, 25);
  console.log(`Auditing representative sample of ${sampleIds.length} games for multi-store price coverage...`);

  let uniqueGamesWithConfirmedPrice = 0;
  let gamesWith2OrMore = 0;
  let gamesWith3OrMore = 0;
  const offersByRetailer = {};
  let totalConfirmedNumericOffers = 0;
  let gogConfirmed = 0;
  let nuuvemConfirmed = 0;
  let steamConfirmed = 0;
  let hypeConfirmed = 0;
  let gamersgateConfirmed = 0;
  let cheapsharkUsdOffers = 0;

  for (const appId of sampleIds) {
    try {
      const res = await fetch(`${BASE_URL}/api/offers?appid=${appId}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const data = await res.json();
      const brlOffers = (data.offers || []).filter(o => o.currency === 'BRL' && typeof o.finalPrice === 'number');
      const usdOffers = (data.offers || []).filter(o => o.currency === 'USD');
      cheapsharkUsdOffers += usdOffers.length;

      const distinctRetailers = new Set(brlOffers.map(o => o.store));
      if (distinctRetailers.size > 0) uniqueGamesWithConfirmedPrice++;
      if (distinctRetailers.size >= 2) gamesWith2OrMore++;
      if (distinctRetailers.size >= 3) gamesWith3OrMore++;

      for (const o of brlOffers) {
        totalConfirmedNumericOffers++;
        offersByRetailer[o.store] = (offersByRetailer[o.store] || 0) + 1;
        if (o.store === 'GOG') gogConfirmed++;
        if (o.store === 'Nuuvem') nuuvemConfirmed++;
        if (o.store === 'Steam') steamConfirmed++;
        if (o.store === 'Hype Games') hypeConfirmed++;
        if (o.store === 'GamersGate') gamersgateConfirmed++;
      }
    } catch (e) {
      console.error(`Failed appId ${appId}:`, e.message);
    }
  }

  // Also query giveaways for Epic
  let epicFreeOffers = 0;
  try {
    const giveRes = await fetch(`${BASE_URL}/api/giveaways`, { signal: AbortSignal.timeout(8000) });
    if (giveRes.ok) {
      const gData = await giveRes.json();
      epicFreeOffers = (gData.giveaways || []).length;
    }
  } catch {}

  console.log('\n=== REAL PRICE COVERAGE METRICS ===');
  console.log(`Sample Scope: ${sampleIds.length} games audited across live catalog`);
  console.log(`REAL_PRICE_RETAILERS: Steam, GOG, Hype Games, Epic Games (free), Nuuvem`);
  console.log(`CONFIRMED_NUMERIC_OFFERS (BRL): ${totalConfirmedNumericOffers}`);
  console.log(`UNIQUE_GAMES_WITH_CONFIRMED_PRICE: ${uniqueGamesWithConfirmedPrice}`);
  console.log(`GAMES_WITH_2_OR_MORE_REAL_RETAILERS: ${gamesWith2OrMore}`);
  console.log(`GAMES_WITH_3_OR_MORE_REAL_RETAILERS: ${gamesWith3OrMore}`);
  console.log(`OFFERS_BY_RETAILER:`, offersByRetailer);
  console.log(`STEAM_CONFIRMED_OFFERS: ${steamConfirmed}`);
  console.log(`GOG_CONFIRMED_OFFERS: ${gogConfirmed}`);
  console.log(`HYPE_CONFIRMED_OFFERS: ${hypeConfirmed}`);
  console.log(`NUUVEM_CONFIRMED_OFFERS: ${nuuvemConfirmed}`);
  console.log(`EPIC_CONFIRMED_FREE_OFFERS: ${epicFreeOffers}`);
  console.log(`CHEAPSHARK_USD_OFFERS (isolated): ${cheapsharkUsdOffers}`);
  console.log(`LINK_ONLY_RETAILERS: Eneba, Kinguin, CDKeys, Instant Gaming, GAMIVO`);

  const multiStoreComparisonRate = uniqueGamesWithConfirmedPrice > 0
    ? ((gamesWith2OrMore / uniqueGamesWithConfirmedPrice) * 100).toFixed(1)
    : '0';
  console.log(`\nMULTI_STORE_COMPARISON_RATE: ${multiStoreComparisonRate}% (${gamesWith2OrMore} / ${uniqueGamesWithConfirmedPrice})`);
}

measure().catch(console.error);

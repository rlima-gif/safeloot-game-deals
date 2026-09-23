const BASE_URL = 'https://safeloot.safeloot.workers.dev';

async function runSmokeTests() {
  console.log(`=== SafeLoot Live Production Smoke Test ===\nTarget: ${BASE_URL}\n`);

  let allPassed = true;

  // 1. Home
  try {
    const res = await fetch(BASE_URL);
    const html = await res.text();
    const statusOk = res.status === 200;
    const titleOk = html.includes('SafeLoot');
    const ogOk = html.includes('og:title') && html.includes('SafeLoot');
    console.log(`[1] Home Page: Status ${res.status} | Title: ${titleOk} | OG: ${ogOk}`);
    if (!statusOk || !titleOk) allPassed = false;
  } catch (err) {
    console.error('[1] Home Page failed:', err.message);
    allPassed = false;
  }

  // 2. Game Detail Page (Slay the Spire)
  try {
    const res = await fetch(`${BASE_URL}/jogo/646570?titulo=Slay%20the%20Spire`);
    const html = await res.text();
    const statusOk = res.status === 200;
    const hasJsonLd = html.includes('application/ld+json');
    const hasProductType = html.includes('"@type":"Product"') || html.includes('schema.org');
    const hasAggregateOffer = html.includes('AggregateOffer');
    const hasCanonical = html.includes('rel="canonical"') && html.includes('/jogo/646570');
    const hasOgMeta = html.includes('og:title') && html.includes('og:image');
    console.log(`[2] Game Page: Status ${res.status} | JSON-LD: ${hasJsonLd} | Schema Product: ${hasProductType} | AggregateOffer: ${hasAggregateOffer} | Canonical: ${hasCanonical} | OG: ${hasOgMeta}`);
    if (!statusOk || !hasJsonLd || !hasCanonical) allPassed = false;
  } catch (err) {
    console.error('[2] Game Page failed:', err.message);
    allPassed = false;
  }

  // 3. Price History API
  try {
    const res = await fetch(`${BASE_URL}/api/history?appid=646570&days=90`);
    const data = await res.json();
    const statusOk = res.status === 200;
    const hasPoints = Array.isArray(data.points);
    console.log(`[3] Price History API: Status ${res.status} | Has Points Array: ${hasPoints} | Status: ${data.status} | Source: ${data.source} | Points: ${data.points?.length ?? 0}`);
    if (!statusOk || !hasPoints) allPassed = false;
  } catch (err) {
    console.error('[3] Price History API failed:', err.message);
    allPassed = false;
  }

  // 4. Highlights API
  try {
    const res = await fetch(`${BASE_URL}/api/highlights`);
    const data = await res.json();
    const statusOk = res.status === 200;
    const hasDeals = Array.isArray(data.featured) || Array.isArray(data.trending);
    const featuredCount = data.featured?.length || 0;
    const trendingCount = data.trending?.length || 0;
    console.log(`[4] Highlights API: Status ${res.status} | Featured Deals: ${featuredCount} | Trending Deals: ${trendingCount}`);
    if (!statusOk || (!featuredCount && !trendingCount)) allPassed = false;
  } catch (err) {
    console.error('[4] Highlights API failed:', err.message);
    allPassed = false;
  }

  // 5. Free Games / Giveaways API
  try {
    const res = await fetch(`${BASE_URL}/api/giveaways`);
    const data = await res.json();
    const statusOk = res.status === 200;
    const count = Array.isArray(data.games) ? data.games.length : 0;
    console.log(`[5] Giveaways API: Status ${res.status} | Active Epic Giveaways: ${count}`);
    if (!statusOk || !Array.isArray(data.games)) allPassed = false;
  } catch (err) {
    console.error('[5] Giveaways API failed:', err.message);
    allPassed = false;
  }

  // 6. Verification page / Legal / Stores
  try {
    const res = await fetch(`${BASE_URL}/como-verificamos`);
    console.log(`[6] Trust & Verification Page (/como-verificamos): Status ${res.status}`);
    if (res.status !== 200) allPassed = false;
  } catch (err) {
    console.error('[6] Verification Page failed:', err.message);
    allPassed = false;
  }

  console.log(`\nOverall Smoke Test Result: ${allPassed ? 'ALL SYSTEMS OPERATIONAL ✅' : 'FAILURES DETECTED ❌'}`);
  process.exit(allPassed ? 0 : 1);
}

void runSmokeTests();

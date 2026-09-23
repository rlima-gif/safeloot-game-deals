import assert from 'node:assert/strict';

const BASE = 'https://safeloot.safeloot.workers.dev';

async function main() {
  console.log(`Starting live production audit against ${BASE}...\n`);

  // 1. Audit Highlights API
  const highlightsRes = await fetch(`${BASE}/api/highlights`);
  assert.equal(highlightsRes.status, 200, 'Highlights API must return 200');
  const highlights = await highlightsRes.json();
  console.log(`[HIGHLIGHTS] Featured count: ${highlights.featured.length}, Trending count: ${highlights.trending.length}`);

  // Check anti-shovelware in featured
  const shovelwareTerms = ['demo', 'prologue', 'playtest', 'soundtrack', 'tree simulator', 'cats', 'dressmaker', 'kabuto park', 'block'];
  const suspiciousInFeatured = highlights.featured.filter(g => 
    shovelwareTerms.some(term => g.title.toLowerCase().includes(term))
  );
  console.log(`[HIGHLIGHTS] Suspicious/shovelware titles in featured: ${suspiciousInFeatured.length}`);
  if (suspiciousInFeatured.length > 0) {
    console.log(' Suspicious items:', suspiciousInFeatured.map(g => g.title));
  }

  // Top 10 featured
  console.log('\nTop 10 Featured Deals in Production:');
  highlights.featured.slice(0, 10).forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.title} | R$ ${g.finalPrice} (${g.discount}% OFF) | Score: ${g.dealScore ?? 'N/A'} | Badge: ${g.explainBadge ?? 'N/A'}`);
  });

  // Trending
  console.log('\nTrending Games in Production:');
  highlights.trending.forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.title} | R$ ${g.finalPrice}`);
  });

  // 2. Audit Discovery Shelves API
  const discoveryRes = await fetch(`${BASE}/api/discovery`);
  assert.equal(discoveryRes.status, 200, 'Discovery API must return 200');
  const discovery = await discoveryRes.json();
  console.log(`\n[DISCOVERY] Total Shelves: ${discovery.shelves.length}`);
  for (const s of discovery.shelves) {
    console.log(`\nShelf: "${s.title}" (ID: ${s.id}, Status: ${s.status}, Count: ${s.games.length})`);
    console.log(`Description: ${s.description}`);
    const top3 = s.games.slice(0, 3);
    top3.forEach((g, idx) => {
      console.log(`   ${idx + 1}. ${g.title} | R$ ${g.price} (-${g.discount}%) | Badge: ${g.badge || 'N/A'} | Store: ${g.store}`);
    });
  }

  // 3. Audit Keyshops API & Outbound Resolvers
  const keyshopsRes = await fetch(`${BASE}/api/keyshops`);
  assert.equal(keyshopsRes.status, 200, 'Keyshops API must return 200');
  const keyshopsData = await keyshopsRes.json();
  console.log(`\n[KEYSHOPS API] Found ${keyshopsData.stores.length} unintegrated stores:`, keyshopsData.stores.map(s => s.name));
  assert.equal(keyshopsData.stores.length, 5, 'Must return exactly 5 unintegrated stores');

  for (const store of keyshopsData.stores) {
    const redirectRes = await fetch(`${BASE}/go/keyshop/${store.id}`, { redirect: 'manual' });
    assert.equal(redirectRes.status, 302, `Outbound redirect for ${store.id} must return 302`);
    const loc = redirectRes.headers.get('location');
    assert.ok(loc && loc.startsWith('http'), `Location header for ${store.id} must be valid: ${loc}`);
    console.log(`  - /go/keyshop/${store.id} -> 302 -> ${loc}`);
  }

  console.log('\n✅ All production API & outbound verification assertions passed.');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});

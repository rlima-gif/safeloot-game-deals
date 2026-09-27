import assert from 'node:assert/strict';

const BASE_URL = 'https://safeloot.safeloot.workers.dev';

console.log('=== Running Live Production Security Verification Probes ===');

async function runProbes() {
  // 1. Verify Global Security Headers on Root SSR Page
  console.log('1. Probing root SSR page headers...');
  const rootRes = await fetch(`${BASE_URL}/`, { method: 'GET' });
  assert.equal(rootRes.status, 200, 'Root must respond 200');

  const headers = Object.fromEntries(rootRes.headers.entries());
  console.log('Returned headers:', {
    'content-security-policy': headers['content-security-policy']?.slice(0, 60) + '...',
    'strict-transport-security': headers['strict-transport-security'],
    'x-content-type-options': headers['x-content-type-options'],
    'x-frame-options': headers['x-frame-options'],
    'referrer-policy': headers['referrer-policy'],
    'permissions-policy': headers['permissions-policy'],
  });

  assert.ok(headers['content-security-policy'], 'CSP header must be present');
  assert.ok(headers['content-security-policy'].includes("frame-ancestors 'none'"), 'CSP must include frame-ancestors none');
  assert.ok(headers['content-security-policy'].includes("object-src 'none'"), 'CSP must include object-src none');
  assert.equal(headers['strict-transport-security'], 'max-age=31536000; includeSubDomains; preload');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.ok(headers['permissions-policy'], 'Permissions-Policy must be present');
  console.log('  -> All 6 security headers verified on root SSR page! ✅');

  // 2. Verify JSON-LD Escaping on Live Root HTML
  console.log('2. Inspecting live JSON-LD structured data on homepage...');
  const html = await rootRes.text();
  assert.ok(html.includes('<script type="application/ld+json">'), 'JSON-LD script must be present');
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  assert.ok(jsonLdMatch, 'Should find JSON-LD tag');
  const jsonLdText = jsonLdMatch[1];
  // Verify it parses as valid JSON
  const parsedJsonLd = JSON.parse(jsonLdText);
  assert.equal(parsedJsonLd['@type'], 'ItemList');
  assert.ok(Array.isArray(parsedJsonLd.itemListElement));
  console.log(`  -> JSON-LD parsed cleanly with ${parsedJsonLd.itemListElement.length} items! ✅`);

  // 3. Verify Admin Route Denial (Non-Destructive)
  console.log('3. Probing privileged admin routes for unauthorized denial...');
  const newsCronRes = await fetch(`${BASE_URL}/api/cron/news`, { method: 'POST' });
  assert.equal(newsCronRes.status, 401, 'Unauthenticated POST /api/cron/news must return 401');

  const pricesCronRes = await fetch(`${BASE_URL}/api/cron/prices`, {
    method: 'POST',
    headers: { Authorization: 'Bearer bad_token_probe' },
  });
  assert.equal(pricesCronRes.status, 401, 'POST /api/cron/prices with bad token must return 401');

  const healthRes = await fetch(`${BASE_URL}/api/integrations/health`, { method: 'GET' });
  assert.equal(healthRes.status, 401, 'GET /api/integrations/health without auth must return 401');
  console.log('  -> Admin routes strictly reject unauthorized requests with 401! ✅');

  // 4. Verify Parameter Bounds & Abuse Resistance
  console.log('4. Probing API input boundaries...');
  const invalidAppIdRes = await fetch(`${BASE_URL}/api/offers?appid=-99`);
  assert.equal(invalidAppIdRes.status, 400, 'Negative appid must return 400');

  const hugeAppIdRes = await fetch(`${BASE_URL}/api/offers?appid=99999999999`);
  assert.equal(hugeAppIdRes.status, 400, 'Out-of-bounds appid must return 400');

  const invalidHistoryRes = await fetch(`${BASE_URL}/api/history?appid=1091500&days=7`);
  assert.equal(invalidHistoryRes.status, 400, 'Invalid days in history must return 400');
  console.log('  -> Input boundaries strictly enforced! ✅');

  // 5. Verify Outbound Redirect Boundary (No Open Redirect)
  console.log('5. Probing outbound commerce redirects...');
  const badStoreRes = await fetch(`${BASE_URL}/go/keyshop/attacker-store`, { redirect: 'manual' });
  assert.equal(badStoreRes.status, 404, 'Unlisted store must return 404');

  const badOfferRes = await fetch(`${BASE_URL}/go/steam/fake-offer?appid=1091500`, { redirect: 'manual' });
  assert.equal(badOfferRes.status, 404, 'Unconfirmed offer must return 404');
  console.log('  -> Outbound redirects strictly reject unapproved destinations! ✅');

  // 6. Verify Normal Product Browsing Integrity
  console.log('6. Probing normal game page (Cyberpunk 2077)...');
  const gameRes = await fetch(`${BASE_URL}/jogo/1091500`);
  assert.equal(gameRes.status, 200, 'Game detail page must respond 200');
  const gameHeaders = Object.fromEntries(gameRes.headers.entries());
  assert.ok(gameHeaders['content-security-policy'], 'Game page must include CSP');
  assert.equal(gameHeaders['x-frame-options'], 'DENY', 'Game page must include X-Frame-Options');

  const gameHtml = await gameRes.text();
  assert.ok(gameHtml.includes('Cyberpunk 2077'), 'Game title must be present in HTML');
  assert.ok(gameHtml.includes('<script type="application/ld+json">'), 'Game page JSON-LD present');
  console.log('  -> Game page renders cleanly with security headers and title! ✅');

  console.log('\n=== ALL LIVE PRODUCTION SECURITY CHECKS PASSED SUCCESSFULLY! ===');
}

runProbes().catch((err) => {
  console.error('Live security verification probe failed:', err);
  process.exit(1);
});

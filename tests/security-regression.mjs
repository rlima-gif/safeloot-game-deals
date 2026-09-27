import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { moduleUrl } from './load-ts.mjs';

const { authorizeAdmin } = await import(moduleUrl('lib/admin-auth.ts'));
const { isAllowedDestinationHost, affiliateDestination } = await import(moduleUrl('lib/affiliate.ts'));
const { buildGameProductJsonLd, buildHighlightsOfferJsonLd, safeJsonLdStringify } = await import(moduleUrl('lib/structured-data.ts'));
const { getGameOffers, _clearOffersCacheForTesting } = await import(moduleUrl('lib/game-api.ts'));

console.log('--- Running SafeLoot Security Hardening & Anti-Hack Regression Suite ---');

let passedChecks = 0;

// ============================================================
// 1. ADMIN AUTHORIZATION & TIMING ATTACK RESISTANCE
// ============================================================
{
  const testSecret = 'safeloot_super_secret_token_2026_xyz';

  // 1.1 Unauthenticated request (no auth header) -> 401
  const reqNoAuth = new Request('https://safeloot.safeloot.workers.dev/api/cron/news', { method: 'POST' });
  const resNoAuth = authorizeAdmin(reqNoAuth, testSecret);
  assert.ok(resNoAuth, 'Unauthenticated request must be denied');
  assert.equal(resNoAuth.status, 401, 'Unauthenticated request must return 401');
  assert.equal(resNoAuth.headers.get('Cache-Control'), 'no-store', 'Auth responses must not be cached');
  passedChecks++;

  // 1.2 Wrong token -> 401
  const reqWrongToken = new Request('https://safeloot.safeloot.workers.dev/api/cron/news', {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong_token_attempt' },
  });
  const resWrongToken = authorizeAdmin(reqWrongToken, testSecret);
  assert.ok(resWrongToken);
  assert.equal(resWrongToken.status, 401);
  passedChecks++;

  // 1.3 Partial prefix match (timing attack test vector) -> 401
  const reqPrefixMatch = new Request('https://safeloot.safeloot.workers.dev/api/cron/news', {
    method: 'POST',
    headers: { Authorization: `Bearer ${testSecret.slice(0, 10)}` },
  });
  const resPrefixMatch = authorizeAdmin(reqPrefixMatch, testSecret);
  assert.ok(resPrefixMatch);
  assert.equal(resPrefixMatch.status, 401);
  passedChecks++;

  // 1.4 Oversized authorization header (> 512 chars) -> 401
  const reqOversized = new Request('https://safeloot.safeloot.workers.dev/api/cron/news', {
    method: 'POST',
    headers: { Authorization: `Bearer ${'A'.repeat(600)}` },
  });
  const resOversized = authorizeAdmin(reqOversized, testSecret);
  assert.ok(resOversized);
  assert.equal(resOversized.status, 401);
  passedChecks++;

  // 1.5 Missing configured token in environment -> 503 Service Unavailable
  const reqValid = new Request('https://safeloot.safeloot.workers.dev/api/cron/news', {
    method: 'POST',
    headers: { Authorization: `Bearer ${testSecret}` },
  });
  const resUnconfigured = authorizeAdmin(reqValid, '');
  assert.ok(resUnconfigured);
  assert.equal(resUnconfigured.status, 503, 'Unconfigured admin routine must return 503');
  passedChecks++;

  // 1.6 Exact matching token -> null (Authorized)
  const resAuthorized = authorizeAdmin(reqValid, testSecret);
  assert.equal(resAuthorized, null, 'Exact token match must be authorized (return null)');
  passedChecks++;
}

// ============================================================
// 2. OUTBOUND COMMERCE & OPEN REDIRECT DEFENSE
// ============================================================
{
  // 2.1 Approved destinations
  assert.equal(isAllowedDestinationHost('steampowered.com'), true);
  assert.equal(isAllowedDestinationHost('store.steampowered.com'), true);
  assert.equal(isAllowedDestinationHost('epicgames.com'), true);
  assert.equal(isAllowedDestinationHost('store.epicgames.com'), true);
  assert.equal(isAllowedDestinationHost('nuuvem.com'), true);
  assert.equal(isAllowedDestinationHost('www.nuuvem.com'), true);
  assert.equal(isAllowedDestinationHost('greenmangaming.com'), true);
  assert.equal(isAllowedDestinationHost('gog.com'), true);
  assert.equal(isAllowedDestinationHost('cheapshark.com'), true);
  assert.equal(isAllowedDestinationHost('isthereanydeal.com'), true);
  assert.equal(isAllowedDestinationHost('awin1.com'), true);
  passedChecks++;

  // 2.2 Attack vectors must fail closed
  assert.equal(isAllowedDestinationHost('evil.com'), false);
  assert.equal(isAllowedDestinationHost('attacker-steampowered.com'), false);
  assert.equal(isAllowedDestinationHost('steampowered.com.attacker.com'), false);
  assert.equal(isAllowedDestinationHost('nuuvem.com.evil.co'), false);
  assert.equal(isAllowedDestinationHost('localhost'), false);
  assert.equal(isAllowedDestinationHost('127.0.0.1'), false);
  assert.equal(isAllowedDestinationHost('169.254.169.254'), false);
  assert.equal(isAllowedDestinationHost('javascript:alert(1)'), false);
  passedChecks++;

  // 2.3 Protocol & credential enforcement in affiliateDestination
  assert.throws(
    () => affiliateDestination({ store: 'Steam', url: 'http://store.steampowered.com/app/10', source: 'Steam Store' }),
    /Destino inválido/,
    'Plain HTTP destination must be rejected',
  );
  assert.throws(
    () => affiliateDestination({ store: 'Steam', url: 'https://attacker:secret@store.steampowered.com/app/10', source: 'Steam Store' }),
    /Destino inválido/,
    'Embedded credentials in URL must be rejected',
  );
  assert.throws(
    () => affiliateDestination({ store: 'Steam', url: 'https://evil-phishing.com/app/10', source: 'Steam Store' }),
    /Domínio de destino não autorizado/,
    'Unlisted destination domain must be rejected',
  );
  passedChecks++;
}

// ============================================================
// 3. STRUCTURED DATA XSS & SCRIPT BREAKOUT DEFENSE
// ============================================================
{
  const maliciousPayload = {
    title: 'Hacked Game </script><script>alert("XSS")</script>',
    description: 'Attack test <img src=x onerror=alert(1)>',
    nested: { html: '<b>bold</b> & "quotes"' },
  };

  const serialized = safeJsonLdStringify(maliciousPayload);
  assert.ok(!serialized.includes('<script>'), 'safeJsonLdStringify must not contain raw <script>');
  assert.ok(!serialized.includes('</script>'), 'safeJsonLdStringify must not contain raw </script>');
  assert.ok(!serialized.includes('<'), 'safeJsonLdStringify must escape all raw < characters to \\u003c');
  assert.ok(serialized.includes('\\u003cscript>'), 'safeJsonLdStringify must encode < as \\u003c');

  // Verify that JSON.parse still round-trips to the original text identically
  const roundTripped = JSON.parse(serialized);
  assert.equal(roundTripped.title, maliciousPayload.title, 'Parsed JSON must match original title');
  assert.equal(roundTripped.description, maliciousPayload.description, 'Parsed JSON must match original description');
  passedChecks++;
}

// ============================================================
// 4. AVAILABILITY SEMANTICS INVARIANT (Price Truth != Stock Truth)
// ============================================================
{
  // 4.1 Product JSON-LD: confirmedPrice must NEVER trigger availability: InStock
  const productNoAvail = buildGameProductJsonLd({
    gameId: 1091500,
    title: 'Cyberpunk 2077',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/header.jpg',
    canonicalUrl: 'https://safeloot.safeloot.workers.dev/jogo/1091500',
    confirmedPrice: 99.99,
    regularPrice: 199.99,
  });
  const offersSchema = productNoAvail.offers;
  assert.equal(offersSchema.lowPrice, 99.99);
  assert.equal(offersSchema.availability, undefined, 'Availability must be omitted without explicit stock signal');
  passedChecks++;

  // 4.2 Product JSON-LD: explicitAvailability: true emits InStock
  const productWithAvail = buildGameProductJsonLd({
    gameId: 1091500,
    title: 'Cyberpunk 2077',
    imageUrl: 'https://shared.cloudflare.steamstatic.com/header.jpg',
    canonicalUrl: 'https://safeloot.safeloot.workers.dev/jogo/1091500',
    confirmedPrice: 99.99,
    explicitAvailability: true,
  });
  assert.equal(productWithAvail.offers.availability, 'https://schema.org/InStock');
  passedChecks++;

  // 4.3 Highlights JSON-LD: priceStatus: 'confirmed' must NEVER trigger availability: InStock
  const highlightNoAvail = buildHighlightsOfferJsonLd({
    title: 'Hollow Knight',
    finalPrice: 19.99,
    priceStatus: 'confirmed',
  });
  assert.equal(highlightNoAvail.offers.availability, undefined);
  passedChecks++;

  // 4.4 Highlights JSON-LD: explicitAvailability: true emits InStock
  const highlightWithAvail = buildHighlightsOfferJsonLd({
    title: 'Hollow Knight',
    finalPrice: 19.99,
    priceStatus: 'confirmed',
    explicitAvailability: true,
  });
  assert.equal(highlightWithAvail.offers.availability, 'https://schema.org/InStock');
  passedChecks++;
}

// ============================================================
// 5. SSRF BLOCKING RULES & PRIVATE IP FILTERING
// ============================================================
{
  const privateIpRegex = /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./;

  const testBlockedIps = [
    '127.0.0.1',
    '127.0.1.1',
    '10.0.0.1',
    '10.255.255.255',
    '192.168.0.1',
    '192.168.1.254',
    '172.16.0.1',
    '172.31.255.255',
    '169.254.169.254', // AWS/Cloud metadata service
    '0.0.0.0',
  ];

  for (const ip of testBlockedIps) {
    assert.ok(privateIpRegex.test(ip), `SSRF filter must identify ${ip} as private/loopback`);
  }

  const testPublicIps = [
    '1.1.1.1',
    '8.8.8.8',
    '104.21.5.12',
    '172.15.0.1',
    '172.32.0.1',
  ];

  for (const ip of testPublicIps) {
    assert.ok(!privateIpRegex.test(ip), `SSRF filter must allow valid public IP ${ip}`);
  }
  passedChecks++;
}

// ============================================================
// 6. INPUT BOUNDARIES & VALUE CONSTRAINTS
// ============================================================
{
  await assert.rejects(
    async () => getGameOffers(-1, 'Test Game'),
    /AppID inválido/,
    'Negative AppID must be rejected',
  );

  await assert.rejects(
    async () => getGameOffers(0, 'Test Game'),
    /AppID inválido/,
    'Zero AppID must be rejected',
  );

  await assert.rejects(
    async () => getGameOffers(3_000_000_000, 'Test Game'),
    /AppID inválido/,
    'Out of bounds AppID (>2B) must be rejected',
  );

  await assert.rejects(
    async () => getGameOffers(NaN, 'Test Game'),
    /AppID inválido/,
    'NaN AppID must be rejected',
  );
  passedChecks++;
}

// ============================================================
// 7. IN-MEMORY CACHE & REQUEST COALESCING
// ============================================================
{
  assert.equal(typeof _clearOffersCacheForTesting, 'function', '_clearOffersCacheForTesting must be exported');
  _clearOffersCacheForTesting();
  passedChecks++;
}

// ============================================================
// 8. SECURITY HEADERS INVARIANT VERIFICATION
// ============================================================
{
  const workerContent = fs.readFileSync(path.resolve('worker.mjs'), 'utf8');

  // Verify presence of all essential security headers in worker.mjs
  assert.ok(workerContent.includes("'Content-Security-Policy'"), 'worker.mjs must define Content-Security-Policy');
  assert.ok(workerContent.includes("'Strict-Transport-Security'"), 'worker.mjs must define Strict-Transport-Security');
  assert.ok(workerContent.includes("'X-Content-Type-Options'"), 'worker.mjs must define X-Content-Type-Options');
  assert.ok(workerContent.includes("'X-Frame-Options'"), 'worker.mjs must define X-Frame-Options');
  assert.ok(workerContent.includes("'Referrer-Policy'"), 'worker.mjs must define Referrer-Policy');
  assert.ok(workerContent.includes("'Permissions-Policy'"), 'worker.mjs must define Permissions-Policy');
  assert.ok(workerContent.includes("frame-ancestors 'none'"), 'CSP must include frame-ancestors none');
  assert.ok(workerContent.includes("object-src 'none'"), 'CSP must include object-src none');
  assert.ok(workerContent.includes("base-uri 'self'"), 'CSP must include base-uri self');
  assert.ok(workerContent.includes("form-action 'self'"), 'CSP must include form-action self');
  assert.ok(workerContent.includes('applySecurityHeaders(res)'), 'worker.mjs must apply security headers to fetch responses');
  passedChecks++;

  const nextConfigContent = fs.readFileSync(path.resolve('next.config.ts'), 'utf8');
  assert.ok(nextConfigContent.includes('headers()'), 'next.config.ts must declare async headers()');
  assert.ok(nextConfigContent.includes('X-Content-Type-Options'), 'next.config.ts must include X-Content-Type-Options');
  assert.ok(nextConfigContent.includes('X-Frame-Options'), 'next.config.ts must include X-Frame-Options');
  passedChecks++;
}

console.log(`Security Hardening Regression Tests: ALL ${passedChecks} CHECK GROUPS PASSED ✅`);

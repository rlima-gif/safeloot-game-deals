// Test live outbound redirects from production
const BASE_URL = 'https://safeloot.safeloot.workers.dev';

async function testRedirect(name, path) {
  const url = `${BASE_URL}${path}`;
  console.log(`\nTesting [${name}]: ${url}`);
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  console.log(`HTTP Status: ${res.status}`);
  const location = res.headers.get('location');
  console.log(`Location Header: ${location}`);
  const cacheControl = res.headers.get('cache-control');
  console.log(`Cache-Control: ${cacheControl}`);

  if (res.status === 302 && location && location.startsWith('https://')) {
    console.log(`Result: SUCCESS (Valid 302 HTTPS redirect to ${new URL(location).hostname}) ✅`);
    return { ok: true, location };
  } else {
    console.log(`Result: FAILURE ❌`);
    return { ok: false, status: res.status, location };
  }
}

async function main() {
  console.log('=== TESTING PRODUCTION OUTBOUND RESOLVER ===');

  // 1. GOG Slay the Spire
  await testRedirect(
    'GOG - Slay the Spire',
    '/go/gog/gog-gog-br-1950754973?appid=646570&title=Slay%20the%20Spire'
  );

  // 2. Hype Games - LEGO Marvel
  await testRedirect(
    'Hype Games - LEGO Marvel',
    '/go/hype/hype-games-hype-br-3043?appid=405310&title=LEGO%C2%AE%20MARVEL%27s%20Avengers'
  );

  // 3. Steam - Slay the Spire
  await testRedirect(
    'Steam - Slay the Spire',
    '/go/steam/steam-646570?appid=646570&title=Slay%20the%20Spire'
  );

  // 4. Discovery Card Outbound (controlled discovery fallback)
  await testRedirect(
    'Discovery Outbound',
    '/go/discovery/gmg-Car-Dealer-Simulator_3'
  );

  // 5. Open Redirect Attack Simulation: must fail closed (e.g. invalid store or offer)
  console.log('\nTesting Open-Redirect Attack Simulation on /go/...');
  const attackUrl = `${BASE_URL}/go/steam/evil-offer?appid=646570&title=Slay%20the%20Spire`;
  const attackRes = await fetch(attackUrl, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
  console.log(`Attack query status: ${attackRes.status} (Expected 404 or 400, no open redirect)`);
  if (attackRes.status !== 302) {
    console.log('Result: SUCCESS (Attack blocked safely) ✅');
  } else {
    console.log('Result: FAILED (Unexpected redirect)');
  }
}

main().catch(console.error);

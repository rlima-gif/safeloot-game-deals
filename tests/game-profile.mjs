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
const {
  parseProfile,
  cleanText,
  publicUrl,
  youtubeIds,
  matchesTrailer,
  getGameProfile,
} = await import(moduleUrl('lib/game-profile.ts'));
const fixture = {
  steam_appid: 987654,
  name: 'Small Game',
  short_description: '<b>A puzzle.</b><script>alert(1)</script>',
  publishers: ['Studio'],
  developers: ['Dev'],
  platforms: { windows: true, linux: false },
  categories: [
    { id: 2, description: 'Um jogador' },
    { id: 22, description: 'Conquistas Steam' },
  ],
  screenshots: [
    {
      path_full: 'https://shared.akamai.steamstatic.com/game.jpg',
      path_thumbnail: 'https://shared.akamai.steamstatic.com/thumb.jpg',
    },
    { path_full: 'javascript:alert(1)', path_thumbnail: 'http://localhost/a' },
  ],
  pc_requirements: { minimum: '<b>OS:</b> Windows<br><li>RAM: 2 GB</li>' },
  release_date: { date: '2026', coming_soon: true },
};
const p = parseProfile(987654, fixture);
assert.equal(p.description, 'A puzzle.');
assert.deepEqual(p.platforms, ['Windows']);
assert.deepEqual(p.modes, ['Um jogador']);
assert.equal(p.screenshots.length, 1);
assert.equal(p.requirements[0].minimum, 'OS: Windows\nRAM: 2 GB');
assert.equal(p.comingSoon, true);
assert.deepEqual(parseProfile(1, {}).requirements, []);
assert.equal(cleanText('&lt;b&gt;Text&lt;/b&gt;'), '<b>Text</b>'); // Rendered as React text, never HTML.
for (const url of [
  'https://127.0.0.1',
  'http://example.com',
  'https://user:pass@example.com',
  'https://site.internal',
  'https://[::1]',
  'javascript:alert(1)',
])
  assert.equal(publicUrl(url), undefined);
assert.deepEqual(
  youtubeIds(
    '[previewyoutube="abcdefghijk;full"] https://www.youtube.com/embed/abcdefghijk https://youtu.be/12345678901',
  ),
  ['abcdefghijk', '12345678901'],
);
assert.equal(
  matchesTrailer('LOK Digital - Launch Trailer', 'LOK Digital'),
  true,
);
assert.equal(matchesTrailer('He Who Watches trailer', 'LOK Digital'), false);
assert.equal(matchesTrailer('The PC Gaming Show 2024', 'LOK Digital'), false);
const actualFetch = globalThis.fetch,
  actualNow = Date.now;
let steamCalls = 0,
  offline = false,
  now = actualNow();
Date.now = () => now;
globalThis.fetch = async (url) => {
  const href = typeof url === 'string' ? url : url.url;
  if (href.includes('appdetails')) {
    steamCalls++;
    if (offline) throw new Error('offline');
    return Response.json({ 987654: { success: true, data: fixture } });
  }
  if (href.includes('GetNewsForApp'))
    return Response.json({ appnews: { newsitems: [] } });
  throw new Error('Unexpected URL');
};
try {
  const [first, second] = await Promise.all([
    getGameProfile(987654),
    getGameProfile(987654),
  ]);
  assert.equal(first.title, 'Small Game');
  assert.deepEqual(first, second);
  assert.equal(steamCalls, 1);
  await getGameProfile(987654);
  assert.equal(steamCalls, 1);
  now += 86400001;
  offline = true;
  const stale = await getGameProfile(987654);
  assert.equal(stale.stale, true);
  assert.equal(stale.title, 'Small Game');
  await getGameProfile(987654);
  assert.equal(steamCalls, 2);
  await assert.rejects(getGameProfile(111));
  const count = steamCalls;
  await assert.rejects(getGameProfile(111));
  assert.equal(steamCalls, count);
  now += 604800001;
  await assert.rejects(getGameProfile(987654));
} finally {
  globalThis.fetch = actualFetch;
  Date.now = actualNow;
}
const live = await fetch('http://localhost:3000/api/game-profile?id=2207440');
assert.equal(live.status, 200);
const lok = await live.json();
assert.equal(lok.title, 'LOK Digital');
assert.ok(lok.screenshots.length > 0);
assert.ok(lok.publishers.length > 0);
assert.ok(lok.requirements.length > 0);
assert.ok(lok.trailer?.videoId);
assert.equal(
  (await fetch('http://localhost:3000/api/game-profile?id=../bad')).status,
  400,
);
console.log(
  'Game profile checks passed: sanitization, identity, partial metadata, cache, concurrent requests, stale fallback, outage cooldown and live LOK Digital.',
);

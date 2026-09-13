import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import { moduleUrl } from './load-ts.mjs';
import { sqliteD1 } from './sqlite-d1.mjs';

const { fetchSteamNewsForApp, parseSteamNewsResponse } = await import(moduleUrl('lib/news/sources/steam.ts'));
const { fetchRssFeed, parseRssXml } = await import(moduleUrl('lib/news/sources/rss.ts'));
const { deduplicateRawItems, groupNewsItemsIntoEvents, areTitlesSimilar } = await import(moduleUrl('lib/news/dedupe.ts'));
const { HeuristicRuleNewsAIProvider } = await import(moduleUrl('lib/news/ai/provider.ts'));
const { processNewsEvent } = await import(moduleUrl('lib/news/ai/pipeline.ts'));
const { saveRawNewsItems, saveProcessedArticle, getPublishedNews, updateSourceHealth, getNewsSourceHealth } = await import(moduleUrl('lib/news/news-store.ts'));
const { collectNewsFromAllSources } = await import(moduleUrl('lib/news/collector.ts'));
const { authorizeAdmin } = await import(moduleUrl('lib/admin-auth.ts'));
const { POST: cronPost } = await import(moduleUrl('app/api/cron/news/route.ts'));
const { GET: newsGet } = await import(moduleUrl('app/api/news/route.ts'));

let checks = 0;
function equal(actual, expected) {
  assert.deepEqual(actual, expected);
  checks++;
}

const fixture = (name) => fs.readFileSync(path.join('tests/fixtures', name), 'utf8');

// 1. Full Category Contract Test & Provider Type Expose
const aiProvider = new HeuristicRuleNewsAIProvider();
equal(aiProvider.providerType, 'heuristic');

const testCategories = [
  { text: 'Cyberpunk 2077 Patch 2.13 released with performance fixes', expectedCat: 'update' },
  { text: 'The Witcher 3 Blood and Wine Expansion detailed', expectedCat: 'expansion' },
  { text: 'Phantom Liberty DLC details revealed', expectedCat: 'dlc' },
  { text: 'Cyberpunk 2077 Ultimate Edition Announced', expectedCat: 'edition' },
  { text: 'Cyberpunk 2077 is 50% off in Steam Summer Sale', expectedCat: 'sale' },
  { text: 'Permanent price cut announced for Cyberpunk 2077', expectedCat: 'price' },
  { text: 'Claim Cyberpunk 2077 for free to keep this weekend', expectedCat: 'free-game' },
  { text: 'Cyberpunk 2077 system requirements updated for 2.0', expectedCat: 'system-requirements' },
  { text: 'Cyberpunk 2077 sequel delayed to 2028', expectedCat: 'delay' },
  { text: 'Cyberpunk 2077 removes Denuvo DRM', expectedCat: 'drm' },
  { text: 'Cyberpunk 2077 is Steam Deck Verified', expectedCat: 'steam-deck' },
  { text: 'Cyberpunk 2077 adds native Linux Proton support', expectedCat: 'linux' },
  { text: 'Cyberpunk 2077 coming to Game Pass subscription', expectedCat: 'subscription' },
  { text: 'Cyberpunk 2077 sequel officially announced', expectedCat: 'announcement' },
  { text: 'Cyberpunk 2077 launching today worldwide', expectedCat: 'release' },
];

for (const tc of testCategories) {
  const res = await aiProvider.classify(tc.text, []);
  equal(res.category, tc.expectedCat);
}

// 2. Old categories 'discount' / 'event' no longer produced
const oldCatCheck1 = await aiProvider.classify('Big discount on Steam sale', []);
equal(oldCatCheck1.category !== 'discount', true);
equal(oldCatCheck1.category, 'sale');

// 3. Same game + unrelated stories within 24h DO NOT merge
const sameGameUnrelated = [
  {
    sourceId: 'steam',
    sourceName: 'Steam News',
    sourceType: 'steam',
    articleId: 'art1',
    articleUrl: 'https://steam.com/1',
    title: 'Cyberpunk 2077 Patch 2.13 Released',
    publishedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    appId: 1091500,
  },
  {
    sourceId: 'pcgamer',
    sourceName: 'PC Gamer',
    sourceType: 'rss',
    articleId: 'art2',
    articleUrl: 'https://pcgamer.com/2',
    title: 'Cyberpunk 2077 Free Cosmetic DLC Pack Available',
    publishedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    appId: 1091500,
  },
];
const unrelatedGroups = groupNewsItemsIntoEvents(sameGameUnrelated);
equal(unrelatedGroups.length, 2); // MUST stay 2 separate events

// 4. Same event phrased differently DOES merge
const sameEventPhrasedDiff = [
  {
    sourceId: 'steam',
    sourceName: 'Steam News',
    sourceType: 'steam',
    articleId: 'art1',
    articleUrl: 'https://steam.com/1',
    title: 'Cyberpunk 2077 Patch 2.13 Released',
    publishedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    appId: 1091500,
  },
  {
    sourceId: 'pcgamer',
    sourceName: 'PC Gamer',
    sourceType: 'rss',
    articleId: 'art2',
    articleUrl: 'https://pcgamer.com/2',
    title: 'Cyberpunk 2077 Patch 2.13 adds FSR 3 support on PC',
    publishedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    appId: 1091500,
  },
];
const sameEventGroups = groupNewsItemsIntoEvents(sameEventPhrasedDiff);
equal(sameEventGroups.length, 1); // MUST merge into 1 event

// 5. Steam/RSS cross-source same event merges
const steamJson = JSON.parse(fixture('steam-news.json'));
const steamItems = parseSteamNewsResponse(steamJson, { id: 'steam', name: 'Steam News', type: 'steam', enabled: true, priority: 100 }, 1091500);
const rssXml = fixture('sample-rss.xml');
const rssItems = parseRssXml(rssXml, { id: 'pcgamer', name: 'PC Gamer', type: 'rss', enabled: true, priority: 80 });

const crossSourceGroups = groupNewsItemsIntoEvents([...steamItems, ...rssItems]);
const cyberpunkGroup = crossSourceGroups.find((g) => g.title.includes('Cyberpunk'));
equal(cyberpunkGroup.items.length >= 2, true);

// 6. Rumor handling & non-publication test
const rumorItem = {
  sourceId: 'rss',
  sourceName: 'PC Gamer',
  sourceType: 'rss',
  articleId: 'rumor1',
  articleUrl: 'https://pcgamer.com/leak',
  title: 'Cyberpunk 2077 sequel reportedly leaked by insider',
  publishedAt: new Date().toISOString(),
  collectedAt: new Date().toISOString(),
  appId: 1091500,
};
const rumorClass = await aiProvider.classify(rumorItem.title, [rumorItem]);
equal(rumorClass.rumor, true);
equal(rumorClass.safeToPublish, false); // MUST NOT BE SAFE TO PUBLISH

const rumorProcessed = await processNewsEvent('evt_rumor', rumorItem.title, [rumorItem], 1091500, aiProvider);
equal(rumorProcessed, null); // processNewsEvent returns null for rumors!

// 7. Steam Timeout Test
const hangFetch = async (url, opts) => {
  if (opts?.signal) {
    return new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  }
  return new Response('', { status: 500 });
};
let steamTimedOut = false;
try {
  await fetchSteamNewsForApp(1091500, { id: 'steam', name: 'Steam', type: 'steam', enabled: true, priority: 100 }, hangFetch, 10);
} catch (e) {
  steamTimedOut = e.message.includes('Timeout');
}
equal(steamTimedOut, true);

// 8. RSS Timeout Test
let rssTimedOut = false;
try {
  await fetchRssFeed({ id: 'pcgamer', name: 'PC Gamer', type: 'rss', enabled: true, priority: 80, url: 'https://hang.com' }, hangFetch, undefined, 10);
} catch (e) {
  rssTimedOut = e.message.includes('Timeout');
}
equal(rssTimedOut, true);

// Setup temporary SQLite D1 database for store and endpoint tests
const tmpDbPath = path.join(os.tmpdir(), `safeloot-test-news-corrective-${Date.now()}.db`);
const db = sqliteD1(tmpDbPath);

db.sqlite.exec(`
  CREATE TABLE games (app_id INTEGER PRIMARY KEY, title TEXT NOT NULL, monitored INTEGER DEFAULT 1 NOT NULL, checked_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE news_sources (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER DEFAULT 1 NOT NULL, priority INTEGER DEFAULT 50 NOT NULL, url TEXT, last_checked_at TEXT, last_success_at TEXT, last_failure_at TEXT, last_error TEXT, last_item_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ok' NOT NULL);
  CREATE TABLE news_raw_items (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, article_id TEXT NOT NULL, article_url TEXT NOT NULL, title TEXT NOT NULL, snippet TEXT, published_at TEXT NOT NULL, collected_at TEXT NOT NULL, app_id INTEGER, hash TEXT NOT NULL);
  CREATE UNIQUE INDEX raw_hash_idx ON news_raw_items (hash);
  CREATE INDEX raw_app_idx ON news_raw_items (app_id);
  CREATE TABLE news_events (id TEXT PRIMARY KEY NOT NULL, app_id INTEGER, title TEXT NOT NULL, category TEXT NOT NULL, importance INTEGER NOT NULL, confidence REAL NOT NULL, purchase_impact TEXT NOT NULL, rumor INTEGER DEFAULT 0 NOT NULL, safe_to_publish INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX event_app_idx ON news_events (app_id);
  CREATE TABLE news_articles (id TEXT PRIMARY KEY NOT NULL, event_id TEXT NOT NULL, app_id INTEGER, title TEXT NOT NULL, summary TEXT NOT NULL, why_it_matters TEXT NOT NULL, purchase_advice TEXT NOT NULL, category TEXT NOT NULL, purchase_impact TEXT NOT NULL, rumor INTEGER DEFAULT 0 NOT NULL, provider_type TEXT DEFAULT 'heuristic' NOT NULL, published_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX article_app_idx ON news_articles (app_id);
  CREATE INDEX article_published_idx ON news_articles (published_at);
  CREATE TABLE news_article_sources (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, article_id TEXT NOT NULL, raw_item_id TEXT NOT NULL, source_name TEXT NOT NULL, article_url TEXT NOT NULL);
`);

db.sqlite.exec(`INSERT INTO games (app_id, title, created_at) VALUES (1091500, 'Cyberpunk 2077', '2026-01-01');`);

// 9, 10, 11, 12. Source Health & Failure Isolation Test
await updateSourceHealth({ sourceId: 'steam', sourceName: 'Steam', sourceType: 'steam', status: 'ok', itemCount: 10 }, db);
const healthInitial = await getNewsSourceHealth('steam', db);
equal(healthInitial.status, 'ok');
equal(healthInitial.lastItemCount, 10);
equal(Boolean(healthInitial.lastSuccessAt), true);

const initialSuccessTime = healthInitial.lastSuccessAt;

// Simulate failure on subsequent run
await updateSourceHealth({ sourceId: 'steam', sourceName: 'Steam', sourceType: 'steam', status: 'error', itemCount: 0, error: 'HTTP 500' }, db);
const healthAfterFail = await getNewsSourceHealth('steam', db);
equal(healthAfterFail.status, 'error');
equal(healthAfterFail.lastError, 'HTTP 500');
equal(Boolean(healthAfterFail.lastFailureAt), true);
// PRESERVES previous success timestamp!
equal(healthAfterFail.lastSuccessAt, initialSuccessTime);

// Test collector with 1 failing source and 1 working source
const mockFetchWithTimeout = async (url, opts) => {
  if (url.includes('pcgamer.com')) {
    return hangFetch(url, opts); // Times out
  }
  return new Response(fixture('steam-news.json'), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const summary = await collectNewsFromAllSources({
  customFetch: mockFetchWithTimeout,
  customDb: db,
  appIds: [1091500],
  timeoutMs: 20,
});

equal(summary.sourceResults.length >= 2, true);
const failedSrc = summary.sourceResults.find((s) => s.status === 'error');
const okSrc = summary.sourceResults.find((s) => s.status === 'ok');

equal(Boolean(failedSrc), true);
equal(failedSrc.error.includes('Timeout'), true);
equal(Boolean(okSrc), true);

try {
  fs.unlinkSync(tmpDbPath);
} catch {}

console.log(`news-pipeline: ${checks} checks passed`);

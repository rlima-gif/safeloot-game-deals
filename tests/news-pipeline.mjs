import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import { moduleUrl } from './load-ts.mjs';
import { sqliteD1 } from './sqlite-d1.mjs';

const { parseSteamNewsResponse } = await import(moduleUrl('lib/news/sources/steam.ts'));
const { parseRssXml } = await import(moduleUrl('lib/news/sources/rss.ts'));
const { deduplicateRawItems, groupNewsItemsIntoEvents } = await import(moduleUrl('lib/news/dedupe.ts'));
const { HeuristicRuleNewsAIProvider } = await import(moduleUrl('lib/news/ai/provider.ts'));
const { processNewsEvent } = await import(moduleUrl('lib/news/ai/pipeline.ts'));
const { saveRawNewsItems, saveProcessedArticle, getPublishedNews } = await import(moduleUrl('lib/news/news-store.ts'));
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

// 1. Test Steam normalization
const steamJson = JSON.parse(fixture('steam-news.json'));
const steamItems = parseSteamNewsResponse(steamJson, { id: 'steam', name: 'Steam News', type: 'steam', enabled: true, priority: 100 }, 1091500);
equal(steamItems.length, 1);
equal(steamItems[0].sourceId, 'steam');
equal(steamItems[0].appId, 1091500);
equal(steamItems[0].title, 'Cyberpunk 2077 Patch 2.13 Released');
equal(steamItems[0].snippet.includes('Patch 2.13 for Cyberpunk 2077 is now live'), true);

// 2. Test RSS normalization
const rssXml = fixture('sample-rss.xml');
const rssItems = parseRssXml(rssXml, { id: 'pcgamer', name: 'PC Gamer', type: 'rss', enabled: true, priority: 80 });
equal(rssItems.length, 2);
equal(rssItems[0].sourceId, 'pcgamer');
equal(rssItems[0].title, 'Cyberpunk 2077 Patch 2.13 adds FSR 3 support on PC');
equal(rssItems[1].title, 'Hollow Knight Silksong update expected later this year');

// 3. Test Duplicate prevention
const combined = [...steamItems, ...rssItems, steamItems[0]];
const deduplicated = deduplicateRawItems(combined);
equal(deduplicated.length, 3);

// 4. Test Event Grouping
const groups = groupNewsItemsIntoEvents(combined);
// Cyberpunk items should group together into 1 event, Silksong into a separate event
equal(groups.length, 2);
const cyberpunkGroup = groups.find(g => g.items.some(i => i.title.includes('Cyberpunk')));
equal(cyberpunkGroup.items.length >= 2, true);

// 5. Test AI Editor JSON validation
const aiProvider = new HeuristicRuleNewsAIProvider();
const classification = await aiProvider.classify(cyberpunkGroup.title, cyberpunkGroup.items);
equal(classification.safeToPublish, true);
equal(classification.category, 'update');
equal(classification.purchaseImpact, 'low');
equal(classification.facts.length >= 3, true);

// 6. Test AI Verifier Rejection
const badGeneratedText = {
  title: 'Você não vai acreditar no que aconteceu com Cyberpunk!',
  summary: '',
  whyItMatters: 'Importante',
  purchaseAdvice: 'Compre já',
};
const verificationFail = await aiProvider.verify(classification.facts, badGeneratedText);
equal(verificationFail.approved, false);
equal(verificationFail.unsupportedClaims.length > 0, true);

const goodGeneratedText = await aiProvider.write(classification.facts, {
  gameTitle: 'Cyberpunk 2077',
  category: classification.category,
  purchaseImpact: classification.purchaseImpact,
});
const verificationPass = await aiProvider.verify(classification.facts, goodGeneratedText);
equal(verificationPass.approved, true);

// Setup temporary SQLite D1 database for store and endpoint tests
const tmpDbPath = path.join(os.tmpdir(), `safeloot-test-news-${Date.now()}.db`);
const db = sqliteD1(tmpDbPath);

db.sqlite.exec(`
  CREATE TABLE games (app_id INTEGER PRIMARY KEY, title TEXT NOT NULL, monitored INTEGER DEFAULT 1 NOT NULL, checked_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE news_sources (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER DEFAULT 1 NOT NULL, priority INTEGER DEFAULT 50 NOT NULL, url TEXT, last_checked_at TEXT, status TEXT DEFAULT 'ok' NOT NULL);
  CREATE TABLE news_raw_items (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, article_id TEXT NOT NULL, article_url TEXT NOT NULL, title TEXT NOT NULL, snippet TEXT, published_at TEXT NOT NULL, collected_at TEXT NOT NULL, app_id INTEGER, hash TEXT NOT NULL);
  CREATE UNIQUE INDEX raw_hash_idx ON news_raw_items (hash);
  CREATE INDEX raw_app_idx ON news_raw_items (app_id);
  CREATE TABLE news_events (id TEXT PRIMARY KEY NOT NULL, app_id INTEGER, title TEXT NOT NULL, category TEXT NOT NULL, importance INTEGER NOT NULL, confidence REAL NOT NULL, purchase_impact TEXT NOT NULL, safe_to_publish INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX event_app_idx ON news_events (app_id);
  CREATE TABLE news_articles (id TEXT PRIMARY KEY NOT NULL, event_id TEXT NOT NULL, app_id INTEGER, title TEXT NOT NULL, summary TEXT NOT NULL, why_it_matters TEXT NOT NULL, purchase_advice TEXT NOT NULL, category TEXT NOT NULL, purchase_impact TEXT NOT NULL, published_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX article_app_idx ON news_articles (app_id);
  CREATE INDEX article_published_idx ON news_articles (published_at);
  CREATE TABLE news_article_sources (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, article_id TEXT NOT NULL, raw_item_id TEXT NOT NULL, source_name TEXT NOT NULL, article_url TEXT NOT NULL);
`);

db.sqlite.exec(`INSERT INTO news_sources (id, name, type) VALUES ('steam', 'Steam News', 'steam'), ('pcgamer', 'PC Gamer', 'rss');`);
db.sqlite.exec(`INSERT INTO games (app_id, title, created_at) VALUES (1091500, 'Cyberpunk 2077', '2026-01-01');`);

// Process and save article to D1
const processed = await processNewsEvent(cyberpunkGroup.id, cyberpunkGroup.title, cyberpunkGroup.items, 1091500, aiProvider);
equal(processed !== null, true);

const saveOk = await saveProcessedArticle(processed, db);
equal(saveOk, true);

// Query news from D1
const savedNews = await getPublishedNews({ appId: 1091500 }, db);
equal(savedNews.length, 1);
equal(savedNews[0].appId, 1091500);
equal(savedNews[0].category, 'update');
equal(savedNews[0].sources.length >= 1, true);

// 7. Test Cron Auth & Route
delete process.env.SAFELOOT_ADMIN_TOKEN;
const resNoToken = await cronPost(new Request('http://localhost/api/cron/news', { method: 'POST' }));
equal(resNoToken.status, 503);

process.env.SAFELOOT_ADMIN_TOKEN = 'secret-test-token-123';
const resBadToken = await cronPost(
  new Request('http://localhost/api/cron/news', {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong-token' },
  }),
);
equal(resBadToken.status, 401);

// 8. Test Source Failure Isolation with Promise.allSettled
const mockFetchWithFailures = async (url) => {
  if (url.includes('pcgamer.com')) {
    throw new Error('Network timeout simulation');
  }
  if (url.includes('steampowered.com')) {
    return new Response(fixture('steam-news.json'), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(fixture('sample-rss.xml'), { status: 200 });
};

const collectionResult = await collectNewsFromAllSources({
  customFetch: mockFetchWithFailures,
  customDb: db,
  appIds: [1091500],
});

equal(collectionResult.sourceResults.length >= 2, true);
const failedSource = collectionResult.sourceResults.find((s) => s.status === 'error');
const successSource = collectionResult.sourceResults.find((s) => s.status === 'ok');

equal(Boolean(failedSource), true);
equal(failedSource.error.includes('Network timeout simulation'), true);
equal(Boolean(successSource), true);
equal(successSource.itemCount > 0, true);

try {
  fs.unlinkSync(tmpDbPath);
} catch {}

console.log(`news-pipeline: ${checks} checks passed`);

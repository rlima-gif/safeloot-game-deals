import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import { moduleUrl } from './load-ts.mjs';
import { sqliteD1 } from './sqlite-d1.mjs';

const { fetchSteamNewsForApp, parseSteamNewsResponse } = await import(moduleUrl('lib/news/sources/steam.ts'));
const { fetchRssFeed, parseRssXml } = await import(moduleUrl('lib/news/sources/rss.ts'));
const { deduplicateRawItems, groupNewsItemsIntoEvents, areTitlesSimilar } = await import(moduleUrl('lib/news/dedupe.ts'));
const { HeuristicRuleNewsAIProvider, getNewsAIProvider } = await import(moduleUrl('lib/news/ai/provider.ts'));
const { OpenAINewsAIProvider, validateEditorResponse, validateWriterResponse, validateVerifierResponse } = await import(moduleUrl('lib/news/ai/openai-provider.ts'));
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

// --- HEURISTIC & DEDUPLICATION TESTS ---

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
equal(rumorProcessed, null);

// 7 & 8. Steam/RSS Timeout Tests
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

let rssTimedOut = false;
try {
  await fetchRssFeed({ id: 'pcgamer', name: 'PC Gamer', type: 'rss', enabled: true, priority: 80, url: 'https://hang.com' }, hangFetch, undefined, 10);
} catch (e) {
  rssTimedOut = e.message.includes('Timeout');
}
equal(rssTimedOut, true);


// --- OPENAI AI PROVIDER UNIT TESTS (18 CASES) ---

const MOCK_API_KEY = 'sk-mock-secret-key-12345';

// Step 10.1: Provider selection = openai
process.env.NEWS_AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = MOCK_API_KEY;
const openAiProv = getNewsAIProvider();
equal(openAiProv.providerType, 'openai');

// Step 10.2: Provider selection = heuristic
process.env.NEWS_AI_PROVIDER = 'heuristic';
const heuristicProv = getNewsAIProvider();
equal(heuristicProv.providerType, 'heuristic');

// Step 10.3: Missing OPENAI_API_KEY produces explicit failure
delete process.env.OPENAI_API_KEY;
process.env.NEWS_AI_PROVIDER = 'openai';
let missingKeyError = false;
try {
  getNewsAIProvider();
} catch (e) {
  missingKeyError = e.message.includes('OPENAI_API_KEY não definida');
}
equal(missingKeyError, true);

// Step 10.4: Default model selection
const instanceWithKey = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY });
equal(instanceWithKey.providerType, 'openai');

// Step 10.5: Editor valid structured response validation
const validEditorRaw = {
  safeToPublish: true,
  category: 'update',
  importance: 85,
  confidence: 0.95,
  purchaseImpact: 'low',
  rumor: false,
  facts: ['Patch 2.13 lançada', 'Suporte FSR 3 adicionado'],
};
const validatedEditor = validateEditorResponse(validEditorRaw);
equal(validatedEditor.safeToPublish, true);
equal(validatedEditor.category, 'update');
equal(validatedEditor.facts.length, 2);

// Step 10.6: Editor malformed JSON rejected
let malformedEditorErr = false;
try {
  validateEditorResponse({ category: 'update', importance: 'invalid-number' });
} catch {
  malformedEditorErr = true;
}
equal(malformedEditorErr, true);

// Step 10.7: Editor invalid category rejected
let invalidCatErr = false;
try {
  validateEditorResponse({ ...validEditorRaw, category: 'non-existent-category' });
} catch (e) {
  invalidCatErr = e.message.includes('categoria inválida');
}
equal(invalidCatErr, true);

// Step 10.8: Editor rumor prevents publication (safeToPublish forced false)
const rumorEditorRaw = { ...validEditorRaw, rumor: true, safeToPublish: true };
const validatedRumor = validateEditorResponse(rumorEditorRaw);
equal(validatedRumor.rumor, true);
equal(validatedRumor.safeToPublish, false);

// Step 10.9: Editor safeToPublish=false stops pipeline before Writer
let writerCalled = false;
const mockWriterProvider = {
  providerType: 'openai',
  async classify() {
    return { safeToPublish: false, category: 'other', importance: 30, confidence: 0.8, purchaseImpact: 'none', rumor: false, providerType: 'openai', facts: ['Unimportant'] };
  },
  async write() {
    writerCalled = true;
    return { title: 'T', summary: 'S', whyItMatters: 'W', purchaseAdvice: 'P' };
  },
  async verify() {
    return { approved: true, unsupportedClaims: [] };
  },
};
const stoppedResult = await processNewsEvent('evt_stop', 'Title', steamItems, 1091500, mockWriterProvider);
equal(stoppedResult, null);
equal(writerCalled, false);

// Step 10.10: Writer receives approved facts only
let receivedFacts = [];
const mockFactsProvider = {
  providerType: 'openai',
  async classify() {
    return { safeToPublish: true, category: 'update', importance: 80, confidence: 0.9, purchaseImpact: 'low', rumor: false, providerType: 'openai', facts: ['Fact A', 'Fact B'] };
  },
  async write(facts) {
    receivedFacts = facts;
    return { title: 'Title', summary: 'Summary text here long enough', whyItMatters: 'Matters text', purchaseAdvice: 'Advice text' };
  },
  async verify() {
    return { approved: true, unsupportedClaims: [] };
  },
};
await processNewsEvent('evt_facts', 'Title', steamItems, 1091500, mockFactsProvider);
equal(receivedFacts, ['Fact A', 'Fact B']);

// Step 10.11: Writer malformed output rejected
let writerMalformedErr = false;
try {
  validateWriterResponse({ title: 'T', summary: 'Short' });
} catch {
  writerMalformedErr = true;
}
equal(writerMalformedErr, true);

// Step 10.12: Verifier unsupported claim prevents publication
const mockUnapprovedVerifier = {
  providerType: 'openai',
  async classify() {
    return { safeToPublish: true, category: 'update', importance: 80, confidence: 0.9, purchaseImpact: 'low', rumor: false, providerType: 'openai', facts: ['Fact A'] };
  },
  async write() {
    return { title: 'Title', summary: 'Summary text here long enough', whyItMatters: 'Matters text', purchaseAdvice: 'Advice text' };
  },
  async verify() {
    return { approved: false, unsupportedClaims: ['Claim not in facts'] };
  },
};
const unapprovedResult = await processNewsEvent('evt_unapproved', 'Title', steamItems, 1091500, mockUnapprovedVerifier);
equal(unapprovedResult, null);

// Step 10.13: Verifier malformed output prevents publication
let verifierMalformedErr = false;
try {
  validateVerifierResponse({ approved: true, unsupportedClaims: ['Invalid claim'] });
} catch {
  verifierMalformedErr = true;
}
const verifiedResult = validateVerifierResponse({ approved: true, unsupportedClaims: ['Invalid claim'] });
equal(verifiedResult.approved, false); // unsupportedClaims.length > 0 makes approved false

// Step 10.14: OpenAI 401/429/500 handled safely without key leak
const mockFetchError = async () => new Response(JSON.stringify({ error: { message: `Invalid key ${MOCK_API_KEY}` } }), { status: 401 });
const openaiErrProv = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: mockFetchError });

let safeErrMsg = '';
try {
  await openaiErrProv.classify('Title', steamItems);
} catch (e) {
  safeErrMsg = e.message;
}
equal(safeErrMsg.includes('OpenAI API error'), true);
equal(safeErrMsg.includes(MOCK_API_KEY), false); // Key MUST NOT be leaked!
equal(safeErrMsg.includes('[REDACTED_API_KEY]'), true);

// Step 10.15: OpenAI timeout handled safely
const openaiTimeoutProv = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, timeoutMs: 10, customFetch: hangFetch });
let openAiTimedOut = false;
try {
  await openaiTimeoutProv.classify('Title', steamItems);
} catch (e) {
  openAiTimedOut = e.message.includes('Timeout');
}
equal(openAiTimedOut, true);

// Step 10.16: No heuristic fallback after OpenAI failure
const failingOpenAiProv = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: mockFetchError });
const failedPipelineResult = await processNewsEvent('evt_fail', 'Title', steamItems, 1091500, failingOpenAiProv);
equal(failedPipelineResult, null); // MUST BE NULL (no fallback to heuristic!)

// Step 10.17: API key never appears in thrown error
equal(safeErrMsg.includes(MOCK_API_KEY), false);

// Step 10.18: Successful 3-stage mocked OpenAI pipeline creates publishable article
const mockOpenAiFetch = async (_url, opts) => {
  const body = JSON.parse(opts.body);
  const promptText = body.messages[1].content;

  if (promptText.includes('EditorClassification') || body.messages[0].content.includes('Editor do SafeLoot')) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validEditorRaw) } }],
    }), { status: 200 });
  }

  if (promptText.includes('Redator do SafeLoot') || body.messages[0].content.includes('Redator do SafeLoot')) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: 'Cyberpunk 2077: Patch 2.13 chega ao PC com FSR 3',
        summary: 'A atualização 2.13 traz suporte ao AMD FSR 3 e correções de desempenho.',
        whyItMatters: 'Melhora a taxa de quadros e estabilidade em placas suportadas.',
        purchaseAdvice: 'Melhorias técnicas contínuas tornam o jogo mais atraente se você aguardava correções.',
      }) } }],
    }), { status: 200 });
  }

  // Verifier
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ approved: true, unsupportedClaims: [] }) } }],
  }), { status: 200 });
};

const mockedOpenAiProv = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: mockOpenAiFetch });
const successfulArticle = await processNewsEvent('evt_success', 'Cyberpunk Patch 2.13', steamItems, 1091500, mockedOpenAiProv);

equal(successfulArticle !== null, true);
equal(successfulArticle.providerType, 'openai');
equal(successfulArticle.category, 'update');
equal(successfulArticle.title.includes('Patch 2.13'), true);


// --- D1 STORE & ENDPOINT TESTS ---

const tmpDbPath = path.join(os.tmpdir(), `safeloot-test-openai-${Date.now()}.db`);
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

const saveOk = await saveProcessedArticle(successfulArticle, db);
equal(saveOk, true);

const savedNews = await getPublishedNews({ appId: 1091500 }, db);
equal(savedNews.length, 1);
equal(savedNews[0].providerType, 'openai');

// Cron auth test
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

try {
  fs.unlinkSync(tmpDbPath);
} catch {}

console.log(`news-pipeline: ${checks} checks passed`);

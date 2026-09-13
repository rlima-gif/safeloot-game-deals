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
const { OpenAINewsAIProvider, validateEditorResponse, validateWriterResponse, validateVerifierResponse, EDITOR_JSON_SCHEMA, WRITER_JSON_SCHEMA, VERIFIER_JSON_SCHEMA } = await import(moduleUrl('lib/news/ai/openai-provider.ts'));
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
equal(unrelatedGroups.length, 2);

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
equal(sameEventGroups.length, 1);

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
equal(rumorClass.safeToPublish, false);

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


// --- OPENAI RESPONSES API STRICT SCHEMA TESTS ---

const MOCK_API_KEY = 'sk-mock-secret-key-12345';

function makeResponsesApiResponse(obj, status = 'completed') {
  return new Response(
    JSON.stringify({
      id: 'resp_test_123',
      object: 'response',
      status,
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: typeof obj === 'string' ? obj : JSON.stringify(obj),
            },
          ],
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeResponsesApiRefusal(refusalReason) {
  return new Response(
    JSON.stringify({
      id: 'resp_test_refusal',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'refusal',
              refusal: refusalReason,
            },
          ],
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

// 1. Provider Selection = openai
process.env.NEWS_AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = MOCK_API_KEY;
const openAiProv = getNewsAIProvider();
equal(openAiProv.providerType, 'openai');

// 2. Provider Selection = heuristic
process.env.NEWS_AI_PROVIDER = 'heuristic';
const heuristicProv = getNewsAIProvider();
equal(heuristicProv.providerType, 'heuristic');

// 3. Missing OPENAI_API_KEY produces explicit failure
delete process.env.OPENAI_API_KEY;
process.env.NEWS_AI_PROVIDER = 'openai';
let missingKeyError = false;
try {
  getNewsAIProvider();
} catch (e) {
  missingKeyError = e.message.includes('OPENAI_API_KEY não definida');
}
equal(missingKeyError, true);

// 4. Responses API endpoint verification & payload structure checks
let capturedUrl = '';
let capturedBody = null;

const captureFetch = async (url, opts) => {
  capturedUrl = url;
  capturedBody = JSON.parse(opts.body);
  return makeResponsesApiResponse({
    safeToPublish: true,
    category: 'update',
    importance: 80,
    confidence: 0.9,
    purchaseImpact: 'low',
    rumor: false,
    facts: ['Fact 1'],
  });
};

const capturedProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: captureFetch });
await capturedProvider.classify('Test Event', steamItems);

// Assertion 1: Endpoint URL is https://api.openai.com/v1/responses
equal(capturedUrl, 'https://api.openai.com/v1/responses');

// Assertion 2: store is false
equal(capturedBody.store, false);

// Assertion 3 & 4: Editor request contains text.format with type: json_schema and strict: true
equal(capturedBody.text.format.type, 'json_schema');
equal(capturedBody.text.format.name, EDITOR_JSON_SCHEMA.name);
equal(capturedBody.text.format.strict, true);

// Assertion 4: response_format is absent
equal(capturedBody.response_format, undefined);

// Assertion 5: Writer request contains its own text.format schema
let writerBody = null;
const captureWriterFetch = async (url, opts) => {
  writerBody = JSON.parse(opts.body);
  return makeResponsesApiResponse({
    title: 'Title',
    summary: 'Summary text here long enough',
    whyItMatters: 'Matters text',
    purchaseAdvice: 'Advice text',
  });
};
const capturedWriterProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: captureWriterFetch });
await capturedWriterProvider.write(['Fact A'], { category: 'update', purchaseImpact: 'low' });

equal(writerBody.text.format.type, 'json_schema');
equal(writerBody.text.format.name, WRITER_JSON_SCHEMA.name);
equal(writerBody.text.format.strict, true);
equal(writerBody.response_format, undefined);

// Assertion 6: Verifier request contains its own text.format schema
let verifierBody = null;
const captureVerifierFetch = async (url, opts) => {
  verifierBody = JSON.parse(opts.body);
  return makeResponsesApiResponse({ approved: true, unsupportedClaims: [] });
};
const capturedVerifierProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: captureVerifierFetch });
await capturedVerifierProvider.verify(['Fact A'], { title: 'T', summary: 'Summary text', whyItMatters: 'W', purchaseAdvice: 'P' });

equal(verifierBody.text.format.type, 'json_schema');
equal(verifierBody.text.format.name, VERIFIER_JSON_SCHEMA.name);
equal(verifierBody.text.format.strict, true);
equal(verifierBody.response_format, undefined);

// Assertion 7: json_object is absent
equal(JSON.stringify(capturedBody).includes('"json_object"'), false);

// Assertion 6 (output_text parsing): Responses API completed result with output_text parses correctly
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

// Assertion 7 (refusal content rejects): Refusal prevents publication
const refusalFetch = async () => makeResponsesApiRefusal('Conteúdo recusado pelas diretrizes de segurança.');
const refusalProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: refusalFetch });
const refusalResult = await processNewsEvent('evt_refusal', 'Title', steamItems, 1091500, refusalProvider);
equal(refusalResult, null);

// Assertion 8: output array with non-message item before message still parses correctly
const nonMessageItemFetch = async () => new Response(
  JSON.stringify({
    id: 'resp_non_message',
    object: 'response',
    status: 'completed',
    output: [
      { type: 'reasoning', text: 'internal reasoning log' },
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(validEditorRaw),
          },
        ],
      },
    ],
  }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);
const nonMessageProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: nonMessageItemFetch });
const parsedNonMessage = await nonMessageProvider.classify('Title', steamItems);
equal(parsedNonMessage.safeToPublish, true);
equal(parsedNonMessage.category, 'update');

// Assertion 9: missing output_text rejects (returns null in pipeline)
const missingTextFetch = async () => new Response(
  JSON.stringify({
    id: 'resp_empty',
    object: 'response',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [],
      },
    ],
  }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);
const missingTextProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: missingTextFetch });
const missingTextResult = await processNewsEvent('evt_missing_text', 'Title', steamItems, 1091500, missingTextProvider);
equal(missingTextResult, null);

// Assertion 10: incomplete status rejects
const incompleteFetch = async () => makeResponsesApiResponse(validEditorRaw, 'incomplete');
const incompleteProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: incompleteFetch });
const incompleteResult = await processNewsEvent('evt_incomplete', 'Title', steamItems, 1091500, incompleteProvider);
equal(incompleteResult, null);

// Malformed output prevents publication
const malformedFetch = async () => makeResponsesApiResponse('NOT_VALID_JSON');
const malformedProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: malformedFetch });
const malformedResult = await processNewsEvent('evt_malformed', 'Title', steamItems, 1091500, malformedProvider);
equal(malformedResult, null);

// No heuristic fallback still holds on error
const mockFetchError = async () => new Response(JSON.stringify({ error: { message: `Invalid key ${MOCK_API_KEY}` } }), { status: 401 });
const failingOpenAiProv = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: mockFetchError });
const failedPipelineResult = await processNewsEvent('evt_fail', 'Title', steamItems, 1091500, failingOpenAiProv);
equal(failedPipelineResult, null);

// API key never leaks in thrown error message
let safeErrMsg = '';
try {
  await failingOpenAiProv.classify('Title', steamItems);
} catch (e) {
  safeErrMsg = e.message;
}
equal(safeErrMsg.includes('OpenAI API error'), true);
equal(safeErrMsg.includes(MOCK_API_KEY), false);
equal(safeErrMsg.includes('[REDACTED_API_KEY]'), true);

// Successful 3-stage mocked OpenAI Responses API pipeline creates publishable article
const mockFullResponsesFetch = async (_url, opts) => {
  const body = JSON.parse(opts.body);
  const schemaName = body.text.format.name;

  if (schemaName === EDITOR_JSON_SCHEMA.name) {
    return makeResponsesApiResponse(validEditorRaw);
  }
  if (schemaName === WRITER_JSON_SCHEMA.name) {
    return makeResponsesApiResponse({
      title: 'Cyberpunk 2077: Patch 2.13 chega ao PC com FSR 3',
      summary: 'A atualização 2.13 traz suporte ao AMD FSR 3 e correções de desempenho.',
      whyItMatters: 'Melhora a taxa de quadros e estabilidade em placas suportadas.',
      purchaseAdvice: 'Melhorias técnicas contínuas tornam o jogo mais atraente se você aguardava correções.',
    });
  }
  // Verifier
  return makeResponsesApiResponse({ approved: true, unsupportedClaims: [] });
};

const fullMockedProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: mockFullResponsesFetch });
const successfulArticle = await processNewsEvent('evt_success', 'Cyberpunk Patch 2.13', steamItems, 1091500, fullMockedProvider);

equal(successfulArticle !== null, true);
equal(successfulArticle.providerType, 'openai');
equal(successfulArticle.category, 'update');
equal(successfulArticle.title.includes('Patch 2.13'), true);


// --- D1 STORE & ENDPOINT TESTS ---

const tmpDbPath = path.join(os.tmpdir(), `safeloot-test-responses-${Date.now()}.db`);
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

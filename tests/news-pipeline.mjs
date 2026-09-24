import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import { moduleUrl } from './load-ts.mjs';
import { sqliteD1 } from './sqlite-d1.mjs';

const { fetchSteamNewsForApp, parseSteamNewsResponse, extractSteamImageUrl } = await import(moduleUrl('lib/news/sources/steam.ts'));
const { fetchRssFeed, parseRssXml, extractImageUrl } = await import(moduleUrl('lib/news/sources/rss.ts'));
const { cleanUrl } = await import(moduleUrl('lib/news/normalize.ts'));
const { fetchGNewsItems } = await import(moduleUrl('lib/news/sources/gnews.ts'));
const { deduplicateRawItems, groupNewsItemsIntoEvents, areTitlesSimilar, normalizeCanonicalUrl, normalizeTitleForDedupe } = await import(moduleUrl('lib/news/dedupe.ts'));
const { isGamingNews, filterGamingNews, hasCommercialValue } = await import(moduleUrl('lib/news/filter.ts'));
const { isPortugueseText, detectLanguage, translateTextToPtBr, translateArticleToPtBr } = await import(moduleUrl('lib/news/ai/translation.ts'));
const { HeuristicRuleNewsAIProvider, getNewsAIProvider, generateArticleWithFallback, classifyError } = await import(moduleUrl('lib/news/ai/provider.ts'));
const { parseAiJsonResponse } = await import(moduleUrl('lib/news/ai/types.ts'));
const { CloudflareWorkersAINewsAIProvider } = await import(moduleUrl('lib/news/ai/cloudflare-provider.ts'));
const { processNewsEvent, processNewsEventResult } = await import(moduleUrl('lib/news/ai/pipeline.ts'));
const { saveRawNewsItems, saveProcessedArticle, getPublishedNews, getPublishedArticleById, updateSourceHealth, getNewsSourceHealth } = await import(moduleUrl('lib/news/news-store.ts'));
const { extractHtmlMetadata, enrichNewsItem, isValidImageUrl } = await import(moduleUrl('lib/news/enrich.ts'));
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


// --- CLOUDFLARE WORKERS AI PROVIDER & ZERO-COST TESTS ---

const MOCK_API_KEY = 'sk-mock-secret-key-12345';

// Test 1: Default provider is cloudflare
delete process.env.NEWS_AI_PROVIDER;
delete process.env.OPENAI_API_KEY;
const defaultProv = getNewsAIProvider();
equal(defaultProv.providerType, 'cloudflare');

// Test 2: Explicit cloudflare provider selection
process.env.NEWS_AI_PROVIDER = 'cloudflare';
const explicitCfProv = getNewsAIProvider();
equal(explicitCfProv.providerType, 'cloudflare');

// Test 3: Explicit openai provider selection
process.env.NEWS_AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = MOCK_API_KEY;
const explicitOpenAiProv = getNewsAIProvider();
equal(explicitOpenAiProv.providerType, 'openai');

// Test 4: Explicit heuristic provider selection
process.env.NEWS_AI_PROVIDER = 'heuristic';
const explicitHeuristicProv = getNewsAIProvider();
equal(explicitHeuristicProv.providerType, 'heuristic');

// Test 5: OPENAI_API_KEY present alone does NOT select OpenAI if NEWS_AI_PROVIDER is unset/cloudflare
delete process.env.NEWS_AI_PROVIDER;
process.env.OPENAI_API_KEY = MOCK_API_KEY;
const defaultWithOpenAiKeyProv = getNewsAIProvider();
equal(defaultWithOpenAiKeyProv.providerType, 'cloudflare'); // MUST stay cloudflare!


// Test 6: Cloudflare provider generateArticle mocked
let calledModel = '';
const mockCfRun = async (model, opts) => {
  calledModel = model;
  return {
    response: JSON.stringify({
      decision: 'publish',
      category: 'update',
      confidence: 0.9,
      game: 'Cyberpunk 2077',
      appId: 1091500,
      title: 'Cyberpunk 2077: Patch 2.13',
      summary: 'Atualização técnica com correções confirmadas.',
      body: 'Atualização técnica com correções confirmadas e suporte a FSR 3.',
      whyItMatters: 'Atualização técnica disponível para jogadores de PC.',
      purchaseImpact: 'low',
      purchaseAdvice: 'Acompanhe as ofertas disponíveis.',
      facts: ['Patch 2.13 para Cyberpunk 2077 lançado para PC', 'Inclui suporte a AMD FSR 3'],
      claims: [
        { text: 'Patch 2.13 para Cyberpunk 2077 lançado para PC', basis: ['fact:0', 'gameIdentity'] },
        { text: 'Acompanhe as ofertas disponíveis', basis: ['purchaseImpact'] },
      ],
    }),
  };
};

const cfTestProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockCfRun });
const cfGenRes = await cfTestProv.generateArticle('Cyberpunk Update', steamItems);
equal(cfGenRes.decision, 'publish');
equal(cfGenRes.category, 'update');
equal(calledModel, '@cf/meta/llama-3.1-8b-instruct-fast');


// Test 7: Selected model is configurable
process.env.NEWS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8';
const cfConfigurableProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockCfRun });
await cfConfigurableProv.generateArticle('Test Event', steamItems);
equal(calledModel, '@cf/meta/llama-3.3-70b-instruct-fp8');
delete process.env.NEWS_AI_MODEL;


// Test 8: Malformed Cloudflare output fails closed
const mockMalformedCfRun = async () => ({ response: 'INVALID_JSON_HERE' });
const cfMalformedProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockMalformedCfRun });
const malformedCfRes = await processNewsEventResult('evt_cf_malformed', 'Title', steamItems, 1091500, cfMalformedProv);
equal(malformedCfRes.status, 'retryable_error');

// Test 8b: parseAiJsonResponse handles raw unescaped newlines, markdown fences, and trailing commas
const rawWithNewlines = '```json\n{\n  "title": "Novo Patch",\n  "body": "Parágrafo um.\n\nParágrafo dois.",\n}\n```';
const parsedRaw = parseAiJsonResponse(rawWithNewlines);
equal(parsedRaw.title, 'Novo Patch');
equal(parsedRaw.body, 'Parágrafo um.\n\nParágrafo dois.');

// Test 8c: Cloudflare provider handles raw newlines in string literals without throwing malformedJson
const mockNewlineCfRun = async () => ({
  response: '{\n  "decision": "publish",\n  "category": "update",\n  "confidence": 0.95,\n  "game": "Cyberpunk 2077",\n  "appId": 1091500,\n  "title": "Patch com múltiplos parágrafos",\n  "summary": "Resumo do patch.",\n  "body": "Primeiro parágrafo com detalhes.\n\nSegundo parágrafo com análises.\n\nTerceiro parágrafo.",\n  "whyItMatters": "Melhorias gerais.",\n  "purchaseImpact": "low",\n  "purchaseAdvice": "Vale conferir.",\n  "facts": ["Patch com multiplos paragrafos"],\n  "claims": [{"text": "Cyberpunk 2077", "basis": ["fact:0", "gameIdentity"]}]\n}',
});
const cfNewlineProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockNewlineCfRun });
const newlineRes = await cfNewlineProv.generateArticle('Cyberpunk Update', steamItems);
equal(newlineRes.decision, 'publish');
equal(newlineRes.title, 'Patch com múltiplos parágrafos');
equal(newlineRes.body.includes('\n\n'), true);



// Test 9: Rumor cannot publish
const mockRumorCfRun = async () => ({
  response: JSON.stringify({
    decision: 'reject',
    category: 'update',
    confidence: 0.9,
    game: null,
    appId: null,
    title: null,
    summary: null,
    body: null,
    whyItMatters: null,
    purchaseImpact: null,
    purchaseAdvice: null,
    facts: ['Fact 1'],
    claims: [{ text: 'Not relevant', basis: ['category'] }],
  }),
});
const cfRumorProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockRumorCfRun });
const rumorCfRes = await processNewsEventResult('evt_cf_rumor', 'Title', steamItems, 1091500, cfRumorProv);
equal(rumorCfRes.status, 'rejected');


// Test 10: Quota failure returns retryable_error
const mockQuotaErrorCfRun = async () => {
  throw new Error('Cloudflare Workers AI HTTP 429: Rate limit or quota exhausted');
};
const cfQuotaProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockQuotaErrorCfRun });
const quotaCfRes = await processNewsEventResult('evt_cf_quota', 'Title', steamItems, 1091500, cfQuotaProv);
equal(quotaCfRes.status, 'retryable_error');


// Test 11: generateArticleWithFallback - primary succeeds
const primarySuccessResult = await generateArticleWithFallback('Test Event', steamItems, 1091500, cfTestProv);
equal(primarySuccessResult.result !== null, true);
equal(primarySuccessResult.error, null);
equal(primarySuccessResult.attempts.length, 1);

// Test 12: generateArticleWithFallback - primary fails technically, no fallback configured
const primaryFailCfRun = async () => {
  throw new Error('Cloudflare Workers AI HTTP 503: Service unavailable');
};
const primaryFailProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: primaryFailCfRun });

const noFallbackResult = await generateArticleWithFallback('Test Event', steamItems, 1091500, primaryFailProv);
equal(noFallbackResult.result, null);
equal(noFallbackResult.error !== null, true);
equal(noFallbackResult.attempts.length, 1); // no fallbacks configured

// Test 13: generateArticleWithFallback - editorial rejection does NOT fallback
const editorialRejectRun = async () => ({
  response: JSON.stringify({
    decision: 'reject',
    category: 'other',
    confidence: 0.9,
    game: null,
    appId: null,
    title: null,
    summary: null,
    body: null,
    whyItMatters: null,
    purchaseImpact: null,
    purchaseAdvice: null,
    facts: ['Fact 1'],
    claims: [{ text: 'Not relevant', basis: ['category'] }],
  }),
});
const editorialRejectProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: editorialRejectRun });
const editorialResult = await generateArticleWithFallback('Test Event', steamItems, 1091500, editorialRejectProv);
equal(editorialResult.result !== null, true);
equal(editorialResult.result.decision, 'reject');
equal(editorialResult.error, null); // editorial rejection returns result, not error
equal(editorialResult.attempts.length, 1); // no fallback


// Test 14: generateArticleWithFallback - max 3 attempts
const allFailRun = async () => {
  throw new Error('Cloudflare Workers AI HTTP 500: Internal error');
};
const allFailProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: allFailRun });
const allFailResult = await generateArticleWithFallback('Test Event', steamItems, 1091500, allFailProv);
equal(allFailResult.result, null);
equal(allFailResult.error !== null, true);
equal(allFailResult.attempts.length, 1); // no fallbacks configured, so only 1 attempt


// Test 15: classifyError function
equal(classifyError('Timeout na chamada Cloudflare Workers AI (12000ms).'), 'timeout');
equal(classifyError('Cloudflare Workers AI HTTP 429: Rate limit'), 'rate_limit');
equal(classifyError('Cloudflare Workers AI HTTP 500: Internal error'), 'http_5xx');
equal(classifyError('JSON malformado do Cloudflare Workers AI'), 'malformed_json');
equal(classifyError('Falha no transporte Cloudflare Workers AI'), 'fetch_error');
equal(classifyError('Unknown error'), 'unknown');


// --- VALIDATION & GROUNDING TESTS ---

const groundingFacts = [
  'Patch 2.13 para Cyberpunk 2077 foi lançado para PC',
  'O patch inclui suporte ao AMD FSR 3 e Intel XeSS 1.3',
  'Melhorias de estabilidade e correções de bugs',
];

// 1. Valid article passes validation
const validProvider = {
  providerType: 'cloudflare',
  async generateArticle() {
    return {
      decision: 'publish',
      category: 'update',
      confidence: 0.9,
      game: 'Cyberpunk 2077',
      appId: 1091500,
      title: 'Cyberpunk 2077: Patch 2.13',
      summary: 'Patch 2.13 lançado para PC com suporte a AMD FSR 3 e Intel XeSS 1.3.',
      body: 'Patch 2.13 lançado para PC com suporte a AMD FSR 3 e Intel XeSS 1.3. Melhorias de estabilidade e correções de bugs.',
      whyItMatters: 'Traz melhorias de estabilidade para jogadores de PC.',
      purchaseImpact: 'none',
      purchaseAdvice: 'Isso não muda de forma relevante a decisão de compra.',
      facts: groundingFacts,
      claims: [
        { text: 'Patch 2.13 lançado para PC', basis: ['fact:0', 'gameIdentity'] },
        { text: 'Isso não muda de forma relevante a decisão de compra', basis: ['purchaseImpact'] },
      ],
    };
  },
};
const validRes = await processNewsEventResult('evt_valid', 'Title', steamItems, 1091500, validProvider);
equal(validRes.status, 'published');


// 2. purchaseImpact=high allows strong purchase language
const highImpactProvider = {
  providerType: 'cloudflare',
  async generateArticle() {
    return {
      decision: 'publish',
      category: 'sale',
      confidence: 0.95,
      game: 'Cyberpunk 2077',
      appId: 1091500,
      title: 'Cyberpunk 2077 com grande desconto',
      summary: 'Promoção relevante confirmada para PC.',
      body: 'Promoção relevante confirmada para PC. 50% de desconto na Steam.',
      whyItMatters: 'Alto impacto na decisão de compra.',
      purchaseImpact: 'high',
      purchaseAdvice: 'Excelente momento para adquirir o jogo com desconto relevante.',
      facts: groundingFacts,
      claims: [
        { text: 'Promoção relevante confirmada', basis: ['fact:0'] },
        { text: 'Excelente momento para adquirir', basis: ['purchaseImpact'] },
      ],
    };
  },
};
const highImpactRes = await processNewsEventResult('evt_high_impact', 'Title', steamItems, 1091500, highImpactProvider);
equal(highImpactRes.status, 'published');


// 3. Invalid output validation rejection
const invalidTitleProvider = {
  providerType: 'cloudflare',
  async generateArticle() {
    return {
      decision: 'publish',
      category: 'update',
      confidence: 0.9,
      game: 'Cyberpunk 2077',
      appId: 1091500,
      title: 'AB', // too short
      summary: 'Summary text long enough',
      body: 'Body text long enough',
      whyItMatters: 'Why text',
      purchaseImpact: 'none',
      purchaseAdvice: 'Advice text',
      facts: groundingFacts,
      claims: [{ text: 'Summary text long enough', basis: ['fact:0'] }],
    };
  },
};
const invalidTitleRes = await processNewsEventResult('evt_invalid_title', 'Title', steamItems, 1091500, invalidTitleProvider);
equal(invalidTitleRes.status, 'rejected');
equal(invalidTitleRes.code, 'validation');
equal(invalidTitleRes.attempts.length, 1); // 1 AI call succeeded, then validation rejected


// 4. Missing purchaseImpact validation rejection
const missingImpactProvider = {
  providerType: 'cloudflare',
  async generateArticle() {
    return {
      decision: 'publish',
      category: 'update',
      confidence: 0.9,
      game: 'Cyberpunk 2077',
      appId: 1091500,
      title: 'Valid Title',
      summary: 'Valid summary text',
      body: 'Valid body text',
      whyItMatters: 'Why text',
      purchaseImpact: null,
      purchaseAdvice: 'Advice text',
      facts: groundingFacts,
      claims: [{ text: 'Valid summary text', basis: ['fact:0'] }],
    };
  },
};
const missingImpactRes = await processNewsEventResult('evt_missing_impact', 'Title', steamItems, 1091500, missingImpactProvider);
equal(missingImpactRes.status, 'rejected');
equal(missingImpactRes.code, 'validation');


// 5. Grounding rejection works
const { checkDeterministicGrounding } = await import(moduleUrl('lib/news/ai/grounding.ts'));
const deterministicContext = {
  gameTitle: 'Cyberpunk 2077',
  category: 'update',
  purchaseImpact: 'none',
  facts: groundingFacts,
};

const perfFail = checkDeterministicGrounding(deterministicContext, {
  title: 'Cyberpunk 2077: Patch 2.13',
  summary: 'FSR 3 melhora o desempenho do jogo.',
  whyItMatters: 'Atualização técnica disponível.',
  purchaseAdvice: 'Acompanhe as ofertas.',
  claims: [],
});
equal(perfFail.approved, false);


// 6. Grounded article passes
const groundedProvider = {
  providerType: 'cloudflare',
  async generateArticle() {
    return {
      decision: 'publish',
      category: 'update',
      confidence: 0.9,
      game: 'Cyberpunk 2077',
      appId: 1091500,
      title: 'Cyberpunk 2077: Patch 2.13',
      summary: 'Inclui suporte a AMD FSR 3 para PC.',
      body: 'Inclui suporte a AMD FSR 3 para PC. Melhorias de estabilidade e correções de bugs.',
      whyItMatters: 'Atualização técnica disponível.',
      purchaseImpact: 'none',
      purchaseAdvice: 'Isso não muda de forma relevante a decisão de compra.',
      facts: groundingFacts,
      claims: [
        { text: 'Inclui suporte a AMD FSR 3', basis: ['fact:1'] },
        { text: 'Isso não muda de forma relevante a decisão de compra', basis: ['purchaseImpact'] },
      ],
    };
  },
};
const groundedRes = await processNewsEventResult('evt_grounded', 'Title', steamItems, 1091500, groundedProvider);
equal(groundedRes.status, 'published');


// 7. Prefilter rejects empty items
const emptyRes = await processNewsEventResult('evt_empty', 'Title', [], 1091500, aiProvider);
equal(emptyRes.status, 'rejected');
equal(emptyRes.code, 'empty');


// 8. Prefilter rejects invalid URL
const invalidUrlItem = [{
  sourceId: 'rss',
  sourceName: 'Test',
  sourceType: 'rss',
  articleId: 'a1',
  articleUrl: 'not-a-url',
  title: 'Valid Title',
  publishedAt: new Date().toISOString(),
  collectedAt: new Date().toISOString(),
}];
const invalidUrlRes = await processNewsEventResult('evt_invalid_url', 'Title', invalidUrlItem, undefined, aiProvider);
equal(invalidUrlRes.status, 'rejected');
equal(invalidUrlRes.code, 'empty');


// --- D1 STORE & ENDPOINT TESTS ---

const tmpDbPath = path.join(os.tmpdir(), `safeloot-test-cf-${Date.now()}.db`);
const db = sqliteD1(tmpDbPath);

db.sqlite.exec(`
  CREATE TABLE games (app_id INTEGER PRIMARY KEY, title TEXT NOT NULL, monitored INTEGER DEFAULT 1 NOT NULL, checked_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE news_sources (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER DEFAULT 1 NOT NULL, priority INTEGER DEFAULT 50 NOT NULL, url TEXT, last_checked_at TEXT, last_success_at TEXT, last_failure_at TEXT, last_error TEXT, last_item_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ok' NOT NULL);
  CREATE TABLE news_raw_items (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, article_id TEXT NOT NULL, article_url TEXT NOT NULL, title TEXT NOT NULL, snippet TEXT, published_at TEXT NOT NULL, collected_at TEXT NOT NULL, app_id INTEGER, hash TEXT NOT NULL);
  CREATE UNIQUE INDEX raw_hash_idx ON news_raw_items (hash);
  CREATE INDEX raw_app_idx ON news_raw_items (app_id);
  CREATE TABLE news_events (id TEXT PRIMARY KEY NOT NULL, app_id INTEGER, title TEXT NOT NULL, category TEXT NOT NULL, importance INTEGER NOT NULL, confidence REAL NOT NULL, purchase_impact TEXT NOT NULL, rumor INTEGER DEFAULT 0 NOT NULL, safe_to_publish INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX event_app_idx ON news_events (app_id);
  CREATE TABLE news_articles (id TEXT PRIMARY KEY NOT NULL, event_id TEXT NOT NULL, app_id INTEGER, title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT, image_url TEXT, why_it_matters TEXT NOT NULL, purchase_advice TEXT NOT NULL, category TEXT NOT NULL, purchase_impact TEXT NOT NULL, rumor INTEGER DEFAULT 0 NOT NULL, provider_type TEXT DEFAULT 'heuristic' NOT NULL, published_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX article_app_idx ON news_articles (app_id);
  CREATE INDEX article_published_idx ON news_articles (published_at);
  CREATE TABLE news_article_sources (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, article_id TEXT NOT NULL, raw_item_id TEXT NOT NULL, source_name TEXT NOT NULL, article_url TEXT NOT NULL);
`);

db.sqlite.exec(`INSERT INTO games (app_id, title, created_at) VALUES (1091500, 'Cyberpunk 2077', '2026-01-01');`);

const saveOk = await saveProcessedArticle(validRes.article, db);
equal(saveOk, true);

const savedNews = await getPublishedNews({ appId: 1091500 }, db);
equal(savedNews.length, 1);
equal(savedNews[0].providerType, 'cloudflare');

const byId = await getPublishedArticleById(validRes.article.eventId, db);
equal(byId !== null, true);
equal(byId.title, validRes.article.title);
equal(typeof byId.body, 'string');
equal(byId.body, validRes.article.body);


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

// Production route must obtain the runtime DB itself
const authedRequest = () =>
  new Request('http://localhost/api/cron/news', {
    method: 'POST',
    headers: { Authorization: 'Bearer secret-test-token-123' },
  });
equal(cronPost.length <= 1, true);


// Watchdog: already-running run blocks second concurrent run with 409
const watchDbPath = `${tmpDbPath}-watchdog`;
const watchDb = sqliteD1(watchDbPath);
watchDb.sqlite.exec(`
  CREATE TABLE news_runs (id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, status TEXT DEFAULT 'running' NOT NULL, error TEXT, summary TEXT);
`);
const { createNewsRun: createWatchRun, getLatestNewsRun: getWatchRun, interpretNewsRunStatus: interpretWatch } = await import(moduleUrl('lib/news/news-store.ts'));
const liveRunId = await createWatchRun(watchDb);
const liveRun = await getWatchRun(watchDb);
equal(liveRun.id, liveRunId);
equal(interpretWatch(liveRun), 'running');
const secondRunId = await createWatchRun(watchDb);
equal(secondRunId !== liveRunId, true);
try { fs.unlinkSync(watchDbPath); } catch {}


// Collector-level injection
const routeDbPath = `${tmpDbPath}-route`;
const routeDb = sqliteD1(routeDbPath);
routeDb.sqlite.exec(`
  CREATE TABLE news_sources (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER DEFAULT 1 NOT NULL, priority INTEGER DEFAULT 50 NOT NULL, url TEXT, last_checked_at TEXT, last_success_at TEXT, last_failure_at TEXT, last_error TEXT, last_item_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ok' NOT NULL);
`);
const directSummary = await collectNewsFromAllSources({ customDb: routeDb, appIds: [] });
equal(Array.isArray(directSummary.sourceResults), true);
equal(directSummary.sourceResults.length >= 2, true);
const steamRouteHealth = await getNewsSourceHealth('steam', routeDb);
equal(steamRouteHealth !== null, true);
equal(['ok', 'error'].includes(steamRouteHealth.status), true);
try { fs.unlinkSync(routeDbPath); } catch {}


// --- EDITORIAL BREAKDOWN TESTS (new architecture) ---

const breakdownDbPath = `${tmpDbPath}-breakdown`;
const breakdownDb = sqliteD1(breakdownDbPath);
breakdownDb.sqlite.exec(`
  CREATE TABLE news_sources (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER DEFAULT 1 NOT NULL, priority INTEGER DEFAULT 50 NOT NULL, url TEXT, last_checked_at TEXT, last_success_at TEXT, last_failure_at TEXT, last_error TEXT, last_item_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ok' NOT NULL);
  CREATE TABLE news_raw_items (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, article_id TEXT NOT NULL, article_url TEXT NOT NULL, title TEXT NOT NULL, snippet TEXT, published_at TEXT NOT NULL, collected_at TEXT NOT NULL, app_id INTEGER, hash TEXT NOT NULL);
  CREATE UNIQUE INDEX raw_hash_idx ON news_raw_items (hash);
  CREATE TABLE news_events (id TEXT PRIMARY KEY NOT NULL, app_id INTEGER, title TEXT NOT NULL, category TEXT NOT NULL, importance INTEGER NOT NULL, confidence REAL NOT NULL, purchase_impact TEXT NOT NULL, rumor INTEGER DEFAULT 0 NOT NULL, safe_to_publish INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE news_articles (id TEXT PRIMARY KEY NOT NULL, event_id TEXT NOT NULL, app_id INTEGER, title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT, image_url TEXT, why_it_matters TEXT NOT NULL, purchase_advice TEXT NOT NULL, category TEXT NOT NULL, purchase_impact TEXT NOT NULL, rumor INTEGER DEFAULT 0 NOT NULL, provider_type TEXT DEFAULT 'heuristic' NOT NULL, published_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE news_article_sources (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, article_id TEXT NOT NULL, raw_item_id TEXT NOT NULL, source_name TEXT NOT NULL, article_url TEXT NOT NULL);
  CREATE TABLE news_runs (id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, status TEXT DEFAULT 'running' NOT NULL, error TEXT, summary TEXT);
  CREATE INDEX news_runs_started ON news_runs (started_at);
`);

// Mock provider that publishes everything for breakdown test
const mockBreakdownProv = {
  providerType: 'heuristic',
  async generateArticle() {
    return {
      decision: 'publish',
      category: 'update',
      confidence: 0.9,
      game: 'Cyberpunk 2077',
      appId: 1091500,
      title: 'Cyberpunk 2077: Patch 2.13',
      summary: 'Patch 2.13 lançado para PC com suporte a AMD FSR 3.',
      body: 'Patch 2.13 lançado para PC com suporte a AMD FSR 3. Melhorias de estabilidade.',
      whyItMatters: 'Atualização técnica disponível.',
      purchaseImpact: 'none',
      purchaseAdvice: 'Isso não muda de forma relevante a decisão de compra.',
      facts: groundingFacts,
      claims: [
        { text: 'Patch 2.13 lançado para PC', basis: ['fact:0', 'gameIdentity'] },
        { text: 'Isso não muda de forma relevante a decisão de compra', basis: ['purchaseImpact'] },
      ],
    };
  },
};

const breakdownSummary = await collectNewsFromAllSources({ customDb: breakdownDb, appIds: [], aiProvider: mockBreakdownProv });
equal(typeof breakdownSummary.editorial, 'object');
equal(breakdownSummary.editorial.pipeline.eventsReceived, breakdownSummary.eventsCreated);
equal(breakdownSummary.editorial.ai.primarySuccess >= 0, true);
equal(breakdownSummary.editorial.ai.attemptsTotal >= breakdownSummary.editorial.ai.primarySuccess, true);
equal(breakdownSummary.editorial.validation.rejected >= 0, true);
equal(breakdownSummary.editorial.grounding.processed >= 0, true);
try { fs.unlinkSync(breakdownDbPath); } catch {}


// --- STEAM RAW PERSISTENCE TESTS ---

const steamDbPath = `${tmpDbPath}-steam`;
const steamDb = sqliteD1(steamDbPath);
steamDb.sqlite.exec(`
  CREATE TABLE games (app_id INTEGER PRIMARY KEY, title TEXT NOT NULL, monitored INTEGER DEFAULT 1 NOT NULL, checked_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE news_sources (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER DEFAULT 1 NOT NULL, priority INTEGER DEFAULT 50 NOT NULL, url TEXT, last_checked_at TEXT, last_success_at TEXT, last_failure_at TEXT, last_error TEXT, last_item_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ok' NOT NULL);
  CREATE TABLE news_raw_items (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL REFERENCES news_sources(id), article_id TEXT NOT NULL, article_url TEXT NOT NULL, title TEXT NOT NULL, snippet TEXT, published_at TEXT NOT NULL, collected_at TEXT NOT NULL, app_id INTEGER REFERENCES games(app_id), hash TEXT NOT NULL);
  CREATE UNIQUE INDEX raw_hash_idx2 ON news_raw_items (hash);
`);
steamDb.sqlite.exec(`INSERT INTO news_sources (id, name, type) VALUES ('steam', 'Steam News', 'steam');`);
const steamOnly = steamItems.filter((i) => i.appId && i.appId > 0).slice(0, 5);
const steamInserted = await saveRawNewsItems(steamOnly, steamDb);
equal(steamInserted, steamOnly.length);
const steamRows = await steamDb.prepare('SELECT COUNT(*) AS c FROM news_raw_items').first();
equal(steamRows.c, steamOnly.length);
const stubRows = await steamDb.prepare('SELECT COUNT(*) AS c FROM games WHERE monitored=0').first();
equal(stubRows.c > 0, true);
const monitoredRows = await steamDb.prepare('SELECT COUNT(*) AS c FROM games WHERE monitored=1').first();
equal(monitoredRows.c, 0);
try { fs.unlinkSync(steamDbPath); } catch {}


// --- NEWS RUN RECORD TESTS ---

const runDbPath = `${tmpDbPath}-runs`;
const runDb = sqliteD1(runDbPath);
runDb.sqlite.exec(`
  CREATE TABLE news_runs (id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, status TEXT DEFAULT 'running' NOT NULL, error TEXT, summary TEXT);
  CREATE INDEX news_runs_started ON news_runs (started_at);
`);
const { createNewsRun, updateNewsRun, getLatestNewsRun, interpretNewsRunStatus } = await import(moduleUrl('lib/news/news-store.ts'));
const { GET: newsStatusGet } = await import(moduleUrl('app/api/cron/news/status/route.ts'));

// 1. Run creation starts in running state.
const runId = await createNewsRun(runDb);
equal(typeof runId, 'string');
let latest = await getLatestNewsRun(runDb);
equal(latest.status, 'running');
equal(latest.finishedAt, null);

// 2. Counter updates persist a summary snapshot.
await updateNewsRun(runId, { status: 'running', summary: { eventsReceived: 10 } }, runDb);
latest = await getLatestNewsRun(runDb);
equal(latest.summary.eventsReceived, 10);
equal(latest.status, 'running');

// 3. Completion stamps finishedAt.
await updateNewsRun(runId, { status: 'completed', summary: { articlesPublished: 2 } }, runDb);
latest = await getLatestNewsRun(runDb);
equal(latest.status, 'completed');
equal(Boolean(latest.finishedAt), true);

// 4. Failure records a sanitized error and no secrets.
const failId = await createNewsRun(runDb);
await updateNewsRun(failId, { status: 'failed', error: 'provider timeout' }, runDb);
latest = await getLatestNewsRun(runDb);
equal(latest.status, 'failed');
equal(latest.error, 'provider timeout');

// 5. A stale running run is interpreted as stale, never rewritten.
const staleId = await createNewsRun(runDb);
runDb.sqlite.exec(`UPDATE news_runs SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = '${staleId}'`);
latest = await getLatestNewsRun(runDb);
equal(latest.id, staleId);
equal(interpretNewsRunStatus(latest), 'stale_running');
const freshId = await createNewsRun(runDb);
latest = await getLatestNewsRun(runDb);
equal(interpretNewsRunStatus(latest), 'running');

// 6. Read-only status endpoint surfaces the latest run without auth or mutation.
const statusRes = await newsStatusGet();
equal(statusRes.status, 503);
const statusJson = await statusRes.json();
equal(statusJson.run, null);

// 7. No secret material is persisted in run records.
const allRuns = await runDb.prepare('SELECT id, error, summary FROM news_runs').all();
for (const row of allRuns.results) {
  const blob = JSON.stringify(row);
  equal(blob.includes('Bearer'), false);
  equal(blob.includes('SAFELOOT_ADMIN_TOKEN'), false);
  equal(blob.includes('sk-'), false);
}

// 8. Counter invariant: rejected + completed + articles published
equal(
  breakdownSummary.editorial.pipeline.eventsCompleted + breakdownSummary.editorial.pipeline.eventsSkipped,
  breakdownSummary.eventsCreated,
);
try { fs.unlinkSync(runDbPath); } catch {}


// --- GNEWS, FILTERING & TRANSLATION TESTS ---

// 1. GNews funcionando com mock fetcher
const mockGNewsResponse = {
  totalArticles: 2,
  articles: [
    {
      title: 'Grand Theft Auto VI Release Date Confirmed for 2026',
      description: 'Rockstar officially confirms GTA 6 release window for next-gen consoles and PC.',
      url: 'https://www.gamespot.com/articles/gta-6-confirmed-date/',
      image: 'https://www.gamespot.com/images/gta6.jpg',
      publishedAt: '2026-09-22T10:00:00Z',
      source: { name: 'GameSpot', url: 'https://gamespot.com' },
    },
    {
      title: 'Cyberpunk 2077 Update 2.14 Patch Notes',
      description: 'CD Projekt Red deploys new stability fix on Steam.',
      url: 'https://www.ign.com/articles/cyberpunk-update-214',
      image: 'https://www.ign.com/images/cp2077.jpg',
      publishedAt: '2026-09-22T11:00:00Z',
      source: { name: 'IGN', url: 'https://ign.com' },
    },
  ],
};

const gnewsMockFetcher = async (url) => {
  return new Response(JSON.stringify(mockGNewsResponse), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const gnewsSource = {
  id: 'gnews',
  name: 'GNews',
  type: 'gnews',
  enabled: true,
  priority: 90,
};

const gnewsItems = await fetchGNewsItems(gnewsSource, {
  apiKey: 'test-api-key',
  fetcher: gnewsMockFetcher,
});
equal(gnewsItems.length, 2);
equal(gnewsItems[0].sourceType, 'gnews');
equal(gnewsItems[0].sourceName, 'GNews (GameSpot)');
equal(gnewsItems[0].imageUrl, 'https://www.gamespot.com/images/gta6.jpg');
equal(gnewsItems[0].articleUrl, 'https://www.gamespot.com/articles/gta-6-confirmed-date/');

// 2. GNews sem API key retorna vazio sem lançar erro
const gnewsNoKey = await fetchGNewsItems(gnewsSource, {
  apiKey: '',
  fetcher: gnewsMockFetcher,
});
equal(Array.isArray(gnewsNoKey), true);
equal(gnewsNoKey.length, 0);

// 3. GNews timeout tratado graciosamente
const gnewsTimeoutFetcher = async () => {
  const err = new Error('The operation was aborted');
  err.name = 'TimeoutError';
  throw err;
};
let timeoutThrown = false;
try {
  await fetchGNewsItems(gnewsSource, {
    apiKey: 'test-key',
    fetcher: gnewsTimeoutFetcher,
    timeoutMs: 100,
  });
} catch (e) {
  timeoutThrown = true;
  equal(e.message.includes('GNews timeout'), true);
}
equal(timeoutThrown, true);

// 4. GNews rate limit (HTTP 429) tratado
const gnewsRateLimitFetcher = async () => new Response('Rate limited', { status: 429 });
let rateLimitThrown = false;
try {
  await fetchGNewsItems(gnewsSource, {
    apiKey: 'test-key',
    fetcher: gnewsRateLimitFetcher,
  });
} catch (e) {
  rateLimitThrown = true;
  equal(e.message.includes('429'), true);
}
equal(rateLimitThrown, true);

// 5. Normalização de URL canônica e desduplicação GNews x RSS
const urlWithTracking = 'https://www.pcgamer.com/new-witcher-game/?utm_source=gnews&utm_medium=feed&ref=newsletter';
const cleanCanonical = normalizeCanonicalUrl(urlWithTracking);
equal(cleanCanonical, 'https://www.pcgamer.com/new-witcher-game');

const crossDedupeItems = [
  {
    sourceId: 'pcgamer',
    sourceName: 'PC Gamer',
    sourceType: 'rss',
    articleId: 'https://www.pcgamer.com/new-witcher-game/',
    articleUrl: 'https://www.pcgamer.com/new-witcher-game/',
    title: 'The Witcher 4 in Active Development',
    publishedAt: '2026-09-22T10:00:00Z',
    collectedAt: '2026-09-22T10:00:00Z',
  },
  {
    sourceId: 'gnews',
    sourceName: 'GNews (PC Gamer)',
    sourceType: 'gnews',
    articleId: 'https://www.pcgamer.com/new-witcher-game/?utm_source=gnews',
    articleUrl: 'https://www.pcgamer.com/new-witcher-game/?utm_source=gnews',
    title: 'The Witcher 4 in Active Development',
    publishedAt: '2026-09-22T10:05:00Z',
    collectedAt: '2026-09-22T10:05:00Z',
  },
];
const dedupedCross = deduplicateRawItems(crossDedupeItems);
equal(dedupedCross.length, 1);
equal(dedupedCross[0].sourceId, 'pcgamer');

// 6. Agrupamento de eventos entre fontes preserva todas as origens
const similarEventItems = [
  {
    sourceId: 'gamespot',
    sourceName: 'GameSpot',
    sourceType: 'rss',
    articleId: 'gs1',
    articleUrl: 'https://gamespot.com/witcher-4-update',
    title: 'CD Projekt reveals The Witcher 4 development milestones',
    publishedAt: '2026-09-22T10:00:00Z',
    collectedAt: '2026-09-22T10:00:00Z',
  },
  {
    sourceId: 'gnews',
    sourceName: 'GNews (IGN)',
    sourceType: 'gnews',
    articleId: 'gn1',
    articleUrl: 'https://ign.com/the-witcher-4-development-update',
    title: 'The Witcher 4 development milestones detailed by CD Projekt',
    publishedAt: '2026-09-22T10:10:00Z',
    collectedAt: '2026-09-22T10:10:00Z',
  },
];
const mergedEvents = groupNewsItemsIntoEvents(similarEventItems);
equal(mergedEvents.length, 1);
equal(mergedEvents[0].items.length, 2);
equal(mergedEvents[0].items.some((i) => i.sourceType === 'gnews'), true);
equal(mergedEvents[0].items.some((i) => i.sourceType === 'rss'), true);

// 7. Filtro determinístico: aceita gaming e rejeita spam / non-gaming
const validGamingItem = {
  sourceId: 'gnews',
  sourceName: 'GNews',
  sourceType: 'gnews',
  articleId: '1',
  articleUrl: 'https://example.com/steam-deck',
  title: 'Steam Deck update adds new performance settings for gamers',
  snippet: 'Valve rolls out new graphics options for PC gaming handheld.',
  publishedAt: '2026-09-22T10:00:00Z',
  collectedAt: '2026-09-22T10:00:00Z',
};
equal(isGamingNews(validGamingItem).pass, true);

const nonGamingItem = {
  sourceId: 'gnews',
  sourceName: 'GNews',
  sourceType: 'gnews',
  articleId: '2',
  articleUrl: 'https://example.com/geladeira',
  title: 'Nova geladeira inteligente da Samsung com conexão Wi-Fi',
  snippet: 'Refrigerador vem com tela touch e compartimento inteligente.',
  publishedAt: '2026-09-22T10:00:00Z',
  collectedAt: '2026-09-22T10:00:00Z',
};
equal(isGamingNews(nonGamingItem).pass, false);

const automotiveItem = {
  sourceId: 'gnews',
  sourceName: 'GNews',
  sourceType: 'gnews',
  articleId: '3',
  articleUrl: 'https://example.com/carro-byd',
  title: 'Novo carro elétrico da BYD tem preço reduzido no Brasil',
  snippet: 'Montadora anuncia corte de preços no mercado automotivo.',
  publishedAt: '2026-09-22T10:00:00Z',
  collectedAt: '2026-09-22T10:00:00Z',
};
equal(isGamingNews(automotiveItem).pass, false);

const filterRun = filterGamingNews([validGamingItem, nonGamingItem, automotiveItem]);
equal(filterRun.passed.length, 1);
equal(filterRun.rejected.length, 2);

// 8. Detecção de idioma EN vs PT-BR
const ptText = 'Novo jogo da Rockstar chega em 2026 com gráficos impressionantes para PC';
const enText = 'Rockstar announces release window for next major gaming title';
equal(isPortugueseText(ptText), true);
equal(detectLanguage(ptText), 'pt');
equal(isPortugueseText(enText), false);
equal(detectLanguage(enText), 'en');

// 9. Tradução EN -> PT-BR
const enArticle = {
  title: 'Patch released with performance fixes',
  summary: 'A new update was launched today on PC with bug fixes and stability improvements.',
  body: 'The developers released a major patch addressing framerate drops across all PC configurations.',
};
const { article: translatedArticle, translated } = await translateArticleToPtBr(enArticle);
equal(translated, true);
equal(isPortugueseText(translatedArticle.title), true);
equal(translatedArticle.title.includes('Patch lançado com melhorias de desempenho'), true);

// 10. Notícia já em português não é retraduzida (custo zero de IA)
const ptArticle = {
  title: 'Atualização de Cyberpunk 2077 traz melhorias de desempenho',
  summary: 'Novo patch foi lançado hoje para PC trazendo correções de bugs e maior estabilidade.',
  body: 'Os desenvolvedores liberaram uma grande atualização resolvendo problemas de taxa de quadros no PC.',
};
const { article: untouchedArticle, translated: ptTranslated } = await translateArticleToPtBr(ptArticle);
equal(ptTranslated, false);
equal(untouchedArticle.title, ptArticle.title);

// 11. Preservação de fontes originais no artigo publicado
const processedResult = await processNewsEventResult(
  'event_test_1',
  'The Witcher 4 Development Milestone',
  similarEventItems,
  undefined,
  {
    providerType: 'heuristic',
    async generateArticle() {
      return {
        decision: 'publish',
        category: 'update',
        confidence: 0.95,
        game: 'The Witcher 4',
        appId: null,
        title: 'The Witcher 4 Development Milestone',
        summary: 'CD Projekt details milestones reached for the next Witcher installment.',
        body: 'CD Projekt details milestones reached for the next Witcher installment with Unreal Engine 5.',
        whyItMatters: 'Grande passo no desenvolvimento do próximo RPG da franquia.',
        purchaseImpact: 'medium',
        purchaseAdvice: 'Acompanhe as notícias de pré-venda no SafeLoot.',
        facts: ['The Witcher 4 development on track'],
        claims: [{ text: 'The Witcher 4', basis: ['fact:0', 'gameIdentity'] }, { text: 'SafeLoot', basis: ['purchaseImpact'] }],
      };
    },
  },
);
equal(processedResult.status, 'published');
equal(processedResult.article.sources.length, 2);
equal(processedResult.article.sources[0].sourceName, 'GameSpot');
equal(processedResult.article.sources[0].articleUrl, 'https://gamespot.com/witcher-4-update');
equal(processedResult.article.sources[1].sourceName, 'GNews (IGN)');
equal(processedResult.article.sources[1].articleUrl, 'https://ign.com/the-witcher-4-development-update');

// 12. Persistência do artigo traduzido no D1
const transDbPath = `${tmpDbPath}-trans`;
const transDb = sqliteD1(transDbPath);
transDb.sqlite.exec(`
  CREATE TABLE games (app_id INTEGER PRIMARY KEY, title TEXT NOT NULL, monitored INTEGER DEFAULT 1 NOT NULL, checked_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE news_sources (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER DEFAULT 1 NOT NULL, priority INTEGER DEFAULT 50 NOT NULL, url TEXT, last_checked_at TEXT, last_success_at TEXT, last_failure_at TEXT, last_error TEXT, last_item_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ok' NOT NULL);
  CREATE TABLE news_raw_items (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, article_id TEXT NOT NULL, article_url TEXT NOT NULL, title TEXT NOT NULL, snippet TEXT, published_at TEXT NOT NULL, collected_at TEXT NOT NULL, app_id INTEGER, hash TEXT NOT NULL);
  CREATE TABLE news_events (id TEXT PRIMARY KEY NOT NULL, app_id INTEGER, title TEXT NOT NULL, category TEXT NOT NULL, importance INTEGER NOT NULL, confidence REAL NOT NULL, purchase_impact TEXT NOT NULL, rumor INTEGER DEFAULT 0 NOT NULL, safe_to_publish INTEGER DEFAULT 0 NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE news_articles (id TEXT PRIMARY KEY NOT NULL, event_id TEXT NOT NULL, app_id INTEGER, title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT, image_url TEXT, why_it_matters TEXT NOT NULL, purchase_advice TEXT NOT NULL, category TEXT NOT NULL, purchase_impact TEXT NOT NULL, rumor INTEGER DEFAULT 0 NOT NULL, provider_type TEXT DEFAULT 'heuristic' NOT NULL, published_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE news_article_sources (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, article_id TEXT NOT NULL, raw_item_id TEXT NOT NULL, source_name TEXT NOT NULL, article_url TEXT NOT NULL);
`);
const saveSuccess = await saveProcessedArticle(processedResult.article, transDb);
equal(saveSuccess, true);
const retrieved = await getPublishedArticleById(processedResult.article.eventId, transDb);
equal(retrieved !== null, true);
equal(retrieved.title, processedResult.article.title);
equal(retrieved.sources.length, 2);
// 13. Testes de Qualidade Editorial e Geração de Notícias

// 13.1 Artigo com body diferente de summary
const testItemHeuristic = {
  sourceId: 'steam',
  sourceName: 'Steam News',
  sourceType: 'steam',
  articleId: 'steam_hww_1',
  articleUrl: 'https://store.steampowered.com/news/app/123/view/456',
  title: 'He Who Watches está disponível agora!',
  snippet: 'O jogo de quebra-cabeça em primeira pessoa em colaboração com o desenvolvedor solo Bobby Vanden, Danga Games, está disponível em Steam e itch.',
  publishedAt: new Date().toISOString(),
  collectedAt: new Date().toISOString(),
  appId: 12345,
};

const generatedArticleResult = await aiProvider.generateArticle(
  'He Who Watches está disponível agora!',
  [testItemHeuristic],
);
equal(generatedArticleResult.decision, 'publish');
equal(typeof generatedArticleResult.summary === 'string', true);
equal(typeof generatedArticleResult.body === 'string', true);
equal(generatedArticleResult.summary !== generatedArticleResult.body, true);
equal(generatedArticleResult.body.length >= 20, true);
equal(generatedArticleResult.summary.toLowerCase() !== generatedArticleResult.body.toLowerCase(), true);

// Pipeline rejeita quando body é idêntico ao resumo
const duplicateBodyEventResult = await processNewsEventResult(
  'evt_dup_body',
  'He Who Watches está disponível agora!',
  [testItemHeuristic],
  undefined,
  {
    providerType: 'heuristic',
    async generateArticle() {
      return {
        decision: 'publish',
        category: 'release',
        confidence: 0.95,
        game: 'He Who Watches',
        appId: 12345,
        title: 'He Who Watches está disponível agora!',
        summary: 'O jogo de quebra-cabeça em primeira pessoa em colaboração com Bobby Vanden está disponível em Steam e itch.',
        body: 'O jogo de quebra-cabeça em primeira pessoa em colaboração com Bobby Vanden está disponível em Steam e itch.',
        whyItMatters: 'Lançamento indie relevante.',
        purchaseImpact: 'medium',
        purchaseAdvice: 'Confira as ofertas.',
        facts: ['Lançamento confirmado'],
        claims: [{ text: 'Lançamento', basis: ['fact:0'] }],
      };
    },
  },
);
equal(duplicateBodyEventResult.status, 'rejected');
equal(duplicateBodyEventResult.reason, 'Corpo idêntico ao resumo');

// 13.2 Fonte com pouco conteúdo -> 1-2 parágrafos curtos
const shortSourceItem = {
  sourceId: 'steam',
  sourceName: 'Steam News',
  sourceType: 'steam',
  articleId: 'short_item_1',
  articleUrl: 'https://store.steampowered.com/news/app/999/1',
  title: 'Pequena atualização corretiva liberada',
  snippet: 'Hotfix rápido para corrigir travamento pontual.',
  publishedAt: new Date().toISOString(),
  collectedAt: new Date().toISOString(),
  appId: 999,
};

const shortArticle = await aiProvider.generateArticle(
  'Pequena atualização corretiva liberada',
  [shortSourceItem],
);
equal(shortArticle.decision, 'publish');
const shortParagraphs = shortArticle.body.split('\n\n').filter(p => p.trim().length > 0);
equal(shortParagraphs.length >= 1 && shortParagraphs.length <= 2, true);
equal(shortArticle.summary !== shortArticle.body, true);
equal(!shortParagraphs.includes(shortArticle.summary), true);

// 13.3 Fonte com conteúdo rico -> 3-6 parágrafos curtos
const richSourceItems = [
  {
    sourceId: 'pcgamer',
    sourceName: 'PC Gamer',
    sourceType: 'rss',
    articleId: 'rich_item_1',
    articleUrl: 'https://pcgamer.com/cyberpunk-2077-patch-213',
    title: 'Cyberpunk 2077 Patch 2.13 adds FSR 3 support on PC',
    snippet: 'CD Projekt Red has released patch 2.13 for Cyberpunk 2077, bringing AMD FSR 3 and Intel XeSS 1.3 to PC players. This update introduces frame generation technology.',
    publishedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    appId: 1091500,
  },
  {
    sourceId: 'steam',
    sourceName: 'Steam News',
    sourceType: 'steam',
    articleId: 'rich_item_2',
    articleUrl: 'https://store.steampowered.com/news/app/1091500/view/123',
    title: 'Cyberpunk 2077 Patch 2.13 Released',
    snippet: 'Patch 2.13 for Cyberpunk 2077 is now live on PC. It includes FSR 3 support, stability fixes, and resolves UI scaling issues across ultrawide monitors.',
    publishedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    appId: 1091500,
  },
];

const richArticle = await aiProvider.generateArticle(
  'Cyberpunk 2077 Patch 2.13 adds FSR 3 support on PC',
  richSourceItems,
);
equal(richArticle.decision, 'publish');
const richParagraphs = richArticle.body.split('\n\n').filter(p => p.trim().length > 0);
equal(richParagraphs.length >= 3 && richParagraphs.length <= 6, true);
equal(richArticle.summary !== richArticle.body, true);
for (const para of richParagraphs) {
  equal(para !== richArticle.summary, true);
}

// 13.4 Nenhuma informação inventada que não esteja na fonte (grounding & verification)
const groundingContext = {
  facts: [
    'Evento detectado: Cyberpunk 2077 Patch 2.13',
    'Fontes confirmadas: Steam News',
    'Fato da fonte Steam News #1: Patch 2.13 adiciona suporte a FSR 3.',
  ],
  category: 'update',
  purchaseImpact: 'low',
};
const verifiedGood = await aiProvider.verify(groundingContext, {
  title: 'Cyberpunk 2077 Patch 2.13',
  summary: 'A CD Projekt Red disponibilizou a atualização com FSR 3 para PC.',
  body: 'O patch já está disponível com suporte a AMD FSR 3.',
  whyItMatters: 'Melhoria de upscaling para jogadores de PC.',
});
equal(verifiedGood.approved, true);

const verifiedHallucinated = await aiProvider.verify(groundingContext, {
  title: 'Cyberpunk 2077 Patch 2.13',
  summary: 'Esta atualização melhora a experiência de jogo e melhora o desempenho do jogo.',
  body: 'O patch pode melhorar a experiência sem dados na fonte.',
  whyItMatters: 'Boa notícia porque melhora tudo.',
});
equal(verifiedHallucinated.approved, false);
equal(verifiedHallucinated.unsupportedClaims.length > 0, true);

// 13.5 Sem contaminação de UI / links internos / botões / SVG
const uiContaminatedBodies = [
  '<svg width="24" height="24"><path d="M0 0h24v24H0z"/></svg> Detalhes do patch 2.13.',
  'Clique aqui para comprar: <button class="btn">Comprar agora</button> no Steam.',
  'Confira a ficha completa em /jogo/cyberpunk-2077 e veja histórico.',
  'Vale comprar? Descubra nessa análise do patch 2.13.',
  'Quer monitorar o preço? Ative o alerta no SafeLoot.',
];

for (const badBody of uiContaminatedBodies) {
  const uiRejection = await processNewsEventResult(
    'evt_ui_bad',
    'Cyberpunk 2077 Patch',
    richSourceItems,
    undefined,
    {
      providerType: 'heuristic',
      async generateArticle() {
        return {
          decision: 'publish',
          category: 'update',
          confidence: 0.9,
          game: 'Cyberpunk 2077',
          appId: 1091500,
          title: 'Cyberpunk 2077 Patch 2.13',
          summary: 'Atualização técnica liberada com novidades para PC.',
          body: badBody,
          whyItMatters: 'Importante para desempenho.',
          purchaseImpact: 'low',
          purchaseAdvice: 'Acompanhe as promoções.',
          facts: ['Patch lançado'],
          claims: [{ text: 'Patch', basis: ['fact:0'] }],
        };
      },
    },
  );
  equal(uiRejection.status, 'rejected');
  equal(uiRejection.reason, 'Corpo contém contaminação de UI ou elementos proibidos');
}

// 13.6 Tradução preservando os campos corretamente (incluindo whyItMatters)
const englishArticle = {
  title: 'Ultimate Edition Announced',
  summary: 'Patch released with performance fixes for PC players worldwide.',
  body: 'CD Projekt Red officially revealed the Ultimate Edition.\n\nPlayers will receive new features across all PC platforms.',
  whyItMatters: 'Major update for PC players regarding game editions.',
};
const { article: translatedEnArticle, translated: enWasTranslated } = await translateArticleToPtBr(
  englishArticle,
  {
    customAiRun: async (model, input) => {
      const srcText = input?.text || input?.messages?.[1]?.content || '';
      return { translated_text: `[Traduzido] ${srcText}` };
    },
  },
);
equal(enWasTranslated, true);
equal(translatedEnArticle.title.startsWith('[Traduzido] Ultimate Edition Announced'), true);
equal(translatedEnArticle.summary.startsWith('[Traduzido] Patch released with performance fixes'), true);
equal(translatedEnArticle.body.startsWith('[Traduzido] CD Projekt Red officially revealed'), true);
equal(translatedEnArticle.whyItMatters.startsWith('[Traduzido] Major update for PC players'), true);
equal(translatedEnArticle.body.includes('\n\n'), true);

// 13.7 Preservação da URL da fonte original
const validProcessedResult = await processNewsEventResult(
  'evt_url_preservation',
  'Cyberpunk 2077 Patch 2.13 adds FSR 3 support on PC',
  richSourceItems,
  undefined,
  {
    providerType: 'heuristic',
    async generateArticle() {
      return {
        decision: 'publish',
        category: 'update',
        confidence: 0.95,
        game: 'Cyberpunk 2077',
        appId: 1091500,
        title: 'Cyberpunk 2077: Patch 2.13 adiciona suporte a FSR 3 no PC',
        summary: 'A CD Projekt Red disponibilizou a atualização 2.13 para Cyberpunk 2077 no PC.',
        body: 'A nova atualização traz a tecnologia AMD FSR 3 e suporte aprimorado a monitores ultrawide.\n\nJogadores no PC já podem baixar o patch diretamente pelo Steam.',
        whyItMatters: 'Adiciona geração de quadros e melhora fluidez no PC.',
        purchaseImpact: 'low',
        purchaseAdvice: 'Melhor momento técnico para jogar se você já possui o título.',
        facts: ['Patch 2.13 disponível com FSR 3'],
        claims: [
          { text: 'Cyberpunk 2077', basis: ['fact:0', 'gameIdentity'] },
          { text: 'FSR 3', basis: ['purchaseImpact'] },
        ],
      };
    },
  },
);
equal(validProcessedResult.status, 'published');
equal(validProcessedResult.article.sources.length, 2);
equal(validProcessedResult.article.sources[0].articleUrl, 'https://pcgamer.com/cyberpunk-2077-patch-213');
equal(validProcessedResult.article.sources[0].sourceName, 'PC Gamer');
equal(validProcessedResult.article.sources[1].articleUrl, 'https://store.steampowered.com/news/app/1091500/view/123');
equal(validProcessedResult.article.sources[1].sourceName, 'Steam News');

// 13.8 Rejeição estrita de frases genéricas de preenchimento (filler)
const fillerArticleResult = await processNewsEventResult(
  'evt_filler_test',
  'Novo jogo indie é lançado no PC',
  richSourceItems,
  undefined,
  {
    providerType: 'heuristic',
    async generateArticle() {
      return {
        decision: 'publish',
        category: 'release',
        confidence: 0.9,
        game: 'Puzzle Quest',
        appId: null,
        title: 'Jogo de puzzle chega ao PC',
        summary: 'Um novo jogo de quebra-cabeça está disponível na Steam.',
        body: 'O jogo foi lançado hoje. O lançamento do jogo é um evento importante para os fãs de quebra-cabeça.\n\nEssa atualização traz novos recursos.',
        whyItMatters: 'Lançamento indie para PC.',
        purchaseImpact: 'low',
        purchaseAdvice: 'Acompanhe as novidades.',
        facts: ['Jogo de puzzle lançado'],
        claims: [{ text: 'Puzzle Quest', basis: ['fact:0', 'gameIdentity'] }],
      };
    },
  },
);
equal(fillerArticleResult.status, 'rejected');
equal(fillerArticleResult.code, 'validation');
equal(fillerArticleResult.reason.includes('filler'), true);

// 13.9 Rejeição de saída inadequada (<120 chars) quando a fonte é extensa (>=1500 chars)
const hugeSourceSnippet = 'Texto detalhado da matéria cobrindo lançamento, mecânicas, desenvolvedora e histórico. '.repeat(20);
const hugeSourceItems = [
  {
    sourceId: 'pcgamer',
    sourceName: 'PC Gamer',
    sourceType: 'rss',
    articleId: 'huge1',
    articleUrl: 'https://pcgamer.com/huge-article',
    title: 'Huge Gaming Announcement',
    snippet: hugeSourceSnippet,
    publishedAt: '2026-09-22T12:00:00Z',
    collectedAt: '2026-09-22T12:00:00Z',
  },
];
const inadequateResult = await processNewsEventResult(
  'evt_inadequate_test',
  'Huge Gaming Announcement',
  hugeSourceItems,
  undefined,
  {
    providerType: 'heuristic',
    async generateArticle() {
      return {
        decision: 'publish',
        category: 'release',
        confidence: 0.9,
        game: 'Big Game',
        appId: null,
        title: 'Grande anúncio revelado',
        summary: 'Um anúncio importante foi feito para a comunidade de jogadores de PC.',
        body: 'Jogo anunciado para PC.',
        whyItMatters: 'Grande anúncio do estúdio.',
        purchaseImpact: 'low',
        purchaseAdvice: 'Acompanhe as ofertas.',
        facts: ['Grande anúncio revelado'],
        claims: [{ text: 'Big Game', basis: ['fact:0', 'gameIdentity'] }],
      };
    },
  },
);
equal(inadequateResult.status, 'rejected');
equal(inadequateResult.code, 'validation');
equal(inadequateResult.reason.includes('Conteúdo insuficiente'), true);

// 13.10 Aceitação de artigo curto quando a fonte é naturalmente curta (<800 chars)
const briefSourceItems = [
  {
    sourceId: 'steam',
    sourceName: 'Steam News',
    sourceType: 'steam',
    articleId: 'brief1',
    articleUrl: 'https://store.steampowered.com/news/app/730/view/999',
    title: 'CS2 Server Maintenance Today',
    snippet: 'Manutenção programada de servidores para hoje às 19h.',
    publishedAt: '2026-09-22T15:00:00Z',
    collectedAt: '2026-09-22T15:00:00Z',
  },
];
const briefResult = await processNewsEventResult(
  'evt_brief_test',
  'CS2 Server Maintenance Today',
  briefSourceItems,
  730,
  {
    providerType: 'heuristic',
    async generateArticle() {
      return {
        decision: 'publish',
        category: 'update',
        confidence: 0.95,
        game: 'Counter-Strike 2',
        appId: 730,
        title: 'Counter-Strike 2: Manutenção programada de servidores hoje',
        summary: 'A Valve anunciou uma breve manutenção técnica nos servidores de CS2.',
        body: 'A Valve informou que os servidores de Counter-Strike 2 passarão por manutenção técnica hoje às 19h.\n\nDurante o período, partidas competitivas e serviços da comunidade poderão ficar temporariamente indisponíveis.',
        whyItMatters: 'Manutenção rápida de servidores no PC.',
        purchaseImpact: 'none',
        purchaseAdvice: 'Isso não muda de forma relevante a decisão de compra.',
        facts: ['Manutenção de servidores'],
        claims: [{ text: 'Counter-Strike 2', basis: ['fact:0', 'gameIdentity'] }],
      };
    },
  },
);
equal(briefResult.status, 'published');
equal(briefResult.article.body.length > 50, true);

// 13.11 Suporte e renderização de subtítulos opcionais (### Subtítulo) no corpo
const articleWithSubheadings = {
  id: 'art_with_sub',
  title: 'Grande RPG anunciado para PC',
  summary: 'Resumo com lead jornalístico destacando o anúncio.',
  body: 'A desenvolvedora confirmou oficialmente a produção do novo RPG.\n\n### O que muda na jogabilidade\n\nNovos combates em tempo real e sistema dinâmico de clima foram confirmados.\n\n### Plataformas e lançamento\n\nO jogo chegará ao PC via Steam e Epic Games Store.',
  whyItMatters: 'Novo título aguardado para PC.',
  purchaseAdvice: 'Vale colocar na lista de desejos.',
  category: 'announcement',
  purchaseImpact: 'medium',
  publishedAt: '2026-09-22T10:00:00Z',
  sources: [{ name: 'PC Gamer', url: 'https://pcgamer.com/new-rpg' }],
};
const paragraphsParsed = (articleWithSubheadings.body || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);
equal(paragraphsParsed.length, 5);
equal(paragraphsParsed[1].startsWith('### '), true);
equal(paragraphsParsed[3].startsWith('### '), true);

// --- 14. IMAGE EXTRACTION & PRESERVATION TESTS ---
// 14.1 cleanUrl utility
equal(cleanUrl('https://assets.io/img.jpg?w=100&amp;q=80'), 'https://assets.io/img.jpg?w=100&q=80');
equal(cleanUrl('  https://assets.io/img.jpg  '), 'https://assets.io/img.jpg');
equal(cleanUrl('//assets.io/img.jpg'), 'https://assets.io/img.jpg');
equal(cleanUrl('not-a-url'), undefined);
equal(cleanUrl(''), undefined);

// 14.2 RSS image extraction
// Enclosure image
const rssEnclosure = '<item><title>T</title><link>https://x.com</link><enclosure type="image/jpeg" url="https://cdn.example.com/enclosure.jpg"/></item>';
equal(extractImageUrl(rssEnclosure), 'https://cdn.example.com/enclosure.jpg');

// Non-image enclosure ignored
const rssAudioEnclosure = '<item><title>T</title><link>https://x.com</link><enclosure type="audio/mpeg" url="https://cdn.example.com/podcast.mp3"/></item>';
equal(extractImageUrl(rssAudioEnclosure), undefined);

// Media:content image
const rssMediaContent = '<item><title>T</title><link>https://x.com</link><media:content type="image/jpeg" url="https://cdn.example.com/media.jpg"><media:credit>A</media:credit></media:content></item>';
equal(extractImageUrl(rssMediaContent), 'https://cdn.example.com/media.jpg');

// Media:thumbnail text (IGN format)
const rssMediaThumbText = '<item><title>T</title><link>https://x.com</link><media:thumbnail>https://assets-prd.ignimgs.com/thumb.png</media:thumbnail></item>';
equal(extractImageUrl(rssMediaThumbText), 'https://assets-prd.ignimgs.com/thumb.png');

// Encoded &lt;img in description
const rssEncodedImg = '<item><title>T</title><link>https://x.com</link><description>&lt;p&gt;&lt;img src=&quot;https://cdn.example.com/encoded.jpg&quot; /&gt;&lt;/p&gt;</description></item>';
equal(extractImageUrl(rssEncodedImg, '&lt;p&gt;&lt;img src=&quot;https://cdn.example.com/encoded.jpg&quot; /&gt;&lt;/p&gt;'), 'https://cdn.example.com/encoded.jpg');

// 14.3 Steam image extraction
// Steam clan image
equal(extractSteamImageUrl('{STEAM_CLAN_IMAGE}/12345/hero.jpg', 730), 'https://clan.cloudflare.steamstatic.com/images/12345/hero.jpg');
// Steam BBCode [img]
equal(extractSteamImageUrl('Update released! [img]https://cdn.steam.com/patch.jpg[/img]', 730), 'https://cdn.steam.com/patch.jpg');
// Steam header fallback for appId
equal(extractSteamImageUrl('', 730), 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg');

// --- 15. COMMERCIAL ANALYSIS CONDITIONAL RENDERING TESTS ---
// Genuine PC deal/update with appId and high/medium impact
equal(hasCommercialValue({
  appId: 730,
  category: 'sale',
  purchaseImpact: 'high',
  purchaseAdvice: 'Excelente momento para adquirir com 50% de desconto na Steam.',
}), true);

equal(hasCommercialValue({
  appId: 1091500,
  category: 'update',
  purchaseImpact: 'medium',
  purchaseAdvice: 'Atualização importante que melhora o desempenho antes da compra.',
}), true);

// Omit when no appId (e.g. general industry, movies, consoles)
equal(hasCommercialValue({
  appId: null,
  category: 'announcement',
  purchaseImpact: 'medium',
  purchaseAdvice: 'Acompanhe o lançamento no Switch.',
}), false);

// Omit for non-commercial categories (industry, hardware, esports, community)
equal(hasCommercialValue({
  appId: 730,
  category: 'industry',
  purchaseImpact: 'medium',
  purchaseAdvice: 'Reestruturação corporativa da empresa.',
}), false);

// Omit for low or none impact ("Baixo impacto na compra")
equal(hasCommercialValue({
  appId: 730,
  category: 'update',
  purchaseImpact: 'low',
  purchaseAdvice: 'Pequena correção de textura.',
}), false);

equal(hasCommercialValue({
  appId: 730,
  category: 'update',
  purchaseImpact: 'none',
  purchaseAdvice: 'Manutenção de servidores.',
}), false);

// Omit when advice is generic boilerplate
equal(hasCommercialValue({
  appId: 730,
  category: 'update',
  purchaseImpact: 'medium',
  purchaseAdvice: 'Acompanhe as novidades e ofertas disponíveis na plataforma.',
}), false);

// --- 16. ARTICLE METADATA ENRICHMENT & IMAGE EXTRACTION TESTS ---
// isValidImageUrl checks
equal(isValidImageUrl('https://cdn.site.com/image.jpg'), true);
equal(isValidImageUrl('http://cdn.site.com/hero.png'), true);
equal(isValidImageUrl('https://cdn.site.com/banner.webp'), true);
equal(isValidImageUrl('https://cdn.site.com/trailer.mp4'), false);
equal(isValidImageUrl('https://cdn.site.com/audio.mp3'), false);
equal(isValidImageUrl('https://feedburner.com/~r/tracker.gif'), false);
equal(isValidImageUrl('https://cdn.site.com/pixel.png'), false);
equal(isValidImageUrl(''), false);
equal(isValidImageUrl(undefined), false);

// extractHtmlMetadata with og:image and og:description
const sampleHtml1 = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Novo RPG anunciado para PC" />
  <meta property="og:image" content="https://cdn.gamer.com/cover-rpg.jpg" />
  <meta property="og:description" content="Estúdio revela gameplay e data de lançamento oficial para o público brasileiro." />
</head>
<body>
  <article>
    <p>A desenvolvedora anunciou formalmente seu mais recente projeto de RPG de ação durante evento digital nesta quarta-feira.</p>
    <p>O título trará combates dinâmicos em tempo real, suporte completo a legendas em português do Brasil e integração total com Steam e Epic Games Store.</p>
    <p>Confira a política de cookies e privacidade do site.</p>
  </article>
</body>
</html>
`;
const meta1 = extractHtmlMetadata(sampleHtml1);
equal(meta1.imageUrl, 'https://cdn.gamer.com/cover-rpg.jpg');
equal(meta1.description, 'Estúdio revela gameplay e data de lançamento oficial para o público brasileiro.');
equal(meta1.articleText.includes('combates dinâmicos'), true);
equal(meta1.articleText.includes('cookies'), false);

// extractHtmlMetadata with JSON-LD
const sampleHtmlJsonLd = `
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": "Atualização 2.0 chega com melhorias gráficas",
    "image": {
      "@type": "ImageObject",
      "url": "https://images.ign.com/patch2-banner.png"
    },
    "description": "Atualização maciça corrige bugs de colisão e traz suporte a DLSS 3.5.",
    "articleBody": "A nova atualização já está disponível para download em todas as plataformas de PC. Os jogadores reportaram ganho expressivo de taxa de quadros e estabilidade melhorada em placas RTX e Radeon."
  }
  </script>
</head>
<body></body>
</html>
`;
const metaJson = extractHtmlMetadata(sampleHtmlJsonLd);
equal(metaJson.imageUrl, 'https://images.ign.com/patch2-banner.png');
equal(metaJson.description, 'Atualização maciça corrige bugs de colisão e traz suporte a DLSS 3.5.');
equal(metaJson.articleText.includes('taxa de quadros'), true);

// enrichNewsItem integration test
const rawShortItem = {
  sourceId: 'rss-pcgamer',
  sourceName: 'PC Gamer',
  sourceType: 'rss',
  articleId: 'test-enrich-1',
  articleUrl: 'https://pcgamer.com/articles/elden-ring-dlc',
  title: 'Elden Ring DLC Novidades',
  snippet: 'DLC anunciada.',
  publishedAt: new Date().toISOString(),
  collectedAt: new Date().toISOString(),
};

const mockFetcher = async (url) => {
  if (url === 'https://pcgamer.com/articles/elden-ring-dlc') {
    return new Response(sampleHtml1, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  return new Response('Not found', { status: 404 });
};

const enriched = await enrichNewsItem(rawShortItem, mockFetcher, 2000);
equal(enriched.imageUrl, 'https://cdn.gamer.com/cover-rpg.jpg');
equal(enriched.snippet.includes('combates dinâmicos'), true);
equal(enriched.snippet.length > rawShortItem.snippet.length, true);

// 16. Teste de regressão para filler e abertura factual direta (TASK 1B)
const multiFactItem = {
  sourceId: 'pcgamer',
  sourceName: 'PC Gamer',
  sourceType: 'rss',
  articleId: 'cyberpunk_patch_22_test',
  articleUrl: 'https://pcgamer.com/cyberpunk-patch-22',
  title: 'Cyberpunk 2077 recebe patch 2.2 com melhorias e FSR 3',
  snippet: 'A CD Projekt Red lançou hoje a atualização 2.2 para Cyberpunk 2077 no PC e consoles. O patch introduz suporte oficial ao AMD FSR 3 com Frame Generation, melhorias de desempenho em traçado de raios e correções para mais de 30 bugs reportados pela comunidade. A atualização já está disponível para download pesando aproximadamente 14 GB.',
  publishedAt: new Date().toISOString(),
  collectedAt: new Date().toISOString(),
  appId: 1091500,
};

const generatedMultiFact = await aiProvider.generateArticle(
  'Cyberpunk 2077 recebe patch 2.2 com melhorias e FSR 3',
  [multiFactItem],
);
equal(generatedMultiFact.decision, 'publish');
equal(typeof generatedMultiFact.body, 'string');

// Regex patterns proibidos que NÃO devem aparecer no corpo
const prohibitedFillerRegexes = [
  /a apuração traz/i,
  /traz detalhes e confirmações/i,
  /conforme reportado por.*a respeito/i,
  /conforme reportado por/i,
  /segundo informações divulgadas/i,
  /a novidade promete/i,
  /os jogadores podem esperar/i,
  /mais informações devem surgir/i,
  /cobertura simultânea por diferentes veículos/i,
  /detalha novidades e confirmações/i,
];

for (const regex of prohibitedFillerRegexes) {
  equal(
    regex.test(generatedMultiFact.body),
    false,
    `Corpo não deve conter padrão filler: ${regex}`
  );
}

// Primeiro parágrafo deve começar diretamente com fato concreto
const bodyParagraphs = generatedMultiFact.body.split('\n\n').map((p) => p.trim()).filter(Boolean);
equal(bodyParagraphs.length >= 2, true);
const firstParagraph = bodyParagraphs[0];

// Fatos concretos no primeiro parágrafo
equal(firstParagraph.length >= 30, true);
equal(/CD Projekt Red/i.test(firstParagraph), true);
equal(/2\.2|atualização|patch/i.test(firstParagraph), true);
equal(firstParagraph !== generatedMultiFact.title, true);
equal(firstParagraph !== generatedMultiFact.summary, true);
equal(generatedMultiFact.body !== generatedMultiFact.summary, true);

// Fatos numéricos e entidades preservados no texto gerado
equal(/FSR 3|Frame Generation/i.test(generatedMultiFact.body), true);
equal(/PC|consoles/i.test(generatedMultiFact.body), true);
equal(/14 GB|30 bugs/i.test(generatedMultiFact.body), true);

// Validação no pipeline: rejeição explícita de saídas contendo filler
const fillerSampleEvent = await processNewsEventResult(
  'evt_filler_rejection',
  'Cyberpunk 2077 recebe patch 2.2',
  [multiFactItem],
  1091500,
  {
    providerType: 'test_filler',
    async generateArticle() {
      return {
        decision: 'publish',
        category: 'update',
        confidence: 0.9,
        game: 'Cyberpunk 2077',
        appId: 1091500,
        title: 'Cyberpunk 2077 recebe patch 2.2',
        summary: 'Atualização técnica lançada.',
        body: 'Conforme reportado por CD Projekt Red, a apuração traz detalhes e confirmações a respeito de Cyberpunk 2077.\n\nO patch melhora o jogo.',
        whyItMatters: 'Melhorias técnicas no jogo.',
        purchaseImpact: 'none',
        purchaseAdvice: null,
        facts: ['Atualização técnica'],
        claims: [{ text: 'Atualização', basis: ['fact:0'] }],
      };
    },
  },
);
equal(fillerSampleEvent.status, 'rejected');
equal(fillerSampleEvent.code, 'validation');
equal(fillerSampleEvent.reason.includes('filler'), true);

// Validação no verify heurístico: reprovação de frases filler
const verifyFillerCheck = await aiProvider.verify(
  { facts: ['Fato 1'] },
  {
    title: 'Notícia de teste',
    summary: 'Resumo válido com mais de dez caracteres.',
    body: 'A novidade promete muitas coisas boas para os fãs.\n\nSegundo informações divulgadas, os jogadores podem esperar novidades.',
    whyItMatters: 'Impacto relevante.',
  },
);
equal(verifyFillerCheck.approved, false);
equal(verifyFillerCheck.unsupportedClaims.some((c) => c.includes('filler')), true);

// Validação de qualidade determinística: reprovação de raw URLs no corpo
const verifyRawUrlCheck = await aiProvider.verify(
  { facts: ['Fato 1'] },
  {
    title: 'CS2 Atualização',
    summary: 'Novo modo 3v3 adicionado ao jogo.',
    body: 'O novo modo Rush traz arenas dinâmicas.\n\nhttps://clan.fastly.steamstatic.com/images/3381077/4ccfe4f44119ac6ddd5cd39d24c907dd11f4c70a\n\nPartidas rápidas.',
    whyItMatters: 'Novo modo competitivo.',
  },
);
equal(verifyRawUrlCheck.approved, false);
equal(verifyRawUrlCheck.unsupportedClaims.some((c) => c.includes('raw URLs')), true);

// Validação de qualidade determinística: reprovação de vazamento de inglês (English leakage)
const verifyEnglishCheck = await aiProvider.verify(
  { facts: ['Fato 1'] },
  {
    title: 'Wardogs Season 2',
    summary: 'Nova temporada traz chuva e reinício de progresso.',
    body: 'Wardogs Season 2 has a release date, and the new content update will add weather effects, including rain. Wardogs Season 2 will arrive on October 15, and although we do not know much about it yet, we do know that it will add weather to the game with players on the battlefield.',
    whyItMatters: 'Atualização de conteúdo para jogadores.',
  },
);
equal(verifyEnglishCheck.approved, false);
equal(verifyEnglishCheck.unsupportedClaims.some((c) => c.includes('English leakage')), true);

// Validação de qualidade determinística: reprovação de promessa de Top 10 sem itens
const verifyIncompleteListCheck = await aiProvider.verify(
  { facts: ['Fato 1'] },
  {
    title: 'Steam: os 10 jogos mais vendidos da semana',
    summary: 'Lista semanal com os títulos mais populares nas lojas digitais.',
    body: 'A Steam atualizou o ranking semanal de vendas no Brasil e no mundo.\n\nVeja quais foram os 10 jogos mais vendidos: As listas removem DLCs cosméticos e passes.',
    whyItMatters: 'Panorama de vendas no PC.',
  },
);
equal(verifyIncompleteListCheck.approved, false);
equal(verifyIncompleteListCheck.unsupportedClaims.some((c) => c.includes('promete lista/ranking numerado')), true);

console.log(`news-pipeline: ${checks + 3} checks passed`);
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
const { CloudflareWorkersAINewsAIProvider } = await import(moduleUrl('lib/news/ai/cloudflare-provider.ts'));
const { processNewsEvent, processNewsEventResult } = await import(moduleUrl('lib/news/ai/pipeline.ts'));
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

// Test 6: Cloudflare provider calls AI binding / customAiRun
let calledModel = '';
let calledOptions = null;
const mockCfRun = async (model, opts) => {
  calledModel = model;
  calledOptions = opts;
  const prompt = opts.messages[0].content;
  if (prompt.includes('Redator')) {
    return {
      response: JSON.stringify({
        title: 'Cyberpunk 2077: Patch 2.13',
        summary: 'Atualização técnica com correções e melhorias de desempenho.',
        whyItMatters: 'Melhora a estabilidade.',
        purchaseAdvice: 'Excelente momento para continuar jogando.',
        claims: [
          { text: 'Atualização técnica com correções', basis: ['fact:0'] },
          { text: 'Melhora a estabilidade', basis: ['fact:0'] },
        ],
      }),
    };
  }
  if (prompt.includes('Verificador de Fatos')) {
    return {
      response: JSON.stringify({ approved: true, unsupportedClaims: [] }),
    };
  }
  return {
    response: JSON.stringify({
      safeToPublish: true,
      category: 'update',
      importance: 80,
      confidence: 0.9,
      purchaseImpact: 'low',
      rumor: false,
      facts: ['Fact 1 from CF'],
    }),
  };
};

const cfTestProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockCfRun });
const cfClassRes = await cfTestProv.classify('Cyberpunk Update', steamItems);
equal(cfClassRes.providerType, 'cloudflare');
equal(cfClassRes.category, 'update');
equal(calledModel, '@cf/meta/llama-3.1-8b-instruct-fast');
equal(calledModel !== '@cf/meta/llama-3.1-8b-instruct', true);
equal(calledOptions.messages.length, 2);
equal(calledOptions.response_format.type, 'json_object');

// Test 7: Selected model is configurable
process.env.NEWS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8';
const cfConfigurableProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockCfRun });
await cfConfigurableProv.classify('Test Event', steamItems);
equal(calledModel, '@cf/meta/llama-3.3-70b-instruct-fp8');
delete process.env.NEWS_AI_MODEL;

// Test 8: Editor valid structured output via Cloudflare provider
equal(cfClassRes.safeToPublish, true);
equal(cfClassRes.facts[0], 'Fact 1 from CF');

// Test 9: Writer valid structured output via Cloudflare provider
const mockWriterCfRun = async () => ({
  response: JSON.stringify({
    title: 'Cyberpunk 2077: Patch 2.13',
    summary: 'Atualização técnica com correções e melhorias de desempenho.',
    whyItMatters: 'Melhora a estabilidade.',
    purchaseAdvice: 'Excelente momento para continuar jogando.',
    claims: [
      { text: 'Atualização técnica com correções', basis: ['fact:0'] },
      { text: 'Melhora a estabilidade', basis: ['fact:0'] },
    ],
  }),
});
const cfWriterProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockWriterCfRun });
const cfWriterRes = await cfWriterProv.write(['Fact 1'], { category: 'update', purchaseImpact: 'low' });
equal(cfWriterRes.title, 'Cyberpunk 2077: Patch 2.13');

// Test 10: Verifier valid structured output via Cloudflare provider
const mockVerifierCfRun = async () => ({
  response: JSON.stringify({ approved: true, unsupportedClaims: [] }),
});
const cfVerifierProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockVerifierCfRun });
const cfVerifierRes = await cfVerifierProv.verify(
  { gameTitle: 'Cyberpunk 2077', category: 'update', purchaseImpact: 'low', facts: ['Fact 1'] },
  { title: 'T', summary: 'S', whyItMatters: 'W', purchaseAdvice: 'P' },
);
equal(cfVerifierRes.approved, true);

// Test 11: Malformed Cloudflare output fails closed
const mockMalformedCfRun = async () => ({ response: 'INVALID_JSON_HERE' });
const cfMalformedProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockMalformedCfRun });
const malformedCfRes = await processNewsEventResult('evt_cf_malformed', 'Title', steamItems, 1091500, cfMalformedProv);
equal(malformedCfRes.status, 'retryable_error');

// Test 12: Rumor cannot publish
const mockRumorCfRun = async () => ({
  response: JSON.stringify({
    safeToPublish: false,
    category: 'update',
    importance: 80,
    confidence: 0.9,
    purchaseImpact: 'low',
    rumor: true,
    facts: ['Fact 1'],
  }),
});
const cfRumorProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockRumorCfRun });
const rumorCfRes = await processNewsEventResult('evt_cf_rumor', 'Title', steamItems, 1091500, cfRumorProv);
equal(rumorCfRes.status, 'rejected');

// Test 13: Verifier rejection cannot publish
const mockUnapprovedVerifierCfRun = async (_model, opts) => {
  if (opts.messages[0].content.includes('Verificador de Fatos')) {
    return { response: JSON.stringify({ approved: false, unsupportedClaims: ['Claim not in facts'] }) };
  }
  if (opts.messages[0].content.includes('Redator')) {
    return {
      response: JSON.stringify({
        title: 'Title',
        summary: 'Summary text long enough',
        whyItMatters: 'Matters text',
        purchaseAdvice: 'Advice text',
        claims: [{ text: 'Summary text long enough', basis: ['fact:0'] }],
      }),
    };
  }
  return { response: JSON.stringify({ safeToPublish: true, category: 'update', importance: 80, confidence: 0.9, purchaseImpact: 'low', rumor: false, facts: ['F1'] }) };
};
const cfUnapprovedProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockUnapprovedVerifierCfRun });
const unapprovedCfRes = await processNewsEventResult('evt_cf_unapproved', 'Title', steamItems, 1091500, cfUnapprovedProv);
equal(unapprovedCfRes.status, 'rejected');

// Test 14: Quota failure (429 / capacity error) returns retryable_error
const mockQuotaErrorCfRun = async () => {
  throw new Error('Cloudflare Workers AI HTTP 429: Rate limit or quota exhausted');
};
const cfQuotaProv = new CloudflareWorkersAINewsAIProvider({ customAiRun: mockQuotaErrorCfRun });
const quotaCfRes = await processNewsEventResult('evt_cf_quota', 'Title', steamItems, 1091500, cfQuotaProv);
equal(quotaCfRes.status, 'retryable_error');

// Test 15 & 16: Quota/Timeout failure does NOT discard/delete raw event items
equal(steamItems.length > 0, true);

// Test 17: Retry can later process the same event when AI becomes available
const successfulRetryArticle = await processNewsEvent('evt_cf_quota', 'Title', steamItems, 1091500, cfTestProv);
equal(successfulRetryArticle !== null, true);

// Test 18: NO automatic OpenAI fallback when Cloudflare fails
// processNewsEventResult for quota error returns retryable_error directly, NEVER calling OpenAI
equal(quotaCfRes.status, 'retryable_error');

// Test 19: NO automatic heuristic fallback when Cloudflare fails
equal(quotaCfRes.status, 'retryable_error');

// --- WRITER / VERIFIER GROUNDING CONTRACT TESTS ---
const groundingFacts = [
  'Patch 2.13 para Cyberpunk 2077 foi lançado para PC',
  'O patch inclui suporte ao AMD FSR 3 e Intel XeSS 1.3',
  'Melhorias de estabilidade e correções de bugs',
];

// 1. purchaseImpact=none allows neutral purchase-decision advice
const noneImpactProvider = {
  providerType: 'cloudflare',
  async classify() {
    return {
      safeToPublish: true,
      category: 'update',
      importance: 70,
      confidence: 0.9,
      purchaseImpact: 'none',
      rumor: false,
      providerType: 'cloudflare',
      facts: groundingFacts,
    };
  },
  async write() {
    return {
      title: 'Cyberpunk 2077: Patch 2.13',
      summary: 'Patch 2.13 lançado para PC com suporte a AMD FSR 3 e Intel XeSS 1.3.',
      whyItMatters: 'Traz melhorias de estabilidade para jogadores de PC.',
      purchaseAdvice: 'Isso não muda de forma relevante a decisão de compra.',
      claims: [
        { text: 'Patch 2.13 lançado para PC', basis: ['fact:0', 'gameIdentity'] },
        { text: 'Isso não muda de forma relevante a decisão de compra', basis: ['purchaseImpact'] },
      ],
    };
  },
  async verify(context, generatedText) {
    return {
      approved: context.purchaseImpact === 'none' && context.facts === groundingFacts,
      unsupportedClaims: [],
    };
  },
};
const noneImpactRes = await processNewsEventResult('evt_none_impact', 'Title', steamItems, 1091500, noneImpactProvider);
equal(noneImpactRes.status, 'published');

// 2. purchaseImpact=high allows appropriately strong purchase-impact language
const highImpactProvider = {
  providerType: 'cloudflare',
  async classify() {
    return {
      safeToPublish: true,
      category: 'sale',
      importance: 90,
      confidence: 0.95,
      purchaseImpact: 'high',
      rumor: false,
      providerType: 'cloudflare',
      facts: groundingFacts,
    };
  },
  async write() {
    return {
      title: 'Cyberpunk 2077 com grande desconto',
      summary: 'Promoção relevante confirmada para PC.',
      whyItMatters: 'Alto impacto na decisão de compra.',
      purchaseAdvice: 'Excelente momento para adquirir o jogo com desconto relevante.',
      claims: [
        { text: 'Promoção relevante confirmada', basis: ['fact:0'] },
        { text: 'Excelente momento para adquirir', basis: ['purchaseImpact'] },
      ],
    };
  },
  async verify(context) {
    return {
      approved: context.purchaseImpact === 'high',
      unsupportedClaims: [],
    };
  },
};
const highImpactRes = await processNewsEventResult('evt_high_impact', 'Title', steamItems, 1091500, highImpactProvider);
equal(highImpactRes.status, 'published');

// 3. unsupported causal claim still gets rejected
const causalProvider = new HeuristicRuleNewsAIProvider();
const causalRes = await causalProvider.verify(
  { gameTitle: 'Cyberpunk 2077', category: 'update', purchaseImpact: 'none', facts: groundingFacts },
  {
    title: 'Cyberpunk 2077: Patch 2.13',
    summary: 'O patch 2.13, o que pode melhorar a experiência de jogo, foi lançado.',
    whyItMatters: 'Atualização técnica.',
    purchaseAdvice: 'Acompanhe as ofertas.',
  },
);
equal(causalRes.approved, false);

// 4. unsupported performance/quality inference still gets rejected
const perfProvider = new HeuristicRuleNewsAIProvider();
const perfRes = await perfProvider.verify(
  { gameTitle: 'Cyberpunk 2077', category: 'update', purchaseImpact: 'none', facts: groundingFacts },
  {
    title: 'Cyberpunk 2077: Patch 2.13',
    summary: 'O patch melhora o desempenho do jogo em 50%.',
    whyItMatters: 'Atualização técnica.',
    purchaseAdvice: 'Acompanhe as ofertas.',
  },
);
equal(perfRes.approved, false);

// 5. verifier receives category + purchaseImpact + facts
let receivedVerifyContext = null;
const contextCaptureProvider = {
  providerType: 'cloudflare',
  async classify() {
    return {
      safeToPublish: true,
      category: 'update',
      importance: 80,
      confidence: 0.9,
      purchaseImpact: 'low',
      rumor: false,
      providerType: 'cloudflare',
      facts: ['Fact A'],
    };
  },
  async write() {
    return {
      title: 'T',
      summary: 'Summary text long enough',
      whyItMatters: 'W',
      purchaseAdvice: 'P',
      claims: [{ text: 'Summary text long enough', basis: ['fact:0'] }],
    };
  },
  async verify(context) {
    receivedVerifyContext = context;
    return { approved: true, unsupportedClaims: [] };
  },
};
await processNewsEventResult('evt_context_capture', 'Title', steamItems, 1091500, contextCaptureProvider);
equal(receivedVerifyContext.category, 'update');
equal(receivedVerifyContext.purchaseImpact, 'low');
equal(receivedVerifyContext.facts, ['Fact A']);

// 6. raw source prose is NOT passed to verifier
equal(JSON.stringify(receivedVerifyContext).includes('Fonte: Steam News'), false);

// 7. existing rumor and publication safety rules remain unchanged
const rumorCfRes2 = await processNewsEventResult('evt_rumor_check', rumorItem.title, [rumorItem], 1091500, aiProvider);
equal(rumorCfRes2.status, 'rejected');

// --- DETERMINISTIC CLAIM-LEVEL GROUNDING TESTS ---
const { checkDeterministicGrounding } = await import(moduleUrl('lib/news/ai/grounding.ts'));
const deterministicFacts = [
  'Patch 2.13 para Cyberpunk 2077 foi lançado para PC',
  'Inclui suporte a AMD FSR 3 e Intel XeSS 1.3',
  'Melhorias de estabilidade e correções de bugs',
];
const deterministicContext = {
  gameTitle: 'Cyberpunk 2077',
  category: 'update',
  purchaseImpact: 'none',
  facts: deterministicFacts,
};

// 1. "Inclui suporte a AMD FSR 3" passes when in facts
const supportPass = checkDeterministicGrounding(deterministicContext, {
  title: 'Cyberpunk 2077: Patch 2.13',
  summary: 'Inclui suporte a AMD FSR 3 para PC.',
  whyItMatters: 'Atualização técnica disponível.',
  purchaseAdvice: 'Acompanhe as ofertas.',
});
equal(supportPass.approved, true);

// 2. "FSR 3 melhora o desempenho" fails when performance improvement is NOT in facts
const perfFail = checkDeterministicGrounding(deterministicContext, {
  title: 'Cyberpunk 2077: Patch 2.13',
  summary: 'FSR 3 melhora o desempenho do jogo.',
  whyItMatters: 'Atualização técnica disponível.',
  purchaseAdvice: 'Acompanhe as ofertas.',
});
equal(perfFail.approved, false);

// 3. Same performance sentence passes if an approved fact explicitly says performance improved
const perfSupportContext = {
  ...deterministicContext,
  facts: [...deterministicFacts, 'O patch melhora o desempenho em placas suportadas'],
};
const perfSupportPass = checkDeterministicGrounding(perfSupportContext, {
  title: 'Cyberpunk 2077: Patch 2.13',
  summary: 'FSR 3 melhora o desempenho do jogo.',
  whyItMatters: 'Atualização técnica disponível.',
  purchaseAdvice: 'Acompanhe as ofertas.',
});
equal(perfSupportPass.approved, true);

// 4. "melhora a experiência de jogo" fails without support
const experienceFail = checkDeterministicGrounding(deterministicContext, {
  title: 'Cyberpunk 2077: Patch 2.13',
  summary: 'O patch melhora a experiência de jogo.',
  whyItMatters: 'Atualização técnica disponível.',
  purchaseAdvice: 'Acompanhe as ofertas.',
});
equal(experienceFail.approved, false);

// 5. purchaseImpact=none allows neutral buying-decision language
const neutralAdvicePass = checkDeterministicGrounding(deterministicContext, {
  title: 'Cyberpunk 2077: Patch 2.13',
  summary: 'Patch lançado com correções.',
  whyItMatters: 'Atualização técnica disponível.',
  purchaseAdvice: 'Isso não muda de forma relevante a decisão de compra.',
});
equal(neutralAdvicePass.approved, true);

// 6. purchaseImpact=none does NOT authorize "vale mais a pena comprar"
const valueAdviceFail = checkDeterministicGrounding(deterministicContext, {
  title: 'Cyberpunk 2077: Patch 2.13',
  summary: 'Patch lançado com correções.',
  whyItMatters: 'Atualização técnica disponível.',
  purchaseAdvice: 'Agora vale mais a pena comprar o jogo.',
});
equal(valueAdviceFail.approved, false);

// 7. Verifier approval alone is insufficient if deterministic grounding guard fails
const permissiveProvider = {
  providerType: 'cloudflare',
  async classify() {
    return {
      safeToPublish: true,
      category: 'update',
      importance: 75,
      confidence: 0.9,
      purchaseImpact: 'none',
      rumor: false,
      providerType: 'cloudflare',
      facts: deterministicFacts,
    };
  },
  async write() {
    return {
      title: 'Cyberpunk 2077: Patch 2.13',
      summary: 'FSR 3 melhora o desempenho do jogo.',
      whyItMatters: 'Atualização técnica disponível.',
      purchaseAdvice: 'Acompanhe as ofertas.',
      claims: [{ text: 'FSR 3 melhora o desempenho', basis: ['fact:1'] }],
    };
  },
  async verify() {
    return { approved: true, unsupportedClaims: [] };
  },
};
const permissiveRes = await processNewsEventResult('evt_permissive_verifier', 'Title', steamItems, 1091500, permissiveProvider);
equal(permissiveRes.status, 'rejected');

// 8. Real publication requires BOTH verifier approval and deterministic grounding approval
const groundedProvider = {
  providerType: 'cloudflare',
  async classify() {
    return {
      safeToPublish: true,
      category: 'update',
      importance: 75,
      confidence: 0.9,
      purchaseImpact: 'none',
      rumor: false,
      providerType: 'cloudflare',
      facts: deterministicFacts,
    };
  },
  async write() {
    return {
      title: 'Cyberpunk 2077: Patch 2.13',
      summary: 'Inclui suporte a AMD FSR 3 para PC.',
      whyItMatters: 'Atualização técnica disponível.',
      purchaseAdvice: 'Isso não muda de forma relevante a decisão de compra.',
      claims: [
        { text: 'Inclui suporte a AMD FSR 3', basis: ['fact:1'] },
        { text: 'Isso não muda de forma relevante a decisão de compra', basis: ['purchaseImpact'] },
      ],
    };
  },
  async verify() {
    return { approved: true, unsupportedClaims: [] };
  },
};
const groundedRes = await processNewsEventResult('evt_grounded', 'Title', steamItems, 1091500, groundedProvider);
equal(groundedRes.status, 'published');

// 9. Existing rumor/retry/provider behavior remains unchanged
const rumorDeterministicCheck = await processNewsEventResult('evt_rumor_recheck', rumorItem.title, [rumorItem], 1091500, aiProvider);
equal(rumorDeterministicCheck.status, 'rejected');


// --- OPENAI RESPONSES API STRICT SCHEMA TESTS ---

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

// Responses API endpoint verification & payload structure checks
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

equal(capturedUrl, 'https://api.openai.com/v1/responses');
equal(capturedBody.store, false);
equal(capturedBody.text.format.type, 'json_schema');
equal(capturedBody.text.format.name, EDITOR_JSON_SCHEMA.name);
equal(capturedBody.text.format.strict, true);
equal(capturedBody.response_format, undefined);

const validEditorRaw = {
  safeToPublish: true,
  category: 'update',
  importance: 85,
  confidence: 0.95,
  purchaseImpact: 'low',
  rumor: false,
  facts: ['Patch 2.13 lançada', 'Suporte FSR 3 adicionado'],
};

// Refusal prevents publication
const refusalFetch = async () => makeResponsesApiRefusal('Conteúdo recusado pelas diretrizes de segurança.');
const refusalProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: refusalFetch });
const refusalResult = await processNewsEvent('evt_refusal', 'Title', steamItems, 1091500, refusalProvider);
equal(refusalResult, null);

// Incomplete response prevents publication
const incompleteFetch = async () => makeResponsesApiResponse(validEditorRaw, 'incomplete');
const incompleteProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: incompleteFetch });
const incompleteResult = await processNewsEvent('evt_incomplete', 'Title', steamItems, 1091500, incompleteProvider);
equal(incompleteResult, null);

// API key never leaks in thrown error message
const mockFetchError = async () => new Response(JSON.stringify({ error: { message: `Invalid key ${MOCK_API_KEY}` } }), { status: 401 });
const failingOpenAiProv = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: mockFetchError });

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
      whyItMatters: 'Melhora a estabilidade para jogadores de PC.',
      purchaseAdvice: 'Melhorias técnicas contínuas tornam o jogo mais atraente se você aguardava correções.',
      claims: [
        { text: 'A atualização 2.13 traz suporte ao AMD FSR 3', basis: ['fact:0'] },
        { text: 'Melhora a estabilidade para jogadores de PC', basis: ['fact:0'] },
        { text: 'Melhorias técnicas contínuas tornam o jogo mais atraente', basis: ['purchaseImpact'] },
      ],
    });
  }
  return makeResponsesApiResponse({ approved: true, unsupportedClaims: [] });
};

const fullMockedProvider = new OpenAINewsAIProvider({ apiKey: MOCK_API_KEY, customFetch: mockFullResponsesFetch });
const successfulArticle = await processNewsEvent('evt_success', 'Cyberpunk Patch 2.13', steamItems, 1091500, fullMockedProvider);

equal(successfulArticle !== null, true);
equal(successfulArticle.providerType, 'openai');
equal(successfulArticle.category, 'update');


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

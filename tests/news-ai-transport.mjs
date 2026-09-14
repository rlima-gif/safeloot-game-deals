import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';

// Mock the Workers module at the import boundary, not the transport selection.
const url = moduleUrl('lib/news/ai/cloudflare-provider.ts');
const source = Buffer.from(url.split(',')[1], 'base64').toString('utf8');
assert.ok(source.includes("await import('cloudflare:workers')"));
const mockedSource = source.replace("await import('cloudflare:workers')", '({ env: globalThis.__transportTestEnv })');
const { CloudflareWorkersAINewsAIProvider: Provider } = await import(
  'data:text/javascript;base64,' + Buffer.from(mockedSource).toString('base64')
);
const { processNewsEventResult } = await import(moduleUrl('lib/news/ai/pipeline.ts'));
const { getNewsAIProvider } = await import(moduleUrl('lib/news/ai/provider.ts'));
const keys = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'NEWS_AI_MODEL', 'NEWS_AI_PROVIDER', 'OPENAI_API_KEY'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const token = 'mock-private-cloudflare-token';
const items = [{ id: 'raw', sourceId: 'steam', sourceName: 'Steam', articleId: '1', articleUrl: 'https://example.com', title: 'Patch lançado', snippet: 'Patch lançado.', publishedAt: '2026-09-13T00:00:00Z', collectedAt: '2026-09-13T00:00:00Z' }];
const editor = { safeToPublish: true, category: 'update', importance: 80, confidence: 0.9, purchaseImpact: 'none', rumor: false, facts: ['Patch lançado.'] };
const writer = { title: 'Patch lançado.', summary: 'Patch lançado.', whyItMatters: 'Patch lançado.', purchaseAdvice: 'Acompanhe as ofertas disponíveis.', claims: [{ text: 'Patch lançado.', basis: ['fact:0'] }, { text: 'Acompanhe as ofertas disponíveis.', basis: ['purchaseImpact'] }] };
const verifier = { approved: true, unsupportedClaims: [] };
const response = result => Response.json({ success: true, result: { response: JSON.stringify(result) } });
const run = provider => processNewsEventResult('event', 'Patch lançado', items, undefined, provider);
let calls = [];
try {
  for (const key of keys) delete process.env[key];
  process.env.CLOUDFLARE_ACCOUNT_ID = 'mock-account';
  process.env.CLOUDFLARE_API_TOKEN = token;
  process.env.OPENAI_API_KEY = 'mock-openai-must-not-be-used';
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(editor);
  };
  let nativeCalls = 0;
  globalThis.__transportTestEnv = { AI: { async run() { nativeCalls++; return { response: JSON.stringify(editor) }; } } };
  await new Provider().classify('Patch', items);
  assert.equal(nativeCalls, 1);
  assert.equal(calls.length, 0);
  // Native provider failures must not fall through to another transport/provider.
  globalThis.__transportTestEnv.AI.run = async () => { throw new Error('native quota'); };
  assert.equal((await run(new Provider())).status, 'retryable_error');
  assert.equal(calls.length, 0);

  globalThis.__transportTestEnv = {};
  assert.equal((await new Provider().classify('Patch', items)).category, 'update');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/mock-account/ai/run/@cf/meta/llama-3.1-8b-instruct-fast');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(!calls[0].options.body.includes(token));
  process.env.NEWS_AI_MODEL = '@cf/meta/custom-model';
  await new Provider().classify('Patch', items);
  assert.ok(calls.at(-1).url.endsWith('/ai/run/@cf/meta/custom-model'));
  delete process.env.NEWS_AI_MODEL;

  for (const missing of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'both']) {
    const count = calls.length;
    if (missing !== 'CLOUDFLARE_API_TOKEN') delete process.env.CLOUDFLARE_ACCOUNT_ID;
    if (missing !== 'CLOUDFLARE_ACCOUNT_ID') delete process.env.CLOUDFLARE_API_TOKEN;
    const result = await run(new Provider());
    assert.equal(result.status, 'retryable_error');
    assert.match(result.error, /configure/);
    assert.equal(calls.length, count);
    process.env.CLOUDFLARE_ACCOUNT_ID = 'mock-account';
    process.env.CLOUDFLARE_API_TOKEN = token;
  }
  for (const status of [401, 429, 500]) {
    globalThis.fetch = async () => new Response(token, { status });
    const result = await run(new Provider());
    assert.equal(result.status, 'retryable_error');
    assert.match(result.error, new RegExp(`HTTP ${status}`));
    assert.ok(!JSON.stringify(result).includes(token));
    assert.ok(!('article' in result));
  }
  globalThis.fetch = async () => { throw new Error(`Authorization: Bearer ${token}`); };
  assert.ok(!(await run(new Provider())).error.includes(token));
  globalThis.fetch = async () => Response.json({ success: false, errors: [{ message: token }] });
  assert.ok(!(await run(new Provider())).error.includes(token));
  let aborted = false;
  globalThis.fetch = async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
  const timeout = await run(new Provider({ timeoutMs: 10 }));
  assert.equal(timeout.status, 'retryable_error');
  assert.match(timeout.error, /Timeout/);
  assert.equal(aborted, true);

  const stages = [editor, writer, verifier];
  let stage = 0;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://api.cloudflare.com/'));
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return response(stages[stage++]);
  };
  const success = await run(new Provider());
  assert.equal(success.status, 'published');
  assert.equal(success.article.providerType, 'cloudflare');
  assert.equal(stage, 3);
  assert.equal(getNewsAIProvider().providerType, 'cloudflare');
  // Real default provider with unavailable native binding still fails closed on REST errors.
  globalThis.fetch = async (url) => {
    assert.ok(url.startsWith('https://api.cloudflare.com/'));
    return new Response('', { status: 429 });
  };
  assert.equal((await run(getNewsAIProvider())).status, 'retryable_error');
  console.log('Workers AI transport: all mock checks passed');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__transportTestEnv;
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

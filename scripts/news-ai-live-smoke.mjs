import { execFileSync } from 'node:child_process';
import { moduleUrl } from '../tests/load-ts.mjs';

function npxCmd() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function runWranglerJson(args) {
  try {
    const out = execFileSync(npxCmd(), ['wrangler@latest', ...args, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function extractAccountId(whoamiJson) {
  if (!whoamiJson || typeof whoamiJson !== 'object') return '';
  const candidates = [
    whoamiJson?.account?.id,
    whoamiJson?.result?.account?.id,
    whoamiJson?.account_id,
    whoamiJson?.result?.account_id,
    whoamiJson?.accountId,
    whoamiJson?.result?.accountId,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  const lists = [whoamiJson?.accounts, whoamiJson?.result?.accounts, whoamiJson?.result];
  for (const list of lists) {
    if (Array.isArray(list) && list.length > 0 && typeof list[0]?.id === 'string') {
      return list[0].id;
    }
  }
  return '';
}

function extractToken(tokenJson, rawOut) {
  if (tokenJson && typeof tokenJson === 'object') {
    const candidates = [
      tokenJson?.token,
      tokenJson?.result?.token,
      tokenJson?.result,
      tokenJson?.authToken,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
  }
  if (typeof rawOut === 'string' && rawOut.trim() && !rawOut.trim().startsWith('{')) {
    return rawOut.trim();
  }
  return '';
}

async function createRemoteRunner() {
  const whoamiJson = runWranglerJson(['whoami']);
  let accountId = extractAccountId(whoamiJson);

  let token = '';
  try {
    const out = execFileSync(npxCmd(), ['wrangler@latest', 'auth', 'token', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let parsed = null;
    try {
      parsed = JSON.parse(out);
    } catch {
      parsed = null;
    }
    token = extractToken(parsed, out);
  } catch {
    token = '';
  }

  if (!token && process.env.CLOUDFLARE_API_TOKEN) {
    token = process.env.CLOUDFLARE_API_TOKEN.trim();
  }

  if (!token) {
    console.log('Wrangler authentication missing. Run:');
    console.log('npx wrangler@latest login --device --browser=false');
    process.exit(1);
  }

  if (!accountId) {
    try {
      const accRes = await fetch('https://api.cloudflare.com/client/v4/accounts', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (accRes.ok) {
        const accJson = await accRes.json();
        const list = accJson?.result;
        if (Array.isArray(list) && list.length > 0 && typeof list[0]?.id === 'string') {
          accountId = list[0].id;
        }
      }
    } catch {
      accountId = '';
    }
  }

  if (!accountId) {
    console.log('Wrangler authentication missing. Run:');
    console.log('npx wrangler@latest login --device --browser=false');
    process.exit(1);
  }

  return async (model, inputs) => {
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + model;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: inputs.messages,
        max_tokens: inputs.max_tokens || 1024,
        response_format: inputs.response_format || { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error('Cloudflare AI REST API error HTTP ' + res.status + ': ' + errTxt.slice(0, 500));
    }

    const cfJson = await res.json();
    const result = cfJson?.result;

    if (typeof result === 'string') {
      return { response: result };
    }
    if (result && typeof result === 'object') {
      if (typeof result.response === 'string') {
        return { response: result.response };
      }
      return result;
    }
    if (typeof cfJson?.response === 'string') {
      return { response: cfJson.response };
    }
    return { response: JSON.stringify(result ?? cfJson).slice(0, 8000) };
  };
}

async function runLiveSmokeTest() {
  console.log('==================================================');
  console.log('SafeLoot — 3-Stage Workers AI Live Pipeline Test');
  console.log('==================================================\n');

  const { CloudflareWorkersAINewsAIProvider } = await import(moduleUrl('lib/news/ai/cloudflare-provider.ts'));
  const remoteRun = await createRemoteRunner();
  const provider = new CloudflareWorkersAINewsAIProvider({ customAiRun: remoteRun });

  console.log('[INFRA] Selected Provider: ' + provider.providerType);
  console.log('[INFRA] Target Model: process.env.NEWS_AI_MODEL || \'@cf/meta/llama-3.1-8b-instruct-fast\'');
  console.log('[INFRA] OpenAI Provider: DISABLED / UNUSED');
  console.log('[INFRA] Heuristic Provider: DISABLED / UNUSED');
  console.log('[INFRA] Database (D1): BYPASSED (Output printed to console only)\n');

  const sampleItems = [
    {
      sourceId: 'steam',
      sourceName: 'Steam News',
      sourceType: 'steam',
      articleId: 'steam_1091500_213',
      articleUrl: 'https://store.steampowered.com/news/app/1091500/view/4200000',
      title: 'Cyberpunk 2077 Patch 2.13 Released',
      snippet: 'Patch 2.13 for Cyberpunk 2077 is now live on PC. It includes AMD FSR 3 and Intel XeSS 1.3 support, stability improvements, and bug fixes.',
      publishedAt: new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      appId: 1091500,
    },
    {
      sourceId: 'pcgamer',
      sourceName: 'PC Gamer',
      sourceType: 'rss',
      articleId: 'pcg_cp2077_213',
      articleUrl: 'https://www.pcgamer.com/cyberpunk-2077-patch-213-fsr3',
      title: 'Cyberpunk 2077 Patch 2.13 adds FSR 3 support on PC',
      snippet: 'CD Projekt Red has released patch 2.13 for Cyberpunk 2077, bringing AMD FSR 3 and Intel XeSS 1.3 frame generation to PC players.',
      publishedAt: new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      appId: 1091500,
    },
  ];

  console.log('--- STAGE 1: EDITOR ---');
  let classification;
  try {
    classification = await provider.classify('Cyberpunk 2077 Patch 2.13 Released', sampleItems);
    console.log('safeToPublish: ' + classification.safeToPublish);
    console.log('category:      ' + classification.category);
    console.log('importance:    ' + classification.importance);
    console.log('confidence:    ' + classification.confidence);
    console.log('purchaseImpact:' + classification.purchaseImpact);
    console.log('rumor:         ' + classification.rumor);
    console.log('providerType:  ' + classification.providerType);
    console.log('facts:');
    classification.facts.forEach((f) => console.log('  - ' + f));
  } catch (err) {
    console.log('\n[RETRYABLE INFRASTRUCTURE ERROR]: ' + (err instanceof Error ? err.message : String(err)));
    console.log('\nFINAL: publishable = false (Retryable Error)');
    return;
  }

  if (!classification.safeToPublish || classification.rumor || classification.category === 'other') {
    console.log('\n[SAFETY STOP] Editor rejected event or flagged rumor. Pipeline stopped before Writer.');
    console.log('FINAL: publishable = false');
    return;
  }

  console.log('\n--- STAGE 2: WRITER ---');
  let writerText;
  try {
    writerText = await provider.write(classification.facts, {
      gameTitle: 'Cyberpunk 2077',
      category: classification.category,
      purchaseImpact: classification.purchaseImpact,
    });
    console.log('title:         ' + writerText.title);
    console.log('summary:       ' + writerText.summary);
    console.log('whyItMatters:  ' + writerText.whyItMatters);
    console.log('purchaseAdvice:' + writerText.purchaseAdvice);
  } catch (err) {
    console.log('\n[RETRYABLE INFRASTRUCTURE ERROR]: ' + (err instanceof Error ? err.message : String(err)));
    console.log('\nFINAL: publishable = false (Retryable Error)');
    return;
  }

  console.log('\n--- STAGE 3: VERIFIER ---');
  let verification;
  try {
    verification = await provider.verify(classification.facts, writerText);
    console.log('approved:          ' + verification.approved);
    console.log('unsupportedClaims: ' + (verification.unsupportedClaims.length ? verification.unsupportedClaims.join(', ') : 'none'));
  } catch (err) {
    console.log('\n[RETRYABLE INFRASTRUCTURE ERROR]: ' + (err instanceof Error ? err.message : String(err)));
    console.log('\nFINAL: publishable = false (Retryable Error)');
    return;
  }

  const isPublishable = Boolean(verification.approved && verification.unsupportedClaims.length === 0);

  console.log('\n==================================================');
  console.log('FINAL RESULT: publishable = ' + isPublishable);
  console.log('PROVIDER USED: ' + provider.providerType);
  console.log('==================================================');
}

runLiveSmokeTest();

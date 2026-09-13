import { moduleUrl } from '../tests/load-ts.mjs';

async function runLiveSmokeTest() {
  console.log('==================================================');
  console.log('SafeLoot — 3-Stage Workers AI Live Pipeline Test');
  console.log('==================================================\n');

  const { CloudflareWorkersAINewsAIProvider } = await import(moduleUrl('lib/news/ai/cloudflare-provider.ts'));
  const provider = new CloudflareWorkersAINewsAIProvider();

  console.log(`[INFRA] Selected Provider: ${provider.providerType}`);
  console.log(`[INFRA] Target Model: process.env.NEWS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast'`);
  console.log(`[INFRA] OpenAI Provider: DISABLED / UNUSED`);
  console.log(`[INFRA] Heuristic Provider: DISABLED / UNUSED`);
  console.log(`[INFRA] Database (D1): BYPASSED (Output printed to console only)\n`);

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

  // --- STAGE 1: EDITOR ---
  console.log('--- STAGE 1: EDITOR ---');
  let classification;
  try {
    classification = await provider.classify('Cyberpunk 2077 Patch 2.13 Released', sampleItems);
    console.log(`safeToPublish: ${classification.safeToPublish}`);
    console.log(`category:      ${classification.category}`);
    console.log(`importance:    ${classification.importance}`);
    console.log(`confidence:    ${classification.confidence}`);
    console.log(`purchaseImpact:${classification.purchaseImpact}`);
    console.log(`rumor:         ${classification.rumor}`);
    console.log(`providerType:  ${classification.providerType}`);
    console.log(`facts:`);
    classification.facts.forEach((f) => console.log(`  - ${f}`));
  } catch (err) {
    console.log(`\n[RETRYABLE INFRASTRUCTURE ERROR]: ${err instanceof Error ? err.message : String(err)}`);
    console.log('\nFINAL: publishable = false (Retryable Error)');
    return;
  }

  if (!classification.safeToPublish || classification.rumor || classification.category === 'other') {
    console.log('\n[SAFETY STOP] Editor rejected event or flagged rumor. Pipeline stopped before Writer.');
    console.log('FINAL: publishable = false');
    return;
  }

  // --- STAGE 2: WRITER ---
  console.log('\n--- STAGE 2: WRITER ---');
  let writerText;
  try {
    writerText = await provider.write(classification.facts, {
      gameTitle: 'Cyberpunk 2077',
      category: classification.category,
      purchaseImpact: classification.purchaseImpact,
    });
    console.log(`title:         ${writerText.title}`);
    console.log(`summary:       ${writerText.summary}`);
    console.log(`whyItMatters:  ${writerText.whyItMatters}`);
    console.log(`purchaseAdvice:${writerText.purchaseAdvice}`);
  } catch (err) {
    console.log(`\n[RETRYABLE INFRASTRUCTURE ERROR]: ${err instanceof Error ? err.message : String(err)}`);
    console.log('\nFINAL: publishable = false (Retryable Error)');
    return;
  }

  // --- STAGE 3: VERIFIER ---
  console.log('\n--- STAGE 3: VERIFIER ---');
  let verification;
  try {
    verification = await provider.verify(classification.facts, writerText);
    console.log(`approved:          ${verification.approved}`);
    console.log(`unsupportedClaims: ${verification.unsupportedClaims.length ? verification.unsupportedClaims.join(', ') : 'none'}`);
  } catch (err) {
    console.log(`\n[RETRYABLE INFRASTRUCTURE ERROR]: ${err instanceof Error ? err.message : String(err)}`);
    console.log('\nFINAL: publishable = false (Retryable Error)');
    return;
  }

  const isPublishable = Boolean(verification.approved && verification.unsupportedClaims.length === 0);

  console.log('\n==================================================');
  console.log(`FINAL RESULT: publishable = ${isPublishable}`);
  console.log(`PROVIDER USED: ${provider.providerType}`);
  console.log('==================================================');
}

runLiveSmokeTest();

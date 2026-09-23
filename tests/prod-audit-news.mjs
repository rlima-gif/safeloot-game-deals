// Audit live production news articles
const BASE_URL = 'https://safeloot.safeloot.workers.dev';

async function auditNews() {
  console.log(`Auditing Production News from ${BASE_URL}/api/news...`);
  const res = await fetch(`${BASE_URL}/api/news?limit=10`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const articles = data.articles || [];
  console.log(`Total Articles Retrieved: ${articles.length}`);

  let purchaseImpactNoneCount = 0;
  for (const [idx, a] of articles.entries()) {
    console.log(`\n--- Article #${idx + 1} (ID: ${a.id}) ---`);
    console.log(`Title: "${a.title}"`);
    console.log(`Category: ${a.category} | PurchaseImpact: ${a.purchaseImpact}`);
    console.log(`Summary: "${a.summary}"`);
    console.log(`Source: ${a.sourceName || a.source} (${a.sourceUrl})`);
    console.log(`PublishedAt: ${a.publishedAt}`);
    console.log(`Image URL: ${a.imageUrl || 'None'}`);
    console.log(`Body Length: ${a.body?.length || 0} chars | Paragraphs: ${(a.body || '').split('\n\n').length}`);
    console.log(`Why It Matters: "${a.whyItMatters}"`);
    console.log(`Purchase Advice: "${a.purchaseAdvice || 'null'}"`);
    if (a.purchaseImpact === 'none') purchaseImpactNoneCount++;
  }

  console.log(`\n=== NEWS QUALITY SUMMARY ===`);
  console.log(`Total Articles Audited: ${articles.length}`);
  console.log(`Articles with purchaseImpact === 'none': ${purchaseImpactNoneCount}`);
}

auditNews().catch(console.error);

import { execSync } from 'child_process';

const raw = execSync(
  'npx wrangler d1 execute safeloot --remote --command="SELECT id, app_id, title, summary, body, category, (SELECT json_group_array(json_object(\'name\', source_name, \'url\', article_url)) FROM news_article_sources WHERE article_id = news_articles.id) as sources_json FROM news_articles;" --json',
  { encoding: 'utf8' },
);
const rows = JSON.parse(raw)[0].results || [];

console.log(`Total articles in D1: ${rows.length}`);

for (const r of rows) {
  const body = r.body || '';
  const title = r.title || '';
  const issues = [];

  // 1. Raw URLs
  if (/https?:\/\//i.test(body)) {
    issues.push('CONTAINS_RAW_URL');
  }

  // 2. English / non-PT language
  const englishWords = [
    'the', 'and', 'with', 'this', 'from', 'have', 'been', 'will', 'that',
    'after', 'about', 'without', 'gameplay', 'players', 'battlefield', 'season',
    'release', 'date', 'announced', 'first', 'into', 'which', 'also'
  ];
  const words = body.toLowerCase().split(/\W+/).filter(Boolean);
  const engCount = words.filter(w => englishWords.includes(w)).length;
  if (engCount > 8 && (engCount / words.length > 0.08)) {
    issues.push(`ENGLISH_LEAKAGE (eng_ratio: ${(engCount / words.length).toFixed(2)})`);
  }

  // Russian / Cyrillic
  if (/[\u0400-\u04FF]/.test(body)) {
    issues.push('CYRILLIC_LEAKAGE');
  }

  // 3. Promised ranking missing
  if (/10 jogos|top 10/i.test(title) && !body.includes('10.') && !body.includes('10 -') && !body.includes('10:')) {
    issues.push('PROMISED_TOP10_MISSING');
  }

  // 4. Standalone Chrome
  if (/(copy link|share this article|imagem:|foto:|watch on youtube)/i.test(body)) {
    issues.push('CHROME_LEAKAGE');
  }

  // 5. Speculation / Inventions
  if (/recomendação formal|negociações prolongadas|arcos narrativos previstos anteriormente/i.test(body)) {
    issues.push('UNSUPPORTED_INVENTIONS');
  }

  if (issues.length > 0) {
    console.log(`[FAIL] ${r.id} | ${r.title}`);
    console.log(`       Issues: ${issues.join(', ')}`);
  } else {
    console.log(`[PASS] ${r.id} | ${r.title.slice(0, 50)} (${body.split(/\n\s*\n/).filter(Boolean).length} paras)`);
  }
}

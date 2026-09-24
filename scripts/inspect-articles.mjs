import { execSync } from 'child_process';
import fs from 'fs';

const query = `
SELECT 
  a.id,
  a.event_id,
  a.app_id,
  a.title,
  a.summary,
  a.body,
  length(a.body) as body_len,
  a.category,
  a.purchase_impact,
  a.purchase_advice,
  a.image_url,
  r.id as raw_id,
  r.title as raw_title,
  r.snippet as raw_snippet,
  r.source_id,
  r.article_url
FROM news_articles a
LEFT JOIN news_raw_items r ON r.id = 'raw_' || substr(a.event_id, instr(a.event_id, 'hash_'))
ORDER BY a.published_at DESC;
`;

const res = execSync(`pnpm exec wrangler d1 execute safeloot --remote --command="${query.replace(/\n/g, ' ')}" --json`, {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

const data = JSON.parse(res);
const rows = data[0].results;
fs.writeFileSync('scripts/articles-dump.json', JSON.stringify(rows, null, 2), 'utf8');
console.log(`Saved ${rows.length} articles to scripts/articles-dump.json`);

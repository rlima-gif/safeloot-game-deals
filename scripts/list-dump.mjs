import fs from 'fs';

const rows = JSON.parse(fs.readFileSync('scripts/articles-dump.json', 'utf8'));
rows.forEach((r, i) => {
  const imgStr = r.image_url ? (r.image_url.length > 50 ? r.image_url.slice(0, 45) + '...' : r.image_url) : 'NULL';
  console.log(`${i + 1}. [${r.id}] appId:${r.app_id} cat:${r.category} impact:${r.purchase_impact} bodyLen:${r.body_len} img:${imgStr} title:"${r.title}"`);
});

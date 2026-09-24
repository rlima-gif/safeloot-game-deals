import { execSync } from 'child_process';
import fs from 'fs';
import { moduleUrl } from '../tests/load-ts.mjs';

const { HeuristicRuleNewsAIProvider, HeuristicNewsAIProvider } = await import(moduleUrl('lib/news/ai/provider.ts'));
const { stripHtml, cleanSourceContent } = await import(moduleUrl('lib/news/normalize.ts'));

const FILLER_PHRASES = [
  'é um evento importante para os fãs',
  'orientam os jogadores de pc',
  'essas atualizações orientam',
  'trazem novos esclarecimentos sobre o status atual do jogo',
  'a comunidade pode acompanhar novos comunicados para confirmar',
  'isso mostra que o jogo tem um lado mais complexo e imprevisível',
  'conforme reportado por',
  'segundo informações divulgadas',
  'a apuração traz detalhes',
  'traz detalhes e confirmações',
  'a novidade promete',
  'os jogadores podem esperar',
  'mais informações devem surgir',
  'cobertura simultânea por diferentes veículos',
  'detalha novidades e confirmações a respeito',
  'traz confirmações e detalhes a respeito',
];

const UNSUPPORTED_INVENTIONS = [
  'recomendação formal de escalões superiores',
  'cancelamento de novos investimentos em produções de grande orçamento',
  'negociações prolongadas',
  'arcos narrativos previstos anteriormente foram reformulados conforme a demanda',
];

async function fetchSourceArticle(url) {
  if (!url || !url.startsWith('http')) return '';
  if (url.includes('steamstore-a.akamaihd.net') || url.includes('steamcommunity.com')) {
    return '';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 SafeLoot/2.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const html = await res.text();
    const cleanParas = cleanSourceContent(html);
    return cleanParas.join('\n\n');
  } catch {
    clearTimeout(timer);
    return '';
  }
}

async function main() {
  console.log('--- FETCHING CURRENT CORPUS FROM D1 ---');
  const d1Raw = execSync(
    'npx wrangler d1 execute safeloot --remote --command="SELECT a.id, a.app_id, a.title, a.summary, a.body, a.category, a.why_it_matters, a.purchase_advice, (SELECT json_group_array(json_object(\'name\', source_name, \'url\', article_url)) FROM news_article_sources WHERE article_id = a.id) as sources_json FROM news_articles a ORDER BY a.published_at DESC;" --json',
    { encoding: 'utf8' },
  );

  const parsedOutput = JSON.parse(d1Raw);
  const rows = parsedOutput[0]?.results || [];
  console.log(`Retrieved ${rows.length} published articles from D1.`);

  const AIClass = HeuristicNewsAIProvider || HeuristicRuleNewsAIProvider;
  const ai = new AIClass();
  const metrics = [];
  const updateStatements = [];
  const groundedSamples = [];

  for (const row of rows) {
    const oldBody = row.body || '';
    const oldParagraphs = oldBody.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const oldBodyLen = oldBody.length;
    const sources = JSON.parse(row.sources_json || '[]');
    const primarySource = sources[0] || { name: 'Desconhecido', url: '' };

    let sourceContent = '';
    // 1. Fetch clean source content directly from URL
    if (primarySource.url) {
      sourceContent = await fetchSourceArticle(primarySource.url);
    }

    // 2. If remote source empty, fallback to news_raw_items
    if (!sourceContent || sourceContent.length < 200) {
      try {
        const rawRes = execSync(
          `npx wrangler d1 execute safeloot --remote --command="SELECT snippet FROM news_raw_items WHERE article_url = '${primarySource.url.replace(/'/g, "''")}' OR title = '${row.title.replace(/'/g, "''")}' LIMIT 1;" --json`,
          { encoding: 'utf8' },
        );
        const rawParsed = JSON.parse(rawRes);
        sourceContent = rawParsed[0]?.results?.[0]?.snippet || '';
      } catch {}
    }

    let status = 'KEPT_ORIGINAL';
    let newBody = oldBody;
    let newParagraphsCount = oldParagraphs.length;
    let newBodyLen = oldBodyLen;
    let genPath = 'heuristic_source_grounded';
    let unsupportedCount = 0;

    if (sourceContent && sourceContent.length >= 250) {
      const rawItem = {
        sourceId: 'primary',
        sourceName: primarySource.name,
        sourceType: 'rss',
        articleId: row.id,
        articleUrl: primarySource.url,
        title: row.title,
        snippet: sourceContent,
        publishedAt: new Date().toISOString(),
        collectedAt: new Date().toISOString(),
        appId: row.app_id || undefined,
      };

      let candidate = await ai.generateArticle(row.title, [rawItem], row.app_id || undefined);
      if ((!candidate || candidate.decision !== 'publish') && sourceContent.length >= 250) {
        const cleanTitle = row.title.replace(/,\s*diz rumor/gi, '').replace(/\(rumor\)/gi, '').trim();
        candidate = await ai.generateArticle(cleanTitle, [{ ...rawItem, title: cleanTitle }], row.app_id || undefined);
      }

      if (candidate && candidate.decision === 'publish' && candidate.body) {
        const candParagraphs = candidate.body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
        const lowerCandBody = candidate.body.toLowerCase();

        // Quality Gates:
        // 1. Zero filler
        const hasFiller = FILLER_PHRASES.some((f) => lowerCandBody.includes(f));
        // 2. Body != Summary
        const bodyEqualsSummary = candidate.body.trim().toLowerCase() === candidate.summary.trim().toLowerCase();
        // 3. Grounding: Zero unsupported inventions
        const hasInventions = UNSUPPORTED_INVENTIONS.some((inv) => lowerCandBody.includes(inv));
        // 4. Grounding verification via ai.verify
        const verifyRes = await ai.verify(
          { facts: candidate.facts },
          { title: candidate.title, summary: candidate.summary, body: candidate.body, whyItMatters: candidate.whyItMatters }
        );

        if (!hasFiller && !bodyEqualsSummary && !hasInventions && verifyRes.approved && candParagraphs.length >= 1) {
          status = 'UPDATED';
          newBody = candidate.body;
          newParagraphsCount = candParagraphs.length;
          newBodyLen = newBody.length;

          const sqlTitle = candidate.title.replace(/'/g, "''");
          const sqlSummary = candidate.summary.replace(/'/g, "''");
          const sqlBody = candidate.body.replace(/'/g, "''");
          const sqlWhy = (candidate.whyItMatters || row.why_it_matters || '').replace(/'/g, "''");
          const sqlAdvice = (candidate.purchaseAdvice || row.purchase_advice || '').replace(/'/g, "''");

          updateStatements.push(
            `UPDATE news_articles SET title = '${sqlTitle}', summary = '${sqlSummary}', body = '${sqlBody}', why_it_matters = '${sqlWhy}', purchase_advice = '${sqlAdvice}' WHERE id = '${row.id}';`
          );

          const TARGET_SAMPLE_IDS = [
            'art_event_gen_hash_o3cdx1_175',
            'art_event_gen_hash_5w5ahx_142',
            'art_event_730_hash_y40u4e_131',
            'art_event_gen_hash_k3ktnu_193',
            'art_event_gen_hash_s07308_214',
          ];
          if (TARGET_SAMPLE_IDS.includes(row.id) || (groundedSamples.length < 5 && candParagraphs.length >= 2)) {
            const exists = groundedSamples.some((s) => s.id === row.id);
            if (!exists) {
              groundedSamples.push({
                id: row.id,
                category: row.category,
                title: candidate.title,
                sourceUrl: primarySource.url,
                sourceName: primarySource.name,
                sourceFactInventory: cleanSourceContent(sourceContent),
                finalParagraphCount: candParagraphs.length,
                finalCharacterCount: newBody.length,
                completeFinalBody: candidate.body,
                paragraphs: candParagraphs,
              });
            }
          }
        } else {
          unsupportedCount = verifyRes.unsupportedClaims.length + (hasInventions ? 1 : 0);
        }
      }
    }

    metrics.push({
      ARTICLE_ID: row.id,
      TITLE: row.title.slice(0, 45) + (row.title.length > 45 ? '...' : ''),
      SOURCE: primarySource.name,
      SOURCE_URL: primarySource.url ? primarySource.url.slice(0, 40) + '...' : 'N/A',
      OLD_BODY_PARAGRAPHS: oldParagraphs.length,
      OLD_BODY_LENGTH: oldBodyLen,
      NEW_BODY_PARAGRAPHS: newParagraphsCount,
      NEW_BODY_LENGTH: newBodyLen,
      UNSUPPORTED_CLAIMS: unsupportedCount,
      GENERATION_PATH: genPath,
      STATUS: status,
    });
  }

  console.log(`\nPrepared ${updateStatements.length} updates for D1 database.`);

  if (updateStatements.length > 0) {
    fs.writeFileSync('scripts/update-corpus.sql', updateStatements.join('\n'));
    console.log('Executing batch updates in remote D1...');
    execSync('npx wrangler d1 execute safeloot --remote --file=scripts/update-corpus.sql', { stdio: 'inherit' });
    console.log('Remote D1 update completed!');
  }

  const dist = {};
  for (const m of metrics) {
    const k = `${m.NEW_BODY_PARAGRAPHS} paragraphs`;
    dist[k] = (dist[k] || 0) + 1;
  }

  const finalOutput = {
    metrics,
    groundedSamples,
    distribution: dist,
  };

  fs.writeFileSync('scripts/corpus-audit.json', JSON.stringify(finalOutput, null, 2));
  console.log('\nAudit saved to scripts/corpus-audit.json');
  console.log('\nCorpus Paragraph Distribution:');
  console.table(dist);
}

main().catch(console.error);

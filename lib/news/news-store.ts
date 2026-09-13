import { database, type Database } from '@/lib/db';
import type { ProcessedNewsArticle } from './ai/pipeline';
import type { RawNewsItem } from './sources/config';
import { computeNewsItemHash } from './normalize';

export interface PublishedArticle {
  id: string;
  appId?: number;
  title: string;
  summary: string;
  whyItMatters: string;
  purchaseAdvice: string;
  category: string;
  purchaseImpact: string;
  publishedAt: string;
  sources: { name: string; url: string }[];
}

export async function getPublishedNews(
  filters: { limit?: number; appId?: number; category?: string } = {},
  customDb?: Database,
): Promise<PublishedArticle[]> {
  const db = customDb || (await database());

  let sql = `
    SELECT id, app_id as appId, title, summary, why_it_matters as whyItMatters,
           purchase_advice as purchaseAdvice, category, purchase_impact as purchaseImpact,
           published_at as publishedAt
    FROM news_articles
  `;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.appId && Number.isInteger(filters.appId)) {
    conditions.push(`app_id = ?`);
    params.push(filters.appId);
  }

  if (filters.category?.trim()) {
    conditions.push(`category = ?`);
    params.push(filters.category.trim());
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ` ORDER BY published_at DESC LIMIT ?`;
  params.push(Math.min(Math.max(filters.limit || 10, 1), 50));

  const stmt = db.prepare(sql).bind(...params);
  const { results } = await stmt.all<PublishedArticle>();

  const articles: PublishedArticle[] = [];
  for (const row of results) {
    const sourcesStmt = db
      .prepare(`SELECT source_name as name, article_url as url FROM news_article_sources WHERE article_id = ?`)
      .bind(row.id);
    const sourcesRes = await sourcesStmt.all<{ name: string; url: string }>();

    articles.push({
      ...row,
      sources: sourcesRes.results || [],
    });
  }

  return articles;
}

export async function saveRawNewsItems(
  items: RawNewsItem[],
  customDb?: Database,
): Promise<number> {
  if (!items.length) return 0;
  const db = customDb || (await database());

  let insertedCount = 0;
  for (const item of items) {
    const hash = computeNewsItemHash(item);
    const id = `raw_${hash}`;

    try {
      await db
        .prepare(
          `INSERT OR IGNORE INTO news_raw_items 
          (id, source_id, article_id, article_url, title, snippet, published_at, collected_at, app_id, hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          item.sourceId,
          item.articleId,
          item.articleUrl,
          item.title,
          item.snippet || null,
          item.publishedAt,
          item.collectedAt,
          item.appId || null,
          hash,
        )
        .run();
      insertedCount++;
    } catch {
      // Ignored if duplicate hash or conflict
    }
  }

  return insertedCount;
}

export async function saveProcessedArticle(
  article: ProcessedNewsArticle,
  customDb?: Database,
): Promise<boolean> {
  const db = customDb || (await database());
  const now = new Date().toISOString();
  const articleId = `art_${article.eventId}`;

  try {
    // 1. Insert Event
    await db
      .prepare(
        `INSERT OR IGNORE INTO news_events
        (id, app_id, title, category, importance, confidence, purchase_impact, safe_to_publish, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        article.eventId,
        article.appId || null,
        article.title,
        article.category,
        article.importance,
        article.confidence,
        article.purchaseImpact,
        article.safeToPublish ? 1 : 0,
        now,
      )
      .run();

    // 2. Insert Article
    await db
      .prepare(
        `INSERT OR REPLACE INTO news_articles
        (id, event_id, app_id, title, summary, why_it_matters, purchase_advice, category, purchase_impact, published_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        articleId,
        article.eventId,
        article.appId || null,
        article.title,
        article.summary,
        article.whyItMatters,
        article.purchaseAdvice,
        article.category,
        article.purchaseImpact,
        article.publishedAt,
        now,
      )
      .run();

    // 3. Insert Sources
    for (const src of article.sources) {
      await db
        .prepare(
          `INSERT INTO news_article_sources (article_id, raw_item_id, source_name, article_url)
          VALUES (?, ?, ?, ?)`,
        )
        .bind(articleId, src.rawItemId, src.sourceName, src.articleUrl)
        .run();
    }

    return true;
  } catch {
    return false;
  }
}

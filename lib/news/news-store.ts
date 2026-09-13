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
  rumor: boolean;
  providerType: string;
  publishedAt: string;
  sources: { name: string; url: string }[];
}

export interface SourceHealthRecord {
  id: string;
  name: string;
  type: string;
  status: 'ok' | 'error';
  lastCheckedAt: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  lastItemCount: number;
}

export async function getPublishedNews(
  filters: { limit?: number; appId?: number; category?: string } = {},
  customDb?: Database,
): Promise<PublishedArticle[]> {
  const db = customDb || (await database());

  let sql = `
    SELECT id, app_id as appId, title, summary, why_it_matters as whyItMatters,
           purchase_advice as purchaseAdvice, category, purchase_impact as purchaseImpact,
           rumor, provider_type as providerType, published_at as publishedAt
    FROM news_articles
  `;
  const conditions: string[] = ['rumor = 0'];
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
  const { results } = await stmt.all<Omit<PublishedArticle, 'rumor'> & { rumor: number }>();

  const articles: PublishedArticle[] = [];
  for (const row of results) {
    const sourcesStmt = db
      .prepare(`SELECT source_name as name, article_url as url FROM news_article_sources WHERE article_id = ?`)
      .bind(row.id);
    const sourcesRes = await sourcesStmt.all<{ name: string; url: string }>();

    articles.push({
      ...row,
      rumor: Boolean(row.rumor),
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
        (id, app_id, title, category, importance, confidence, purchase_impact, rumor, safe_to_publish, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        article.eventId,
        article.appId || null,
        article.title,
        article.category,
        article.importance,
        article.confidence,
        article.purchaseImpact,
        article.rumor ? 1 : 0,
        article.safeToPublish ? 1 : 0,
        now,
      )
      .run();

    // 2. Insert Article
    await db
      .prepare(
        `INSERT OR REPLACE INTO news_articles
        (id, event_id, app_id, title, summary, why_it_matters, purchase_advice, category, purchase_impact, rumor, provider_type, published_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        article.rumor ? 1 : 0,
        article.providerType || 'heuristic',
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

export async function updateSourceHealth(
  record: {
    sourceId: string;
    sourceName: string;
    sourceType: string;
    status: 'ok' | 'error';
    itemCount: number;
    error?: string;
  },
  customDb?: Database,
): Promise<void> {
  const db = customDb || (await database());
  const now = new Date().toISOString();

  const existing = await db
    .prepare(`SELECT last_success_at FROM news_sources WHERE id = ?`)
    .bind(record.sourceId)
    .first<{ last_success_at?: string }>()
    .catch(() => null);

  if (record.status === 'ok') {
    await db
      .prepare(
        `INSERT INTO news_sources (id, name, type, status, last_checked_at, last_success_at, last_error, last_item_count)
         VALUES (?, ?, ?, 'ok', ?, ?, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           type = excluded.type,
           status = 'ok',
           last_checked_at = excluded.last_checked_at,
           last_success_at = excluded.last_success_at,
           last_error = NULL,
           last_item_count = excluded.last_item_count`,
      )
      .bind(record.sourceId, record.sourceName, record.sourceType, now, now, record.itemCount)
      .run()
      .catch(() => {});
  } else {
    const previousSuccess = existing?.last_success_at || null;
    await db
      .prepare(
        `INSERT INTO news_sources (id, name, type, status, last_checked_at, last_success_at, last_failure_at, last_error, last_item_count)
         VALUES (?, ?, ?, 'error', ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           type = excluded.type,
           status = 'error',
           last_checked_at = excluded.last_checked_at,
           last_failure_at = excluded.last_failure_at,
           last_error = excluded.last_error`,
      )
      .bind(
        record.sourceId,
        record.sourceName,
        record.sourceType,
        now,
        previousSuccess,
        now,
        record.error || 'Erro desconhecido',
      )
      .run()
      .catch(() => {});
  }
}

export async function getNewsSourceHealth(
  sourceId: string,
  customDb?: Database,
): Promise<SourceHealthRecord | null> {
  const db = customDb || (await database());
  const stmt = db
    .prepare(
      `SELECT id, name, type, status,
              last_checked_at as lastCheckedAt,
              last_success_at as lastSuccessAt,
              last_failure_at as lastFailureAt,
              last_error as lastError,
              last_item_count as lastItemCount
       FROM news_sources WHERE id = ?`,
    )
    .bind(sourceId);
  return stmt.first<SourceHealthRecord>().catch(() => null);
}

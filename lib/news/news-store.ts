import { database, type Database } from '@/lib/db';
import type { ProcessedNewsArticle } from './ai/pipeline';
import type { RawNewsItem } from './sources/config';
import { computeNewsItemHash } from './normalize';

export interface PublishedArticle {
  id: string;
  appId?: number;
  title: string;
  summary: string;
  body?: string;
  whyItMatters: string;
  purchaseAdvice: string;
  category: string;
  purchaseImpact: string;
  rumor: boolean;
  providerType: string;
  publishedAt: string;
  imageUrl?: string;
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

  const buildSql = (includeExtra: boolean) => {
    let sql = includeExtra
      ? `
        SELECT id, app_id as appId, title, summary, body, image_url as imageUrl,
               why_it_matters as whyItMatters, purchase_advice as purchaseAdvice,
               category, purchase_impact as purchaseImpact, rumor,
               provider_type as providerType, published_at as publishedAt
        FROM news_articles
      `
      : `
        SELECT id, app_id as appId, title, summary,
               why_it_matters as whyItMatters, purchase_advice as purchaseAdvice,
               category, purchase_impact as purchaseImpact, rumor,
               provider_type as providerType, published_at as publishedAt
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

    return { sql, params };
  };

  let rows: (Omit<PublishedArticle, 'rumor' | 'sources'> & { rumor: number })[] = [];

  try {
    const { sql, params } = buildSql(true);
    const stmt = db.prepare(sql).bind(...params);
    const { results } = await stmt.all<Omit<PublishedArticle, 'rumor' | 'sources'> & { rumor: number }>();
    rows = results || [];
  } catch {
    const { sql, params } = buildSql(false);
    const stmt = db.prepare(sql).bind(...params);
    const { results } = await stmt.all<Omit<PublishedArticle, 'rumor' | 'sources'> & { rumor: number }>();
    rows = results || [];
  }

  const articles: PublishedArticle[] = [];
  for (const row of rows) {
    const sourcesStmt = db
      .prepare(`SELECT source_name as name, article_url as url FROM news_article_sources WHERE article_id = ?`)
      .bind(row.id);
    const sourcesRes = await sourcesStmt.all<{ name: string; url: string }>();

    articles.push({
      ...row,
      rumor: Boolean(row.rumor),
      body: row.body || row.summary,
      imageUrl: row.imageUrl || (row.appId ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${row.appId}/header.jpg` : undefined),
      sources: sourcesRes.results || [],
    });
  }

  return articles;
}

export async function getPublishedArticleById(
  id: string,
  customDb?: Database,
): Promise<PublishedArticle | null> {
  const db = customDb || (await database());
  const cleanId = id.trim();
  const searchIds = [
    cleanId,
    cleanId.startsWith('art_') ? cleanId.replace(/^art_/, '') : `art_${cleanId}`,
  ];

  let row: (Omit<PublishedArticle, 'rumor' | 'sources'> & { rumor: number }) | null = null;

  try {
    const stmt = db.prepare(
      `SELECT id, app_id as appId, title, summary, body, image_url as imageUrl,
              why_it_matters as whyItMatters, purchase_advice as purchaseAdvice,
              category, purchase_impact as purchaseImpact, rumor,
              provider_type as providerType, published_at as publishedAt
       FROM news_articles
       WHERE (id = ? OR id = ?) AND rumor = 0
       LIMIT 1`
    ).bind(searchIds[0], searchIds[1]);
    row = await stmt.first<Omit<PublishedArticle, 'rumor' | 'sources'> & { rumor: number }>();
  } catch {
    const stmt = db.prepare(
      `SELECT id, app_id as appId, title, summary,
              why_it_matters as whyItMatters, purchase_advice as purchaseAdvice,
              category, purchase_impact as purchaseImpact, rumor,
              provider_type as providerType, published_at as publishedAt
       FROM news_articles
       WHERE (id = ? OR id = ?) AND rumor = 0
       LIMIT 1`
    ).bind(searchIds[0], searchIds[1]);
    row = await stmt.first<Omit<PublishedArticle, 'rumor' | 'sources'> & { rumor: number }>();
  }

  if (!row) return null;

  const sourcesStmt = db
    .prepare(`SELECT source_name as name, article_url as url FROM news_article_sources WHERE article_id = ?`)
    .bind(row.id);
  const sourcesRes = await sourcesStmt.all<{ name: string; url: string }>();

  return {
    ...row,
    rumor: Boolean(row.rumor),
    body: row.body || row.summary,
    imageUrl: row.imageUrl || (row.appId ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${row.appId}/header.jpg` : undefined),
    sources: sourcesRes.results || [],
  };
}

export async function saveRawNewsItems(
  items: RawNewsItem[],
  customDb?: Database,
): Promise<number> {
  if (!items.length) return 0;
  const db = customDb || (await database());

  const referencedApps = new Map<number, string>();
  for (const item of items) {
    if (item.appId && Number.isInteger(item.appId) && item.appId > 0 && !referencedApps.has(item.appId)) {
      referencedApps.set(item.appId, item.title);
    }
  }
  for (const [appId, title] of referencedApps) {
    try {
      await db
        .prepare(
          `INSERT OR IGNORE INTO games(app_id,title,monitored,created_at) VALUES(?,?,0,?)`,
        )
        .bind(appId, title, new Date().toISOString())
        .run();
    } catch {
    }
  }

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
    } catch (err) {
      void err;
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
    // 0. Ensure game stub exists if appId is provided, preventing FK violation
    if (article.appId && Number.isInteger(article.appId) && article.appId > 0) {
      try {
        await db
          .prepare(
            `INSERT OR IGNORE INTO games(app_id,title,monitored,created_at) VALUES(?,?,0,?)`,
          )
          .bind(article.appId, article.title, now)
          .run();
      } catch {
      }
    }

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

    // 2. Insert Article (try with body and image_url, fallback to base schema if columns missing)
    try {
      await db
        .prepare(
          `INSERT OR REPLACE INTO news_articles
          (id, event_id, app_id, title, summary, body, image_url, why_it_matters, purchase_advice, category, purchase_impact, rumor, provider_type, published_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          articleId,
          article.eventId,
          article.appId || null,
          article.title,
          article.summary,
          article.body || null,
          article.imageUrl || null,
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
    } catch {
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
    }

    // 3. Insert Sources
    for (const src of article.sources) {
      try {
        await db
          .prepare(
            `INSERT OR IGNORE INTO news_article_sources (article_id, raw_item_id, source_name, article_url)
            VALUES (?, ?, ?, ?)`,
          )
          .bind(articleId, src.rawItemId, src.sourceName, src.articleUrl)
          .run();
      } catch (srcErr) {
        console.warn('Falha ao inserir source do artigo:', srcErr);
      }
    }

    return true;
  } catch (err) {
    console.error('Falha ao persistir notícia processada:', err);
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

export type NewsRunStatus = 'running' | 'completed' | 'failed' | 'truncated';

export interface NewsRunRecord {
  id: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  status: NewsRunStatus;
  error: string | null;
  summary: Record<string, unknown> | null;
}

const STALE_RUN_MS = 15 * 60 * 1000;

export function interpretNewsRunStatus(record: NewsRunRecord, now = Date.now()): NewsRunStatus | 'stale_running' {
  if (record.status !== 'running') return record.status;
  const updatedAt = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedAt)) return 'running';
  return now - updatedAt > STALE_RUN_MS ? 'stale_running' : 'running';
}

export async function createNewsRun(customDb?: Database): Promise<string> {
  const db = customDb || (await database());
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO news_runs (id, started_at, updated_at, finished_at, status, error, summary)
       VALUES (?, ?, ?, NULL, 'running', NULL, NULL)`,
    )
    .bind(id, now, now)
    .run();
  return id;
}

export async function updateNewsRun(
  runId: string,
  patch: { status?: NewsRunStatus; error?: string | null; summary?: Record<string, unknown> | null },
  customDb?: Database,
): Promise<void> {
  const db = customDb || (await database());
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];
  if (patch.status) {
    sets.push('status = ?');
    params.push(patch.status);
    if (patch.status !== 'running') {
      sets.push('finished_at = ?');
      params.push(now);
    }
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    params.push(patch.error);
  }
  if (patch.summary !== undefined) {
    sets.push('summary = ?');
    params.push(patch.summary ? JSON.stringify(patch.summary) : null);
  }
  params.push(runId);
  await db
    .prepare(`UPDATE news_runs SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();
}

export async function getLatestNewsRun(customDb?: Database): Promise<NewsRunRecord | null> {
  const db = customDb || (await database());
  const row = await db
    .prepare(
      `SELECT id, started_at AS startedAt, updated_at AS updatedAt,
              finished_at AS finishedAt, status, error, summary
       FROM news_runs ORDER BY started_at DESC LIMIT 1`,
    )
    .first<{
      id: string;
      startedAt: string;
      updatedAt: string;
      finishedAt: string | null;
      status: string;
      error: string | null;
      summary: string | null;
    }>()
    .catch(() => null);
  if (!row) return null;
  let summary: Record<string, unknown> | null = null;
  if (row.summary) {
    try {
      summary = JSON.parse(row.summary) as Record<string, unknown>;
    } catch {
      summary = null;
    }
  }
  const status: NewsRunStatus =
    row.status === 'completed' || row.status === 'failed' || row.status === 'truncated' ? row.status : 'running';
  return {
    id: row.id,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    finishedAt: row.finishedAt,
    status,
    error: row.error,
    summary,
  };
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

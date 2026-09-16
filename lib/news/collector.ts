import { NEWS_SOURCES, type NewsSourceConfig, type RawNewsItem } from './sources/config';
import { fetchSteamNewsForApp } from './sources/steam';
import { fetchRssFeed } from './sources/rss';
import { groupNewsItemsIntoEvents } from './dedupe';
import { processNewsEventResult } from './ai/pipeline';
import {
  saveRawNewsItems,
  saveProcessedArticle,
  updateSourceHealth,
  createNewsRun,
  updateNewsRun,
} from './news-store';
import type { Database } from '@/lib/db';
import type { NewsAIProvider } from './ai/provider';

export interface SourceCollectResult {
  sourceId: string;
  sourceName: string;
  status: 'ok' | 'error';
  itemCount: number;
  error?: string;
}

export interface EditorialBreakdown {
  ai: {
    primarySuccess: number;
    fallbackSuccess: number;
    fallbackAttempts: number;
    attemptsTotal: number;
    failures: number;
    models: { primary: number; fallback: number };
  };
  validation: {
    rejected: number;
    reasons: Record<string, number>;
  };
  grounding: {
    processed: number;
    rejected: number;
  };
  errors: {
    retryable: number;
    timeout: number;
    rateLimit: number;
    providerUnavailable: number;
    malformedJson: number;
    invalidOutput: number;
    unknown: number;
  };
  persistence: {
    rawReceived: number;
    rawPersisted: number;
    rawDropped: number;
  };
  pipeline: {
    eventsReceived: number;
    eventsCompleted: number;
    articlesPublished: number;
    eventsSkipped: number;
  };
}

export interface CollectionSummary {
  collectedAt: string;
  totalCollected: number;
  eventsCreated: number;
  articlesPublished: number;
  sourceResults: SourceCollectResult[];
  editorial?: EditorialBreakdown;
}

export const DEFAULT_MONITORED_APPS = [1091500, 2207440, 570, 730, 271590];

export async function collectNewsFromAllSources(options: {
  customFetch?: typeof fetch;
  customDb?: Database;
  aiProvider?: NewsAIProvider;
  appIds?: number[];
  timeoutMs?: number;
} = {}): Promise<CollectionSummary> {
  const fetcher = options.customFetch || fetch;
  const appIds = options.appIds || DEFAULT_MONITORED_APPS;
  const timeoutMs = options.timeoutMs || 8000;
  const sourceResults: SourceCollectResult[] = [];
  const allRawItems: RawNewsItem[] = [];

  const activeSources = NEWS_SOURCES.filter((s) => s.enabled);

  const sourcePromises = activeSources.map(async (source): Promise<{ source: NewsSourceConfig; items: RawNewsItem[] }> => {
    if (source.type === 'steam') {
      const steamItems: RawNewsItem[] = [];
      let successCount = 0;
      let lastErr: Error | null = null;
      for (const appId of appIds) {
        try {
          const items = await fetchSteamNewsForApp(appId, source, fetcher, timeoutMs);
          steamItems.push(...items);
          successCount++;
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e));
        }
      }
      if (steamItems.length === 0 && appIds.length > 0 && lastErr) {
        throw lastErr;
      }
      return { source, items: steamItems };
    } else if (source.type === 'rss') {
      const items = await fetchRssFeed(source, fetcher, undefined, timeoutMs);
      return { source, items };
    }
    return { source, items: [] };
  });

  const settled = await Promise.allSettled(sourcePromises);

  for (let index = 0; index < settled.length; index++) {
    const res = settled[index];
    const sourceConfig = activeSources[index];
    if (res.status === 'fulfilled') {
      const resultObj: SourceCollectResult = {
        sourceId: sourceConfig.id,
        sourceName: sourceConfig.name,
        status: 'ok',
        itemCount: res.value.items.length,
      };
      sourceResults.push(resultObj);
      allRawItems.push(...res.value.items);

      if (options.customDb) {
        await updateSourceHealth(
          {
            sourceId: sourceConfig.id,
            sourceName: sourceConfig.name,
            sourceType: sourceConfig.type,
            status: 'ok',
            itemCount: res.value.items.length,
          },
          options.customDb,
        ).catch(() => {});
      }
    } else {
      const errMsg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      const resultObj: SourceCollectResult = {
        sourceId: sourceConfig.id,
        sourceName: sourceConfig.name,
        status: 'error',
        itemCount: 0,
        error: errMsg,
      };
      sourceResults.push(resultObj);

      if (options.customDb) {
        await updateSourceHealth(
          {
            sourceId: sourceConfig.id,
            sourceName: sourceConfig.name,
            sourceType: sourceConfig.type,
            status: 'error',
            itemCount: 0,
            error: errMsg,
          },
          options.customDb,
        ).catch(() => {});
      }
    }
  }

  const editorial: EditorialBreakdown = {
    ai: {
      primarySuccess: 0,
      fallbackSuccess: 0,
      fallbackAttempts: 0,
      attemptsTotal: 0,
      failures: 0,
      models: { primary: 0, fallback: 0 },
    },
    validation: {
      rejected: 0,
      reasons: {},
    },
    grounding: {
      processed: 0,
      rejected: 0,
    },
    errors: {
      retryable: 0,
      timeout: 0,
      rateLimit: 0,
      providerUnavailable: 0,
      malformedJson: 0,
      invalidOutput: 0,
      unknown: 0,
    },
    persistence: {
      rawReceived: allRawItems.length,
      rawPersisted: 0,
      rawDropped: 0,
    },
    pipeline: {
      eventsReceived: 0,
      eventsCompleted: 0,
      articlesPublished: 0,
      eventsSkipped: 0,
    },
  };

  let runId: string | null = null;
  const snapshot = (): Record<string, unknown> => ({
    totalCollected: allRawItems.length,
    eventsCreated: editorial.pipeline.eventsReceived,
    articlesPublished,
    sourceResults,
    editorial,
  });
  const checkpoint = async (patch: { status?: 'running' | 'completed' | 'failed' | 'truncated'; error?: string | null; summary?: boolean }) => {
    if (!runId || !options.customDb) return;
    try {
      await updateNewsRun(
        runId,
        {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(patch.summary ? { summary: snapshot() } : {}),
        },
        options.customDb,
      );
    } catch {
    }
  };
  if (options.customDb) {
    try {
      runId = await createNewsRun(options.customDb);
    } catch {
      runId = null;
    }
  }

  if (allRawItems.length > 0 && options.customDb) {
    const persisted = await saveRawNewsItems(allRawItems, options.customDb).catch(() => 0);
    editorial.persistence.rawPersisted = persisted;
    editorial.persistence.rawDropped = Math.max(0, allRawItems.length - persisted);
  } else {
    editorial.persistence.rawDropped = allRawItems.length;
  }

  const events = groupNewsItemsIntoEvents(allRawItems);
  let articlesPublished = 0;
  editorial.pipeline.eventsReceived = events.length;
  await checkpoint({ status: 'running', summary: true });

  const CHECKPOINT_EVERY = 5;
  let processedEvents = 0;
  for (const event of events) {
    const result = await processNewsEventResult(
      event.id,
      event.title,
      event.items,
      event.appId,
      options.aiProvider,
    );

    if (result.status === 'published') {
      editorial.ai.primarySuccess++;
      editorial.ai.attemptsTotal++;
      editorial.ai.models.primary++;
      editorial.validation.rejected = editorial.validation.rejected;
      editorial.grounding.processed++;
      editorial.pipeline.eventsCompleted++;
      editorial.pipeline.articlesPublished++;
      if (options.customDb) {
        const saved = await saveProcessedArticle(result.article, options.customDb).catch(() => false);
        if (!saved) {
          articlesPublished--;
          editorial.pipeline.articlesPublished--;
        }
      } else {
        articlesPublished++;
      }
    } else if (result.status === 'rejected') {
      editorial.pipeline.eventsCompleted++;
      editorial.pipeline.eventsSkipped++;
      switch (result.code) {
        case 'empty':
          editorial.validation.rejected++;
          editorial.validation.reasons.empty = (editorial.validation.reasons.empty || 0) + 1;
          break;
        case 'rumor':
          editorial.validation.rejected++;
          editorial.validation.reasons.rumor = (editorial.validation.reasons.rumor || 0) + 1;
          break;
        case 'safeToPublishFalse':
          editorial.validation.rejected++;
          editorial.validation.reasons.safeToPublishFalse = (editorial.validation.reasons.safeToPublishFalse || 0) + 1;
          break;
        case 'other':
          editorial.validation.rejected++;
          editorial.validation.reasons.other = (editorial.validation.reasons.other || 0) + 1;
          break;
        case 'validation':
          editorial.validation.rejected++;
          editorial.validation.reasons.validation = (editorial.validation.reasons.validation || 0) + 1;
          break;
        case 'grounding':
          editorial.grounding.processed++;
          editorial.grounding.rejected++;
          break;
      }
    } else {
      editorial.ai.failures++;
      editorial.ai.attemptsTotal += result.attempts.length;
      for (const attempt of result.attempts) {
        if (attempt.model === 'cloudflare' || attempt.model === 'openai') {
          editorial.ai.models.primary++;
        } else {
          editorial.ai.models.fallback++;
        }
      }
      if (result.attempts.length > 1) {
        editorial.ai.fallbackAttempts += result.attempts.length - 1;
        editorial.ai.fallbackSuccess++;
      }
      editorial.errors.retryable++;
      if (result.code === 'timeout') editorial.errors.timeout++;
      else if (result.code === 'rate_limit') editorial.errors.rateLimit++;
      else if (result.code === 'provider_unavailable') editorial.errors.providerUnavailable++;
      else if (result.code === 'malformed_json') editorial.errors.malformedJson++;
      else if (result.code === 'invalid_output') editorial.errors.invalidOutput++;
      else editorial.errors.unknown++;
    }

    processedEvents++;
    if (processedEvents % CHECKPOINT_EVERY === 0) await checkpoint({ status: 'running', summary: true });
  }

  await checkpoint({ status: 'completed', summary: true });

  return {
    collectedAt: new Date().toISOString(),
    totalCollected: allRawItems.length,
    eventsCreated: events.length,
    articlesPublished,
    sourceResults,
    editorial,
  };
}
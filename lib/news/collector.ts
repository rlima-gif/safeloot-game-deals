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
  editor: {
    processed: number;
    approved: number;
    rejected: number;
    reasons: { rumor: number; safeToPublishFalse: number; other: number };
  };
  writer: { processed: number; failed: number };
  verifier: { processed: number; rejected: number };
  grounding: { processed: number; rejected: number };
  errors: { retryable: number; provider: number; timeout: number; malformedJson: number; unknown: number };
  persistence: { rawReceived: number; rawPersisted: number; rawDropped: number };
  pipeline: { eventsReceived: number; eventsCompleted: number; articlesPublished: number };
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

  // Run collection per source concurrently using Promise.allSettled
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
    editor: { processed: 0, approved: 0, rejected: 0, reasons: { rumor: 0, safeToPublishFalse: 0, other: 0 } },
    writer: { processed: 0, failed: 0 },
    verifier: { processed: 0, rejected: 0 },
    grounding: { processed: 0, rejected: 0 },
    errors: { retryable: 0, provider: 0, timeout: 0, malformedJson: 0, unknown: 0 },
    persistence: { rawReceived: allRawItems.length, rawPersisted: 0, rawDropped: 0 },
    pipeline: { eventsReceived: 0, eventsCompleted: 0, articlesPublished: 0 },
  };

  // Run record: created BEFORE collection so a killed Worker still leaves a
  // `running` row behind. Checkpoints are best-effort and never fail the run.
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
      // Checkpoint writes must never fail the collection itself.
    }
  };
  if (options.customDb) {
    try {
      runId = await createNewsRun(options.customDb);
    } catch {
      runId = null;
    }
  }

  // Persist raw items. The persisted/dropped delta is observable so a
  // silent FK or conflict failure can no longer hide collection loss.
  if (allRawItems.length > 0 && options.customDb) {
    const persisted = await saveRawNewsItems(allRawItems, options.customDb).catch(() => 0);
    editorial.persistence.rawPersisted = persisted;
    editorial.persistence.rawDropped = Math.max(0, allRawItems.length - persisted);
  } else {
    editorial.persistence.rawDropped = allRawItems.length;
  }

  // Deduplicate and group into events
  const events = groupNewsItemsIntoEvents(allRawItems);
  let articlesPublished = 0;
  editorial.pipeline.eventsReceived = events.length;
  await checkpoint({ status: 'running', summary: true });

  // Checkpoint every 5 events: frequent enough that a killed Worker leaves a
  // recent partial breakdown, cheap enough to not dominate D1 writes.
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
      editorial.editor.processed++;
      editorial.editor.approved++;
      editorial.writer.processed++;
      editorial.verifier.processed++;
      editorial.grounding.processed++;
      editorial.pipeline.eventsCompleted++;
      if (options.customDb) {
        const saved = await saveProcessedArticle(result.article, options.customDb).catch(() => false);
        if (saved) {
          articlesPublished++;
          editorial.pipeline.articlesPublished++;
        }
      } else {
        articlesPublished++;
        editorial.pipeline.articlesPublished++;
      }
    } else if (result.status === 'rejected') {
      switch (result.code) {
        case 'empty':
          // Degenerate: no items to classify; count as an editor rejection.
          editorial.editor.processed++;
          editorial.editor.rejected++;
          break;
        case 'rumor':
          editorial.editor.processed++;
          editorial.editor.rejected++;
          editorial.editor.reasons.rumor++;
          break;
        case 'safeToPublishFalse':
          editorial.editor.processed++;
          editorial.editor.rejected++;
          editorial.editor.reasons.safeToPublishFalse++;
          break;
        case 'other':
          editorial.editor.processed++;
          editorial.editor.rejected++;
          editorial.editor.reasons.other++;
          break;
        case 'verifier':
          editorial.editor.processed++;
          editorial.editor.approved++;
          editorial.writer.processed++;
          editorial.verifier.processed++;
          editorial.verifier.rejected++;
          editorial.pipeline.eventsCompleted++;
          break;
        case 'grounding':
          editorial.editor.processed++;
          editorial.editor.approved++;
          editorial.writer.processed++;
          editorial.verifier.processed++;
          editorial.grounding.processed++;
          editorial.grounding.rejected++;
          editorial.pipeline.eventsCompleted++;
          break;
      }
    } else {
      // retryable_error: the event entered `failedStage` and then errored.
      // Earlier stages completed normally.
      editorial.errors.retryable++;
      if (result.code === 'timeout') editorial.errors.timeout++;
      else if (result.code === 'malformedJson') editorial.errors.malformedJson++;
      else if (result.code === 'provider') editorial.errors.provider++;
      else editorial.errors.unknown++;
      editorial.editor.processed++;
      if (result.failedStage !== 'editor') {
        editorial.editor.approved++;
        editorial.writer.processed++;
        if (result.failedStage === 'writer') {
          editorial.writer.failed++;
        } else {
          editorial.verifier.processed++;
          if (result.failedStage === 'grounding') editorial.grounding.processed++;
        }
      }
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

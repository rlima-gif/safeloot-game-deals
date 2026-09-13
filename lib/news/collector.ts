import { NEWS_SOURCES, type NewsSourceConfig, type RawNewsItem } from './sources/config';
import { fetchSteamNewsForApp } from './sources/steam';
import { fetchRssFeed } from './sources/rss';
import { groupNewsItemsIntoEvents } from './dedupe';
import { processNewsEvent } from './ai/pipeline';
import { saveRawNewsItems, saveProcessedArticle } from './news-store';
import type { Database } from '@/lib/db';
import type { NewsAIProvider } from './ai/provider';

export interface SourceCollectResult {
  sourceId: string;
  sourceName: string;
  status: 'ok' | 'error';
  itemCount: number;
  error?: string;
}

export interface CollectionSummary {
  collectedAt: string;
  totalCollected: number;
  eventsCreated: number;
  articlesPublished: number;
  sourceResults: SourceCollectResult[];
}

export const DEFAULT_MONITORED_APPS = [1091500, 2207440, 570, 730, 271590];

export async function collectNewsFromAllSources(options: {
  customFetch?: typeof fetch;
  customDb?: Database;
  aiProvider?: NewsAIProvider;
  appIds?: number[];
} = {}): Promise<CollectionSummary> {
  const fetcher = options.customFetch || fetch;
  const appIds = options.appIds || DEFAULT_MONITORED_APPS;
  const sourceResults: SourceCollectResult[] = [];
  let allRawItems: RawNewsItem[] = [];

  const activeSources = NEWS_SOURCES.filter((s) => s.enabled);

  // Run collection per source concurrently using Promise.allSettled
  const sourcePromises = activeSources.map(async (source): Promise<{ source: NewsSourceConfig; items: RawNewsItem[] }> => {
    if (source.type === 'steam') {
      const steamItems: RawNewsItem[] = [];
      for (const appId of appIds) {
        try {
          const items = await fetchSteamNewsForApp(appId, source, fetcher);
          steamItems.push(...items);
        } catch {
          // Individual appId failures don't abort whole source
        }
      }
      return { source, items: steamItems };
    } else if (source.type === 'rss') {
      const items = await fetchRssFeed(source, fetcher);
      return { source, items };
    }
    return { source, items: [] };
  });

  const settled = await Promise.allSettled(sourcePromises);

  settled.forEach((res, index) => {
    const sourceConfig = activeSources[index];
    if (res.status === 'fulfilled') {
      sourceResults.push({
        sourceId: sourceConfig.id,
        sourceName: sourceConfig.name,
        status: 'ok',
        itemCount: res.value.items.length,
      });
      allRawItems.push(...res.value.items);
    } else {
      sourceResults.push({
        sourceId: sourceConfig.id,
        sourceName: sourceConfig.name,
        status: 'error',
        itemCount: 0,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  });

  // Persist raw items
  if (allRawItems.length > 0 && options.customDb) {
    await saveRawNewsItems(allRawItems, options.customDb).catch(() => 0);
  }

  // Deduplicate and group into events
  const events = groupNewsItemsIntoEvents(allRawItems);
  let articlesPublished = 0;

  for (const event of events) {
    const processed = await processNewsEvent(
      event.id,
      event.title,
      event.items,
      event.appId,
      options.aiProvider,
    );

    if (processed && processed.safeToPublish) {
      if (options.customDb) {
        const saved = await saveProcessedArticle(processed, options.customDb).catch(() => false);
        if (saved) articlesPublished++;
      } else {
        articlesPublished++;
      }
    }
  }

  return {
    collectedAt: new Date().toISOString(),
    totalCollected: allRawItems.length,
    eventsCreated: events.length,
    articlesPublished,
    sourceResults,
  };
}

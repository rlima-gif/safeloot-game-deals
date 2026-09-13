import type { RawNewsItem } from './sources/config';
import { computeNewsItemHash } from './normalize';

export interface NewsGroupEvent {
  id: string;
  appId?: number;
  title: string;
  items: RawNewsItem[];
  earliestPublishedAt: string;
  keywords: string[];
}

export function deduplicateRawItems(items: RawNewsItem[]): RawNewsItem[] {
  const seenHashes = new Set<string>();
  const result: RawNewsItem[] = [];

  for (const item of items) {
    const hash = computeNewsItemHash(item);
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      result.push(item);
    }
  }

  return result;
}

export function extractKeywords(title: string): string[] {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9à-ú\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['with', 'from', 'this', 'that', 'para', 'com', 'sobre', 'novo', 'nova', 'game', 'jogo'].includes(w));
  return Array.from(new Set(normalized));
}

export function areTitlesSimilar(t1: string, t2: string): boolean {
  const k1 = extractKeywords(t1);
  const k2 = extractKeywords(t2);
  if (!k1.length || !k2.length) return false;

  const intersection = k1.filter((k) => k2.includes(k));
  const minLength = Math.min(k1.length, k2.length);
  return intersection.length >= Math.max(2, Math.floor(minLength * 0.5));
}

export function groupNewsItemsIntoEvents(items: RawNewsItem[]): NewsGroupEvent[] {
  const deduplicated = deduplicateRawItems(items);
  const events: NewsGroupEvent[] = [];

  for (const item of deduplicated) {
    let matchedEvent: NewsGroupEvent | null = null;

    for (const event of events) {
      // Rule 1: Must match appId if both specify it
      if (item.appId && event.appId && item.appId !== event.appId) {
        continue;
      }

      // Rule 2: Time window check (within 72 hours)
      const itemTime = new Date(item.publishedAt).getTime();
      const eventTime = new Date(event.earliestPublishedAt).getTime();
      const diffHours = Math.abs(itemTime - eventTime) / (1000 * 60 * 60);

      if (diffHours > 72) {
        continue;
      }

      // Rule 3: Check title similarity or same appId + overlapping keywords
      const sameAppId = Boolean(item.appId && event.appId && item.appId === event.appId);
      const titleSim = areTitlesSimilar(item.title, event.title);

      if ((sameAppId && titleSim) || (sameAppId && diffHours <= 24) || titleSim) {
        matchedEvent = event;
        break;
      }
    }

    if (matchedEvent) {
      matchedEvent.items.push(item);
      if (new Date(item.publishedAt).getTime() < new Date(matchedEvent.earliestPublishedAt).getTime()) {
        matchedEvent.earliestPublishedAt = item.publishedAt;
      }
      matchedEvent.keywords = Array.from(new Set([...matchedEvent.keywords, ...extractKeywords(item.title)]));
    } else {
      const eventId = `event_${item.appId || 'gen'}_${computeNewsItemHash(item)}`;
      events.push({
        id: eventId,
        appId: item.appId,
        title: item.title,
        items: [item],
        earliestPublishedAt: item.publishedAt,
        keywords: extractKeywords(item.title),
      });
    }
  }

  return events;
}

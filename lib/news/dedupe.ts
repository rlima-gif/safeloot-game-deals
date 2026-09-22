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

export function normalizeCanonicalUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'ref_src', 'source', 'gclid', 'fbclid', 'cmpid', 'feedType',
      'feedName', 'taid', 'ocid',
    ];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    parsed.hash = '';
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const search = parsed.searchParams.toString();
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${search ? `?${search}` : ''}`;
  } catch {
    return rawUrl.toLowerCase().trim().replace(/\/+$/, '');
  }
}

export function normalizeTitleForDedupe(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deduplicateRawItems(items: RawNewsItem[]): RawNewsItem[] {
  const seenHashes = new Set<string>();
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const result: RawNewsItem[] = [];

  for (const item of items) {
    const hash = computeNewsItemHash(item);
    const canonicalUrl = normalizeCanonicalUrl(item.articleUrl);
    const normalizedTitle = normalizeTitleForDedupe(item.title);

    if (seenHashes.has(hash)) {
      continue;
    }
    if (canonicalUrl && seenUrls.has(canonicalUrl)) {
      continue;
    }
    if (normalizedTitle.length > 10 && seenTitles.has(normalizedTitle)) {
      continue;
    }

    seenHashes.add(hash);
    if (canonicalUrl) seenUrls.add(canonicalUrl);
    if (normalizedTitle.length > 10) seenTitles.add(normalizedTitle);
    result.push(item);
  }

  return result;
}

export function extractKeywords(title: string): string[] {
  const stopwords = new Set([
    'with', 'from', 'this', 'that', 'para', 'com', 'sobre', 'novo', 'nova',
    'game', 'jogo', 'out', 'now', 'the', 'and', 'for', 'you', 'are', 'is'
  ]);
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9à-ú\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopwords.has(w));
  return Array.from(new Set(normalized));
}

/**
 * DETERMINISTIC THRESHOLD:
 * Requires overall keyword intersection AND at least 1 specific event token
 * (excluding common game title names) to prevent different stories for the same game
 * from collapsing into a single event.
 */
export function areTitlesSimilar(t1: string, t2: string): boolean {
  const k1 = extractKeywords(t1);
  const k2 = extractKeywords(t2);
  if (!k1.length || !k2.length) return false;

  const intersection = k1.filter((k) => k2.includes(k));
  const minLength = Math.min(k1.length, k2.length);

  const genericGameTokens = new Set(['cyberpunk', '2077', 'witcher', 'hollow', 'knight', 'silksong', 'pc']);
  const specificIntersection = intersection.filter((k) => !genericGameTokens.has(k));

  if (minLength === 1) {
    return intersection.length === 1;
  }
  return specificIntersection.length >= 1 && intersection.length >= 2;
}

/**
 * DETERMINISTIC DEDUPLICATION & GROUPING:
 * 
 * 1. Time Window: Max 72 hours difference. Supporting condition only.
 * 2. AppID Isolation: Different appIds NEVER merge.
 * 3. Primary Requirement: `areTitlesSimilar` MUST be true.
 *    Same appId + close time alone is NOT enough (e.g. Patch vs DLC on same day remain separate).
 */
export function groupNewsItemsIntoEvents(items: RawNewsItem[]): NewsGroupEvent[] {
  const deduplicated = deduplicateRawItems(items);
  const events: NewsGroupEvent[] = [];

  for (const item of deduplicated) {
    let matchedEvent: NewsGroupEvent | null = null;

    for (const event of events) {
      // Rule 1: Must match appId if both specify different non-null appIds
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

      // Rule 3: Hardened Title Similarity Requirement
      const titleSim = areTitlesSimilar(item.title, event.title);

      // MERGE REQUIREMENT: Title similarity MUST be true (sameAppId alone is NOT sufficient)
      if (titleSim) {
        matchedEvent = event;
        break;
      }
    }

    if (matchedEvent) {
      matchedEvent.items.push(item);
      if (!matchedEvent.appId && item.appId) {
        matchedEvent.appId = item.appId;
      }
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

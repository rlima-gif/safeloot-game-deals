import type { RawNewsItem } from './sources/config';

export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeNewsItemHash(item: {
  sourceId: string;
  articleId?: string;
  articleUrl: string;
  title: string;
}): string {
  const str = `${item.sourceId}:${item.articleId || ''}:${item.articleUrl.toLowerCase().trim()}:${item.title.toLowerCase().trim()}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(36)}_${str.length}`;
}

export function normalizeTimestamp(input: string | number | undefined): string {
  if (!input) return new Date().toISOString();
  let date: Date;
  if (typeof input === 'number') {
    date = new Date(input < 1e11 ? input * 1000 : input);
  } else {
    date = new Date(input);
  }
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function normalizeRawNewsItem(item: Partial<RawNewsItem> & { sourceId: string; sourceName: string; articleUrl: string; title: string }): RawNewsItem {
  const collectedAt = item.collectedAt ? normalizeTimestamp(item.collectedAt) : new Date().toISOString();
  const publishedAt = item.publishedAt ? normalizeTimestamp(item.publishedAt) : collectedAt;
  const cleanSnippet = item.snippet ? stripHtml(item.snippet).slice(0, 4000) : undefined;
  const cleanTitle = stripHtml(item.title).slice(0, 300);

  return {
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    sourceType: item.sourceType || 'official',
    articleId: item.articleId || item.articleUrl,
    articleUrl: item.articleUrl,
    title: cleanTitle,
    snippet: cleanSnippet,
    publishedAt,
    collectedAt,
    appId: item.appId && Number.isInteger(item.appId) && item.appId > 0 ? item.appId : undefined,
    imageUrl: item.imageUrl && item.imageUrl.startsWith('http') ? item.imageUrl : undefined,
  };
}

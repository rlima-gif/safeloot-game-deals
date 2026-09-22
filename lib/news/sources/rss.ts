import type { RawNewsItem, NewsSourceConfig } from './config';
import { normalizeRawNewsItem } from '../normalize';

export function parseRssXml(
  xml: string,
  sourceConfig: NewsSourceConfig,
  appId?: number,
): RawNewsItem[] {
  const items: RawNewsItem[] = [];

  // Match RSS <item> tags
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const itemXml of itemMatches) {
    const title = getTagValue(itemXml, 'title');
    const link = getTagValue(itemXml, 'link') || getAttrValue(itemXml, 'link', 'href');
    const description = getTagValue(itemXml, 'description') || getTagValue(itemXml, 'content:encoded');
    const pubDate = getTagValue(itemXml, 'pubDate') || getTagValue(itemXml, 'dc:date');
    const guid = getTagValue(itemXml, 'guid') || link;
    const imageUrl = extractImageUrl(itemXml, description);

    if (title && link) {
      items.push(
        normalizeRawNewsItem({
          sourceId: sourceConfig.id,
          sourceName: sourceConfig.name,
          sourceType: 'rss',
          articleId: guid || link,
          articleUrl: link,
          title,
          snippet: description,
          publishedAt: pubDate || new Date().toISOString(),
          collectedAt: new Date().toISOString(),
          appId,
          imageUrl,
        }),
      );
    }
  }

  // If no RSS items found, check Atom <entry> tags
  if (items.length === 0) {
    const entryMatches = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
    for (const entryXml of entryMatches) {
      const title = getTagValue(entryXml, 'title');
      const link = getAttrValue(entryXml, 'link', 'href') || getTagValue(entryXml, 'link');
      const summary = getTagValue(entryXml, 'summary') || getTagValue(entryXml, 'content');
      const published = getTagValue(entryXml, 'published') || getTagValue(entryXml, 'updated');
      const id = getTagValue(entryXml, 'id') || link;
      const imageUrl = extractImageUrl(entryXml, summary);

      if (title && link) {
        items.push(
          normalizeRawNewsItem({
            sourceId: sourceConfig.id,
            sourceName: sourceConfig.name,
            sourceType: 'rss',
            articleId: id || link,
            articleUrl: link,
            title,
            snippet: summary,
            publishedAt: published || new Date().toISOString(),
            collectedAt: new Date().toISOString(),
            appId,
            imageUrl,
          }),
        );
      }
    }
  }

  return items;
}

function extractImageUrl(itemXml: string, content?: string): string | undefined {
  const enclosureUrl = getAttrValue(itemXml, 'enclosure', 'url');
  if (enclosureUrl && enclosureUrl.startsWith('http')) return enclosureUrl;

  const mediaContentUrl = getAttrValue(itemXml, 'media:content', 'url');
  if (mediaContentUrl && mediaContentUrl.startsWith('http')) return mediaContentUrl;

  const mediaThumbUrl = getAttrValue(itemXml, 'media:thumbnail', 'url');
  if (mediaThumbUrl && mediaThumbUrl.startsWith('http')) return mediaThumbUrl;

  const searchScope = `${content || ''} ${itemXml}`;
  const imgMatch = searchScope.match(/<img[^>]+src=["'](https?:\/\/[^"'>]+)["']/i);
  if (imgMatch && imgMatch[1]) return imgMatch[1];

  return undefined;
}

function getTagValue(xml: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function getAttrValue(xml: string, tag: string, attr: string): string {
  const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*\\/?>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

export async function fetchRssFeed(
  sourceConfig: NewsSourceConfig,
  customFetch: typeof fetch = fetch,
  appId?: number,
  timeoutMs = 8000,
): Promise<RawNewsItem[]> {
  if (!sourceConfig.url) {
    throw new Error(`Fonte RSS ${sourceConfig.id} sem URL configurada.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await customFetch(sourceConfig.url, {
      headers: { 'User-Agent': 'SafeLoot-NewsBot/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`RSS ${sourceConfig.id} HTTP ${res.status}`);
    }
    const xml = await res.text();
    return parseRssXml(xml, sourceConfig, appId);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout na fonte RSS ${sourceConfig.name} (${timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

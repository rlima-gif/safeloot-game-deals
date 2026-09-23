import type { RawNewsItem, NewsSourceConfig } from './config';
import { normalizeRawNewsItem, cleanUrl } from '../normalize';

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
    const desc = getTagValue(itemXml, 'description');
    const contentEncoded =
      getTagValue(itemXml, 'content:encoded') ||
      getTagValue(itemXml, 'dc:content') ||
      getTagValue(itemXml, 'content');
    const description = (contentEncoded && contentEncoded.length > desc.length) ? contentEncoded : (desc || contentEncoded);
    const pubDate = getTagValue(itemXml, 'pubDate') || getTagValue(itemXml, 'dc:date');
    const guid = getTagValue(itemXml, 'guid') || link;
    const imageUrl = extractImageUrl(itemXml, contentEncoded || desc);

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
      const summaryTag = getTagValue(entryXml, 'summary');
      const contentTag = getTagValue(entryXml, 'content');
      const summary = (contentTag && contentTag.length > summaryTag.length) ? contentTag : (summaryTag || contentTag);
      const published = getTagValue(entryXml, 'published') || getTagValue(entryXml, 'updated');
      const id = getTagValue(entryXml, 'id') || link;
      const imageUrl = extractImageUrl(entryXml, contentTag || summaryTag);

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

function isValidImageUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  // Discard video/audio files mistakenly tagged in feeds
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mp3') || lower.endsWith('.ogg')) {
    return false;
  }
  // Discard tracking pixels
  if (lower.includes('pixel') || lower.includes('feedburner.com/~r/')) {
    return false;
  }
  return true;
}

export function extractImageUrl(itemXml: string, content?: string): string | undefined {
  if (!itemXml) return undefined;

  // 1. Check enclosure tags (ensure it's an image enclosure or has an image extension)
  const enclosureMatches = itemXml.matchAll(/<enclosure\b([^>]*?)(?:\/?>|>[\s\S]*?<\/enclosure>)/gi);
  for (const m of enclosureMatches) {
    const attrs = m[1];
    const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
    const urlMatch = attrs.match(/url=["']([^"']+)["']/i);
    if (urlMatch && urlMatch[1]) {
      const type = typeMatch ? typeMatch[1].toLowerCase() : '';
      if (!type || type.startsWith('image/')) {
        const cleaned = cleanUrl(urlMatch[1]);
        if (isValidImageUrl(cleaned)) return cleaned;
      }
    }
  }

  // 2. Check media:content (prefer image medium/type and skip videos)
  const mediaContentMatches = itemXml.matchAll(/<media:content\b([^>]*?)(?:\/?>|>[\s\S]*?<\/media:content>)/gi);
  for (const m of mediaContentMatches) {
    const attrs = m[1];
    const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
    const mediumMatch = attrs.match(/medium=["']([^"']+)["']/i);
    const urlMatch = attrs.match(/url=["']([^"']+)["']/i);
    if (urlMatch && urlMatch[1]) {
      const medium = mediumMatch ? mediumMatch[1].toLowerCase() : '';
      const type = typeMatch ? typeMatch[1].toLowerCase() : '';
      if (medium === 'video' || type.startsWith('video/')) continue;
      const cleaned = cleanUrl(urlMatch[1]);
      if (isValidImageUrl(cleaned)) return cleaned;
    }
  }

  // 3. Check media:thumbnail (via url attribute or inner text)
  const mediaThumbAttrMatch = itemXml.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["']/i);
  if (mediaThumbAttrMatch && mediaThumbAttrMatch[1]) {
    const cleaned = cleanUrl(mediaThumbAttrMatch[1]);
    if (isValidImageUrl(cleaned)) return cleaned;
  }
  const mediaThumbTextMatch = itemXml.match(/<media:thumbnail\b[^>]*>([^<]+)<\/media:thumbnail>/i);
  if (mediaThumbTextMatch && mediaThumbTextMatch[1]) {
    const cleaned = cleanUrl(mediaThumbTextMatch[1]);
    if (isValidImageUrl(cleaned)) return cleaned;
  }

  // 4. Atom link enclosure
  const atomLinkMatch =
    itemXml.match(/<link\b[^>]*rel=["']enclosure["'][^>]*href=["']([^"']+)["']/i) ||
    itemXml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']enclosure["']/i);
  if (atomLinkMatch && atomLinkMatch[1]) {
    const cleaned = cleanUrl(atomLinkMatch[1]);
    if (isValidImageUrl(cleaned)) return cleaned;
  }

  // 5. Featured image or image tags
  const featuredImgMatch = itemXml.match(/<(?:wp:featured_image|featured_image|image)>([\s\S]*?)<\/(?:wp:featured_image|featured_image|image)>/i);
  if (featuredImgMatch && featuredImgMatch[1]) {
    const inner = featuredImgMatch[1];
    const innerUrl = inner.match(/<url>([^<]+)<\/url>/i)?.[1] || inner.trim();
    const cleaned = cleanUrl(innerUrl);
    if (isValidImageUrl(cleaned)) return cleaned;
  }

  // 6. Search for <img> in description, content, and itemXml (both raw HTML and entity-encoded)
  const searchScope = `${content || ''} ${itemXml}`;

  // Direct <img src="...">
  const directImgMatch = searchScope.match(/<img\b[^>]*?\bsrc=["'](https?:\/\/[^"'\s>]+)["']/i);
  if (directImgMatch && directImgMatch[1]) {
    const cleaned = cleanUrl(directImgMatch[1]);
    if (isValidImageUrl(cleaned)) return cleaned;
  }

  // Encoded &lt;img ... src=&quot;...&quot;
  const encodedImgMatch = searchScope.match(/&lt;img\b[^&>]*?\bsrc=(?:&quot;|&#34;|["'])(https?:\/\/[^"'\s>&]+)(?:&quot;|&#34;|["'])/i);
  if (encodedImgMatch && encodedImgMatch[1]) {
    const cleaned = cleanUrl(encodedImgMatch[1]);
    if (isValidImageUrl(cleaned)) return cleaned;
  }

  // Fallback to data-src in <img>
  const dataSrcMatch = searchScope.match(/<img\b[^>]*?\bdata-src=["'](https?:\/\/[^"'\s>]+)["']/i);
  if (dataSrcMatch && dataSrcMatch[1]) {
    const cleaned = cleanUrl(dataSrcMatch[1]);
    if (isValidImageUrl(cleaned)) return cleaned;
  }

  return undefined;
}

function getTagValue(xml: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
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

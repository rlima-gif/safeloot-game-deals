import type { RawNewsItem } from './sources/config';
import { cleanUrl, stripHtml } from './normalize';

export function isValidImageUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mp3') || lower.endsWith('.ogg')) {
    return false;
  }
  if (lower.includes('pixel') || lower.includes('feedburner.com/~r/')) {
    return false;
  }
  return true;
}

export function extractHtmlMetadata(html: string): {
  imageUrl?: string;
  description?: string;
  articleText?: string;
} {
  let imageUrl: string | undefined;
  let description: string | undefined;

  // 1. Open Graph & Twitter Image
  const ogImgMatch =
    html.match(/<meta\b[^>]*property=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::url)?["']/i) ||
    html.match(/<meta\b[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);

  if (ogImgMatch && ogImgMatch[1]) {
    const cleaned = cleanUrl(ogImgMatch[1]);
    if (isValidImageUrl(cleaned)) {
      imageUrl = cleaned;
    }
  }

  // 2. Open Graph & Twitter Description
  const descMatch =
    html.match(/<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
    html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
    html.match(/<meta\b[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i);

  if (descMatch && descMatch[1]) {
    const cleanedDesc = stripHtml(descMatch[1]);
    if (cleanedDesc.length > 20) {
      description = cleanedDesc;
    }
  }

  // 3. JSON-LD structured data (Article, NewsArticle, BlogPosting)
  try {
    for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const parsed = JSON.parse(match[1]);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          if (!entry || typeof entry !== 'object') continue;
          if (!imageUrl && entry.image) {
            const img = typeof entry.image === 'string' ? entry.image : entry.image?.url;
            const cleaned = cleanUrl(img);
            if (isValidImageUrl(cleaned)) imageUrl = cleaned;
          }
          if (!description && entry.description && typeof entry.description === 'string') {
            description = stripHtml(entry.description);
          }
          if (entry.articleBody && typeof entry.articleBody === 'string') {
            const bodyText = stripHtml(entry.articleBody);
            if (bodyText.length > 100) {
              return { imageUrl, description, articleText: bodyText.slice(0, 2000) };
            }
          }
        }
      } catch {
        // ignore malformed JSON-LD
      }
    }
  } catch {
    // regex failure safe
  }

  // 4. Extract article body paragraphs (<article> or main content <p> tags)
  const articleBlockMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const searchScope = articleBlockMatch ? articleBlockMatch[1] : html;

  // Extract non-empty paragraphs
  const paragraphs: string[] = [];
  for (const pMatch of searchScope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const raw = stripHtml(pMatch[1]);
    // Filter out ads, cookie notices, social links
    if (
      raw.length >= 40 &&
      !/cookie|subscribe|newsletter|advertisement|direitos reservados|compartilhe/i.test(raw)
    ) {
      paragraphs.push(raw);
      if (paragraphs.join(' ').length >= 1500) break;
    }
  }

  const articleText = paragraphs.length > 0 ? paragraphs.join('\n\n') : undefined;

  return { imageUrl, description, articleText };
}

export async function enrichNewsItem(
  item: RawNewsItem,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<RawNewsItem> {
  // If item already has a rich snippet and a good image, no need to fetch
  const hasRichSnippet = (item.snippet || '').trim().length >= 500;
  const hasValidImage = Boolean(item.imageUrl && isValidImageUrl(item.imageUrl));

  if (hasRichSnippet && hasValidImage) {
    return item;
  }

  if (!item.articleUrl || !item.articleUrl.startsWith('http')) {
    return item;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetcher(item.articleUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent': 'SafeLoot-NewsBot/1.0 (+https://safeloot.safeloot.workers.dev)',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      return item;
    }

    const html = await response.text();
    // Do not parse excessively large payloads
    if (html.length > 2_000_000) {
      return item;
    }

    const metadata = extractHtmlMetadata(html);

    let updatedImageUrl = item.imageUrl;
    if (!hasValidImage && metadata.imageUrl) {
      updatedImageUrl = metadata.imageUrl;
    }

    let updatedSnippet = item.snippet || '';
    if (metadata.articleText && metadata.articleText.length > updatedSnippet.length) {
      updatedSnippet = metadata.articleText;
    } else if (metadata.description && metadata.description.length > updatedSnippet.length) {
      updatedSnippet = metadata.description;
    }

    return {
      ...item,
      imageUrl: updatedImageUrl,
      snippet: updatedSnippet,
    };
  } catch {
    // If enrichment fails (timeout, block, etc.), return the original item safely
    return item;
  }
}

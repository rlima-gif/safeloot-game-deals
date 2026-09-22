import type { RawNewsItem, NewsSourceConfig } from './config';
import { normalizeRawNewsItem } from '../normalize';

export interface GNewsArticle {
  title: string;
  description?: string;
  content?: string;
  url: string;
  image?: string;
  publishedAt: string;
  source?: {
    name?: string;
    url?: string;
  };
}

export interface GNewsResponse {
  totalArticles?: number;
  articles?: GNewsArticle[];
  errors?: string[] | string;
}

export interface FetchGNewsOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  query?: string;
  lang?: string;
  max?: number;
}

export async function fetchGNewsItems(
  source: NewsSourceConfig,
  options: FetchGNewsOptions = {},
): Promise<RawNewsItem[]> {
  const apiKey = options.apiKey || process.env.GNEWS_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    // Graceful skip: GNews requires an API key. When omitted, return empty array without throwing.
    return [];
  }

  const fetcher = options.fetcher || fetch;
  const timeoutMs = options.timeoutMs || 8000;
  const query = options.query || 'games OR gaming OR steam OR playstation OR xbox OR nintendo';
  const lang = options.lang || source.lang || 'en';
  const max = Math.min(Math.max(options.max || 10, 1), 10); // GNews free tier caps at 10

  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(lang)}&max=${max}&apikey=${encodeURIComponent(apiKey.trim())}`;

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SafeLootNewsBot/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`GNews timeout após ${timeoutMs}ms.`);
    }
    throw new Error(`Falha de rede ao acessar GNews: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 429) {
    throw new Error('GNews rate limit atingido (HTTP 429).');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`GNews API key inválida ou não autorizada (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`GNews retornou status HTTP ${response.status}.`);
  }

  let data: GNewsResponse;
  try {
    data = (await response.json()) as GNewsResponse;
  } catch {
    throw new Error('GNews retornou resposta JSON malformada.');
  }

  if (data.errors) {
    const errorDetails = Array.isArray(data.errors) ? data.errors.join(', ') : String(data.errors);
    throw new Error(`Erro retornado pela API GNews: ${errorDetails}`);
  }

  const articles = Array.isArray(data.articles) ? data.articles : [];
  const rawItems: RawNewsItem[] = [];

  for (const article of articles) {
    if (!article.title || !article.url) continue;

    const sourceOrigin = article.source?.name ? `GNews (${article.source.name})` : source.name || 'GNews';
    const raw = normalizeRawNewsItem({
      sourceId: source.id,
      sourceName: sourceOrigin,
      sourceType: 'gnews',
      articleId: article.url,
      articleUrl: article.url,
      title: article.title,
      snippet: article.description || article.content,
      publishedAt: article.publishedAt,
      collectedAt: new Date().toISOString(),
      imageUrl: article.image,
    });

    rawItems.push(raw);
  }

  return rawItems;
}

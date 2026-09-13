import type { RawNewsItem, NewsSourceConfig } from './config';
import { normalizeRawNewsItem } from '../normalize';

export interface SteamNewsApiItem {
  gid: string;
  title: string;
  url: string;
  is_external_url?: boolean;
  author?: string;
  contents?: string;
  feedlabel?: string;
  date: number;
  feedname?: string;
  feed_type?: number;
  appid: number;
}

export interface SteamNewsApiResponse {
  appnews?: {
    appid: number;
    newsitems: SteamNewsApiItem[];
  };
}

export function parseSteamNewsResponse(
  json: SteamNewsApiResponse,
  sourceConfig: NewsSourceConfig,
  appId: number,
): RawNewsItem[] {
  const items = json.appnews?.newsitems || [];
  return items.map((item) =>
    normalizeRawNewsItem({
      sourceId: sourceConfig.id,
      sourceName: sourceConfig.name,
      sourceType: 'steam',
      articleId: item.gid || item.url,
      articleUrl: item.url,
      title: item.title,
      snippet: item.contents,
      publishedAt: item.date ? new Date(item.date * 1000).toISOString() : new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      appId: item.appid || appId,
    }),
  );
}

export async function fetchSteamNewsForApp(
  appId: number,
  sourceConfig: NewsSourceConfig,
  customFetch: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<RawNewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=10&maxlength=500&format=json`;
    const res = await customFetch(url, {
      headers: { 'User-Agent': 'SafeLoot-NewsBot/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Steam API HTTP ${res.status}`);
    }
    const json = (await res.json()) as SteamNewsApiResponse;
    return parseSteamNewsResponse(json, sourceConfig, appId);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout na consulta Steam API (${timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

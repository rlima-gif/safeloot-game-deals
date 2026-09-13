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
): Promise<RawNewsItem[]> {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=10&maxlength=500&format=json`;
  const res = await customFetch(url, {
    headers: { 'User-Agent': 'SafeLoot-NewsBot/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Steam API HTTP ${res.status}`);
  }
  const json = (await res.json()) as SteamNewsApiResponse;
  return parseSteamNewsResponse(json, sourceConfig, appId);
}

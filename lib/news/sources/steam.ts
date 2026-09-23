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

export function extractSteamImageUrl(contents?: string, appId?: number): string | undefined {
  if (contents) {
    // 1. Steam clan images: {STEAM_CLAN_IMAGE}/...
    const clanMatch = contents.match(/\{STEAM_CLAN_IMAGE\}\/([^\s"'>\]]+)/i);
    if (clanMatch && clanMatch[1]) {
      return `https://clan.cloudflare.steamstatic.com/images/${clanMatch[1]}`;
    }

    // 2. BBCode [img]...[/img]
    const bbMatch = contents.match(/\[img\]\s*(https?:\/\/[^\]\s]+)\s*\[\/img\]/i);
    if (bbMatch && bbMatch[1]) {
      return bbMatch[1].trim();
    }

    // 3. HTML <img> tags
    const imgMatch = contents.match(/<img\b[^>]*?\bsrc=["'](https?:\/\/[^"'\s>]+)["']/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1].trim();
    }
  }

  // 4. Default to Steam header image for the game
  if (appId && Number.isInteger(appId) && appId > 0) {
    return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
  }

  return undefined;
}

export function parseSteamNewsResponse(
  json: SteamNewsApiResponse,
  sourceConfig: NewsSourceConfig,
  appId: number,
): RawNewsItem[] {
  const items = json.appnews?.newsitems || [];
  return items.map((item) => {
    const resolvedAppId = item.appid || appId;
    return normalizeRawNewsItem({
      sourceId: sourceConfig.id,
      sourceName: sourceConfig.name,
      sourceType: 'steam',
      articleId: item.gid || item.url,
      articleUrl: item.url,
      title: item.title,
      snippet: item.contents,
      publishedAt: item.date ? new Date(item.date * 1000).toISOString() : new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      appId: resolvedAppId,
      imageUrl: extractSteamImageUrl(item.contents, resolvedAppId),
    });
  });
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
    const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=10&maxlength=4000&format=json`;
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

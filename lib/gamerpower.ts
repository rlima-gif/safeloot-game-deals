export type GamerPowerGiveaway = {
  id: number;
  title: string;
  cleanTitle: string;
  worth: string;
  originalPrice: number;
  image: string;
  url: string;
  directUrl?: string;
  store: string;
  storeId: string;
  platforms: string;
  endDate?: string;
  publishedDate?: string;
  source: string;
};

type RawGamerPowerItem = {
  id?: number;
  title?: string;
  worth?: string;
  thumbnail?: string;
  image?: string;
  description?: string;
  open_giveaway_url?: string;
  gamerpower_url?: string;
  type?: string;
  platforms?: string;
  end_date?: string;
  published_date?: string;
  status?: string;
};

export function cleanGamerPowerTitle(title: string): string {
  return (title || '')
    .replace(/\s*\([^)]*(?:epic|indiegala|steam|gog|pc|drm-free|g2a)[^)]*\)\s*giveaway/gi, '')
    .replace(/\s*\([^)]*\)\s*giveaway/gi, '')
    .replace(/\s*giveaway$/gi, '')
    .trim();
}

export function detectGamerPowerStore(platforms = '', title = '', desc = ''): { store: string; storeId: string } {
  const combined = `${platforms} ${title} ${desc}`.toLowerCase();
  if (combined.includes('epic games')) return { store: 'Epic Games', storeId: 'epic' };
  if (combined.includes('steam')) return { store: 'Steam', storeId: 'steam' };
  if (combined.includes('gog')) return { store: 'GOG', storeId: 'gog' };
  if (combined.includes('indiegala')) return { store: 'IndieGala', storeId: 'indiegala' };
  return { store: 'PC DRM-Free', storeId: 'drm-free' };
}

export function filterAndNormalizeGamerPower(items: RawGamerPowerItem[]): GamerPowerGiveaway[] {
  if (!Array.isArray(items)) return [];

  const giveaways: GamerPowerGiveaway[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    // Strict Anti-Shovelware / Anti-Loot Invariant:
    // Only accept genuine full games (type === 'Game').
    // Rejects DLCs, in-game loot, beta keys, trials, and demos.
    const rawType = (item.type || '').trim().toLowerCase();
    if (rawType !== 'game') continue;

    const status = (item.status || '').trim().toLowerCase();
    if (status !== 'active') continue;

    const rawTitle = (item.title || '').trim();
    if (!rawTitle) continue;

    const titleLower = rawTitle.toLowerCase();
    const descLower = (item.description || '').toLowerCase();
    if (
      /\b(dlc|loot|beta|trial|demo|soundtrack|season pass|expansion|pack|skin|bundle pack|coins|credits|starter pack)\b/i.test(titleLower) ||
      /\b(beta key|closed beta|free trial)\b/i.test(descLower)
    ) {
      continue;
    }

    const cleanTitle = cleanGamerPowerTitle(rawTitle);
    if (!cleanTitle) continue;

    const { store, storeId } = detectGamerPowerStore(item.platforms, rawTitle, item.description);
    const destinationUrl = item.open_giveaway_url || item.gamerpower_url || '';
    if (!destinationUrl.startsWith('https://')) continue;

    // Parse worth if formatted like "$19.99"
    let originalPrice = 0;
    if (item.worth && typeof item.worth === 'string') {
      const match = item.worth.match(/[\d.]+/);
      if (match) {
        const num = parseFloat(match[0]);
        if (Number.isFinite(num) && num > 0) {
          // Worth is in USD, keep as numeric reference or convert if needed
          originalPrice = num;
        }
      }
    }

    let endDate: string | undefined;
    if (item.end_date && item.end_date !== 'N/A') {
      const parsed = Date.parse(item.end_date);
      if (Number.isFinite(parsed) && parsed > Date.now()) {
        endDate = new Date(parsed).toISOString();
      }
    }

    giveaways.push({
      id: Number(item.id),
      title: rawTitle,
      cleanTitle,
      worth: item.worth || 'Free',
      originalPrice,
      image: item.image || item.thumbnail || '',
      url: destinationUrl,
      directUrl: item.open_giveaway_url,
      store,
      storeId,
      platforms: item.platforms || 'PC',
      endDate,
      publishedDate: item.published_date,
      source: 'GamerPower · Resgate Grátis',
    });
  }

  return giveaways;
}

export async function getGamerPowerGiveaways(): Promise<GamerPowerGiveaway[]> {
  try {
    const response = await fetch(
      'https://www.gamerpower.com/api/giveaways?type=game&platform=pc',
      {
        headers: { Accept: 'application/json', 'User-Agent': 'SafeLoot/2.0' },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return [];
    const data = await response.json();
    return filterAndNormalizeGamerPower(data as RawGamerPowerItem[]);
  } catch {
    return [];
  }
}

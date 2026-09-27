import type { NormalizedOffer } from './providers/types';

export function ggdealsEnabled(): boolean {
  return Boolean(
    process.env.GGDEALS_API_KEY && process.env.GGDEALS_USE_APPROVED === 'true',
  );
}

export type GgdealsRawResponse = {
  data?: {
    [gameId: string]: {
      lowest_retail?: {
        price?: number;
        currency?: string;
        url?: string;
        shop?: { name?: string; id?: string };
      };
      lowest_keyshop?: {
        price?: number;
        currency?: string;
        url?: string;
        shop?: { name?: string; id?: string };
      };
      deals?: Array<{
        retailer?: string;
        retailerId?: string;
        price?: number;
        regularPrice?: number;
        currency?: string;
        cut?: number;
        url?: string;
        drm?: string;
        region?: string;
      }>;
    };
  };
};

/**
 * Parses GG.deals API responses according to SafeLoot Price-Truth invariants:
 * 
 * 1. Do NOT invent retailer identity when the API does not provide it.
 *    If only aggregate lowest-price information is returned without store identity,
 *    we do NOT fabricate individual retailer cards (e.g., we do NOT claim "Steam" or "Fanatical").
 * 2. Only full retailer offers with explicit retailer name and valid BRL price are normalized as retailer cards.
 * 3. Preserves original provider/affiliate URLs as mandated by terms.
 */
export function parseGgdealsPrices(value: unknown, canonicalGameId: number): NormalizedOffer[] {
  if (typeof value !== 'object' || value === null) return [];
  const raw = value as GgdealsRawResponse;
  const games = raw.data;
  if (!games || typeof games !== 'object') return [];

  const offers: NormalizedOffer[] = [];
  const now = new Date().toISOString();

  for (const gameEntry of Object.values(games)) {
    if (!gameEntry || typeof gameEntry !== 'object') continue;

    // Check if detailed deals array is available (retailer-level tier)
    if (Array.isArray(gameEntry.deals)) {
      for (const deal of gameEntry.deals) {
        if (!deal || typeof deal !== 'object') continue;
        if (deal.currency !== 'BRL' || typeof deal.price !== 'number' || !Number.isFinite(deal.price) || deal.price < 0) {
          continue;
        }
        if (!deal.retailer || typeof deal.retailer !== 'string') {
          // Rule: Never invent retailer identity
          continue;
        }

        try {
          const url = new URL(deal.url || '');
          if (url.protocol !== 'https:') continue;
        } catch {
          continue;
        }

        const regularPrice = typeof deal.regularPrice === 'number' && deal.regularPrice >= deal.price
          ? deal.regularPrice
          : deal.price;
        const discount = typeof deal.cut === 'number' && deal.cut >= 0 && deal.cut <= 100
          ? Math.round(deal.cut)
          : regularPrice > 0 ? Math.round((1 - deal.price / regularPrice) * 100) : 0;

        offers.push({
          canonicalGameId,
          retailerId: deal.retailerId || deal.retailer.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          retailerName: deal.retailer,
          providerId: 'ggdeals',
          region: (deal.region === 'Global' || deal.region === 'LATAM') ? deal.region : 'Brasil',
          currency: 'BRL',
          currentPrice: deal.price,
          regularPrice,
          discount,
          observedAt: now,
          providerUrl: deal.url!,
          commerceUrl: deal.url!,
          commerceUrlSource: 'provider',
          available: true,
          launcher: deal.drm,
          edition: 'standard',
        });
      }
    }
  }

  return offers;
}

export async function getGgdealsOffers(appId: number): Promise<NormalizedOffer[]> {
  if (!ggdealsEnabled()) return [];
  try {
    const response = await fetch(
      `https://gg.deals/api/prices/?key=${encodeURIComponent(process.env.GGDEALS_API_KEY!)}&steamAppId=${appId}&region=br`,
      {
        headers: { Accept: 'application/json', 'User-Agent': 'SafeLoot/2.0' },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return [];
    const data = await response.json();
    return parseGgdealsPrices(data, appId);
  } catch {
    return [];
  }
}

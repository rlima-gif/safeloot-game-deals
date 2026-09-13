import type { LiveOffer } from './game-api';

export function itadEnabled() {
  return Boolean(
    process.env.ITAD_API_KEY && process.env.ITAD_USE_APPROVED === 'true',
  );
}

export async function itadRequest(path: string, body?: unknown) {
  const response = await fetch(`https://api.isthereanydeal.com${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'ITAD-API-Key': process.env.ITAD_API_KEY!,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error('IsThereAnyDeal temporariamente indisponível.');
  return response.json();
}

export function parseItadPrices(value: unknown, gameId: string): LiveOffer[] {
  if (!Array.isArray(value)) return [];
  const row = value.find((row) => row?.id === gameId);
  if (!Array.isArray(row?.deals)) return [];
  const result = new Map<string, LiveOffer>();
  for (const deal of row.deals) {
    const price = deal?.price,
      regular = deal?.regular;
    if (
      price?.currency !== 'BRL' ||
      typeof price.amount !== 'number' ||
      !Number.isFinite(price.amount) ||
      price.amount < 0
    )
      continue;
    if (
      typeof deal.shop?.name !== 'string' ||
      !Number.isInteger(deal.shop?.id) ||
      deal.voucher
    )
      continue;
    if (/kinguin|eneba/i.test(deal.shop.name)) continue;
    if (
      deal.expiry != null &&
      (!Number.isFinite(Date.parse(deal.expiry)) ||
        Date.parse(deal.expiry) <= Date.now())
    )
      continue;
    try {
      const url = new URL(deal.url);
      if (url.protocol !== 'https:' || url.username || url.password) continue;
    } catch {
      continue;
    }
    const original =
      regular?.currency === 'BRL' &&
      typeof regular.amount === 'number' &&
      Number.isFinite(regular.amount) &&
      regular.amount >= price.amount
        ? regular.amount
        : price.amount;
    const offer: LiveOffer = {
      id: `itad-${gameId}-${deal.shop.id}`,
      kind: 'official',
      available:true,
      activationInBrazil:true,
      verifiedAt:new Date().toISOString(),
      store: deal.shop.name,
      region: 'Brasil',
      currency: 'BRL',
      finalPrice: price.amount,
      originalPrice: original,
      discount:
        typeof deal.cut === 'number' && deal.cut >= 0 && deal.cut <= 100
          ? deal.cut
          : 0,
      url: deal.url,
      source: 'IsThereAnyDeal · Brasil',
      launcher: Array.isArray(deal.drm)
        ? deal.drm
            .map((drm: { name?: string }) => drm?.name)
            .filter((name: unknown) => typeof name === 'string')
            .join(', ') || undefined
        : undefined,
    };
    const previous = result.get(offer.store.toLowerCase());
    if (!previous || offer.finalPrice < previous.finalPrice)
      result.set(offer.store.toLowerCase(), offer);
  }
  return [...result.values()];
}

const cache = new Map<number, { expires: number; offers: LiveOffer[] }>();
export async function getItadOffers(appId: number): Promise<LiveOffer[]> {
  if (!itadEnabled()) return [];
  const cached = cache.get(appId);
  if (cached && cached.expires > Date.now()) return cached.offers;
  const lookup = (await itadRequest(`/games/lookup/v1?appid=${appId}`)) as {
    found?: boolean;
    game?: { id?: string };
  };
  if (!lookup?.found || typeof lookup.game?.id !== 'string') return [];
  const offers = parseItadPrices(
    await itadRequest(
      '/games/prices/v3?country=BR&deals=false&vouchers=false&capacity=0',
      [lookup.game.id],
    ),
    lookup.game.id,
  );
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(appId, { expires: Date.now() + 300_000, offers });
  return offers;
}

import type { LiveOffer } from './game-api';
import { decodeEntities, titleKey, cleanTitle, isEditionCompatible } from './regional-prices';

type GogProduct = {
  id: string;
  title: string;
  slug: string;
  productState?: string;
  price?: {
    finalMoney?: { amount: string; currency: string };
    baseMoney?: { amount: string; currency: string };
  };
};
export function parseGogOffers(
  products: GogProduct[],
  title: string,
): LiveOffer[] {
  const targetKey = titleKey(title);
  const targetClean = cleanTitle(title);
  const matches = products.filter((p) => {
    const pk = titleKey(p.title);
    return pk === targetKey || (cleanTitle(p.title) === targetClean && isEditionCompatible(p.title, title));
  });
  if (matches.length === 0) return [];
  // Sort matches: prefer exact titleKey, then lowest price
  matches.sort((a, b) => {
    const aExact = titleKey(a.title) === targetKey ? 0 : 1;
    const bExact = titleKey(b.title) === targetKey ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aPrice = Number(a.price?.finalMoney?.amount || Infinity);
    const bPrice = Number(b.price?.finalMoney?.amount || Infinity);
    return aPrice - bPrice;
  });
  const p = matches[0],
    price = p.price?.finalMoney,
    base = p.price?.baseMoney;
  if (
    price?.currency !== 'BRL' ||
    !/^\d+(\.\d{1,2})?$/.test(price.amount) ||
    !/^[a-z0-9_]+$/.test(p.slug)
  )
    return [];
  const finalPrice = Number(price.amount);
  const originalPrice =
    base?.currency === 'BRL' && Number(base.amount) >= finalPrice
      ? Number(base.amount)
      : finalPrice;
  return [
    {
      id: `gog-br-${p.id}`,
      store: 'GOG',
      launcher: 'GOG · sem DRM',
      region: 'Brasil',
      currency: 'BRL',
      finalPrice,
      originalPrice,
      discount: originalPrice
        ? Math.round((1 - finalPrice / originalPrice) * 100)
        : 0,
      url: `https://www.gog.com/en/game/${p.slug}?countryCode=BR&currencyCode=BRL`,
      source: 'Catálogo GOG · Brasil · BRL',
    },
  ];
}
export async function getGogOffers(title: string) {
  const url = new URL('https://catalog.gog.com/v1/catalog');
  url.search = new URLSearchParams({
    query: title,
    limit: '20',
    countryCode: 'BR',
    currencyCode: 'BRL',
    locale: 'en-US',
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('GOG indisponível');
  const data = (await res.json()) as { products?: GogProduct[] };
  if (!Array.isArray(data.products)) throw new Error('Catálogo GOG inválido');
  return parseGogOffers(data.products, title);
}

export function parseHypeOffers(html: string, title: string): LiveOffer[] {
  const offers: LiveOffer[] = [];
  const targetKey = titleKey(title);
  const targetClean = cleanTitle(title);

  for (const match of html.matchAll(
    /<product-card-component\b[^>]*data-product="([^"]+)"/g,
  )) {
    try {
      const p = JSON.parse(decodeEntities(match[1]));
      if (
        typeof p.name !== 'string' ||
        p.priceCurrency !== 'BRL' ||
        p.isAvailable !== true ||
        p.purchaseMethodName
      )
        continue;
      const pk = titleKey(p.name);
      const isMatch = pk === targetKey || (cleanTitle(p.name) === targetClean && isEditionCompatible(p.name, title));
      if (!isMatch) continue;

      if (
        typeof p.currentPrice !== 'number' ||
        !Number.isFinite(p.currentPrice) ||
        p.currentPrice < 0 ||
        typeof p.link !== 'string' ||
        !/^\/br\/[a-z0-9-]+$/.test(p.link)
      )
        continue;
      const launcher = p.platform?.name;
      if (
        ![
          'Steam',
          'GOG',
          'Epic Games',
          'Ubisoft Connect',
          'EA App',
          'Origin',
          'Rockstar',
        ].includes(launcher)
      )
        continue;
      const finalPrice = p.currentPrice,
        originalPrice =
          Number.isFinite(p.originalPrice) && p.originalPrice >= finalPrice
            ? p.originalPrice
            : finalPrice;
      offers.push({
        id: `hype-br-${p.id}`,
        store: 'Hype Games',
        launcher,
        region: 'Brasil',
        currency: 'BRL',
        finalPrice,
        originalPrice,
        discount: originalPrice
          ? Math.round((1 - finalPrice / originalPrice) * 100)
          : 0,
        url: `https://hype.games${p.link}`,
        source: 'Catálogo Hype Games · Brasil · BRL',
      });
    } catch {
      /* malformed cards are not prices */
    }
  }
  if (!offers.length) return [];
  // Sort: lowest price first
  offers.sort((a, b) => a.finalPrice - b.finalPrice);
  return [offers[0]];
}
export async function getHypeOffers(title: string) {
  const res = await fetch(
    `https://hype.games/br/busca/tudo/${encodeURIComponent(title)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error('Hype indisponível');
  const html = await res.text();
  if (html.length > 2_000_000) throw new Error('Catálogo muito grande');
  return parseHypeOffers(html, title);
}

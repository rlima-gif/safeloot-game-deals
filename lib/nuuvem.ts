import type { LiveOffer } from './game-api';
import { decodeEntities, titleKey } from './regional-prices';

// Product addresses differ for remakes. These are identifiers, never price fixtures.
const productSlugs: Record<number, string> = {
  2050650: 'resident-evil-4-remake',
  254700: 'resident-evil-4',
};
export function parseNuuvemOffer(
  html: string,
  title: string,
  url: string,
): LiveOffer[] {
  let destination: URL;
  try {
    destination = new URL(url);
  } catch {
    return [];
  }
  if (
    destination.hostname !== 'www.nuuvem.com' ||
    destination.protocol !== 'https:' ||
    !/^\/br-pt\/item\/[a-z0-9-]+$/.test(destination.pathname)
  )
    return [];
  const product = html.match(/<div\b[^>]*id="product"[^>]*>/)?.[0];
  if (
    !product ||
    !/\bproduct__purchasable\b/.test(product) ||
    !/\bproduct__available\b/.test(product)
  )
    return [];
  const main = html.slice(html.indexOf(product));
  const name = main.match(
    /<h1\b[^>]*class="product-title"[^>]*title="([^"]+)"/,
  )?.[1];
  if (!name || titleKey(name) !== titleKey(title)) return [];
  const platform =
    main.match(/<ul\b[^>]*class="platform-tags"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ||
    '';
  if (!/\b(Windows|Linux|Mac)\b/i.test(platform.replace(/<[^>]*>/g, ' ')))
    return [];
  const currency = main.match(
    /<meta\b[^>]*itemprop="priceCurrency"[^>]*content="([^"]+)"/,
  )?.[1];
  const amount = main.match(
    /<meta\b[^>]*itemprop="price"[^>]*content="([^"]+)"/,
  )?.[1];
  if (currency !== 'BRL' || !amount || !/^\d+(\.\d{1,2})?$/.test(amount))
    return [];
  const priceText = main.match(/\bdata-price="([^"]+)"/)?.[1];
  if (!priceText) return [];
  try {
    const price = JSON.parse(decodeEntities(priceText));
    if (
      typeof price.v !== 'number' ||
      !Number.isSafeInteger(price.v) ||
      price.v < 0 ||
      Math.abs(price.v / 100 - Number(amount)) > 0.001
    )
      return [];
    if (
      price.e &&
      (!Number.isFinite(Date.parse(price.e)) ||
        Date.parse(price.e) <= Date.now())
    )
      return [];
    const baseText = main.match(/\bdata-base-price="([^"]+)"/)?.[1];
    const base = baseText ? JSON.parse(decodeEntities(baseText)) : price;
    const finalPrice = price.v / 100;
    const originalPrice =
      Number.isSafeInteger(base.v) && base.v >= price.v
        ? base.v / 100
        : finalPrice;
    const activation =
      main.match(
        /<ul\b[^>]*class="drm-activation"[^>]*>([\s\S]*?)<\/ul>/,
      )?.[1] || '';
    const launcher = decodeEntities(
      activation.match(/<span>([^<]+)<\/span>/)?.[1] || '',
    ).trim();
    return [
      {
        id: `nuuvem-${destination.pathname.split('/').at(-1)}`,
        store: 'Nuuvem',
        kind: 'official',
        region: 'Brasil',
        currency: 'BRL',
        finalPrice,
        originalPrice,
        discount:
          originalPrice > 0
            ? Math.round((1 - finalPrice / originalPrice) * 100)
            : 0,
        launcher: launcher || undefined,
        url: destination.toString(),
        source: 'Nuuvem · página do produto · Brasil · BRL',
      },
    ];
  } catch {
    return [];
  }
}

const cache = new Map<string, { expires: number; offers: LiveOffer[] }>();
export async function getNuuvemOffers(
  appId: number,
  title: string,
): Promise<LiveOffer[]> {
  const slug =
    productSlugs[appId] ||
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f™®]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  if (!slug || slug.length > 160) return [];
  const key = `${appId}:${titleKey(title)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.offers;
  const url = `https://www.nuuvem.com/br-pt/item/${slug}`;
  const response = await fetch(url, {
    headers: { Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error('Nuuvem temporariamente indisponível.');
  const html = await response.text();
  if (html.length > 2_000_000)
    throw new Error('Resposta da Nuuvem excedeu o limite.');
  const offers = parseNuuvemOffer(html, title, response.url);
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 300000, offers });
  return offers;
}

import { decodeEntities, titleKey } from '../regional-prices';
import { getMappedProduct } from '../price-history-store';
import { runWithHealth } from '../source-health';
import type { ConnectorInput, StoreResult } from './types';

const productSlugs: Record<number, string> = {
  2050650: 'resident-evil-4-remake',
  254700: 'resident-evil-4',
};

const cache = new Map<string, { expires: number; result: StoreResult }>();

function cleanTitle(value: string) {
  return titleKey(value)
    .replace(
      /\b(deluxe|gold|ultimate|complete|goty|standard|edition|edicao|edição)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function editionOf(value: string) {
  const key = titleKey(value);
  if (/\bdeluxe\b/.test(key)) return 'Deluxe';
  if (/\bgold\b/.test(key)) return 'Gold';
  if (/\bultimate\b/.test(key)) return 'Ultimate';
  if (/\bcomplete|goty\b/.test(key)) return 'Complete';
  return 'Standard';
}

function isEditionCompatible(candidate: string, canonical: string) {
  const candidateEdition = editionOf(candidate);
  const canonicalEdition = editionOf(canonical);
  return (
    candidateEdition === canonicalEdition ||
    (canonicalEdition === 'Standard' && candidateEdition === 'Standard')
  );
}

function isTitleCompatible(candidate: string, canonical: string) {
  return cleanTitle(candidate) === cleanTitle(canonical);
}

function safeNuuvemUrl(value: string) {
  try {
    const url = new URL(value, 'https://www.nuuvem.com');
    if (
      url.protocol === 'https:' &&
      url.hostname === 'www.nuuvem.com' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/br-pt\/item\/[a-z0-9-]+$/.test(url.pathname)
    ) {
      url.search = '';
      url.hash = '';
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function parseNuuvemCandidates(html: string) {
  const urls = new Set<string>();
  for (const match of html.matchAll(
    /href="([^"]*\/br-pt\/item\/[a-z0-9-]+[^"]*)"/g,
  )) {
    const safe = safeNuuvemUrl(decodeEntities(match[1]));
    if (safe) urls.add(safe);
  }
  return [...urls].slice(0, 20);
}

function extractJsonLd(main: string) {
  for (const match of main.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1].trim()));
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const product = items.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          ['Product', 'VideoGame'].includes(String(item['@type'])),
      );
      if (product) return product as Record<string, unknown>;
    } catch {
      /* malformed structured data is ignored */
    }
  }
  return null;
}

function stringField(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

export function parseNuuvemResult(
  html: string,
  canonicalTitle: string,
  url: string,
  inputKind = 'game',
): StoreResult {
  const destination = safeNuuvemUrl(url);
  if (!destination)
    return {
      store: 'Nuuvem',
      status: 'parser-error',
      diagnostic: 'URL de produto inválida.',
    };
  const product = html.match(/<div\b[^>]*id="product"[^>]*>/)?.[0];
  if (!product)
    return {
      store: 'Nuuvem',
      status: 'parser-error',
      diagnostic: 'HTML sem bloco de produto reconhecido.',
    };
  const main = html.slice(html.indexOf(product));
  const name = decodeEntities(
    main.match(/<h1\b[^>]*class="product-title"[^>]*title="([^"]+)"/)?.[1] ||
      stringField(extractJsonLd(html)?.name),
  ).trim();
  if (!name)
    return {
      store: 'Nuuvem',
      status: 'parser-error',
      diagnostic: 'Produto sem título estruturado.',
    };
  if (
    !isTitleCompatible(name, canonicalTitle) ||
    !isEditionCompatible(name, canonicalTitle)
  ) {
    return {
      store: 'Nuuvem',
      status: 'no-offer',
      diagnostic: 'Produto rejeitado por título ou edição.',
    };
  }
  if (
    inputKind !== 'dlc' &&
    /\b(dlc|expansion|season pass|pack)\b/i.test(name)
  ) {
    return {
      store: 'Nuuvem',
      status: 'no-offer',
      diagnostic: 'Produto rejeitado por parecer DLC.',
    };
  }
  const platform =
    main.match(/<ul\b[^>]*class="platform-tags"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ||
    '';
  if (!/\b(Windows|Linux|Mac|PC)\b/i.test(platform.replace(/<[^>]*>/g, ' '))) {
    return {
      store: 'Nuuvem',
      status: 'no-offer',
      diagnostic: 'Produto rejeitado por plataforma.',
    };
  }
  const purchasable = /\bproduct__purchasable\b/.test(product);
  const available = /\bproduct__available\b/.test(product);
  if (!purchasable || !available) {
    return {
      store: 'Nuuvem',
      status: 'unavailable',
      productId: destination.split('/').at(-1),
      diagnostic: 'Produto correto sem estoque ou compra indisponível.',
    };
  }
  const currency =
    main.match(
      /<meta\b[^>]*itemprop="priceCurrency"[^>]*content="([^"]+)"/,
    )?.[1] ||
    stringField(
      (extractJsonLd(html)?.offers as Record<string, unknown> | undefined)
        ?.priceCurrency,
    );
  const amount =
    main.match(/<meta\b[^>]*itemprop="price"[^>]*content="([^"]+)"/)?.[1] ||
    stringField(
      (extractJsonLd(html)?.offers as Record<string, unknown> | undefined)
        ?.price,
    );
  const structuredOffer = extractJsonLd(html)?.offers as
    | Record<string, unknown>
    | undefined;
  if (
    typeof structuredOffer?.availability === 'string' &&
    /OutOfStock|Discontinued|PreOrder/.test(structuredOffer.availability)
  )
    return {
      store: 'Nuuvem',
      status: 'unavailable',
      diagnostic: 'Dados estruturados indicam produto indisponível.',
    };
  if (
    currency === 'BRL' &&
    structuredOffer &&
    ((structuredOffer.priceCurrency &&
      structuredOffer.priceCurrency !== 'BRL') ||
      (structuredOffer.price !== undefined &&
        Math.abs(Number(structuredOffer.price) - Number(amount)) > 0.001))
  )
    return {
      store: 'Nuuvem',
      status: 'parser-error',
      diagnostic: 'Preço divergente entre JSON-LD e metadados.',
    };
  if (currency !== 'BRL') {
    return {
      store: 'Nuuvem',
      status: 'no-offer',
      diagnostic: 'Produto rejeitado por moeda diferente de BRL.',
    };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    return {
      store: 'Nuuvem',
      status: 'parser-error',
      diagnostic: 'Preço estruturado ausente ou inválido.',
    };
  }
  const priceText = main.match(/\bdata-price="([^"]+)"/)?.[1];
  if (!priceText)
    return {
      store: 'Nuuvem',
      status: 'parser-error',
      diagnostic: 'data-price ausente.',
    };
  try {
    const price = JSON.parse(decodeEntities(priceText));
    if (
      typeof price.v !== 'number' ||
      !Number.isSafeInteger(price.v) ||
      price.v < 0 ||
      Math.abs(price.v / 100 - Number(amount)) > 0.001
    ) {
      return {
        store: 'Nuuvem',
        status: 'parser-error',
        diagnostic: 'Preço divergente entre campos estruturados.',
      };
    }
    if (
      price.e &&
      (!Number.isFinite(Date.parse(price.e)) ||
        Date.parse(price.e) <= Date.now())
    ) {
      return {
        store: 'Nuuvem',
        status: 'no-offer',
        diagnostic: 'Promoção vencida.',
      };
    }
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
    return {
      store: 'Nuuvem',
      status: 'confirmed',
      productId: destination.split('/').at(-1),
      offer: {
        price: finalPrice,
        originalPrice,
        currency: 'BRL',
        discount:
          originalPrice > 0
            ? Math.round((1 - finalPrice / originalPrice) * 100)
            : 0,
        productUrl: destination,
        region: 'Brasil',
        launcher: launcher || undefined,
        edition: editionOf(name),
        available: true,
        verifiedAt: new Date().toISOString(),
      },
    };
  } catch {
    return {
      store: 'Nuuvem',
      status: 'parser-error',
      diagnostic: 'Falha ao interpretar dados estruturados de preço.',
    };
  }
}

export async function fetchNuuvemHtml(
  url: string,
  signal = AbortSignal.timeout(8000),
) {
  let target = new URL(url);
  for (let redirects = 0; redirects < 4; redirects++) {
    if (
      target.protocol !== 'https:' ||
      target.hostname !== 'www.nuuvem.com' ||
      target.username ||
      target.password ||
      target.port
    )
      throw new Error('Redirect Nuuvem inseguro.');
    const response = await fetch(target.toString(), {
      headers: { Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal,
      redirect: 'manual',
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect sem destino.');
      target = new URL(location, target);
      continue;
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Nuuvem temporariamente indisponível.');
    const html = await response.text();
    if (html.length > 2_000_000)
      throw new Error('Resposta da Nuuvem excedeu o limite.');
    return { html, url: target.toString() };
  }
  throw new Error('Limite de redirects Nuuvem.');
}

export async function getNuuvemResult(
  input: ConnectorInput,
): Promise<StoreResult> {
  const key = `${input.appId}:${titleKey(input.canonicalTitle)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = await runWithHealth('Nuuvem', async () => {
    const signal = AbortSignal.timeout(18000);
    const urls = new Set<string>();
    const mapped = await getMappedProduct(input.appId, 'Nuuvem').catch(
      () => null,
    );
    if (mapped?.url) urls.add(mapped.url);
    if (productSlugs[input.appId])
      urls.add(
        `https://www.nuuvem.com/br-pt/item/${productSlugs[input.appId]}`,
      );
    // Catalog results, never a guessed title slug, supply all ordinary candidates.
    let sourceFailed = false;
    try {
      const page = await fetchNuuvemHtml(
        `https://www.nuuvem.com/br-pt/catalog/search/${encodeURIComponent(input.canonicalTitle)}`,
        signal,
      );
      if (page)
        for (const candidate of parseNuuvemCandidates(page.html))
          urls.add(candidate);
    } catch {
      sourceFailed = true;
    }
    let unavailable: StoreResult | null = null;
    let parserError: StoreResult | null = null;
    const candidates = [...urls].slice(0, 8);
    const parsedResults: StoreResult[] = [];
    const pending = [...candidates];
    await Promise.all(
      [0, 1].map(async () => {
        while (pending.length && !signal.aborted) {
          const candidate = pending.shift()!;
          try {
            const page = await fetchNuuvemHtml(candidate, signal);
            if (!page) continue;
            const canonical =
              input.appId === 2050650
                ? 'Resident Evil 4 Remake'
                : input.canonicalTitle;
            const parsed = parseNuuvemResult(
              page.html,
              canonical,
              page.url,
              input.kind,
            );
            parsedResults.push(parsed);
          } catch {
            sourceFailed = true;
          }
        }
      }),
    );
    const confirmed = parsedResults.find(
      (result) => result.status === 'confirmed',
    );
    if (confirmed)
      return {
        result: confirmed,
        status: confirmed.status,
        candidates: urls.size,
        validated: true,
        priceExtracted: true,
      };
    unavailable =
      parsedResults.find((result) => result.status === 'unavailable') || null;
    parserError =
      parsedResults.find((result) => result.status === 'parser-error') || null;
    const fallback = unavailable ||
      parserError ||
      (sourceFailed
        ? {
            store: 'Nuuvem',
            status: 'unavailable' as const,
            diagnostic: 'Nuuvem temporariamente indisponível.',
          }
        : null) || {
        store: 'Nuuvem',
        status: 'no-offer' as const,
        diagnostic: 'Sem produto correto confirmado na Nuuvem.',
      };
    return {
      result: fallback,
      status: fallback.status,
      candidates: urls.size,
      validated: false,
      priceExtracted: false,
    };
  });
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 300000, result });
  return result;
}

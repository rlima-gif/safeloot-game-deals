/**
 * Structured Data (JSON-LD) generators for SafeLoot.
 *
 * SEMANTIC INVARIANT:
 * Confirmed numeric price != Confirmed availability.
 * A confirmed price proves PRICE TRUTH, not STOCK / AVAILABILITY TRUTH.
 *
 * Rules:
 * - Do NOT infer availability from numeric price, priceStatus === 'confirmed',
 *   existence of an offer URL, retailer presence, or successful price fetch.
 * - IF a trustworthy explicit availability signal exists, emit
 *   `availability: 'https://schema.org/InStock'` ONLY when that signal explicitly confirms it.
 * - IF no such signal exists, omit `availability` entirely from Offer / AggregateOffer.
 * - Do NOT invent 'OutOfStock'.
 */

export type GameProductJsonLdOptions = {
  gameId: number;
  title: string;
  imageUrl: string;
  canonicalUrl: string;
  confirmedPrice?: number | null;
  regularPrice?: number | null;
  explicitAvailability?: boolean | null;
};

export type HighlightsOfferJsonLdOptions = {
  title: string;
  image?: string;
  finalPrice: number | null;
  currency?: string;
  storeUrl?: string;
  priceStatus?: 'confirmed' | 'unconfirmed';
  explicitAvailability?: boolean | null;
};

export function buildGameProductJsonLd(options: GameProductJsonLdOptions) {
  const {
    gameId,
    title,
    imageUrl,
    canonicalUrl,
    confirmedPrice,
    regularPrice,
    explicitAvailability,
  } = options;

  const offersSchema: Record<string, unknown> = {
    '@type': 'AggregateOffer',
    priceCurrency: 'BRL',
    url: canonicalUrl,
  };

  if (typeof confirmedPrice === 'number' && Number.isFinite(confirmedPrice)) {
    offersSchema.lowPrice = confirmedPrice;
    offersSchema.highPrice =
      typeof regularPrice === 'number' && Number.isFinite(regularPrice)
        ? regularPrice
        : confirmedPrice;
    offersSchema.offerCount = 1;
  }

  // Availability is emitted ONLY if an explicit, trustworthy signal confirms stock.
  // Never inferred from confirmedPrice != null.
  if (explicitAvailability === true) {
    offersSchema.availability = 'https://schema.org/InStock';
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    image: imageUrl,
    description: `Ofertas e comparação de preço de ${title} para PC no Brasil.`,
    sku: String(gameId),
    offers: offersSchema,
  };
}

export function buildHighlightsOfferJsonLd(options: HighlightsOfferJsonLdOptions) {
  const {
    title,
    image,
    finalPrice,
    currency,
    storeUrl,
    explicitAvailability,
  } = options;

  const offerSchema: Record<string, unknown> = {
    '@type': 'Offer',
    price: finalPrice,
    priceCurrency: currency || 'BRL',
    url: storeUrl,
  };

  // Availability is emitted ONLY if an explicit, trustworthy signal confirms stock.
  // Never inferred from priceStatus === 'confirmed' or numeric price.
  if (explicitAvailability === true) {
    offerSchema.availability = 'https://schema.org/InStock';
  }

  return {
    '@type': 'Product',
    name: title,
    image,
    offers: offerSchema,
  };
}

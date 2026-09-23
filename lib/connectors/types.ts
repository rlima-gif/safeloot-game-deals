export type StoreStatus =
  | 'confirmed'
  | 'no-offer'
  | 'unavailable'
  | 'not-integrated'
  | 'parser-error';

export type StoreOffer = {
  price: number;
  originalPrice: number;
  currency: 'BRL' | 'USD';
  discount: number;
  productUrl: string;
  region: 'Brasil' | 'LATAM' | 'Global';
  launcher?: string;
  edition?: string;
  available: boolean;
  verifiedAt: string;
};

export type StoreResult = {
  store: string;
  status: StoreStatus;
  offer?: StoreOffer;
  productId?: string;
  diagnostic?: string;
};

export type ConnectorInput = {
  appId: number;
  title: string;
  canonicalTitle: string;
  kind?: string;
  baseGameName?: string;
};

export type ConnectorHealthEvent = {
  store: string;
  status: StoreStatus;
  responded: boolean;
  durationMs: number;
  candidates?: number;
  validated?: boolean;
  priceExtracted?: boolean;
  rejectedByCurrency?: boolean;
  rejectedByEdition?: boolean;
  parserError?: boolean;
  timeout?: boolean;
  htmlChanged?: boolean;
  checkedAt: string;
};

export function resultToOffer(result: StoreResult) {
  const offer = result.offer;
  if (
    result.status !== 'confirmed' ||
    !offer ||
    !offer.available ||
    !Number.isFinite(offer.price) ||
    offer.price < 0 ||
    !Number.isFinite(Date.parse(offer.verifiedAt)) ||
    Date.parse(offer.verifiedAt) > Date.now() + 60000 ||
    Date.now() - Date.parse(offer.verifiedAt) > 86400000
  )
    return null;
  try {
    const url = new URL(offer.productUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
  } catch {
    return null;
  }
  const originalPrice =
    Number.isFinite(offer.originalPrice) && offer.originalPrice >= offer.price
      ? offer.originalPrice
      : offer.price;
  const discount =
    originalPrice > 0 ? Math.round((1 - offer.price / originalPrice) * 100) : 0;
  return {
    id: `${result.store.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${result.productId || encodeURIComponent(offer.productUrl)}`,
    store: result.store,
    kind:
      result.store === 'Eneba' || result.store === 'Kinguin'
        ? ('key' as const)
        : ('official' as const),
    launcher: offer.launcher,
    edition: offer.edition,
    activationInBrazil: offer.region === 'Brasil' || offer.region === 'Global' || offer.region === 'LATAM',
    region: offer.region,
    currency: offer.currency,
    finalPrice: offer.price,
    originalPrice,
    discount,
    url: offer.productUrl,
    source: `${result.store} · preço validado · ${offer.region} · ${offer.currency}`,
    verifiedAt: offer.verifiedAt,
    available: offer.available,
  };
}

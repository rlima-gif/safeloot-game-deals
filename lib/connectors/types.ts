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
  if (result.status !== 'confirmed' || !result.offer) return null;
  return {
    id: `${result.store.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${result.productId || encodeURIComponent(result.offer.productUrl)}`,
    store: result.store,
    kind: result.store === 'Eneba' || result.store === 'Kinguin' ? 'key' as const : 'official' as const,
    launcher: result.offer.launcher,
    region: result.offer.region,
    currency: result.offer.currency,
    finalPrice: result.offer.price,
    originalPrice: result.offer.originalPrice,
    discount: result.offer.discount,
    url: result.offer.productUrl,
    source: `${result.store} · preço validado · ${result.offer.region} · ${result.offer.currency}`,
    verifiedAt: result.offer.verifiedAt,
    available: result.offer.available,
  };
}

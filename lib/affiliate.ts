import { findStore, type StoreDefinition } from './stores';
import type { LiveOffer } from './game-api';
function config(name: string): Partial<StoreDefinition> {
  const store = findStore(name);
  if (!store) return {};
  try {
    return {
      ...store,
      ...JSON.parse(process.env.STORE_AFFILIATES_JSON || '{}')?.[store.id],
    };
  } catch {
    return store;
  }
}
export type OutboundDestination = {
  url: string;
  affiliate: boolean;
  storeId: string;
  storeName: string;
  provider: string;
};

export function affiliateDestination(offer: Pick<LiveOffer, 'store' | 'url' | 'source'>): OutboundDestination {
  const store = findStore(offer.store);
  const storeId = store?.id || offer.store.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const storeName = store?.name || offer.store;
  const settings = config(offer.store);
  const url = new URL(offer.url);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Destino inválido.');
  const isAggregator = /IsThereAnyDeal|CheapShark/i.test(offer.source);
  const provider = isAggregator ? (offer.source.includes('IsThereAnyDeal') ? 'itad' : 'cheapshark') : storeId;
  let affiliate = isAggregator;
  // Preserve aggregator affiliate URLs exactly, as required by their source terms.
  if (affiliate) return { url: url.toString(), affiliate, storeId, storeName, provider };
  if (
    settings.tracking_parameters &&
    typeof settings.tracking_parameters === 'object'
  ) {
    for (const [key, value] of Object.entries(settings.tracking_parameters)) {
      if (typeof value === 'string') {
        url.searchParams.set(
          key,
          value.replaceAll('{affiliate_id}', settings.affiliate_id || ''),
        );
        affiliate = true;
      }
    }
  }
  if (
    typeof settings.affiliate_url === 'string' &&
    settings.affiliate_url.includes('{url}')
  ) {
    const destination = new URL(
      settings.affiliate_url
        .replaceAll('{url}', encodeURIComponent(url.toString()))
        .replaceAll(
          '{affiliate_id}',
          encodeURIComponent(settings.affiliate_id || ''),
        ),
    );
    if (
      destination.protocol !== 'https:' ||
      destination.username ||
      destination.password
    )
      throw new Error('Afiliado inválido.');
    return { url: destination.toString(), affiliate: true, storeId, storeName, provider };
  }
  return { url: url.toString(), affiliate, storeId, storeName, provider };
}

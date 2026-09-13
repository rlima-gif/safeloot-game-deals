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
export function affiliateDestination(offer: Pick<LiveOffer,'store'|'url'|'source'>) {
  const settings = config(offer.store);
  const url = new URL(offer.url);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Destino inválido.');
  let affiliate = /IsThereAnyDeal|CheapShark/i.test(offer.source);
  // Preserve aggregator affiliate URLs exactly, as required by their source terms.
  if (affiliate) return { url: url.toString(), affiliate };
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
    return { url: destination.toString(), affiliate: true };
  }
  return { url: url.toString(), affiliate };
}

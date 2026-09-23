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
export const ALLOWED_OUTBOUND_DOMAINS = [
  // Official Game Stores
  'steampowered.com',
  'steamcommunity.com',
  'epicgames.com',
  'gog.com',
  'xbox.com',
  'microsoft.com',
  'ea.com',
  'ubisoft.com',
  'nuuvem.com',
  'hype.games',
  'humblebundle.com',
  'fanatical.com',
  'greenmangaming.com',
  'gamesplanet.com',
  'gamersgate.com',
  'gamebillet.com',
  'indiegala.com',
  // Verified Keyshops / Aggregators
  'eneba.com',
  'cdkeys.com',
  'instant-gaming.com',
  'kinguin.net',
  'g2a.com',
  'gamivo.com',
  'k4g.com',
  'driffle.com',
  'electronicfirst.com',
  'gameseal.com',
  'cheapshark.com',
  'isthereanydeal.com',
  // Approved Affiliate Networks & Tracking Redirectors
  'awin1.com',
  'anrdoezrs.net',
  'commission-junction.com',
  'cj.com',
  'tkqlhce.com',
  'dpbolvw.net',
  'jdoqier.com',
  'linksynergy.com',
  'rakuten.com',
  'impact.com',
  'sjv.io',
  'pxf.io',
  'evyy.net',
  'admitad.com',
  'tradedoubler.com',
];

export function isAllowedDestinationHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  return ALLOWED_OUTBOUND_DOMAINS.some(
    (allowed) => host === allowed || host.endsWith('.' + allowed),
  );
}

export function logOutboundClick(event: {
  store: string;
  storeId: string;
  appId?: number;
  gameTitle?: string;
  affiliate: boolean;
  provider: string;
}): void {
  // SafeLoot Commerce Privacy Invariant:
  // Never log IP addresses, user identifiers, session tokens, or sensitive headers.
  console.log(
    JSON.stringify({
      type: 'safeloot_outbound_click',
      timestamp: new Date().toISOString(),
      store: event.store,
      storeId: event.storeId,
      appId: event.appId || null,
      gameTitle: event.gameTitle ? event.gameTitle.slice(0, 120) : null,
      affiliate: event.affiliate,
      provider: event.provider,
    }),
  );
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
  if (!isAllowedDestinationHost(url.hostname))
    throw new Error(`Domínio de destino não autorizado: ${url.hostname}`);
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
    if (!isAllowedDestinationHost(destination.hostname))
      throw new Error(`Domínio de afiliado não autorizado: ${destination.hostname}`);
    return { url: destination.toString(), affiliate: true, storeId, storeName, provider };
  }
  return { url: url.toString(), affiliate, storeId, storeName, provider };
}

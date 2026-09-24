import type { LiveOffer } from './game-api';
export type StoreKind = 'official' | 'key' | 'unknown';
export type StoreDefinition = {
  id: string;
  name: string;
  url: string;
  kind: StoreKind;
  status: string;
  desc: string;
  active: boolean;
  affiliate_url?: string;
  affiliate_id?: string;
  tracking_parameters?: Record<string, string>;
};
const official = [
  ['steam', 'Steam', 'https://store.steampowered.com/?cc=br'],
  ['epic', 'Epic Games', 'https://store.epicgames.com/pt-BR/'],
  [
    'gog',
    'GOG',
    'https://www.gog.com/en/games?countryCode=BR&currencyCode=BRL',
  ],
  ['microsoft', 'Microsoft/Xbox', 'https://www.xbox.com/pt-BR/games'],
  ['ea', 'EA', 'https://www.ea.com/pt-br/games'],
  ['ubisoft', 'Ubisoft', 'https://store.ubisoft.com/'],
  ['nuuvem', 'Nuuvem', 'https://www.nuuvem.com/br-pt/catalog'],
  ['hype', 'Hype Games', 'https://hype.games/br'],
  ['humble', 'Humble Store', 'https://www.humblebundle.com/store'],
  ['fanatical', 'Fanatical', 'https://www.fanatical.com/'],
  ['gmg', 'Green Man Gaming', 'https://www.greenmangaming.com/'],
  ['gamesplanet', 'GamesPlanet', 'https://us.gamesplanet.com/'],
  ['gamersgate', 'GamersGate', 'https://www.gamersgate.com/pt/'],
  ['gamebillet', 'GameBillet', 'https://www.gamebillet.com/'],
  ['indiegala', 'IndieGala', 'https://www.indiegala.com/'],
];
const keys = [
  ['eneba', 'Eneba', 'https://www.eneba.com/'],
  ['cdkeys', 'CDKeys', 'https://www.cdkeys.com/'],
  ['instant-gaming', 'Instant Gaming', 'https://www.instant-gaming.com/'],
  ['kinguin', 'Kinguin', 'https://www.kinguin.net/'],
  ['g2a', 'G2A', 'https://www.g2a.com/'],
  ['gamivo', 'GAMIVO', 'https://www.gamivo.com/'],
  ['k4g', 'K4G', 'https://k4g.com/'],
  ['driffle', 'Driffle', 'https://driffle.com/'],
  ['electronic-first', 'Electronic First', 'https://www.electronicfirst.com/'],
  ['gameseal', 'GameSeal', 'https://gameseal.com/'],
];
export const stores: StoreDefinition[] = [
  ...official.map(([id, name, url]) => ({
    id,
    name,
    url,
    kind: 'official' as const,
    active: ['steam', 'gog', 'hype', 'gamersgate', 'nuuvem', 'epic', 'gmg'].includes(
      id,
    ),
    status:
      id === 'epic'
        ? 'Resgates gratuitos'
        : ['steam', 'gog', 'hype', 'gamersgate', 'nuuvem', 'gmg'].includes(id)
          ? 'Preços em reais'
          : 'Consultar na loja',
    desc:
      id === 'epic'
        ? 'Jogos pagos oferecidos grátis por tempo limitado.'
        : 'Preços e disponibilidade dependem da cobertura das fontes.',
  })),
  ...keys.map(([id, name, url]) => ({
    id,
    name,
    url,
    kind: 'key' as const,
    active: false,
    status: 'Keys · preços não integrados',
    desc: 'Confira taxas, edição e região de ativação no vendedor.',
  })),
];
export const storeSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
export function findStore(name: string) {
  const slug = storeSlug(name);
  return stores.find(
    (store) => storeSlug(store.name) === slug || store.id === name.toLowerCase() || store.id === slug,
  );
}
export function canonicalStoreId(nameOrId: string): string {
  const store = findStore(nameOrId);
  return store?.id || storeSlug(nameOrId);
}
export function canonicalStoreName(nameOrId: string): string {
  const store = findStore(nameOrId);
  return store?.name || nameOrId;
}
export function offerKind(offer: LiveOffer): StoreKind {
  return offer.kind ?? findStore(offer.store)?.kind ?? 'unknown';
}
export function offerCost(offer: LiveOffer) {
  return typeof offer.totalPrice === 'number' &&
    Number.isFinite(offer.totalPrice) &&
    offer.totalPrice >= 0
    ? offer.totalPrice
    : offer.finalPrice;
}
export function offerLink(offer: LiveOffer) {
  if (!offer.gameId) return '#';
  const storeId = canonicalStoreId(offer.store);
  return `/go/${storeId}/${encodeURIComponent(offer.id)}?appid=${offer.gameId}&title=${encodeURIComponent(offer.gameTitle || '')}`;
}

export function storeSearchAction(storeNameOrId: string, gameTitle: string): { url: string; verb: string } {
  const store = findStore(storeNameOrId);
  const q = encodeURIComponent(gameTitle);
  const id = store?.id || storeNameOrId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  switch (id) {
    case 'nuuvem':
      return { url: `https://www.nuuvem.com/br-pt/catalog/search/${q}`, verb: 'Buscar na loja' };
    case 'gog':
      return { url: `https://www.gog.com/en/games?query=${q}&countryCode=BR&currencyCode=BRL`, verb: 'Buscar na loja' };
    case 'hype':
      return { url: `https://hype.games/br/search?q=${q}`, verb: 'Buscar na loja' };
    case 'epic':
      return { url: `https://store.epicgames.com/pt-BR/browse?q=${q}`, verb: 'Buscar na loja' };
    case 'gmg':
      return { url: `https://www.greenmangaming.com/search?query=${q}`, verb: 'Buscar na loja' };
    case 'gamersgate':
      return { url: `https://www.gamersgate.com/pt/games/?query=${q}`, verb: 'Buscar na loja' };
    case 'steam':
      return { url: `https://store.steampowered.com/search/?term=${q}`, verb: 'Buscar na loja' };
    case 'fanatical':
      return { url: `https://www.fanatical.com/en/search?search=${q}`, verb: 'Buscar na loja' };
    case 'humble':
      return { url: `https://www.humblebundle.com/store/search?sort=bestselling&search=${q}`, verb: 'Buscar na loja' };
    case 'gamebillet':
      return { url: `https://www.gamebillet.com/search?q=${q}`, verb: 'Buscar na loja' };
    case 'gamesplanet':
      return { url: `https://us.gamesplanet.com/search?query=${q}`, verb: 'Buscar na loja' };
    case 'indiegala':
      return { url: `https://www.indiegala.com/store/search?ref=${q}`, verb: 'Buscar na loja' };
    default:
      return { url: store?.url || '#', verb: 'Buscar na loja' };
  }
}


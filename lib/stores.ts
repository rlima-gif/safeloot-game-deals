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
    active: ['steam', 'gog', 'hype', 'gamersgate', 'nuuvem', 'epic'].includes(
      id,
    ),
    status:
      id === 'epic'
        ? 'Resgates gratuitos'
        : ['steam', 'gog', 'hype', 'gamersgate', 'nuuvem'].includes(id)
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


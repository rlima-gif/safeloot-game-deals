const STEAM_STORE = 'https://store.steampowered.com/api';
const CHEAPSHARK = 'https://www.cheapshark.com/api/1.0';
const CLIENT_ID = 'Ludopreco/2.0 (+https://ludopreco-br.rlima614331.chatgpt.site)';

export type LiveGame = {
  id: number;
  title: string;
  image: string;
  headerImage: string;
  finalPrice: number | null;
  originalPrice: number | null;
  currency: string;
  discount: number;
  score: number | null;
  windows: boolean;
  mac: boolean;
  linux: boolean;
  expiresAt: number | null;
  storeUrl: string;
};

export type LiveOffer = {
  id: string;
  store: string;
  region: 'Brasil' | 'Global';
  finalPrice: number;
  originalPrice: number;
  currency: 'BRL' | 'USD';
  discount: number;
  url: string;
  source: string;
};

export type GameDetails = {
  id: number;
  title: string;
  description: string;
  image: string;
  genres: string[];
  developers: string[];
  releaseDate: string;
  score: number | null;
};

type JsonRecord = Record<string, unknown>;

let cheapSharkStoresCache: { expiresAt: number; stores: JsonRecord[] } | null = null;

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');
  requestHeaders.set('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.7');
  const response = await fetch(url, {
    headers: requestHeaders,
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`Fonte respondeu com status ${response.status}.`);
  return response.json() as Promise<T>;
}

async function getCheapSharkStores() {
  if (cheapSharkStoresCache && cheapSharkStoresCache.expiresAt > Date.now()) {
    return cheapSharkStoresCache.stores;
  }
  const stores = await fetchJson<JsonRecord[]>(`${CHEAPSHARK}/stores`, { 'User-Agent': CLIENT_ID });
  cheapSharkStoresCache = { stores, expiresAt: Date.now() + 86_400_000 };
  return stores;
}

function cheapSharkRedirectUrl(value: unknown) {
  const rawDealId = textValue(value);
  let dealId = rawDealId;
  try { dealId = decodeURIComponent(rawDealId); } catch { /* keep the original value */ }
  const url = new URL('https://www.cheapshark.com/redirect');
  url.searchParams.set('dealID', dealId);
  return url.toString();
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stripHtml(value: unknown) {
  return textValue(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapSteamCard(item: JsonRecord): LiveGame {
  const id = numberValue(item.id);
  const original = item.original_price == null ? null : numberValue(item.original_price) / 100;
  const final = item.final_price == null ? null : numberValue(item.final_price) / 100;
  return {
    id,
    title: textValue(item.name, 'Jogo sem título'),
    image: textValue(item.large_capsule_image) || textValue(item.tiny_image) || textValue(item.header_image),
    headerImage: textValue(item.header_image) || textValue(item.large_capsule_image) || textValue(item.tiny_image),
    finalPrice: final,
    originalPrice: original,
    currency: textValue(item.currency, 'BRL'),
    discount: numberValue(item.discount_percent),
    score: item.metascore ? numberValue(item.metascore) : null,
    windows: item.windows_available !== false,
    mac: item.mac_available === true,
    linux: item.linux_available === true,
    expiresAt: item.discount_expiration ? numberValue(item.discount_expiration) : null,
    storeUrl: `https://store.steampowered.com/app/${id}/?cc=br&l=brazilian`,
  };
}

export async function getHighlights() {
  const data = await fetchJson<JsonRecord>(`${STEAM_STORE}/featuredcategories?cc=BR&l=brazilian`);
  const specials = (data.specials as JsonRecord | undefined)?.items;
  const topSellers = (data.top_sellers as JsonRecord | undefined)?.items;
  const featured = Array.isArray(specials)
    ? specials.filter((item): item is JsonRecord => typeof item === 'object' && item !== null && item.type === 0 && item.currency === 'BRL').map(mapSteamCard)
    : [];
  const trending = Array.isArray(topSellers)
    ? topSellers.filter((item): item is JsonRecord => typeof item === 'object' && item !== null && item.type === 0 && item.currency === 'BRL').slice(0, 10).map(mapSteamCard)
    : [];
  if (!featured.length && !trending.length) throw new Error('A vitrine da Steam não retornou jogos agora.');
  return {
    featured,
    trending,
    updatedAt: new Date().toISOString(),
    source: 'Steam — região Brasil',
  };
}

export async function searchSteamGames(query: string) {
  const params = new URLSearchParams({ term: query, cc: 'BR', l: 'brazilian' });
  const data = await fetchJson<JsonRecord>(`${STEAM_STORE}/storesearch/?${params}`);
  const items = Array.isArray(data.items) ? data.items : [];
  const results = items
    .filter((item): item is JsonRecord => typeof item === 'object' && item !== null && item.type === 'app')
    .slice(0, 18)
    .map((item) => {
      const price = typeof item.price === 'object' && item.price !== null ? item.price as JsonRecord : {};
      const platforms = typeof item.platforms === 'object' && item.platforms !== null ? item.platforms as JsonRecord : {};
      const isFree = item.is_free === true;
      return mapSteamCard({
        ...item,
        original_price: isFree ? 0 : price.initial,
        final_price: isFree ? 0 : price.final,
        currency: price.currency ?? 'BRL',
        windows_available: platforms.windows,
        mac_available: platforms.mac,
        linux_available: platforms.linux,
        discount_percent: price.initial && price.final
          ? Math.max(0, Math.round((1 - numberValue(price.final) / numberValue(price.initial)) * 100))
          : 0,
      });
    });
  return {
    query,
    results,
    updatedAt: new Date().toISOString(),
    source: 'Steam Store — Brasil',
  };
}

export async function getGameOffers(appId: number, title: string) {
  const steamUrl = `${STEAM_STORE}/appdetails?appids=${appId}&cc=BR&l=brazilian`;
  const cheapParams = new URLSearchParams({ steamAppID: String(appId), pageSize: '20', sortBy: 'Price' });
  const [steamResult, dealsResult, storesResult] = await Promise.allSettled([
    fetchJson<JsonRecord>(steamUrl),
    fetchJson<JsonRecord[]>(`${CHEAPSHARK}/deals?${cheapParams}`, { 'User-Agent': CLIENT_ID }),
    getCheapSharkStores(),
  ]);

  let details: GameDetails = {
    id: appId,
    title,
    description: '',
    image: '',
    genres: [],
    developers: [],
    releaseDate: '',
    score: null,
  };
  const offers: LiveOffer[] = [];

  if (steamResult.status === 'fulfilled') {
    const record = steamResult.value[String(appId)] as JsonRecord | undefined;
    const data = record?.success && typeof record.data === 'object' && record.data !== null ? record.data as JsonRecord : undefined;
    if (data) {
      const price = typeof data.price_overview === 'object' && data.price_overview !== null ? data.price_overview as JsonRecord : null;
      const genres = Array.isArray(data.genres) ? data.genres : [];
      const metacritic = typeof data.metacritic === 'object' && data.metacritic !== null ? data.metacritic as JsonRecord : null;
      const releaseDate = typeof data.release_date === 'object' && data.release_date !== null ? data.release_date as JsonRecord : null;
      details = {
        id: appId,
        title: textValue(data.name, title),
        description: stripHtml(data.short_description),
        image: textValue(data.header_image),
        genres: genres.map((genre) => typeof genre === 'object' && genre !== null ? textValue((genre as JsonRecord).description) : '').filter(Boolean),
        developers: Array.isArray(data.developers) ? data.developers.map((name) => textValue(name)).filter(Boolean) : [],
        releaseDate: textValue(releaseDate?.date),
        score: metacritic?.score ? numberValue(metacritic.score) : null,
      };
      if (price) {
        const initial = numberValue(price.initial) / 100;
        const final = numberValue(price.final) / 100;
        offers.push({
          id: `steam-${appId}`,
          store: 'Steam',
          region: 'Brasil',
          finalPrice: final,
          originalPrice: initial,
          currency: 'BRL',
          discount: numberValue(price.discount_percent),
          url: `https://store.steampowered.com/app/${appId}/?cc=br&l=brazilian`,
          source: 'Preço regional da Steam',
        });
      } else if (data.is_free === true) {
        offers.push({
          id: `steam-${appId}`,
          store: 'Steam',
          region: 'Brasil',
          finalPrice: 0,
          originalPrice: 0,
          currency: 'BRL',
          discount: 0,
          url: `https://store.steampowered.com/app/${appId}/?cc=br&l=brazilian`,
          source: 'Jogo gratuito na Steam',
        });
      }
    }
  }

  if (dealsResult.status === 'fulfilled') {
    const storeNames = new Map<string, string>();
    if (storesResult.status === 'fulfilled') {
      for (const store of storesResult.value) storeNames.set(textValue(store.storeID), textValue(store.storeName, 'Loja parceira'));
    }
    for (const deal of dealsResult.value) {
      const storeId = textValue(deal.storeID);
      if (storeId === '1') continue;
      if (deal.salePrice == null || !Number.isFinite(Number(deal.salePrice))) continue;
      const finalPrice = numberValue(deal.salePrice);
      const originalPrice = numberValue(deal.normalPrice, finalPrice);
      offers.push({
        id: `cheapshark-${textValue(deal.dealID)}`,
        store: storeNames.get(storeId) ?? `Loja ${storeId}`,
        region: 'Global',
        finalPrice,
        originalPrice,
        currency: 'USD',
        discount: Math.round(numberValue(deal.savings)),
        url: cheapSharkRedirectUrl(deal.dealID),
        source: 'CheapShark — mercado global',
      });
    }
  }

  if (!offers.length && !details.image) throw new Error('Não foi possível consultar as fontes para este jogo.');
  return {
    game: details,
    offers: offers.slice(0, 8),
    updatedAt: new Date().toISOString(),
    sources: [
      ...(steamResult.status === 'fulfilled' ? ['Steam Store'] : []),
      ...(dealsResult.status === 'fulfilled' ? ['CheapShark'] : []),
    ],
  };
}

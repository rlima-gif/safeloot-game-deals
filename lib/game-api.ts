import { affiliateDestination } from './affiliate';
import { regionalAmount } from './regional-prices';
import { getItadOffers, itadEnabled } from './itad';
import { criticUrl, officialTrailer, type OfficialTrailer } from './game-media';
import { getSteamResult } from './connectors/steam';
import { getNuuvemResult } from './connectors/nuuvem';
import { getGogResult } from './connectors/gog';
import { getHypeResult } from './connectors/hype';
import { getGamersGateResult } from './connectors/gamersgate';
import { getEpicResult } from './connectors/epic';
import { getEnebaResult } from './connectors/eneba';
import { getKinguinResult } from './connectors/kinguin';
import { resultToOffer, type StoreResult } from './connectors/types';
import { recordSourceHealth } from './source-health';
import { recordConfirmedPrice } from './price-history-store';
import { parseSteamDiscovery, getDiscovery, calculateRelevanceScore, assignExplainBadge, isHighSignalDiscoveryGame } from './discovery';
import { resolveGameArtwork } from './game-images';

const STEAM_STORE = 'https://store.steampowered.com/api';
const CHEAPSHARK = 'https://www.cheapshark.com/api/1.0';
const CLIENT_ID = 'SafeLoot/2.0 (+https://ludopreco-br.rlima614331.chatgpt.site)';

export type LiveGame = {
  store?: string;
  storeId?: string;
  dealId?: string;
  appId?: number;
  id: number;
  title: string;
  image: string;
  headerImage: string;
  finalPrice: number | null;
  originalPrice: number | null;
  currency: string;
  discount: number;
  score: number | null;
  reviews?: number;
  released?: string;
  tags?: string[];
  windows: boolean;
  mac: boolean;
  linux: boolean;
  expiresAt: number | null;
  storeUrl: string;
  priceStatus?: 'confirmed' | 'unconfirmed';
  verifiedAt?: string;
  dealScore?: number;
  explainBadge?: string;
};

export type LiveOffer = {
  gameId?: number;
  gameTitle?: string;
  kind?: 'official' | 'key' | 'unknown';
  totalPrice?: number;
  feesIncluded?: boolean;
  activationInBrazil?: boolean;
  activationRestriction?: string;
  paymentMethods?: string[];
  installments?: string;
  coupon?: string;
  cashback?: string;
  affiliate?: boolean;
  launcher?: string;
  edition?: string;
  id: string;
  store: string;
  region: 'Brasil' | 'Global' | 'LATAM';
  finalPrice: number;
  originalPrice: number;
  currency: 'BRL' | 'USD';
  discount: number;
  url: string;
  source: string;
  verifiedAt?: string;
  available?: boolean;
};

export type GameDetails = {
  linuxNative?: boolean;
  steamDeck?: { status: 'Verified' | 'Playable' | 'Unsupported'; sourceUrl: string };
  protonDB?: { rating: string; sourceUrl: string };
  cloud?: { provider: string; sourceUrl: string }[];
  subscriptions?: { provider: string; sourceUrl: string }[];
  criticUrl?: string;
  trailer?: OfficialTrailer;
  kind?: string;
  dlcIds?: number[];
  baseGame?: { id: number; name: string };
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

async function fetchJson<T>(url: string, headers?: HeadersInit, timeoutMs = 4000): Promise<T> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');
  requestHeaders.set('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.7');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: requestHeaders,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Fonte respondeu com status ${response.status}.`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
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
    store: 'Steam',
    storeId: 'steam',
    id,
    appId: id,
    title: textValue(item.name, 'Jogo sem título'),
    image: resolveGameArtwork({ appId: id, image: textValue(item.large_capsule_image) || textValue(item.header_image) }, 'hero'),
    headerImage: resolveGameArtwork({ appId: id, image: textValue(item.header_image) || textValue(item.large_capsule_image) }, 'card'),
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
    priceStatus: 'confirmed',
    verifiedAt: new Date().toISOString(),
  };
}

const EDITION_KEYWORDS = [
  'deluxe',
  'ultimate',
  'gold',
  'goty',
  'game of the year',
  'definitive',
  'complete',
  'remastered',
  'directors cut',
  "director's cut",
  'anniversary',
  'bundle',
  'premium',
  'enhanced',
  'legendary',
  'collector',
];

export function extractEdition(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('game of the year') || lower.includes('goty')) return 'goty';
  if (lower.includes("director's cut") || lower.includes('directors cut')) return "director's cut";
  for (const kw of EDITION_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return 'standard';
}

function hashToNegativeId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return -Math.abs(hash || 1);
}

let highlightsCache: {
  data: {
    featured: LiveGame[];
    trending: LiveGame[];
    updatedAt: string;
    source: string;
  };
  expiresAt: number;
} | null = null;

export async function getHighlights() {
  if (highlightsCache && highlightsCache.expiresAt > Date.now()) {
    return highlightsCache.data;
  }

  try {
    const [featuredDataResult, specialsSearchResult, discoveryResult] = await Promise.allSettled([
      fetchJson<JsonRecord>(`${STEAM_STORE}/featuredcategories?cc=BR&l=brazilian`, undefined, 3500),
      (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
          const params = new URLSearchParams({
            start: '0',
            count: '50',
            specials: '1',
            category1: '998',
            cc: 'BR',
            l: 'brazilian',
            infinite: '1',
            filter: 'topsellers',
          });
          const res = await fetch(`https://store.steampowered.com/search/results/?${params}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
              Accept: 'application/json, text/javascript, */*; q=0.01',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            signal: controller.signal,
          });
          if (!res.ok) return [];
          const json = (await res.json()) as { results_html?: string };
          return parseSteamDiscovery(json.results_html || '');
        } catch {
          return [];
        } finally {
          clearTimeout(timer);
        }
      })(),
      Promise.race([
        getDiscovery(),
        new Promise<{ shelves: any[]; updatedAt: string }>((resolve) =>
          setTimeout(() => resolve({ shelves: [], updatedAt: new Date().toISOString() }), 2500),
        ),
      ]),
    ]);

    const featuredData = featuredDataResult.status === 'fulfilled' ? featuredDataResult.value : {};
    const specials = (featuredData.specials as JsonRecord | undefined)?.items;
    const topSellers = (featuredData.top_sellers as JsonRecord | undefined)?.items;

    const spotlightFeatured = Array.isArray(specials)
      ? specials.filter((item): item is JsonRecord => typeof item === 'object' && item !== null && item.type === 0 && item.currency === 'BRL').map(mapSteamCard)
      : [];

    const trendingRaw = Array.isArray(topSellers)
      ? topSellers.filter((item): item is JsonRecord => typeof item === 'object' && item !== null && item.type === 0 && item.currency === 'BRL').map(mapSteamCard)
      : [];
    const seenTrending = new Set<string>();
    const trending: LiveGame[] = [];
    for (const t of trendingRaw) {
      const titleNorm = t.title.toLowerCase().trim();
      const key = `${t.id}-${titleNorm}`;
      if (!seenTrending.has(key) && !seenTrending.has(titleNorm)) {
        seenTrending.add(key);
        seenTrending.add(titleNorm);
        trending.push(t);
      }
    }

    const steamReviewsMap = new Map<number, { reviews?: number; positive?: number; released?: string; tags?: string[] }>();
    if (specialsSearchResult.status === 'fulfilled') {
      for (const d of specialsSearchResult.value) {
        if (d.appId) {
          steamReviewsMap.set(d.appId, { reviews: d.reviews, positive: d.positive, released: d.released, tags: d.tags });
        }
      }
    }

    for (const s of spotlightFeatured) {
      const match = steamReviewsMap.get(s.id);
      if (match) {
        s.reviews = match.reviews;
        s.score = match.positive ?? s.score;
        s.released = match.released;
        s.tags = match.tags;
      }
    }

    const candidatePool: LiveGame[] = [...spotlightFeatured];

    // Add Steam specials search
    if (specialsSearchResult.status === 'fulfilled') {
      for (const d of specialsSearchResult.value) {
        const appId = d.appId || Number(d.id.replace('steam-', ''));
        if (appId > 0) {
          candidatePool.push({
            id: appId,
            dealId: d.id,
            title: d.title,
            image: resolveGameArtwork({ appId, image: d.image }, 'hero'),
            headerImage: resolveGameArtwork({ appId, image: d.image }, 'card'),
            finalPrice: d.price,
            originalPrice: d.original,
            currency: 'BRL',
            discount: d.discount,
            score: d.positive ?? null,
            reviews: d.reviews,
            released: d.released,
            tags: d.tags,
            windows: true,
            mac: false,
            linux: false,
            expiresAt: null,
            store: 'Steam',
            storeId: 'steam',
            storeUrl: d.url,
            priceStatus: 'confirmed',
            verifiedAt: d.verifiedAt || new Date().toISOString(),
          });
        }
      }
    }

    // Add multi-store discovery deals (Nuuvem, GMG, Epic, etc.)
    if (discoveryResult.status === 'fulfilled') {
      for (const shelf of discoveryResult.value.shelves) {
        for (const d of shelf.games) {
          // Skip unconfirmed prices or missing prices for the primary deal highlights
          if (d.priceStatus === 'unconfirmed' || d.price === null) continue;
          const appId = d.appId || (d.id.startsWith('steam-') ? Number(d.id.replace('steam-', '')) : undefined);
          const gameId = (appId && appId > 0) ? appId : hashToNegativeId(d.id || d.title);
          candidatePool.push({
            id: gameId,
            dealId: d.id,
            appId,
            title: d.title,
            image: resolveGameArtwork({ appId, image: d.image }, 'hero'),
            headerImage: resolveGameArtwork({ appId, image: d.image }, 'card'),
            finalPrice: d.price,
            originalPrice: d.original,
            currency: 'BRL',
            discount: d.discount,
            score: d.positive ?? null,
            reviews: d.reviews,
            released: d.released,
            tags: d.tags,
            windows: true,
            mac: false,
            linux: false,
            expiresAt: d.endsAt ? Date.parse(d.endsAt) : null,
            store: d.store,
            storeId: d.storeId || (d.store.toLowerCase().includes('nuuvem') ? 'nuuvem' : d.store.toLowerCase().includes('green man') ? 'gmg' : d.store.toLowerCase().includes('epic') ? 'epic' : 'steam'),
            storeUrl: d.url,
            priceStatus: 'confirmed',
            verifiedAt: d.verifiedAt || new Date().toISOString(),
          });
        }
      }
    }

    // Score and filter candidates using deterministic model and anti-shovelware rules
    const scoredCandidates: { game: LiveGame; score: number }[] = [];
    for (const game of candidatePool) {
      const isSpotlight = spotlightFeatured.some((s) => s.id === game.id);
      const isTopSeller = trending.some((t) => t.id === game.id);

      const dealForScore = {
        id: String(game.id),
        title: game.title,
        image: game.image,
        store: game.store || 'Steam',
        price: game.finalPrice,
        original: game.originalPrice,
        discount: game.discount || 0,
        url: game.storeUrl || '',
        positive: game.score ?? (game.store === 'Steam' ? undefined : 80),
        reviews: game.reviews ?? (isTopSeller ? 5000 : undefined),
        tags: game.tags || [],
        released: game.released,
      };

      if (!isHighSignalDiscoveryGame(dealForScore)) {
        continue;
      }

      const score = calculateRelevanceScore(dealForScore, { isTopSeller, isSpotlight });
      game.dealScore = score;
      game.explainBadge = assignExplainBadge(dealForScore);
      scoredCandidates.push({ game, score });
    }

    // Edition-safe deduplication:
    // If same game has valid appId > 0, compare editions.
    // If same edition: keep the offer with lowest confirmed finalPrice (or higher score).
    // If distinct editions (e.g. Standard vs Deluxe vs Complete): keep BOTH!
    const deduplicated = new Map<string, { game: LiveGame; score: number }>();
    for (const item of scoredCandidates) {
      const { game, score } = item;
      if (game.id > 0) {
        const editionKey = `${game.id}-${extractEdition(game.title)}`;
        const existing = deduplicated.get(editionKey);
        if (!existing) {
          deduplicated.set(editionKey, { game, score });
        } else {
          const currentPrice = game.finalPrice ?? Infinity;
          const existingPrice = existing.game.finalPrice ?? Infinity;
          if (currentPrice < existingPrice) {
            deduplicated.set(editionKey, { game, score: Math.max(score, existing.score) });
          } else if (currentPrice === existingPrice && (game.discount || 0) > (existing.game.discount || 0)) {
            deduplicated.set(editionKey, { game, score: Math.max(score, existing.score) });
          }
        }
      } else {
        const uniqueKey = `deal-${game.dealId || game.storeUrl || game.title}`;
        if (!deduplicated.has(uniqueKey)) {
          deduplicated.set(uniqueKey, { game, score });
        }
      }
    }

    // Sort by deterministic relevance score descending
    const sorted = [...deduplicated.values()].sort((a, b) => b.score - a.score);

    // Apply franchise diversity:
    // In top 8 (hero view): strictly max 1 game per franchise to avoid franchise fatigue
    // Any sequels are deferred to position 9+
    // Overall list: max 2 games per franchise
    const franchiseCounts = new Map<string, number>();
    const getFranchise = (t: string) => {
      const raw = t.split(/[:\-_—]/)[0].trim().toLowerCase();
      const cleaned = raw.replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x|\d+|remastered|definitive|edition|deluxe|complete|goty)\b/gi, '').trim().replace(/\s+/g, ' ');
      return cleaned || raw;
    };
    const featured: LiveGame[] = [];
    const deferredSequels: LiveGame[] = [];

    for (const item of sorted) {
      const franchise = getFranchise(item.game.title);
      const count = franchiseCounts.get(franchise) || 0;
      if (featured.length < 8) {
        if (count === 0) {
          franchiseCounts.set(franchise, 1);
          featured.push(item.game);
        } else if (count < 2) {
          deferredSequels.push(item.game);
        }
      } else {
        if (count < 2 || featured.length >= 25) {
          franchiseCounts.set(franchise, count + 1);
          featured.push(item.game);
        }
      }
    }

    for (const game of deferredSequels) {
      const franchise = getFranchise(game.title);
      const count = franchiseCounts.get(franchise) || 0;
      if (count < 2 || featured.length >= 25) {
        franchiseCounts.set(franchise, count + 1);
        featured.push(game);
      }
    }

    if (!featured.length && !trending.length) {
      if (highlightsCache) return highlightsCache.data;
      throw new Error('A vitrine não retornou jogos agora.');
    }

    const payload = {
      featured,
      trending,
      updatedAt: new Date().toISOString(),
      source: 'Ofertas confirmadas — Brasil',
    };

    highlightsCache = {
      data: payload,
      expiresAt: Date.now() + 300_000,
    };

    return payload;
  } catch (error) {
    if (highlightsCache) {
      return highlightsCache.data;
    }
    throw error;
  }
}

export async function searchSteamGames(query: string) {
  const params = new URLSearchParams({ term: query, cc: 'BR', l: 'brazilian' });
  const data = await fetchJson<JsonRecord>(`${STEAM_STORE}/storesearch/?${params}`);
  const items = Array.isArray(data.items) ? data.items : [];
  const results = items
    .filter((item): item is JsonRecord => typeof item === 'object' && item !== null && item.type === 'app')
    .slice(0, 100)
    .map((item) => {
      const price = typeof item.price === 'object' && item.price !== null ? item.price as JsonRecord : {};
      const platforms = typeof item.platforms === 'object' && item.platforms !== null ? item.platforms as JsonRecord : {};
      const isFree = item.is_free === true;
      return mapSteamCard({
        ...item,
        original_price: isFree ? 0 : regionalAmount(price.initial, price.currency) === null ? null : price.initial,
        final_price: isFree ? 0 : regionalAmount(price.final, price.currency) === null ? null : price.final,
        currency: 'BRL',
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
  const cheapParams = new URLSearchParams({ steamAppID: String(appId), pageSize: '20', sortBy: 'Price' });
  const [steamResult, dealsResult, storesResult, itadResult] = await Promise.allSettled([
    getSteamResult({ appId, title, canonicalTitle: title }),
    fetchJson<JsonRecord[]>(`${CHEAPSHARK}/deals?${cheapParams}`, { 'User-Agent': CLIENT_ID }),
    getCheapSharkStores(),
    getItadOffers(appId),
  ]);

  let details: GameDetails = {
    id: appId,
    title,
    description: '',
    image: resolveGameArtwork({ appId }, 'hero'),
    genres: [],
    developers: [],
    releaseDate: '',
    score: null,
    trailer: officialTrailer(appId),
  };
  const offers: LiveOffer[] = [];
  const storeResults: StoreResult[] = [];

  if (steamResult.status === 'fulfilled') {
    storeResults.push(steamResult.value.result);
    const data = steamResult.value.data;
    if (data) {
      const genres = Array.isArray(data.genres) ? data.genres : [];
      const metacritic = typeof data.metacritic === 'object' && data.metacritic !== null ? data.metacritic as JsonRecord : null;
      const releaseDate = typeof data.release_date === 'object' && data.release_date !== null ? data.release_date as JsonRecord : null;
      details = {
        kind: textValue(data.type),
        linuxNative: (data.platforms as { linux?: boolean } | undefined)?.linux === true,
        dlcIds: Array.isArray(data.dlc) ? data.dlc.filter((id): id is number => typeof id === 'number' && id > 0).slice(0, 24) : [],
        baseGame: data.fullgame as { id: number; name: string } | undefined,
        id: appId,
        title: textValue(data.name, title),
        description: stripHtml(data.short_description),
        image: textValue(data.header_image) || resolveGameArtwork({ appId }, 'hero'),
        genres: genres.map((genre) => typeof genre === 'object' && genre !== null ? textValue((genre as JsonRecord).description) : '').filter(Boolean),
        developers: Array.isArray(data.developers) ? data.developers.map((name) => textValue(name)).filter(Boolean) : [],
        releaseDate: textValue(releaseDate?.date),
        score: typeof metacritic?.score === 'number' && Number.isFinite(metacritic.score) && metacritic.score >= 0 && metacritic.score <= 100 ? metacritic.score : null,
        criticUrl: criticUrl(metacritic?.url),
        trailer: officialTrailer(appId),
      };
      const connectorInput = {
        appId,
        title,
        canonicalTitle: details.title,
        kind: details.kind,
        baseGameName: details.baseGame?.name,
      };
      const secondary = await Promise.allSettled([
        getGamersGateResult(connectorInput),
        getGogResult(connectorInput),
        getHypeResult(connectorInput),
        getNuuvemResult(connectorInput),
        getEpicResult(connectorInput),
        getEnebaResult(connectorInput),
        getKinguinResult(connectorInput),
      ]);
      for (const [index,result] of secondary.entries()) {
        if (result.status === 'fulfilled') storeResults.push(result.value);
        else storeResults.push({ store: ['GamersGate','GOG','Hype Games','Nuuvem','Epic Games','Eneba','Kinguin'][index], status: 'unavailable', diagnostic: 'Falha isolada do conector.' });
      }
    }
  } else {
    storeResults.push({ store: 'Steam', status: 'unavailable', diagnostic: 'Steam temporariamente indisponível.' });
  }

  let persistenceFailures = 0;
  let recorded = 0;
  for (const result of storeResults) {
    const offer = resultToOffer(result);
    if (offer) offers.push(offer);
    try {
      if (await recordConfirmedPrice(appId, details.title || title, result)) recorded++;
      if (result.store !== 'Nuuvem') await recordSourceHealth({ store:result.store,status:result.status,responded:result.status!=='unavailable',
        durationMs:0,checkedAt:new Date().toISOString(),priceExtracted:!!offer });
    } catch { persistenceFailures++; console.error('Price or source health persistence failed'); }
  }

  if (itadResult.status === 'fulfilled') {
    for (const offer of itadResult.value) {
      if (!offers.some(existing => existing.currency === 'BRL' && existing.store.toLowerCase() === offer.store.toLowerCase())) offers.push(offer);
    }
  }

  if (dealsResult.status === 'fulfilled') {
    const storeNames = new Map<string, string>();
    if (storesResult.status === 'fulfilled') {
      for (const store of storesResult.value) storeNames.set(textValue(store.storeID), textValue(store.storeName, 'Loja parceira'));
    }
    for (const deal of dealsResult.value) {
      const storeId = textValue(deal.storeID);
      if (storeId === '1' || offers.some(offer => offer.currency === 'BRL' && offer.store === storeNames.get(storeId))) continue;
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
    collection: { recorded, persistenceFailures },
    game: details,
    offers: offers.map(offer => { let affiliate = false; try { affiliate = affiliateDestination(offer).affiliate; } catch { /* Bad optional tracking must not break comparison. */ } return { ...offer, gameId: appId, gameTitle: details.title, affiliate }; }).sort((a, b) => (a.currency === b.currency ? a.finalPrice - b.finalPrice : a.currency === 'BRL' ? -1 : 1)),
    updatedAt: new Date().toISOString(),
    integrations: { itad: !itadEnabled() ? 'not-configured' : itadResult.status === 'fulfilled' ? 'ready' : 'unavailable' },
    sources: [
      ...(storeResults.some((result) => result.store === 'Nuuvem' && result.status === 'confirmed') ? ['Nuuvem Brasil'] : []),
      ...(itadEnabled() && itadResult.status === 'fulfilled' ? ['IsThereAnyDeal'] : []),
      ...(steamResult.status === 'fulfilled' ? ['Steam Store'] : []),
      ...(dealsResult.status === 'fulfilled' ? ['CheapShark'] : []),
      ...(offers.some((offer) => offer.store === 'GamersGate' && offer.currency === 'BRL') ? ['GamersGate Brasil'] : []),
      ...(storeResults.some((result) => result.store === 'GOG' && result.status === 'confirmed') ? ['GOG Brasil'] : []),
      ...(storeResults.some((result) => result.store === 'Hype Games' && result.status === 'confirmed') ? ['Hype Games Brasil'] : []),
    ],
    coverage: [
      ...storeResults.map((result) => ({
        store: result.store,
        status: result.status,
        diagnostic: result.diagnostic,
        productUrl: result.offer?.productUrl,
      })),
      ...(itadEnabled() ? [{ store: 'IsThereAnyDeal', available: itadResult.status === 'fulfilled' }] : []),
    ],
  };
}

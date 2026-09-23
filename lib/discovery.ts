import { affiliateDestination } from './affiliate';
import type { LiveOffer } from './game-api';
import { decodeEntities, cleanTitle } from './regional-prices';
import { getGiveaways } from './giveaways';
import { database } from './db';
export type DiscoveryDeal = {
  id: string;
  title: string;
  image: string;
  store: string;
  storeId?: string;
  price: number | null;
  original: number | null;
  discount: number;
  url: string;
  appId?: number;
  positive?: number;
  reviews?: number;
  tags: string[];
  endsAt?: string;
  affiliate?: boolean;
  priceStatus?: 'confirmed' | 'unconfirmed';
  verifiedAt?: string;
  badge?: string;
  score?: number;
  released?: string;
};
export type DiscoveryShelf = { id: string; storeId?: string; title: string; description: string; games: DiscoveryDeal[]; status: 'ready' | 'unavailable' | 'empty' };
const plain = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g,' ').trim();
export function discoveryOffer(game: DiscoveryDeal): LiveOffer {
  return {
    id: game.id,
    store: game.store,
    finalPrice: game.price ?? 0,
    originalPrice: game.original ?? 0,
    discount: game.discount,
    currency: 'BRL',
    region: 'Brasil',
    url: game.url,
    source: 'Catálogo direto da loja',
    verifiedAt: game.verifiedAt,
    available: game.priceStatus !== 'unconfirmed' && game.price !== null,
  };
}
const unique = (games: DiscoveryDeal[]) => [...new Map(games.map(game => [game.id, game])).values()];
const brl = (value: string) => Number(value.replace(/R\$|\s|\./g,'').replace(',','.'));

export function isHighSignalDiscoveryGame(game: DiscoveryDeal): boolean {
  if (!game || !game.title) return false;
  // Anti-shovelware: filter out non-game products, prologue, tests, soundtracks, demo, etc.
  if (/(\bdemo\b|\bprologue\b|\bplaytest\b|\bbenchmark\b|\bsoundtrack\b|\bost\b|\bartbook\b|\bseason pass\b|\bexpansion pack\b|\bserver\b)/i.test(game.title)) {
    return false;
  }
  // Must have a valid price (or be an Epic free giveaway)
  if (game.price === null || (game.price === 0 && game.store !== 'Epic Games')) {
    return false;
  }
  // If review sentiment is known, require at least 70% positive
  if (game.positive !== undefined && game.positive < 70) {
    return false;
  }
  // Minimum review count to filter zero-engagement / asset flips
  if (game.reviews !== undefined) {
    if (game.reviews < 100) return false;
    if (game.reviews < 350 && (game.positive ?? 0) < 85) return false;
  }
  return true;
}

export function calculateRelevanceScore(
  game: DiscoveryDeal,
  options: { isTopSeller?: boolean; isSpotlight?: boolean } = {}
): number {
  const revs = game.reviews ?? 100;
  const logRevs = Math.log10(Math.max(1, revs));
  let score = logRevs * 16;

  const positive = game.positive ?? 75;
  score += Math.max(0, (positive - 70) * 1.0);

  const discount = game.discount || 0;
  score += discount * 0.35;

  if (game.price !== null && game.price > 0 && game.price <= 35) {
    score += 10;
  }
  if (game.price === 0 && game.store === 'Epic Games') {
    score += 35;
  }
  if (options.isTopSeller) score += 25;
  if (options.isSpotlight) score += 20;

  return Math.round(score);
}

export function assignExplainBadge(game: DiscoveryDeal): string {
  if (game.price === 0 && game.store === 'Epic Games') return 'Grátis';
  if ((game.discount || 0) >= 70) return `-${game.discount}% OFF`;
  if ((game.positive || 0) >= 95 && (game.reviews || 0) >= 1500) return '95%+ Positivas';
  if (game.tags.includes('Co-op')) return 'Co-op';
  if (game.tags.includes('Roguelike')) return 'Roguelike';
  if (game.price !== null && game.price <= 20) return 'Até R$ 20';
  if ((game.discount || 0) >= 50) return `-${game.discount}% OFF`;
  if ((game.positive || 0) >= 80) return `${game.positive}% Positivas`;
  return 'Em Alta';
}

export function applyDiscoveryDiversity(games: DiscoveryDeal[], maxPerFranchise = 2): DiscoveryDeal[] {
  const franchiseCounts = new Map<string, number>();
  const getRoot = (t: string) => {
    const raw = t.split(/[:\-_—]/)[0].trim().toLowerCase();
    const cleaned = raw.replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x|\d+|remastered|definitive|edition|deluxe|complete|goty)\b/gi, '').trim().replace(/\s+/g, ' ');
    return cleaned || raw;
  };
  const result: DiscoveryDeal[] = [];

  for (const game of games) {
    const root = getRoot(game.title);
    const count = franchiseCounts.get(root) || 0;
    if (count < maxPerFranchise || result.length >= 25) {
      franchiseCounts.set(root, count + 1);
      result.push(game);
    }
  }
  return result;
}

export function parseSteamDiscovery(html: string): DiscoveryDeal[] {
  const games: DiscoveryDeal[] = [];
  for (const match of html.matchAll(/<a\b[^>]*class="[^"]*search_result_row[^"]*"[^>]*>[\s\S]*?<\/a>/g)) {
    const card = match[0], app = card.match(/data-ds-appid="(\d+)"/)?.[1];
    if (!app || !card.includes(`data-ds-itemkey="App_${app}"`)) continue;
    const title = plain(card.match(/<span class="title">([\s\S]*?)<\/span>/)?.[1] || '');
    const raw = card.match(/data-price-final="(\d+)"/)?.[1];
    const visible = plain(card.match(/class="discount_final_price">([^<]+)/)?.[1] || '');
    if (!title || !raw || !visible.startsWith('R$')) continue;
    const price = Number(raw)/100;
    if (!Number.isFinite(price) || price <= 0 || Math.abs(brl(visible)-price) > .001) continue;
    const old = plain(card.match(/class="discount_original_price">([^<]+)/)?.[1] || '');
    const original = old.startsWith('R$') ? brl(old) : price;
    const tooltip = plain(card.match(/data-tooltip-html="([^"]+)"/)?.[1] || '');
    const review = tooltip.match(/(\d+)% das? ([\d.,]+) an/);
    const positive = review ? Number(review[1]) : undefined, reviews = review ? Number(review[2].replace(/[.,]/g,'')) : undefined;
    const tags = JSON.parse(card.match(/data-ds-tagids="(\[[\d,]*\])"/)?.[1] || '[]') as number[];
    const released = plain(card.match(/class="[^"]*search_released[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '');

    const tagNames: string[] = [];
    if (tags.includes(492)) tagNames.push('Indie');
    if (tags.includes(1716) || tags.includes(3959)) tagNames.push('Roguelike');
    if (tags.includes(122)) tagNames.push('RPG');
    if (tags.includes(3859) || tags.includes(3843) || tags.includes(1685)) tagNames.push('Co-op');
    if (tags.includes(19)) tagNames.push('Ação');
    if (tags.includes(1667)) tagNames.push('Terror');
    if (tags.includes(1695)) tagNames.push('Mundo Aberto');
    if (tags.includes(42804)) tagNames.push('Soulslike');
    if (tags.includes(1628)) tagNames.push('Metroidvania');

    const discount = Math.round((1-price/original)*100);
    const deal: DiscoveryDeal = {
      id:`steam-${app}`,
      appId:Number(app),
      title,
      image:card.match(/<img[^>]*src="([^"]+)"/)?.[1] || '',
      store:'Steam',
      storeId:'steam',
      price,
      original,
      discount,
      url:`https://store.steampowered.com/app/${app}/?cc=br&l=brazilian`,
      positive,
      reviews,
      tags: tagNames,
      priceStatus: 'confirmed',
      verifiedAt: new Date().toISOString(),
      released,
    };
    deal.badge = assignExplainBadge(deal);
    deal.score = calculateRelevanceScore(deal);
    games.push(deal);
  }
  return unique(games);
}

export const KNOWN_NUUVEM_SLUGS: Record<string, number> = {
  'lego-marvels-avengers': 405310,
  'lego-marvel-super-heroes-2': 647830,
  'lego-dc-super-villains': 829110,
  'lego-star-wars-the-skywalker-saga': 920210,
  'middle-earth-shadow-of-war': 356190,
  'middle-earth-shadow-of-mordor': 241930,
  'mad-max': 234140,
  'injustice-2': 627270,
  'suicide-squad-kill-the-justice-league': 315210,
  'back-4-blood': 924970,
  'silent-hill-2': 2124490,
  'resident-evil-4-remake': 2050650,
  'resident-evil-4': 254700,
  'resident-evil-2': 883710,
  'resident-evil-3': 952060,
  'resident-evil-7-biohazard': 418370,
  'resident-evil-village': 1196590,
  'monster-hunter-world': 582010,
  'monster-hunter-rise': 1446780,
  'street-fighter-6': 1364780,
  'dragons-dogma-2': 2054970,
  'devil-may-cry-5': 601150,
  'cyberpunk-2077': 1091500,
  'the-witcher-3-wild-hunt': 292030,
  'the-witcher-3-wild-hunt-complete-edition': 292030,
  'elden-ring': 1245620,
  'dark-souls-iii': 374320,
  'dark-souls-remastered': 570940,
  'sekiro-shadows-die-twice': 814380,
  'armored-core-vi-fires-of-rubicon': 1888160,
  'it-takes-two': 1426210,
  'slay-the-spire': 646570,
  'hades': 1145360,
  'dead-cells': 588650,
  'celeste': 504230,
  'hollow-knight': 367520,
  'god-of-war': 1593500,
  'marvels-spider-man-remastered': 1817070,
  'horizon-zero-dawn-complete-edition': 1151640,
  'days-gone': 1259420,
  'ghost-of-tsushima-directors-cut': 2215430,
  'helldivers-2': 553850,
  'baldurs-gate-3': 1086940,
  'red-dead-redemption-2': 1174180,
  'grand-theft-auto-v': 271590,
  'gta-v': 271590,
  'hogwarts-legacy': 990080,
  'mortal-kombat-1': 1971870,
  'mortal-kombat-11': 976310,
  'batman-arkham-knight': 208650,
  'tekken-8': 1778820,
  'persona-5-royal': 1687950,
  'persona-3-reload': 2161700,
  'lies-of-p': 1627720,
  'control': 870780,
  'death-stranding': 1190460,
  'death-stranding-directors-cut': 1850570,
  'disco-elysium': 632470,
  'frostpunk': 323190,
  'frostpunk-2': 1601580,
  'manor-lords': 1363080,
  'black-myth-wukong': 2358720,
  'palworld': 1623730,
  'enshrouded': 1203620,
};

export function resolveNuuvemAppId(slug: string, _title: string): number | undefined {
  if (KNOWN_NUUVEM_SLUGS[slug]) return KNOWN_NUUVEM_SLUGS[slug];
  const cleaned = slug
    .replace(/-(standard|deluxe|gold|ultimate|complete|goty|definitive|anniversary|remastered|directors-cut|premium|enhanced|legendary|edition|bundle|pre-venda)(-(edition|bundle|cut|[0-9]+th-anniversary))*$/i, '')
    .replace(/-pc$/, '');
  if (KNOWN_NUUVEM_SLUGS[cleaned]) return KNOWN_NUUVEM_SLUGS[cleaned];
  return undefined;
}

export function parseNuuvemDiscovery(html: string): DiscoveryDeal[] {
  const games: DiscoveryDeal[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href="https:\/\/www\.nuuvem\.com\/br-pt\/item\/[^"]+"[^>]*>\s*<article\b[\s\S]*?<\/article>\s*<\/a>/g)) {
    const card = match[0];
    if (!/class="[^"]*\bproduct__purchasable\b/.test(card)) continue;
    const platforms = plain(card.match(/<ul class="platform-tags">([\s\S]*?)<\/ul>/)?.[1] || '');
    if (!/\b(Windows|Linux|Mac)\b/i.test(platforms)) continue;
    try {
      const tracking = JSON.parse(decodeEntities(card.match(/data-default-tracker-product-tracking-data-param="([^"]+)"/)?.[1] || '{}'));
      const price = JSON.parse(decodeEntities(card.match(/\bdata-price="([^"]+)"/)?.[1] || '{}'));
      const base = JSON.parse(decodeEntities(card.match(/\bdata-base-price="([^"]+)"/)?.[1] || '{}'));
      if (tracking.currency !== 'BRL' || typeof tracking.name !== 'string' || !Number.isSafeInteger(price.v) || price.v <= 0) continue;
      if (price.e && (!Number.isFinite(Date.parse(price.e)) || Date.parse(price.e)<=Date.now())) continue;
      const url = new URL(tracking.url);
      if (url.origin !== 'https://www.nuuvem.com' || !/^\/br-pt\/item\/[a-z0-9-]+$/.test(url.pathname)) continue;
      if (/cart[aã]o|gift[- ]?card|game[- ]?pass|assinatura|\bvp\b|valorant|moedas|pontos|credits|points|coins|v-bucks|robux/i.test(tracking.name) || /gift[- ]?card|valorant/i.test(url.pathname)) continue;
      const slug = url.pathname.replace(/^\/br-pt\/item\//, '');
      const appId = resolveNuuvemAppId(slug, tracking.name);
      const amount = price.v/100, original = Number.isSafeInteger(base.v) && base.v >= price.v ? base.v/100 : amount;
      games.push({
        id: `nuuvem-${tracking.id}`,
        appId,
        title: tracking.name,
        image: tracking.image_url,
        store: 'Nuuvem',
        storeId: 'nuuvem',
        price: amount,
        original,
        discount: Math.round((1 - amount / original) * 100),
        url: url.toString(),
        tags: [],
        priceStatus: 'confirmed',
        verifiedAt: new Date().toISOString(),
      });
    } catch { /* A malformed card is not an offer. */ }
  }
  return unique(games);
}

export const KNOWN_GMG_SLUGS: Record<string, number> = {
  'trials-of-mana': 924980,
  'cities-skylines-ii': 949230,
  'tactics-ogre-reborn': 1451090,
  'planetary-annihilation-titans': 386070,
  'stalker-2-heart-of-chornobyl': 1643320,
  'valkyrie-elysium': 1963210,
  'live-a-live': 2014380,
  'visions-of-mana': 2490990,
  'heroes-of-might-and-magic-olden-era': 3105440,
};

export function parseGmgDiscovery(html: string): DiscoveryDeal[] {
  const starts = [...html.matchAll(/<div ng-controller="GameViewController" ng-init="initialize\(([^"]+)"/g)];
  const games: DiscoveryDeal[] = [];
  for (let i=0;i<starts.length;i++) {
    const card = html.slice(starts[i].index, starts[i+1]?.index ?? html.length);
    try {
      const args = JSON.parse(`[${decodeEntities(starts[i][1]).replace(/\);\s*$/, '')}]`);
      const p = args[0];
      if (args[1]?.Name !== 'PC' || p.IsOutOfStock !== false || p.IsComingSoon !== false || p.IsPrepurchase !== false || typeof p.GameName !== 'string') continue;
      const display = card.match(/<gmgPrice\b[^>]*type="currentPrice"[^>]*currency="'BRL'"[^>]*>([\s\S]*?)<\/gmgPrice>/)?.[1];
      if (!display || typeof p.Price !== 'number' || !Number.isFinite(p.Price) || p.Price<=0 || Math.abs(brl(plain(display))-p.Price)>.001) continue;
      if (typeof p.Url !== 'string' || !/^\/games\/[a-z0-9-]+\/$/.test(p.Url)) continue;
      const original = typeof p.OldPrice === 'number' && Number.isFinite(p.OldPrice) && p.OldPrice >= p.Price ? p.OldPrice : p.Price;
      const slug = p.Url.replace(/^\/games\/|\/$/g, '').replace(/-pc$/, '');
      const appId = KNOWN_GMG_SLUGS[slug];
      games.push({
        id:`gmg-${p.Id}`,
        appId,
        title:p.GameName,
        image:p.BigModuleHalfImage || p.CarouselDesktopImage || '',
        store:'Green Man Gaming',
        storeId:'gmg',
        price:p.Price,
        original,
        discount:Math.round((1-p.Price/original)*100),
        url:`https://www.greenmangaming.com/pt${p.Url}`,
        tags:[],
        priceStatus: 'confirmed',
        verifiedAt: new Date().toISOString(),
      });
    } catch { /* Never evaluate storefront JavaScript. */ }
  }
  return unique(games);
}

export const KNOWN_GMG_CATALOG: DiscoveryDeal[] = [
  { id: 'gmg-Heroes-of-Might-and-Magic-Olden-Era_3', appId: 3105440, title: 'Heroes of Might and Magic: Olden Era', image: 'https://images.greenmangaming.com/13853210b89d429492dde1d43094cb8d/29339e57913f4f1ea37ce8df63f39fd2.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/heroes-of-might-and-magic-olden-era-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-Visions-of-Mana_3', appId: 2490990, title: 'Visions of Mana', image: 'https://images.greenmangaming.com/3333e04c96d64fa29840778ff4788b0b/791f18ff90f2402689d6a2176fdafd6d.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/visions-of-mana-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-VALKYRIE-ELYSIUM_3', appId: 1963210, title: 'VALKYRIE ELYSIUM', image: 'https://images.greenmangaming.com/81f02eb85ca9414d90ac9d720b20f29d/29da32338a844332934528401a37883b.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/valkyrie-elysium-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-LIVE-IS-LIVE_3', appId: 2014380, title: 'LIVE A LIVE', image: 'https://images.greenmangaming.com/afcc44ea2615496f8cd16b63233b0898/99cdea01837b4d3dbd631ac05642630e.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/live-a-live-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-Trials-of-Mana_3', appId: 924980, title: 'Trials of Mana', image: 'https://images.greenmangaming.com/3ae47cec654345a18c0a33a22208846e/7d352e01b65b45e2b373f4f83ddbcb22.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/trials-of-mana-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-Car-Dealer-Simulator_3', title: 'Car Dealer Simulator', image: 'https://images.greenmangaming.com/c36b0f0af88746849a16b259bf9c8a2e/6f054ab2d14147bb9ca6adaab6d2f47e.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/car-dealer-simulator-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-Teenage-Mutant-Ninja-Turtles-Splintered-Fate_4', title: 'Teenage Mutant Ninja Turtles: Splintered Fate Bundle', image: 'https://images.greenmangaming.com/32a9f04fe0a54de7bb2d4f95c9323eb0/2e0159724387423a9037b8412564cf29.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/teenage-mutant-ninja-turtles-splintered-fate-bundle-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-Cities-Skylines-II_2', appId: 949230, title: 'Cities: Skylines II', image: 'https://images.greenmangaming.com/eef943ce3542486b9f976bfb4af06a3d/91c2183dd29441c5a27942c779362fb6.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/cities-skylines-ii-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-product_key_4140', appId: 386070, title: 'Planetary Annihilation: TITANS', image: 'https://images.greenmangaming.com/15f8ace96a214faaa704d9ec6de46ea1/a65ce8253f74415a93cc2c4a7155ea86.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/planetary-annihilation-titans-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-Tactics-Ogre-Reborn_3', appId: 1451090, title: 'Tactics Ogre: Reborn', image: 'https://images.greenmangaming.com/c23c2139c55746b09a94aa51e80e005d/f8cec9f3b13a426299054c251ee5e4d3.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/tactics-ogre-reborn-pc/', tags: [], priceStatus: 'unconfirmed' },
  { id: 'gmg-Outlast-Trinity_2', title: 'Outlast Trinity', image: 'https://images.greenmangaming.com/9dbd17b2d6a24f1da6853c472a40de80/2bb7d63701f94485844c0bb9aa3c6429.jpg', store: 'Green Man Gaming', storeId: 'gmg', price: null, original: null, discount: 0, url: 'https://www.greenmangaming.com/pt/games/outlast-trinity-pc/', tags: [], priceStatus: 'unconfirmed' }
];

async function html(url: string, timeoutMs = 2500): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Loja indisponível: HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 3_000_000) throw new Error('Catálogo muito grande');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function steam(extra: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const baseParams: Record<string, string> = {
      start: '0',
      count: '50',
      specials: '1',
      category1: '998',
      cc: 'BR',
      l: 'brazilian',
      infinite: '1',
      ...extra,
    };
    if (!baseParams.filter && !baseParams.sort_by) {
      baseParams.filter = 'topsellers';
    }
    const params = new URLSearchParams(baseParams);
    const response = await fetch(`https://store.steampowered.com/search/results/?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Steam indisponível');
    const data = (await response.json()) as { results_html?: string };
    const games = parseSteamDiscovery(data.results_html || '');
    const filtered = games.filter(
      (game) => (game.positive || 0) >= 80 && (game.reviews || 0) >= 50 && isHighSignalDiscoveryGame(game),
    );
    const scored = filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    return applyDiscoveryDiversity(scored);
  } finally {
    clearTimeout(timer);
  }
}

let cache: { expires: number; shelves: DiscoveryShelf[]; updatedAt: string } | undefined;
let pending: Promise<{ shelves: DiscoveryShelf[]; updatedAt: string }> | undefined;
const lastKnownShelves = new Map<string, DiscoveryDeal[]>();

export async function getDiscovery() {
  if (cache && cache.expires > Date.now()) return { shelves: cache.shelves, updatedAt: cache.updatedAt };
  if (pending) return pending;
  pending = (async () => {
    const sources = [
      {
        id: 'cheap',
        storeId: 'steam',
        title: 'Grandes achados no precinho',
        description: 'Pequenos preços, boas surpresas. Pelo menos 80% de avaliações positivas e engajamento comprovado.',
        load: () => steam({ maxprice: '10' }).then((games) => games.filter((game) => game.price !== null && game.price < 10)),
      },
      {
        id: 'roguelike',
        storeId: 'steam',
        title: 'Roguelike & Desafio',
        description: 'Roguelikes, soulslikes e metroidvanias aclamados em oferta na Steam.',
        load: () => steam({ tags: '1716' }).then((games) => games.filter((game) => game.tags.includes('Roguelike'))),
      },
      {
        id: 'indie',
        storeId: 'steam',
        title: 'Indies consagrados',
        description: 'Grandes sucessos independentes com alta aprovação da comunidade para sair do óbvio.',
        load: () => steam({ tags: '492', maxprice: '30' }).then((games) => games.filter((game) => game.tags.includes('Indie'))),
      },
      {
        id: 'nuuvem',
        storeId: 'nuuvem',
        title: 'Garimpo na Nuuvem',
        description: 'Jogos para PC e preços em reais do catálogo brasileiro.',
        load: async () => {
          try {
            const content = await html('https://www.nuuvem.com/br-pt/catalog', 2000);
            const games = unique(parseNuuvemDiscovery(content)).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
            if (games.length) {
              try {
                const db = await database();
                const rows = await db.prepare('SELECT app_id, title FROM games WHERE app_id > 0').all<{ app_id: number; title: string }>();
                if (rows.results?.length) {
                  const titleMap = new Map<string, number>();
                  for (const r of rows.results) {
                    titleMap.set(cleanTitle(r.title), r.app_id);
                  }
                  for (const g of games) {
                    if (!g.appId) {
                      const found = titleMap.get(cleanTitle(g.title));
                      if (found) g.appId = found;
                    }
                  }
                }
              } catch {}
              return games.map((g) => ({
                ...g,
                badge: assignExplainBadge(g),
                score: calculateRelevanceScore(g),
              }));
            }
          } catch {}
          return lastKnownShelves.get('nuuvem') || [];
        },
      },
      {
        id: 'gmg',
        storeId: 'gmg',
        title: 'Ofertas da Green Man Gaming',
        description: 'Seleção da loja com preços confirmados em BRL. Confira a ativação no produto.',
        load: async () => {
          try {
            const content = await html('https://www.greenmangaming.com/pt/', 2000);
            const games = parseGmgDiscovery(content);
            if (games.length) {
              return games.map((g) => ({
                ...g,
                badge: assignExplainBadge(g),
                score: calculateRelevanceScore(g),
              }));
            }
          } catch {}
          return lastKnownShelves.get('gmg') || [];
        },
      },
      {
        id: 'epic',
        storeId: 'epic',
        title: 'Para resgatar na Epic',
        description: 'Jogos pagos que estão sendo oferecidos de graça por tempo limitado.',
        load: async () => {
          const data = await getGiveaways();
          return data.games.map((game) => ({
            id: `epic-${game.id}`,
            title: game.title,
            image: game.image,
            store: 'Epic Games',
            storeId: 'epic',
            price: 0,
            original: game.originalPrice,
            discount: 100,
            url: game.url,
            tags: [],
            endsAt: game.endsAt,
            priceStatus: 'confirmed' as const,
            verifiedAt: new Date().toISOString(),
            badge: 'Grátis',
            score: 100,
          }));
        },
      },
    ];

    const results = await Promise.allSettled(sources.map((source) => source.load()));
    const shelves: DiscoveryShelf[] = sources.map((source, index) => {
      const result = results[index];
      let games: DiscoveryDeal[] = [];
      if (result.status === 'fulfilled') {
        games = result.value.slice(0, 40).map((game) => {
          let affiliate = false;
          try {
            affiliate = affiliateDestination(discoveryOffer(game)).affiliate;
          } catch {}
          return { ...game, affiliate };
        });
        if (games.length > 0) {
          lastKnownShelves.set(source.id, games);
        }
      } else {
        const cached = lastKnownShelves.get(source.id);
        if (cached && cached.length > 0) {
          games = cached;
        }
      }
      return {
        id: source.id,
        storeId: source.storeId,
        title: source.title,
        description: source.description,
        games,
        status: games.length ? 'ready' : (result.status === 'rejected' ? 'unavailable' : 'empty'),
      };
    });

    const updatedAt = new Date().toISOString();
    cache = { expires: Date.now() + 300000, shelves, updatedAt };
    return { shelves, updatedAt };
  })();

  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}

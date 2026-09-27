import { getGamerPowerGiveaways } from './gamerpower';

export type Giveaway = {
  id: string;
  title: string;
  image: string;
  url: string;
  originalPrice: number;
  endsAt: string;
  store?: string;
  storeId?: string;
  source?: string;
  badge?: string;
};

type EpicGame = {
  id: string;
  title: string;
  offerType: string;
  keyImages: { type: string; url: string }[];
  offerMappings?: { pageSlug: string }[];
  catalogNs?: { mappings?: { pageSlug: string }[] };
  price?: { totalPrice?: { currencyCode: string; originalPrice: number; discountPrice: number } };
  promotions?: { promotionalOffers?: { promotionalOffers: { startDate: string; endDate: string; discountSetting: { discountPercentage: number } }[] }[] };
};

export function activeGiveaways(elements: EpicGame[], now = Date.now()): Giveaway[] {
  return elements.flatMap((game) => {
    const price = game.price?.totalPrice;
    const promotion = game.promotions?.promotionalOffers?.flatMap((group) => group.promotionalOffers).find((offer) => Date.parse(offer.startDate) <= now && Date.parse(offer.endDate) > now && offer.discountSetting.discountPercentage === 0);
    const slug = game.offerMappings?.[0]?.pageSlug ?? game.catalogNs?.mappings?.[0]?.pageSlug;
    if (game.offerType !== 'BASE_GAME' || !promotion || !slug || price?.currencyCode !== 'BRL' || !(price.originalPrice > 0) || price.discountPrice !== 0) return [];
    return [{
      id: game.id,
      title: game.title,
      image: game.keyImages.find((image) => image.type === 'OfferImageWide')?.url ?? game.keyImages[0]?.url ?? '',
      url: `https://store.epicgames.com/pt-BR/p/${encodeURIComponent(slug)}`,
      originalPrice: price.originalPrice / 100,
      endsAt: promotion.endDate,
      store: 'Epic Games',
      storeId: 'epic',
      source: 'Epic Games Store · Brasil',
      badge: 'Grátis na Epic',
    }];
  });
}

function normalizeTitleForComparison(t: string): string {
  return (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function getGiveaways() {
  const [epicResult, gamerPowerResult] = await Promise.allSettled([
    (async () => {
      const response = await fetch(
        'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR',
        { signal: AbortSignal.timeout(6000) }
      );
      if (!response.ok) throw new Error('Não foi possível consultar os jogos grátis da Epic agora.');
      const data = await response.json() as { data?: { Catalog?: { searchStore?: { elements?: EpicGame[] } } } };
      const elements = data.data?.Catalog?.searchStore?.elements;
      if (!Array.isArray(elements)) throw new Error('A Epic não retornou a lista de resgates.');
      return activeGiveaways(elements);
    })(),
    getGamerPowerGiveaways(),
  ]);

  const directEpicGames = epicResult.status === 'fulfilled' ? epicResult.value : [];
  const gamerPowerGames = gamerPowerResult.status === 'fulfilled' ? gamerPowerResult.value : [];

  if (!directEpicGames.length && !gamerPowerGames.length) {
    throw new Error('Nenhum serviço de resgates gratuitos está acessível agora.');
  }

  // Precedence rule: Direct Epic Games Store promotions take precedence over aggregator entries.
  const seenTitles = new Set<string>();
  const combined: Giveaway[] = [];

  for (const game of directEpicGames) {
    seenTitles.add(normalizeTitleForComparison(game.title));
    combined.push(game);
  }

  for (const gp of gamerPowerGames) {
    const norm = normalizeTitleForComparison(gp.cleanTitle);
    if (seenTitles.has(norm)) {
      // Duplicate already covered by higher precedence direct retailer
      continue;
    }
    seenTitles.add(norm);

    combined.push({
      id: `gamerpower-${gp.id}`,
      title: gp.cleanTitle,
      image: gp.image,
      url: gp.url,
      originalPrice: gp.originalPrice,
      endsAt: gp.endDate || '',
      store: gp.store,
      storeId: gp.storeId,
      source: 'GamerPower · Resgate Grátis',
      badge: gp.store === 'Epic Games' ? 'Grátis na Epic' : `Grátis · ${gp.store}`,
    });
  }

  return { games: combined, updatedAt: new Date().toISOString() };
}

export type Giveaway = { id: string; title: string; image: string; url: string; originalPrice: number; endsAt: string };
type EpicGame = {
  id: string; title: string; offerType: string;
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
    return [{ id: game.id, title: game.title, image: game.keyImages.find((image) => image.type === 'OfferImageWide')?.url ?? game.keyImages[0]?.url ?? '', url: `https://store.epicgames.com/pt-BR/p/${encodeURIComponent(slug)}`, originalPrice: price.originalPrice / 100, endsAt: promotion.endDate }];
  });
}

export async function getGiveaways() {
  const response = await fetch('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR', { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error('Não foi possível consultar os jogos grátis da Epic agora.');
  const data = await response.json() as { data?: { Catalog?: { searchStore?: { elements?: EpicGame[] } } } };
  const elements = data.data?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) throw new Error('A Epic não retornou a lista de resgates.');
  return { games: activeGiveaways(elements), updatedAt: new Date().toISOString() };
}

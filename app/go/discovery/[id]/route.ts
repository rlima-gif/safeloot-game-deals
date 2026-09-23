import { affiliateDestination, logOutboundClick } from '@/lib/affiliate';
import { getDiscovery, discoveryOffer } from '@/lib/discovery';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getDiscovery();
  const game = data.shelves.flatMap((shelf) => shelf.games).find((g) => g.id === id);
  if (!game || (game.endsAt && Date.parse(game.endsAt) <= Date.now()))
    return new Response(
      'Esta oferta não está mais disponível. Atualize a vitrine.',
      { status: 404 },
    );

  const dest = affiliateDestination(discoveryOffer(game));
  logOutboundClick({
    store: game.store,
    storeId: game.store.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    appId: game.appId,
    gameTitle: game.title,
    affiliate: dest.affiliate,
    provider: dest.provider,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: dest.url,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}


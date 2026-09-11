import { getGameOffers } from '@/lib/game-api';
import { affiliateDestination } from '@/lib/affiliate';
import { findStore, storeSlug } from '@/lib/stores';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ store: string; offer: string }> },
) {
  const { store, offer } = await params;
  const query = new URL(request.url).searchParams;
  const appId = Number(query.get('appid')),
    title = query.get('title') || '';
  if (
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    title.length > 120 ||
    offer.length > 500
  )
    return new Response('Oferta inválida.', { status: 400 });
  try {
    const result = await getGameOffers(appId, title);
    const selected = result.offers.find(
      (item) =>
        item.id === offer &&
        (findStore(item.store)?.id || storeSlug(item.store)) === store,
    );
    if (!selected || selected.activationInBrazil === false)
      return new Response(
        'Oferta indisponível. Volte ao jogo e atualize os preços.',
        { status: 404 },
      );
    return new Response(null, {
      status: 302,
      headers: {
        Location: affiliateDestination(selected).url,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  } catch {
    return new Response(
      'Não foi possível confirmar a oferta. Volte ao jogo e tente novamente.',
      { status: 503 },
    );
  }
}

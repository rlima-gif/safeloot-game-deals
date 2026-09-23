import { getGameOffers } from '@/lib/game-api';
import { affiliateDestination, logOutboundClick } from '@/lib/affiliate';
import { findStore, storeSlug } from '@/lib/stores';
import { getSteamData } from '@/lib/steam-data';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ store: string; offer: string }> },
) {
  const { store, offer } = await params;
  const query = new URL(request.url).searchParams;
  const appId = Number(query.get('appid'));
  if (
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    offer.length > 500
  )
    return new Response('Oferta inválida.', { status: 400 });

  try {
    // Canonical Steam Identity Invariant:
    // Resolve authoritative game title from Steam; never trust client-supplied title.
    const steamData = await getSteamData(appId).catch(() => null);
    const authoritativeTitle =
      typeof steamData?.name === 'string' && steamData.name.trim()
        ? steamData.name.trim()
        : '';

    const result = await getGameOffers(appId, authoritativeTitle);
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

    const dest = affiliateDestination(selected);

    // SafeLoot Commerce Privacy Invariant:
    // Log outbound click event without IP addresses or user headers.
    logOutboundClick({
      store: selected.store,
      storeId: store,
      appId,
      gameTitle: authoritativeTitle || selected.gameTitle,
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
  } catch {
    return new Response(
      'Não foi possível confirmar a oferta. Volte ao jogo e tente novamente.',
      { status: 503 },
    );
  }
}


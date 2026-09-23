import { keyshopDestination } from '@/lib/store-links';
import { logOutboundClick } from '@/lib/affiliate';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ store: string }> },
) {
  try {
    const { store } = await params;
    const link = keyshopDestination(store);
    if (!link)
      return Response.json({ error: 'Loja desconhecida.' }, { status: 404 });

    logOutboundClick({
      store: link.storeName,
      storeId: link.storeId,
      affiliate: link.affiliate,
      provider: link.provider,
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: link.url,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  } catch {
    return Response.json(
      { error: 'Link temporariamente indisponível.' },
      { status: 503 },
    );
  }
}


import { getGameOffers } from '@/lib/game-api';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appId = Number(params.get('appid'));
  const title = params.get('title')?.trim() ?? '';
  if (!Number.isInteger(appId) || appId <= 0 || !title || title.length > 120) {
    return Response.json({ error: 'Jogo inválido para consulta.' }, { status: 400 });
  }
  try {
    const payload = await getGameOffers(appId, title);
    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=90, s-maxage=300, stale-while-revalidate=900' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Falha ao consultar ofertas.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

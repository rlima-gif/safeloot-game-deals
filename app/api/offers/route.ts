import { getGameOffers } from '@/lib/game-api';
import { getSteamData } from '@/lib/steam-data';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appId = Number(params.get('appid'));
  if (!Number.isInteger(appId) || appId <= 0) {
    return Response.json(
      { error: 'Jogo inválido para consulta.' },
      { status: 400 },
    );
  }
  try {
    const steamData = await getSteamData(appId).catch(() => null);
    const authoritativeTitle =
      typeof steamData?.name === 'string' && steamData.name.trim()
        ? steamData.name.trim()
        : '';

    if (!authoritativeTitle) {
      return Response.json(
        { error: 'Jogo não encontrado na Steam.' },
        { status: 404 },
      );
    }

    const payload = await getGameOffers(appId, authoritativeTitle);
    return Response.json(payload, {
      headers: {
        'Cache-Control':
          'public, max-age=90, s-maxage=300, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao consultar ofertas.',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

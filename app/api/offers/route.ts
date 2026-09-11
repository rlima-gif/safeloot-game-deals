import { getGameOffers } from '@/lib/game-api';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appId = Number(params.get('appid'));
  let title = params.get('title')?.trim() ?? '';
  if (!Number.isInteger(appId) || appId <= 0 || title.length > 120) {
    return Response.json(
      { error: 'Jogo inválido para consulta.' },
      { status: 400 },
    );
  }
  try {
    if (!title) {
      const response = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=BR&l=brazilian`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error('Não foi possível identificar o jogo.');
      const json = (await response.json()) as Record<
        string,
        { data?: { name?: string } }
      >;
      title = json[String(appId)]?.data?.name ?? '';
      if (typeof title !== 'string' || !title)
        return Response.json(
          { error: 'Jogo não encontrado.' },
          { status: 404 },
        );
    }
    const payload = await getGameOffers(appId, title);
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

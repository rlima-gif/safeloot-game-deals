import { searchSteamGames } from '@/lib/game-api';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 80) {
    return Response.json({ error: 'Digite entre 2 e 80 caracteres.' }, { status: 400 });
  }
  try {
    const payload = await searchSteamGames(query);
    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Falha ao buscar jogos.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

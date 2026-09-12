import { getGameOffers } from '@/lib/game-api';

export async function POST(request: Request) {
  const token = process.env.SAFELOOT_ADMIN_TOKEN;
  if (token && request.headers.get('authorization') !== `Bearer ${token}`) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as
    | { games?: { appId: number; title: string }[] }
    | null;
  const games = body?.games?.filter(
    (game) =>
      Number.isInteger(game.appId) &&
      game.appId > 0 &&
      typeof game.title === 'string' &&
      game.title.length <= 120,
  ).slice(0, 25) || [];
  const results = await Promise.allSettled(
    games.map((game) => getGameOffers(game.appId, game.title)),
  );
  return Response.json({
    updatedAt: new Date().toISOString(),
    requested: games.length,
    completed: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  });
}

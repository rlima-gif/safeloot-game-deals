import { getHighlights } from '@/lib/game-api';

export async function GET() {
  try {
    const payload = await getHighlights();
    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800' },
    });
  } catch {
    return Response.json(
      { error: 'Não foi possível atualizar as ofertas agora. Tente novamente em instantes.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

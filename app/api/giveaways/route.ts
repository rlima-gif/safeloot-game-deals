import { getGiveaways } from '@/lib/giveaways';

export async function GET() {
  try {
    return Response.json(await getGiveaways(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Não foi possível consultar os jogos grátis da Epic agora.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

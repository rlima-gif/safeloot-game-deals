import { getGameProfile } from '@/lib/game-profile';
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('id') || '';
  if (!/^[1-9]\d{0,9}$/.test(raw))
    return Response.json({ error: 'Jogo inválido' }, { status: 400 });
  try {
    return Response.json(await getGameProfile(Number(raw)), {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return Response.json(
      { error: 'A ficha está temporariamente indisponível. Tente novamente.' },
      { status: 502 },
    );
  }
}

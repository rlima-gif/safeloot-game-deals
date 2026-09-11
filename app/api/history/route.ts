import { getHistory } from '@/lib/history';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get('appid')),
    days = Number(params.get('days') || 90);
  if (!Number.isInteger(id) || id <= 0 || ![90, 180, 365].includes(days))
    return Response.json({ error: 'Consulta inválida.' }, { status: 400 });
  try {
    return Response.json(await getHistory(id, days), {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return Response.json(
      { error: 'Não foi possível carregar o histórico. Tente novamente.' },
      { status: 502 },
    );
  }
}

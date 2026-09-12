import { getSourceHealth } from '@/lib/source-health';

export async function GET(request: Request) {
  const token = process.env.SAFELOOT_ADMIN_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return Response.json({ error: 'Não autorizado.' }, { status: 401 });
    }
  }
  return Response.json(
    {
      updatedAt: new Date().toISOString(),
      sources: getSourceHealth(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

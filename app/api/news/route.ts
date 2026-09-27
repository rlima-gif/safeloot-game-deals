import { getPublishedNews } from '@/lib/news/news-store';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const appIdParam = url.searchParams.get('appId');
  const categoryParam = url.searchParams.get('category');

  const rawLimit = limitParam ? Number.parseInt(limitParam, 10) : 10;
  const limit = Number.isSafeInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 10;

  const rawAppId = appIdParam ? Number.parseInt(appIdParam, 10) : undefined;
  const appId =
    typeof rawAppId === 'number' && Number.isSafeInteger(rawAppId) && rawAppId > 0 && rawAppId <= 2_000_000_000
      ? rawAppId
      : undefined;

  const category = categoryParam ? categoryParam.trim().slice(0, 32) : undefined;

  try {
    const articles = await getPublishedNews({
      limit,
      appId,
      category,
    });

    return Response.json(
      {
        updatedAt: new Date().toISOString(),
        articles,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        updatedAt: new Date().toISOString(),
        articles: [],
        error: error instanceof Error ? error.message : 'Não foi possível carregar as notícias.',
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}

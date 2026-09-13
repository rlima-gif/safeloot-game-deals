import { getPublishedNews } from '@/lib/news/news-store';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const appIdParam = url.searchParams.get('appId');
  const categoryParam = url.searchParams.get('category');

  const limit = limitParam ? Number.parseInt(limitParam, 10) : 10;
  const appId = appIdParam ? Number.parseInt(appIdParam, 10) : undefined;
  const category = categoryParam ? categoryParam.trim() : undefined;

  try {
    const articles = await getPublishedNews({
      limit: Number.isNaN(limit) ? 10 : limit,
      appId: Number.isNaN(appId) ? undefined : appId,
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

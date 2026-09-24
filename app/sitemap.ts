import type { MetadataRoute } from 'next';
import { database } from '@/lib/db';
import { getPublishedNews } from '@/lib/news/news-store';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeloot.safeloot.workers.dev').replace(/\/$/, '');

// Sitemap gerado em request-time (precisa do binding D1 do Worker).
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/como-verificamos`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/lojas`, changeFrequency: 'weekly', priority: 0.3 },
  ];

  let gameRoutes: MetadataRoute.Sitemap = [];
  try {
    const db = await database();
    const { results } = await db
      .prepare(
        'SELECT app_id AS appId, checked_at AS checkedAt FROM games WHERE monitored=1 ORDER BY checked_at DESC LIMIT 2000',
      )
      .all<{ appId: number; checkedAt: string | null }>();
    gameRoutes = results
      .filter((g) => Number.isInteger(g.appId) && g.appId > 0)
      .map((g) => ({
        url: `${SITE_URL}/jogo/${g.appId}`,
        lastModified: g.checkedAt ? new Date(g.checkedAt) : undefined,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }));
  } catch {
    // Sem binding D1 disponível (ex.: build local) — sitemap sai só com as
    // rotas estáticas em vez de quebrar a rota inteira.
  }

  let newsRoutes: MetadataRoute.Sitemap = [];
  try {
    const articles = await getPublishedNews({ limit: 500 });
    newsRoutes = articles.map((a) => ({
      url: `${SITE_URL}/noticia/${a.id}`,
      lastModified: a.publishedAt ? new Date(a.publishedAt) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch {
    // Idem: falha ao buscar notícias não derruba o sitemap inteiro.
  }

  return [...staticRoutes, ...gameRoutes, ...newsRoutes];
}

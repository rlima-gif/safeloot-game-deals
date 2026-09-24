import { getPublishedNews, getPublishedArticleById } from '@/lib/news/news-store';
import { notFound } from 'next/navigation';
import { NewsArticlePage } from '@/components/news-article-page';

export const dynamic = 'force-dynamic';
export const revalidate = 0;


export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getPublishedArticleById(id);
  
  if (article) {
    return {
      title: `${article.title} | SafeLoot`,
      description: article.summary,
      openGraph: {
        title: article.title,
        description: article.summary,
        type: 'article',
        publishedTime: article.publishedAt,
        images: article.imageUrl ? [{ url: article.imageUrl }] : undefined,
        authors: article.sources.map((s) => s.name),
      },
    };
  }
  return { title: 'Notícia não encontrada | SafeLoot' };
}

export default async function NewsArticlePageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await getPublishedArticleById(id);

  if (!article) {
    notFound();
  }

  const authors = Array.isArray(article.sources) && article.sources.length > 0
    ? article.sources.map((s) => ({
        '@type': 'Organization',
        name: s.name,
        ...(s.url ? { url: s.url } : {}),
      }))
    : [{ '@type': 'Organization', name: 'SafeLoot' }];

  const imageUrl = article.imageUrl
    || (article.appId ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${article.appId}/capsule_616x353.jpg` : undefined);

  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.summary,
    datePublished: article.publishedAt,
    author: authors,
    publisher: {
      '@type': 'Organization',
      name: 'SafeLoot',
      url: 'https://safeloot.safeloot.workers.dev',
    },
    ...(imageUrl ? { image: [imageUrl] } : {}),
    ...(article.body ? { articleBody: article.body } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <NewsArticlePage article={article} />
    </>
  );
}
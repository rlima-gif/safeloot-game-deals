import { getPublishedArticleById } from '@/lib/news/news-store';
import { notFound } from 'next/navigation';
import { NewsArticlePage } from '@/components/news-article-page';

export const dynamic = 'force-dynamic';
export const revalidate = 0;


const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeloot.safeloot.workers.dev').replace(/\/$/, '');

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getPublishedArticleById(id);
  
  if (article) {
    return {
      title: `${article.title} | SafeLoot`,
      description: article.summary,
      alternates: {
        canonical: `${SITE_URL}/noticia/${id}`,
      },
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

  const imageUrl = article.imageUrl
    || (article.appId ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${article.appId}/capsule_616x353.jpg` : `${SITE_URL}/og-home.png`);

  const citation = Array.isArray(article.sources)
    ? article.sources
        .filter((s) => s && s.name)
        .map((s) => ({
          '@type': 'CreativeWork',
          name: s.name,
          ...(s.url ? { url: s.url } : {}),
        }))
    : [];

  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/noticia/${id}`,
    },
    headline: article.title,
    description: article.summary,
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    author: {
      '@type': 'Organization',
      name: 'SafeLoot',
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'SafeLoot',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo-safeloot.png`,
        width: 512,
        height: 512,
      },
    },
    ...(citation.length > 0 ? { citation } : {}),
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
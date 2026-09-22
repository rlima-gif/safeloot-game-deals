import { getPublishedNews, getPublishedArticleById } from '@/lib/news/news-store';
import { notFound } from 'next/navigation';
import { NewsArticlePage } from '@/components/news-article-page';

export async function generateStaticParams() {
  const articles = await getPublishedNews({ limit: 100 });
  return articles.map((article) => ({
    id: article.id.replace('art_', ''),
  }));
}

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

  return <NewsArticlePage article={article} />;
}
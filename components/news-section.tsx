'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface NewsArticle {
  id: string;
  appId?: number | null;
  title: string;
  summary: string;
  whyItMatters: string;
  purchaseAdvice: string;
  category: string;
  purchaseImpact: string;
  publishedAt: string;
  sources: { name: string; url: string }[];
  imageUrl?: string;
}

const categoryLabel = (category: string) => category.replace(/-/g, ' ');

const impactLabel = (impact: string) => {
  if (impact === 'high') return 'Alto impacto na compra';
  if (impact === 'medium') return 'Médio impacto na compra';
  if (impact === 'low') return 'Baixo impacto na compra';
  return 'Sem impacto na compra';
};

const formatDate = (publishedAt: string) => {
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return publishedAt;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

function NewsItem({ article }: { article: NewsArticle }) {
  const imageUrl = article.imageUrl
    || (article.appId ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${article.appId}/header.jpg` : '/placeholder-news.svg');

  return (
    <article className="news-card">
      <Link href={`/noticia/${article.id.replace('art_', '')}`} className="news-card-link" aria-label={`Ler notícia: ${article.title}`}>
        <div className="news-card-image">
          <img
            src={imageUrl}
            alt={article.title || 'Imagem da notícia'}
            loading="lazy"
            onError={(e) => { e.currentTarget.src = '/placeholder-news.svg'; }}
          />
        </div>
        <div className="news-card-content">
          <div className="news-card-meta">
            <span className="news-category">{categoryLabel(article.category)}</span>
            <span className={`news-impact news-impact-${article.purchaseImpact}`}>
              {impactLabel(article.purchaseImpact)}
            </span>
            <time className="news-date">{formatDate(article.publishedAt)}</time>
          </div>
          <h3 className="news-card-title">{article.title}</h3>
          <p className="news-card-summary">{article.summary}</p>
          <div className="news-card-footer">
            <span className="read-more">Ler notícia <span className="arrow">→</span></span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export function NewsSection() {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/news?limit=6');
      const payload = (await response.json()) as {
        articles: NewsArticle[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Notícias indisponíveis.');
      setArticles(
        (Array.isArray(payload.articles) ? payload.articles : []).map((article) => ({
          ...article,
          sources: Array.isArray(article.sources) ? article.sources : [],
        })),
      );
      if (payload.error) setError(payload.error);
    } catch {
      setError('Não foi possível carregar as notícias agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="news-section" aria-labelledby="news-heading">
      <div className="news-section-header">
        <h2 id="news-heading">Notícias do mundo dos games</h2>
      </div>
      <p className="news-section-subtitle">
        As principais novidades, lançamentos, atualizações e acontecimentos do mundo dos games.
      </p>
      {loading && !articles ? (
        <div className="loading-panel" role="status">
          <div className="spin" /> Carregando notícias…
        </div>
      ) : error && (!articles || articles.length === 0) ? (
        <p className="error-message" role="alert">
          {error} {' '}
          <button onClick={() => void refresh()}>Tentar novamente</button>
        </p>
      ) : !articles || articles.length === 0 ? (
        <p className="filter-status" role="status">
          Nenhuma notícia publicada ainda.
        </p>
      ) : (
        <div className="news-grid" role="list">
          {articles.map((article) => (
            <NewsItem key={article.id} article={article} />
          ))}
        </div>
      )}
    </section>
  );
}
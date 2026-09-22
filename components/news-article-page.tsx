'use client';

import { ChevronLeft, Calendar } from 'lucide-react';

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

export function NewsArticlePage({ article }: { article: NewsArticle }) {
  const imageUrl = article.imageUrl
    || (article.appId ? `https://steamcdn-a.akamaihd.net/steam/apps/${article.appId}/header.jpg` : '/placeholder-news.svg');

  return (
    <article className="news-article-page">
      <header className="news-article-header">
        <div className="news-article-meta">
          <span className="news-category">{categoryLabel(article.category)}</span>
          <span className="news-impact">{impactLabel(article.purchaseImpact)}</span>
          <time className="news-date" dateTime={article.publishedAt}>
            <Calendar size={14} /> {formatDate(article.publishedAt)}
          </time>
        </div>
        <h1 className="news-article-title">{article.title}</h1>
        <p className="news-article-summary">{article.summary}</p>
      </header>

      <div className="news-article-image">
        <img
          src={imageUrl}
          alt={article.title}
          loading="eager"
          onError={(e) => { e.currentTarget.src = '/placeholder-news.svg'; }}
        />
      </div>

      <div className="news-article-content">
        <section className="news-article-section">
          <h2><span className="section-icon">📋</span> Por que importa</h2>
          <p>{article.whyItMatters}</p>
        </section>

        <section className="news-article-section">
          <h2><span className="section-icon">💡</span> Vale comprar?</h2>
          <p>{article.purchaseAdvice}</p>
        </section>

        {article.appId && (
          <div className="news-article-game-link">
            <a href={`/jogo/${article.appId}`} className="news-game-link">
              Ver página do jogo →
            </a>
          </div>
        )}

        <section className="news-article-sources">
          <h3>Fontes</h3>
          <div className="sources-list">
            {article.sources.map((source: { name: string; url: string }, index: number) => (
              <a
                key={`${source.name}-${index}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="source-link"
              >
                {source.name}
              </a>
            ))}
          </div>
        </section>
      </div>

      <footer className="news-article-footer">
        <a href="/" className="back-home">
          <ChevronLeft size={16} /> Voltar para as notícias
        </a>
      </footer>
    </article>
  );
}
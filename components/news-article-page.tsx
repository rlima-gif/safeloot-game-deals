'use client';

import { ChevronLeft, Calendar, ExternalLink, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

interface NewsArticle {
  id: string;
  appId?: number | null;
  title: string;
  summary: string;
  body?: string;
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
    || (article.appId ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${article.appId}/header.jpg` : '/placeholder-news.svg');

  const paragraphs = (article.body || article.summary || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <article className="news-article-page">
      <nav className="news-breadcrumb" aria-label="Navegação de retorno">
        <Link href="/" className="back-link">
          <ChevronLeft size={16} /> Voltar para as ofertas
        </Link>
      </nav>

      <header className="news-article-header">
        <div className="news-article-meta">
          <span className="news-category">{categoryLabel(article.category)}</span>
          <span className={`news-impact news-impact-${article.purchaseImpact}`}>
            {impactLabel(article.purchaseImpact)}
          </span>
          <time className="news-date" dateTime={article.publishedAt}>
            <Calendar size={13} /> {formatDate(article.publishedAt)}
          </time>
        </div>
        <h1 className="news-article-title">{article.title}</h1>
        {article.summary && (
          <p className="news-article-lead">{article.summary}</p>
        )}
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
        {paragraphs.length > 0 && (
          <section className="news-article-section news-article-body">
            <h2><span className="section-icon">📰</span> Matéria Completa</h2>
            <div className="article-body-text">
              {paragraphs.map((para, index) => (
                <p key={index}>{para}</p>
              ))}
            </div>
          </section>
        )}

        <section className="news-article-section">
          <h2><span className="section-icon">📋</span> Por que isso importa</h2>
          <p>{article.whyItMatters}</p>
        </section>

        <section className="news-article-section news-article-advice-section">
          <h2><span className="section-icon">💡</span> Vale comprar? Análise de Compra</h2>
          <div className="advice-box">
            <span className="advice-impact-tag">{impactLabel(article.purchaseImpact)}</span>
            <p>{article.purchaseAdvice}</p>
          </div>
        </section>

        {article.appId && (
          <div className="news-article-game-cta">
            <div className="game-cta-info">
              <span className="game-cta-label">Quer monitorar o preço?</span>
              <span className="game-cta-desc">Confira o comparativo de preços e histórico de ofertas no SafeLoot.</span>
            </div>
            <Link href={`/jogo/${article.appId}`} className="news-game-cta-button">
              Ver ofertas deste jogo →
            </Link>
          </div>
        )}

        {article.sources && article.sources.length > 0 && (
          <section className="news-article-sources">
            <h3><ShieldCheck size={16} /> Fontes Originais Verificadas</h3>
            <div className="sources-list">
              {article.sources.map((source, index) => (
                <a
                  key={`${source.name}-${index}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-link"
                >
                  <span>{source.name}</span>
                  <ExternalLink size={12} />
                </a>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="news-article-footer">
        <Link href="/" className="back-home">
          <ChevronLeft size={16} /> Voltar para a página inicial
        </Link>
      </footer>
    </article>
  );
}
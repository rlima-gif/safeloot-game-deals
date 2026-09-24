'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasCommercialValue } from './news-article-page';
import { getCategoryBadgeLabel, NEWS_NAV_CHIPS } from '@/lib/news/taxonomy';

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

export function normalizeNewsImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  let clean = url
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '')
    .replace(/^["']|["']$/g, '');
  if (clean.startsWith('//')) {
    clean = `https:${clean}`;
  }
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    return undefined;
  }
  return clean;
}

export function NewsCardCover({
  imageUrl,
  appId,
  title,
  eager = false,
}: {
  imageUrl?: string;
  appId?: number | null;
  title: string;
  eager?: boolean;
}) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const normalized = normalizeNewsImageUrl(imageUrl);

  let src = '/placeholder-news.svg';
  if (stage === 0) {
    if (normalized) src = normalized;
    else if (appId && Number(appId) > 0)
      src = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`;
    else src = '/placeholder-news.svg';
  } else if (stage === 1) {
    if (appId && Number(appId) > 0)
      src = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`;
    else src = '/placeholder-news.svg';
  } else {
    src = '/placeholder-news.svg';
  }

  const handleError = () => {
    if (stage === 0 && normalized && appId && Number(appId) > 0) {
      setStage(1);
    } else {
      setStage(2);
    }
  };

  return (
    <img
      src={src}
      alt={title || 'Imagem da notícia'}
      loading={eager ? 'eager' : 'lazy'}
      onError={handleError}
    />
  );
}

function NewsItem({ article }: { article: NewsArticle }) {
  const showImpact = hasCommercialValue(article);
  const articleSlug = article.id.replace(/^art_/, '');
  const badgeLabel = getCategoryBadgeLabel(article.category);

  return (
    <article className="news-card">
      <a
        href={`/noticia/${articleSlug}`}
        className="news-card-link"
        aria-label={`Ler notícia: ${article.title}`}
      >
        <div className="news-card-image">
          <NewsCardCover
            imageUrl={article.imageUrl}
            appId={article.appId}
            title={article.title}
          />
        </div>
        <div className="news-card-content">
          <div className="news-card-meta">
            <span className="news-category">{badgeLabel}</span>
            {showImpact && (
              <span
                className={`news-impact news-impact-${article.purchaseImpact}`}
              >
                {impactLabel(article.purchaseImpact)}
              </span>
            )}
            <time className="news-date">{formatDate(article.publishedAt)}</time>
          </div>
          <h3 className="news-card-title">{article.title}</h3>
          <p className="news-card-summary">{article.summary}</p>
          <div className="news-card-footer">
            <span className="read-more">
              Ler notícia <span className="arrow">→</span>
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}

export function NewsSection() {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/news?limit=24');
      const payload = (await response.json()) as {
        articles: NewsArticle[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || 'Notícias indisponíveis.');
      setArticles(
        (Array.isArray(payload.articles) ? payload.articles : []).map(
          (article) => ({
            ...article,
            sources: Array.isArray(article.sources) ? article.sources : [],
          }),
        ),
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

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    if (selectedCategory === 'all') return articles.slice(0, 9);
    return articles.filter((a) => {
      const cat = (a.category || '').toLowerCase();
      if (selectedCategory === 'consoles') {
        return cat === 'playstation' || cat === 'xbox' || cat === 'nintendo';
      }
      return cat === selectedCategory;
    });
  }, [articles, selectedCategory]);

  return (
    <section className="news-section" aria-labelledby="news-heading">
      <div className="news-section-header">
        <h2 id="news-heading">Notícias do mundo dos games</h2>
      </div>
      <p className="news-section-subtitle">
        As principais novidades, lançamentos, atualizações e acontecimentos do
        mundo dos games.
      </p>

      {/* Mobile-first compact news category rail */}
      <div
        className="news-category-rail"
        role="tablist"
        aria-label="Filtrar notícias por categoria"
      >
        {NEWS_NAV_CHIPS.map((chip) => {
          const isSelected = selectedCategory === chip.id;
          return (
            <button
              key={chip.id}
              role="tab"
              type="button"
              aria-selected={isSelected}
              className={`news-category-chip ${isSelected ? 'active' : ''}`}
              onClick={() => setSelectedCategory(chip.id)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {loading && !articles ? (
        <div className="loading-panel" role="status">
          <div className="spin" /> Carregando notícias…
        </div>
      ) : error && (!articles || articles.length === 0) ? (
        <p className="error-message" role="alert">
          {error}{' '}
          <button onClick={() => void refresh()}>Tentar novamente</button>
        </p>
      ) : !articles || articles.length === 0 ? (
        <p className="filter-status" role="status">
          Nenhuma notícia publicada ainda.
        </p>
      ) : filteredArticles.length === 0 ? (
        <div className="news-empty-category">
          <p>Nenhuma notícia encontrada na categoria selecionada.</p>
          <button
            type="button"
            className="news-reset-chip"
            onClick={() => setSelectedCategory('all')}
          >
            Ver todas as notícias
          </button>
        </div>
      ) : (
        <div className="news-grid">
          {filteredArticles.map((article) => (
            <NewsItem key={article.id} article={article} />
          ))}
        </div>
      )}
    </section>
  );
}

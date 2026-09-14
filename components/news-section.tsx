'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NewsSourceLink {
  name: string;
  url: string;
}

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
  sources: NewsSourceLink[];
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
    <section className="deals-section" aria-labelledby="news-heading">
      <div className="section-heading">
        <h2 id="news-heading">Notícias que mudam a compra</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Atualizar notícias"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      <p className="filter-status">
        Somente notícias publicadas que podem mudar a decisão de compra.
      </p>
      {loading && articles === null ? (
        <div className="loading-panel" role="status">
          <LoaderCircle className="spin" /> Carregando notícias…
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
      ) : (
        <div className="deals-grid">
          {articles.map((article) => (
            <article className="deal-card" key={article.id}>
              <div className="deal-body">
                <span className="storeline">
                  {categoryLabel(article.category)} ·{' '}
                  {impactLabel(article.purchaseImpact)} ·{' '}
                  {formatDate(article.publishedAt)}
                </span>
                <h3>{article.title}</h3>
                <p className="filter-status">{article.summary}</p>
                <p className="filter-status">
                  <strong>Por que importa:</strong> {article.whyItMatters}
                </p>
                <p className="filter-status">
                  <strong>Vale comprar:</strong> {article.purchaseAdvice}
                </p>
                {typeof article.appId === 'number' && (
                  <a
                    className="secondary-link"
                    href={`/jogo/${article.appId}`}
                  >
                    Ver jogo <ArrowUpRight size={14} />
                  </a>
                )}
                {article.sources.length > 0 && (
                  <p className="filter-status">
                    Fontes:{' '}
                    {article.sources.map((source, index) => (
                      <span key={`${source.name}-${index}`}>
                        {index > 0 && ' · '}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {source.name}
                        </a>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

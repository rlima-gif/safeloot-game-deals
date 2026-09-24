/* oxlint-disable next/no-html-link-for-pages */
'use client';

import { ChevronLeft, Calendar, ExternalLink, ShieldCheck, Tag, ShoppingBag } from 'lucide-react';

export interface NewsArticle {
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

import { getCategoryBadgeLabel } from '@/lib/news/taxonomy';
import { hasCommercialValue } from '@/lib/news/filter';
export { hasCommercialValue };

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
  const initialImage = article.imageUrl
    || (article.appId ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${article.appId}/capsule_616x353.jpg` : '/placeholder-news.svg');

  const rawParagraphs = (article.body || article.summary || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const showCommercial =
    hasCommercialValue(article) &&
    article.purchaseImpact !== 'none' &&
    Boolean(article.purchaseAdvice && article.purchaseAdvice.trim().length > 0);

  return (
    <article className="news-article-page">
      <nav className="news-breadcrumb" aria-label="Navegação de retorno">
        <a
          href="/"
          className="back-link"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer.includes(window.location.host)) {
              e.preventDefault();
              window.history.back();
            }
          }}
        >
          <ChevronLeft size={16} /> Voltar para as ofertas
        </a>
      </nav>

      {/* 1. Header Jornalístico */}
      <header className="news-article-header">
        <div className="news-article-meta">
          <span className="news-category">{getCategoryBadgeLabel(article.category)}</span>
          <time className="news-date" dateTime={article.publishedAt}>
            <Calendar size={13} /> {formatDate(article.publishedAt)}
          </time>
          <span className="news-author-tag">
            Por <strong>SafeLoot</strong>
          </span>
          {article.sources && article.sources.length > 0 && (
            <span className="news-sources-count">
              <ShieldCheck size={13} /> {article.sources.length} {article.sources.length > 1 ? 'fontes consultadas' : 'fonte consultada'}
            </span>
          )}
        </div>

        <h1 className="news-article-title">{article.title}</h1>

        {article.summary && (
          <p className="news-article-lead">{article.summary}</p>
        )}
      </header>

      {/* 2. Imagem Hero com Fallback Robusto */}
      <div className="news-article-hero">
        <img
          src={initialImage}
          alt={article.title}
          loading="eager"
          onError={(e) => {
            const img = e.currentTarget;
            if (article.appId && !img.src.includes('capsule_616x353.jpg') && !img.src.includes('header.jpg')) {
              img.src = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${article.appId}/capsule_616x353.jpg`;
            } else if (article.appId && !img.src.includes('header.jpg')) {
              img.src = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${article.appId}/header.jpg`;
            } else if (!img.src.endsWith('/placeholder-news.svg')) {
              img.src = '/placeholder-news.svg';
            }
          }}
        />
      </div>

      {/* 3. Corpo Editorial da Matéria */}
      <div className="news-article-editorial">
        <div className="news-article-body">
          {rawParagraphs.map((para, index) => {
            if (para.startsWith('### ')) {
              return (
                <h3 key={index} className="news-body-subheading">
                  {para.replace(/^###\s+/, '')}
                </h3>
              );
            }
            if (para.startsWith('## ')) {
              return (
                <h3 key={index} className="news-body-subheading">
                  {para.replace(/^##\s+/, '')}
                </h3>
              );
            }
            return <p key={index}>{para}</p>;
          })}
        </div>

        {/* Fontes originais consultadas — Transparência Editorial */}
        {article.sources && article.sources.length > 0 && (
          <section className="news-article-sources" aria-label="Fontes consultadas">
            <h4 className="sources-heading">
              <ShieldCheck size={15} /> Fontes consultadas
            </h4>
            <p className="sources-disclaimer" style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: '1.5' }}>
              Esta matéria é uma síntese editorial informativa elaborada pelo SafeLoot com base nas apurações e comunicados originais publicados por:
            </p>
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

      {/* 4. CTA de Acompanhamento de Preço do Jogo (Sempre visível quando houver appId) */}
      {article.appId && (
        <section className="news-article-game-cta" aria-label="Ofertas do jogo relacionado">
          <div className="commercial-cta-row">
            <div className="commercial-cta-info">
              <span className="commercial-cta-title">Acompanhe os menores preços</span>
              <span className="commercial-cta-desc">Compare ofertas, lojas confiáveis e histórico de promoções no SafeLoot.</span>
            </div>
            <a href={`/jogo/${article.appId}`} className="news-game-cta-button">
              Ver ofertas deste jogo →
            </a>
          </div>
        </section>
      )}

      {/* 5. Análise Comercial SafeLoot (Omitida quando não houver valor comercial real) */}
      {showCommercial && (
        <aside className="news-commercial-card" aria-label="Central de compra SafeLoot">
          <div className="commercial-card-header">
            <div className="commercial-card-title">
              <ShoppingBag size={18} className="commercial-title-icon" />
              <span>Central de Compra SafeLoot</span>
            </div>
            <span className={`news-impact news-impact-${article.purchaseImpact}`}>
              <Tag size={12} /> {impactLabel(article.purchaseImpact)}
            </span>
          </div>

          <div className="commercial-card-body">
            {article.purchaseAdvice && (
              <p className="commercial-advice">{article.purchaseAdvice}</p>
            )}

            {article.whyItMatters && !article.whyItMatters.toLowerCase().includes('orientam os jogadores') && (
              <div className="commercial-context">
                <span className="commercial-context-label">Contexto para o jogador:</span>
                <p>{article.whyItMatters}</p>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* 6. Rodapé da Notícia */}
      <footer className="news-article-footer">
        <a
          href="/"
          className="back-home"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer.includes(window.location.host)) {
              e.preventDefault();
              window.history.back();
            }
          }}
        >
          <ChevronLeft size={16} /> Voltar para as ofertas
        </a>
      </footer>
    </article>
  );
}
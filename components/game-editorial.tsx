'use client';
import { stores, storeSearchAction } from '@/lib/stores';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Play, ShieldCheck } from 'lucide-react';
import type { GameDetails } from '@/lib/game-api';

export function CriticReview({ game }: { game: GameDetails }) {
  return (
    <section className="critic-panel" aria-labelledby="critic-heading">
      <div className="panel-heading">
        <h2 id="critic-heading">O que diz a crítica</h2>
        <span>PC</span>
      </div>
      <div className="critic-content">
        <div className="critic-score">
          <strong>{game.score ?? '—'}</strong>
          <span>/ 100</span>
        </div>
        <div>
          <h3>Metacritic</h3>
          <p>
            {game.score === null
              ? 'Nota da crítica ainda não disponível nesta fonte.'
              : 'Nota agregada da crítica especializada, informada pela Steam.'}
          </p>
          {game.criticUrl && (
            <a
              className="secondary-link"
              href={game.criticUrl}
              target="_blank"
              rel="noreferrer"
            >
              Ler as análises <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export function GameTrailer({ game }: { game: GameDetails }) {
  const [playing, setPlaying] = useState(false);
  const trailer = game.trailer;
  return (
    <section className="trailer-panel" aria-labelledby="trailer-heading">
      <div className="panel-heading">
        <h2 id="trailer-heading">Veja o jogo em ação</h2>
        <span>{trailer?.official === false ? 'Trailer no YouTube' : 'Trailer oficial'}</span>
      </div>
      {trailer ? (
        <>
          <div className="trailer-frame">
            {playing ? (
              <iframe
                title={`Trailer de ${game.title}`}
                src={`https://www.youtube-nocookie.com/embed/${trailer.videoId}?autoplay=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label={`Reproduzir trailer de ${game.title}`}
              >
                {game.image && <img src={game.image} alt="" loading="lazy" />}
                <span>
                  <Play size={28} fill="currentColor" />
                  Reproduzir trailer
                </span>
              </button>
            )}
          </div>
          {playing && (
            <p className="muted">
              Se o player não carregar, use o link “Assistir no YouTube” abaixo.
            </p>
          )}
          <div className="trailer-source">
            <a href={trailer.sourceUrl} target="_blank" rel="noreferrer">
              <ShieldCheck size={14} />
              {trailer.publisher}
            </a>
            <a
              href={`https://www.youtube.com/watch?v=${trailer.videoId}`}
              target="_blank"
              rel="noreferrer"
            >
              Assistir no YouTube ↗
            </a>
          </div>
        </>
      ) : (
        <div className="editorial-empty">
          <p>
            Ainda não temos um trailer do YouTube com origem oficial confirmada
            para este jogo.
          </p>
          <a
            className="secondary-link"
            href={`https://store.steampowered.com/app/${game.id}/?cc=br&l=brazilian`}
            target="_blank"
            rel="noreferrer"
          >
            Ver vídeos na página da Steam <ArrowUpRight size={14} />
          </a>
        </div>
      )}
    </section>
  );
}

export function OtherStoresConsultation({
  gameTitle,
  confirmedStores = [],
}: {
  gameTitle: string;
  confirmedStores?: string[];
}) {
  const [links, setLinks] = useState<{ id: string; name: string; affiliate: boolean }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/keyshops', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !controller.signal.aborted) {
          setLinks((data as { stores: { id: string; name: string; affiliate: boolean }[] }).stores);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const confirmedLower = confirmedStores.map((s) => s.toLowerCase());

  // Authorized stores without real-time BRL integration
  const authorizedStores = [
    { id: 'gmg', name: 'Green Man Gaming', status: 'Aguardando feed' },
    { id: 'gamebillet', name: 'GameBillet', status: 'Sem API BRL' },
    { id: 'fanatical', name: 'Fanatical', status: 'Cobrança em USD' },
    { id: 'humble', name: 'Humble Store', status: 'Cobrança em USD' },
    { id: 'gamesplanet', name: 'GamesPlanet', status: 'Cobrança em USD' },
    { id: 'indiegala', name: 'IndieGala', status: 'Sem API BRL' },
  ].filter(
    (s) =>
      !confirmedLower.includes(s.name.toLowerCase()) &&
      !confirmedLower.includes(s.id),
  );

  // Keyshops & Marketplaces (outside official ranking)
  const keyshopStores = [
    { id: 'eneba', name: 'Eneba', status: 'Marketplace' },
    { id: 'cdkeys', name: 'CDKeys', status: 'Marketplace' },
    { id: 'instant-gaming', name: 'Instant Gaming', status: 'Marketplace' },
    { id: 'kinguin', name: 'Kinguin', status: 'Marketplace' },
    { id: 'gamivo', name: 'GAMIVO', status: 'Marketplace' },
  ].filter(
    (s) =>
      !confirmedLower.includes(s.name.toLowerCase()) &&
      !confirmedLower.includes(s.id),
  );

  const totalStores = authorizedStores.length + keyshopStores.length;
  if (totalStores === 0) return null;

  return (
    <details
      className="marketplace-panel other-stores-disclosure"
      aria-labelledby="marketplace-heading"
      open
    >
      <summary className="other-stores-summary">
        <div className="panel-heading other-stores-heading-wrapper">
          <h2 id="marketplace-heading">Consultar em outras lojas</h2>
          <span className="marketplace-badge">Sem integração em BRL</span>
        </div>
        <span className="other-stores-toggle-hint">
          {totalStores} lojas disponíveis ▾
        </span>
      </summary>

      <p className="marketplace-disclosure">
        Preços não monitorados pelo SafeLoot. Ativação, taxas e edições devem ser conferidas diretamente na loja antes de comprar.
      </p>

      {authorizedStores.length > 0 && (
        <div className="other-stores-subgroup">
          <h3 className="other-stores-subgroup-title">Revendedores autorizados (sem integração em BRL)</h3>
          <div className="marketplace-compact-list other-stores-grid">
            {authorizedStores.map((store) => {
              const action = storeSearchAction(store.id, gameTitle);
              return (
                <div key={store.id} className="marketplace-compact-item other-stores-chip">
                  <div className="marketplace-item-info">
                    <span className="marketplace-store-name">{store.name}</span>
                    <span className="marketplace-status-tag">{store.status}</span>
                  </div>
                  <a
                    className="marketplace-cta"
                    href={action.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Buscar ${store.name} na loja externa`}
                  >
                    <span>Buscar na loja</span>
                    <ArrowUpRight size={13} />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {keyshopStores.length > 0 && (
        <div className="other-stores-subgroup">
          <h3 className="other-stores-subgroup-title">Outras lojas (keyshops e marketplaces)</h3>
          <div className="marketplace-compact-list other-stores-grid">
            {keyshopStores.map((store) => {
              const isAffiliate = links.find((l) => l.id === store.id)?.affiliate;
              return (
                <div key={store.id} className="marketplace-compact-item other-stores-chip">
                  <div className="marketplace-item-info">
                    <span className="marketplace-store-name">{store.name}</span>
                    <span className="marketplace-status-tag">{store.status}</span>
                  </div>
                  <a
                    className="marketplace-cta"
                    href={`/go/keyshop/${store.id}`}
                    target="_blank"
                    rel={isAffiliate ? 'sponsored noreferrer' : 'noreferrer'}
                    aria-label={`Buscar ${store.name} na loja externa`}
                  >
                    <span>Buscar na loja</span>
                    <ArrowUpRight size={13} />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </details>
  );
}

export const SmallerRetailersLinks = OtherStoresConsultation;
export function MarketplaceLinks() {
  return null;
}


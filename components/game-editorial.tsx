'use client';
import { stores } from '@/lib/stores';
import { useEffect,useState } from 'react';
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

export function MarketplaceLinks() {
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

  const keyshopStores = stores.filter((store) =>
    ['eneba', 'cdkeys', 'instant-gaming', 'kinguin', 'gamivo'].includes(store.id)
  );

  return (
    <section
      className="marketplace-panel"
      aria-labelledby="marketplace-heading"
    >
      <div className="panel-heading">
        <h2 id="marketplace-heading">Outras lojas (keyshops e marketplaces)</h2>
        <span className="marketplace-badge">Fora do ranking oficial</span>
      </div>
      <p className="marketplace-disclosure">
        Preços não monitorados pelo SafeLoot. Ativação, taxas e edições devem ser conferidas diretamente na loja antes de comprar.
      </p>
      <div className="marketplace-compact-list">
        {keyshopStores.map((store) => {
          const isAffiliate = links.find((l) => l.id === store.id)?.affiliate;
          return (
            <div key={store.id} className="marketplace-compact-item">
              <div className="marketplace-item-info">
                <span className="marketplace-store-name">{store.name}</span>
                <span className="marketplace-status-tag">Preço não integrado</span>
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
    </section>
  );
}

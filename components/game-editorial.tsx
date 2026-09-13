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
  const [links,setLinks]=useState<{id:string;name:string;affiliate:boolean}[]>([]);
  useEffect(()=>{const controller=new AbortController();void fetch('/api/keyshops',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(data && !controller.signal.aborted)setLinks((data as {stores:{id:string;name:string;affiliate:boolean}[]}).stores);}).catch(()=>{});return()=>controller.abort();},[]);

  return (
    <section
      className="marketplace-panel"
      aria-labelledby="marketplace-heading"
    >
      <div className="panel-heading">
        <h2 id="marketplace-heading">Keys recomendadas para conferir</h2>
        <span>Fora do ranking oficial</span>
      </div>
      <p>
        Preços ainda não integrados. Confira vendedor, taxas, edição e região de
        ativação antes de comprar.
      </p>
      <div className="marketplace-links">
        {stores
          .filter((store) => ['eneba','kinguin','gamivo','cdkeys','instant-gaming'].includes(store.id))
          .map((store) => (
            <a
              key={store.name}
              href={`/go/keyshop/${store.id}`}
              target="_blank"
              rel={links.find(l=>l.id===store.id)?.affiliate ? "sponsored noreferrer" : "noreferrer"}
            >
              {store.name}
              <small>Preço ainda não integrado ao SafeLoot</small>
              <small>Ativação no Brasil: não confirmada</small>
              {links.find(l=>l.id===store.id)?.affiliate && <small>Link afiliado</small>}
              <span>
                Ver preço atual na loja <ArrowUpRight size={14} />
              </span>
            </a>
          ))}
      </div>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Gamepad2, RefreshCw } from 'lucide-react';
import type { DiscoveryDeal, DiscoveryShelf } from '@/lib/discovery';
import { matchesPriceBand, priceBandLabel } from '@/lib/price-bands';
import {
  resolveGameArtwork,
  getGameArtworkFallback,
  SAFE_LOOT_GAME_PLACEHOLDER,
} from '@/lib/game-images';

const money = (value: number | null) =>
  value === null
    ? 'Indisponível'
    : value === 0
      ? 'Grátis'
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function CategoryTile({ shelf }: { shelf: DiscoveryShelf }) {
  const repGame = shelf.games[0];
  const initialImg =
    repGame?.image ||
    (repGame?.appId
      ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${repGame.appId}/header.jpg`
      : SAFE_LOOT_GAME_PLACEHOLDER);
  const [prevGameId, setPrevGameId] = useState(repGame?.id);
  const [imgSrc, setImgSrc] = useState(initialImg);

  if (repGame?.id !== prevGameId) {
    setPrevGameId(repGame?.id);
    setImgSrc(initialImg);
  }

  const label =
    shelf.id === 'indie'
      ? 'Indies'
      : shelf.id === 'roguelike'
        ? 'Roguelikes'
        : shelf.id === 'epic'
          ? 'Grátis na Epic'
          : shelf.title;

  const handleError = () => {
    if (repGame?.appId) {
      const fallback = getGameArtworkFallback(imgSrc, repGame.appId);
      if (fallback && fallback !== imgSrc) {
        setImgSrc(fallback);
        return;
      }
    }
    setImgSrc(SAFE_LOOT_GAME_PLACEHOLDER);
  };

  return (
    <a href={`#selection-${shelf.id}`}>
      <img
        src={imgSrc || SAFE_LOOT_GAME_PLACEHOLDER}
        alt={`Coleção ${label}`}
        loading="lazy"
        onError={handleError}
      />
      {label}
    </a>
  );
}

function StoreExternalLink({ store }: { store: string }) {
  if (store === 'steam') {
    return (
      <a className="discover-more" href="https://store.steampowered.com/search/?specials=1&cc=br" target="_blank" rel="noreferrer">
        Consultar ofertas na Steam ↗
      </a>
    );
  }
  if (store === 'gmg') {
    return (
      <a className="discover-more" href="https://www.greenmangaming.com/pt/hot-deals/" target="_blank" rel="noreferrer">
        Consultar ofertas na Green Man Gaming ↗
      </a>
    );
  }
  if (store === 'nuuvem') {
    return (
      <a className="discover-more" href="https://www.nuuvem.com/br-pt/catalog" target="_blank" rel="noreferrer">
        Consultar catálogo completo na Nuuvem ↗
      </a>
    );
  }
  if (store === 'epic') {
    return (
      <a className="discover-more" href="https://store.epicgames.com/pt-BR/free-games" target="_blank" rel="noreferrer">
        Consultar jogos grátis na Epic Games Store ↗
      </a>
    );
  }
  return null;
}

function DiscoveryCard({ game }: { game: DiscoveryDeal }) {
  const [prevGameId, setPrevGameId] = useState(game.id);
  const [imgSrc, setImgSrc] = useState(() => resolveGameArtwork(game, 'card'));

  if (game.id !== prevGameId) {
    setPrevGameId(game.id);
    setImgSrc(resolveGameArtwork(game, 'card'));
  }

  const handleError = () => {
    const fallback = getGameArtworkFallback(imgSrc, game.appId);
    if (fallback && fallback !== imgSrc) {
      setImgSrc(fallback);
    } else {
      setImgSrc(SAFE_LOOT_GAME_PLACEHOLDER);
    }
  };

  const destination = `/go/discovery/${encodeURIComponent(game.id)}`;
  const detail = game.appId ? `/jogo/${game.appId}?titulo=${encodeURIComponent(game.title)}` : destination;
  const isExternal = !game.appId;

  return (
    <article className="discover-card">
      <a
        className="discover-cover"
        href={detail}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? (game.affiliate ? 'sponsored noreferrer' : 'noreferrer') : undefined}
        aria-label={`Ver ${game.title}`}
      >
        <img
          src={imgSrc || SAFE_LOOT_GAME_PLACEHOLDER}
          alt={game.title}
          loading="lazy"
          onError={handleError}
        />
        {game.discount > 0 && <span className="discount">−{game.discount}%</span>}
      </a>
      <div className="discover-card-body">
        <div className="discover-card-meta">
          <span>{game.store}{game.affiliate ? ' · Afiliado' : ''}</span>
          {game.badge ? (
            <span className="discover-badge-pill">{game.badge}</span>
          ) : (
            game.tags[0] && <span>{game.tags[0]}</span>
          )}
        </div>
        <h3>
          <a
            href={detail}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? (game.affiliate ? 'sponsored noreferrer' : 'noreferrer') : undefined}
          >
            {game.title}
          </a>
        </h3>
        {game.positive !== undefined && (
          <p className="discover-reviews">
            {game.positive}% positivas <span>· {game.reviews?.toLocaleString('pt-BR')} análises</span>
          </p>
        )}
        {game.endsAt && (
          <p className="discover-reviews">
            Resgate até {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(game.endsAt))}
          </p>
        )}
        <div className="discover-card-bottom">
          <div>
            {game.priceStatus === 'unconfirmed' || game.price === null ? (
              <strong>Consultar loja</strong>
            ) : (
              <>
                {game.original !== null && game.original > game.price && <s>{money(game.original)}</s>}
                <strong>{game.price === 0 ? 'Grátis' : money(game.price)}</strong>
              </>
            )}
          </div>
          <a
            href={detail}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? (game.affiliate ? 'sponsored noreferrer' : 'noreferrer') : undefined}
            aria-label={isExternal ? `Consultar oferta de ${game.title} na ${game.store}` : `Comparar preços de ${game.title} no SafeLoot`}
            title={isExternal ? 'Consultar na loja' : 'Comparar preços'}
          >
            <ArrowUpRight size={20} />
          </a>
        </div>
      </div>
    </article>
  );
}

function Shelf({ shelf, budget, sort }: { shelf: DiscoveryShelf; budget: string; sort: string }) {
  const [count, setCount] = useState(8);
  const [now] = useState(() => Date.now());
  const games = shelf.games
    .filter((game) => {
      if (game.endsAt && Date.parse(game.endsAt) <= now) return false;
      if (budget === 'all') return true;
      if (game.priceStatus === 'unconfirmed' || game.price === null) return false;
      return matchesPriceBand(game.price, budget);
    })
    .toSorted((a, b) =>
      sort === 'price'
        ? (a.price ?? Infinity) - (b.price ?? Infinity)
        : sort === 'discount'
          ? b.discount - a.discount
          : sort === 'name'
            ? a.title.localeCompare(b.title, 'pt-BR')
            : 0,
    );

  const displayTitle =
    shelf.id === 'cheap' && budget !== 'all'
      ? budget === '0'
        ? 'Achados grátis'
        : `Achados na faixa ${priceBandLabel(budget)}`
      : shelf.title;

  return (
    <section className="discover-shelf" id={`selection-${shelf.id}`} aria-labelledby={`shelf-${shelf.id}`}>
      <div className="discover-heading">
        <div>
          <span className="eyebrow">
            {shelf.id === 'cheap'
              ? 'O preço é pequeno. A descoberta, não.'
              : shelf.id === 'epic'
                ? 'Sua biblioteca agradece'
                : shelf.id === 'nuuvem'
                  ? 'Catálogo brasileiro em reais'
                  : shelf.id === 'gmg'
                    ? 'Chaves oficiais para ativação no PC'
                    : 'Escolha seu próximo jogo'}
          </span>
          <h2 id={`shelf-${shelf.id}`}>{displayTitle}</h2>
          <p>{shelf.description}</p>
        </div>
        {!!games.length && <span className="discover-count">{games.length} opções</span>}
      </div>
      {games.length ? (
        <>
          <div className="discover-grid">
            {games.slice(0, count).map((game) => (
              <DiscoveryCard key={game.id} game={game} />
            ))}
          </div>
          {games.length > count && (
            <button className="discover-more" type="button" onClick={() => setCount(count + 8)}>
              Explorar mais {shelf.id === 'cheap' ? 'achados' : 'jogos'} ({games.length - count})
            </button>
          )}
        </>
      ) : (
        <div className="discover-empty-panel">
          <p className="discover-empty">
            {shelf.status === 'unavailable'
              ? 'Esta loja está temporariamente inacessível. Você pode consultar as ofertas diretamente pelo link abaixo.'
              : budget === '0'
                ? 'Nenhuma oferta grátis nesta seleção agora.'
                : budget !== 'all'
                  ? `Nenhuma oferta desta seleção até R$ ${budget}.`
                  : 'Nenhuma oferta confirmada nesta seleção agora.'}
          </p>
          {shelf.id === 'gmg' && (
            <a className="discover-more" href="https://www.greenmangaming.com/pt/hot-deals/" target="_blank" rel="noreferrer">
              Consultar ofertas na Green Man Gaming ↗
            </a>
          )}
          {shelf.id === 'nuuvem' && (
            <a className="discover-more" href="https://www.nuuvem.com/br-pt/catalog" target="_blank" rel="noreferrer">
              Consultar catálogo completo na Nuuvem ↗
            </a>
          )}
          {['cheap', 'roguelike', 'indie'].includes(shelf.id) && (
            <a className="discover-more" href="https://store.steampowered.com/search/?specials=1&cc=br" target="_blank" rel="noreferrer">
              Consultar ofertas na Steam ↗
            </a>
          )}
          {shelf.id === 'epic' && (
            <a className="discover-more" href="https://store.epicgames.com/pt-BR/free-games" target="_blank" rel="noreferrer">
              Consultar jogos grátis na Epic Games Store ↗
            </a>
          )}
        </div>
      )}
    </section>
  );
}

export function DiscoveryShelves({ budget, sort }: { budget: string; sort: string }) {
  const [shelves, setShelves] = useState<DiscoveryShelf[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [store, setStore] = useState('all');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/discovery', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar as vitrines.');
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setError('');
          setShelves((data as { shelves: DiscoveryShelf[] }).shelves);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [retry]);

  const targetStore = store.toLowerCase().trim();
  const sourceShelves =
    targetStore === 'all'
      ? shelves
      : shelves?.filter((shelf) => {
          const sId = (shelf.storeId || (['cheap', 'roguelike', 'indie'].includes(shelf.id) ? 'steam' : shelf.id))
            .toLowerCase()
            .trim();
          return sId === targetStore;
        });

  const primaryStores = [
    ['all', 'Todas as lojas'],
    ['steam', 'Steam'],
    ['nuuvem', 'Nuuvem'],
    ['gmg', 'Green Man Gaming'],
    ['epic', 'Epic · grátis'],
  ] as const;

  return (
    <div className="discovery-home">
      <div className="discover-intro">
        <div>
          <span className="eyebrow">Sem ideia do que jogar?</span>
          <h2>Seu próximo favorito está por aqui.</h2>
          <p>Achados baratos, indies cheios de personalidade e ofertas de várias lojas. Tudo em reais.</p>
        </div>
        <button type="button" aria-label="Atualizar vitrines" onClick={() => setRetry(retry + 1)}>
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="source-filters" role="group" aria-label="Explorar por loja">
        {primaryStores.map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={store === value}
            onClick={() => setStore(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert">
          {error} <button type="button" onClick={() => setRetry(retry + 1)}>Tentar novamente</button>
        </p>
      ) : !shelves ? (
        <div className="discovery-loading" role="status">
          <Gamepad2 size={28} />
          <span>Garimpando ofertas nas lojas…</span>
        </div>
      ) : targetStore !== 'all' ? (
        sourceShelves && sourceShelves.length > 0 ? (
          sourceShelves.some((s) => s.games.length) ? (
            <>
              <nav className="category-tiles" aria-label="Explorar coleções">
                {sourceShelves
                  .filter((s) => s.games.length && ['indie', 'roguelike', 'epic'].includes(s.id))
                  .map((s) => (
                    <CategoryTile key={s.id + '-' + (s.games[0]?.id || '')} shelf={s} />
                  ))}
              </nav>
              {sourceShelves
                .filter((s) => s.games.length)
                .map((shelf) => (
                  <Shelf key={shelf.id} shelf={shelf} budget={budget} sort={sort} />
                ))}
              {sourceShelves.some((s) => !s.games.length) && (
                <details className="source-details">
                  <summary>Outras seleções sem ofertas ativas</summary>
                  {sourceShelves
                    .filter((s) => !s.games.length)
                    .map((shelf) => (
                      <Shelf key={shelf.id} shelf={shelf} budget={budget} sort={sort} />
                    ))}
                </details>
              )}
            </>
          ) : (
            <div className="discover-empty-panel">
              <p className="discover-empty">
                {sourceShelves.some((s) => s.status === 'unavailable')
                  ? 'Esta loja está temporariamente inacessível. Você pode consultar as ofertas diretamente pelo link abaixo.'
                  : budget === '0'
                    ? 'Nenhuma oferta grátis nesta seleção agora.'
                    : budget !== 'all'
                      ? `Nenhuma oferta desta seleção até R$ ${budget}.`
                      : 'Nenhuma oferta confirmada nesta seleção agora.'}
              </p>
              <StoreExternalLink store={targetStore} />
            </div>
          )
        ) : (
          <div className="discover-empty-panel">
            <p className="discover-empty">
              Esta loja está temporariamente inacessível. Você pode consultar as ofertas diretamente pelo link abaixo.
            </p>
            <StoreExternalLink store={targetStore} />
          </div>
        )
      ) : (
        <>
          <nav className="category-tiles" aria-label="Explorar coleções">
            {sourceShelves
              ?.filter((s) => s.games.length && ['indie', 'roguelike', 'epic'].includes(s.id))
              .map((s) => (
                <CategoryTile key={s.id + '-' + (s.games[0]?.id || '')} shelf={s} />
              ))}
          </nav>
          {sourceShelves
            ?.filter((s) => s.games.length)
            .map((shelf) => (
              <Shelf key={shelf.id} shelf={shelf} budget={budget} sort={sort} />
            ))}
          {sourceShelves?.some((s) => !s.games.length) && (
            <details className="source-details">
              <summary>Outras lojas e seleções sem ofertas ativas</summary>
              {sourceShelves
                .filter((s) => !s.games.length)
                .map((shelf) => (
                  <Shelf key={shelf.id} shelf={shelf} budget={budget} sort={sort} />
                ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}

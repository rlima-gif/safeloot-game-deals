'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Compass, Gamepad2, RefreshCw } from 'lucide-react';
import type { DiscoveryDeal, DiscoveryShelf } from '@/lib/discovery';
import {
  getCuratedDiscoverySelection,
  resolveCategoryRepresentatives,
} from '@/lib/discovery-curation';
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

function CategoryTile({
  shelf,
  repGame,
  rotationIndex = 0,
  onSelectCategory,
  isActive = false,
}: {
  shelf: DiscoveryShelf;
  repGame?: DiscoveryDeal;
  rotationIndex?: number;
  onSelectCategory?: (id: string) => void;
  isActive?: boolean;
}) {
  const activeRep = repGame || (shelf.games.length > 0 ? shelf.games[rotationIndex % shelf.games.length] : undefined);
  const initialImg =
    activeRep?.image ||
    (activeRep?.appId
      ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${activeRep.appId}/header.jpg`
      : SAFE_LOOT_GAME_PLACEHOLDER);
  const [prevGameId, setPrevGameId] = useState(activeRep?.id);
  const [imgSrc, setImgSrc] = useState(initialImg);

  if (activeRep?.id !== prevGameId) {
    setPrevGameId(activeRep?.id);
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
    if (activeRep?.appId) {
      const fallback = getGameArtworkFallback(imgSrc, activeRep.appId);
      if (fallback && fallback !== imgSrc) {
        setImgSrc(fallback);
        return;
      }
    }
    setImgSrc(SAFE_LOOT_GAME_PLACEHOLDER);
  };

  return (
    <a
      href={`#selection-${shelf.id}`}
      data-testid={`category-tile-${shelf.id}`}
      data-rep-id={activeRep?.id}
      data-rep-title={activeRep?.title}
      onClick={(e) => {
        if (onSelectCategory) {
          e.preventDefault();
          onSelectCategory(shelf.id);
        }
      }}
      style={{
        minHeight: '74px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-end',
        position: 'relative',
        textDecoration: 'none',
        borderRadius: '8px',
        overflow: 'hidden',
        border: isActive ? '1px solid #39ff14' : undefined,
        boxShadow: isActive ? '0 0 16px rgba(57, 255, 20, 0.25)' : undefined,
      }}
    >
      <img
        src={imgSrc || SAFE_LOOT_GAME_PLACEHOLDER}
        alt={`Coleção ${label}`}
        loading="lazy"
        onError={handleError}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '16px', fontWeight: 800, color: '#f3f4f6', lineHeight: 1.2 }}>{label}</span>
        {activeRep && (
          <span
            style={{
              fontSize: '11px',
              color: '#b0a6bf',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Destaque: <strong style={{ color: '#e5d7f6', fontWeight: 600 }}>{activeRep.title}</strong>
          </span>
        )}
      </div>
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

function CarouselCard({ game }: { game: DiscoveryDeal }) {
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
    <article
      className="discovery-carousel-card"
      data-appid={game.appId}
      data-game-id={game.id}
      data-testid="carousel-card"
    >
      <a
        className="carousel-cover"
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
        {game.discount > 0 && <span className="carousel-discount">−{game.discount}%</span>}
        <span className="carousel-store">
          {game.store}{game.affiliate ? ' · Afiliado' : ''}
        </span>
      </a>

      <div className="carousel-body">
        <div className="carousel-meta">
          {game.badge ? (
            <span className="discover-badge-pill">{game.badge}</span>
          ) : (
            game.tags[0] && <span>{game.tags[0]}</span>
          )}
          {game.positive !== undefined && (
            <span>· {game.positive}% positivas ({game.reviews ? (game.reviews > 1000 ? `${Math.round(game.reviews / 1000)}k` : game.reviews) : ''})</span>
          )}
          {game.endsAt && (
            <span>· Resgate até {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(game.endsAt))}</span>
          )}
        </div>

        <h3>
          <a
            className="carousel-title"
            href={detail}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? (game.affiliate ? 'sponsored noreferrer' : 'noreferrer') : undefined}
          >
            {game.title}
          </a>
        </h3>

        <div className="carousel-bottom">
          <div className="carousel-pricing">
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
            className="carousel-cta"
            href={detail}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? (game.affiliate ? 'sponsored noreferrer' : 'noreferrer') : undefined}
            aria-label={isExternal ? `Consultar oferta de ${game.title} na ${game.store}` : `Comparar preços de ${game.title} no SafeLoot`}
            title={isExternal ? 'Consultar na loja' : 'Comparar preços'}
          >
            <span>{isExternal ? (game.price === 0 ? 'Resgatar' : 'Na loja') : 'Comparar'}</span>
            <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
    </article>
  );
}

function DiscoveryCarousel({
  title,
  eyebrow,
  games,
  rotationIndex,
}: {
  title: string;
  eyebrow: string;
  games: DiscoveryDeal[];
  rotationIndex: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [games]);

  useEffect(() => {
    // Reset scroll when rotation replaces candidate set
    trackRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [rotationIndex]);

  const scroll = (direction: 'left' | 'right') => {
    const el = trackRef.current;
    if (!el) return;
    const distance = Math.max(280, Math.floor(el.clientWidth * 0.75));
    el.scrollBy({ left: direction === 'left' ? -distance : distance, behavior: 'smooth' });
  };

  if (!games.length) return null;

  return (
    <div className="discovery-carousel-wrapper" data-testid="discovery-carousel-v2">
      <div className="discovery-carousel-header">
        <div>
          <span className="eyebrow" style={{ color: '#39ff14', fontWeight: 800 }}>{eyebrow}</span>
          <h2 style={{ fontSize: '22px', margin: '2px 0 0', fontWeight: 700 }}>{title}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="discover-count" style={{ fontSize: '12px', color: '#b0a6bf', marginRight: '4px' }}>
            {games.length} jogos disponíveis
          </span>
          <div className="discovery-carousel-nav" aria-label="Navegar carrossel">
            <button
              type="button"
              className="discovery-carousel-btn"
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              aria-label="Ver jogos anteriores"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className="discovery-carousel-btn"
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              aria-label="Ver próximos jogos"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="discovery-carousel-track"
        ref={trackRef}
        aria-label="Roleta horizontal de jogos"
      >
        {games.map((game) => (
          <CarouselCard key={`carousel-${game.id}`} game={game} />
        ))}
      </div>
    </div>
  );
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
    <article className="discover-card" data-appid={game.appId} data-game-id={game.id}>
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

function Shelf({
  shelf,
  budget,
  sort,
  rotationIndex = 0,
}: {
  shelf: DiscoveryShelf;
  budget: string;
  sort: string;
  rotationIndex?: number;
}) {
  const [count, setCount] = useState(8);
  const [prevRotation, setPrevRotation] = useState(rotationIndex);
  if (rotationIndex !== prevRotation) {
    setPrevRotation(rotationIndex);
    setCount(8);
  }

  const [now] = useState(() => Date.now());
  const filteredGames = shelf.games
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

  const offset = filteredGames.length > 0 ? (rotationIndex * 8) % filteredGames.length : 0;
  const rotatedGames: DiscoveryDeal[] = [];
  const seenKeys = new Set<string | number>();
  for (let i = 0; i < filteredGames.length; i++) {
    const game = filteredGames[(offset + i) % filteredGames.length];
    const key = game.appId ?? game.id;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      rotatedGames.push(game);
    }
  }

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
        {!!rotatedGames.length && <span className="discover-count">{rotatedGames.length} opções</span>}
      </div>
      {rotatedGames.length ? (
        <>
          <div className="discover-grid">
            {rotatedGames.slice(0, count).map((game) => (
              <DiscoveryCard key={game.id} game={game} />
            ))}
          </div>
          {rotatedGames.length > count && (
            <button className="discover-more" type="button" onClick={() => setCount(count + 8)}>
              Explorar mais {shelf.id === 'cheap' ? 'achados' : 'jogos'} ({rotatedGames.length - count})
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
  const [rotationIndex, setRotationIndex] = useState(0);
  const [isDiscoverActive, setIsDiscoverActive] = useState(false);
  const [discoverStep, setDiscoverStep] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('all');

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

  const handleRotate = () => {
    setRotationIndex((prev) => prev + 1);
    if (isDiscoverActive) {
      setDiscoverStep((prev) => prev + 1);
    }
  };

  const handleDiscover = () => {
    if (isDiscoverActive) {
      setIsDiscoverActive(false);
    } else {
      setIsDiscoverActive(true);
      setDiscoverStep((prev) => prev + 1);
      if (store !== 'all') {
        setStore('all');
      }
    }
  };

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
    ['epic', 'Epic / Giveaways'],
  ] as const;

  const curatedDiscoveryGames = shelves ? getCuratedDiscoverySelection(shelves, discoverStep) : [];
  const categoryShelves =
    sourceShelves?.filter((s) => s.games.length && ['indie', 'roguelike', 'epic'].includes(s.id)) || [];
  const categoryRepresentatives = resolveCategoryRepresentatives(categoryShelves, rotationIndex);

  // Derive candidate pool for the Discovery Carousel V2 roulette:
  // Extracts candidates based on current context (store/category filter) and rotates via rotationIndex.
  const carouselCandidates: DiscoveryDeal[] = (() => {
    if (!sourceShelves || !sourceShelves.length) return [];
    
    let pool: DiscoveryDeal[] = [];
    if (activeCategory === 'all') {
      // Aggregate high-signal games across shelves
      for (const shelf of sourceShelves) {
        if (shelf.games?.length) {
          pool.push(...shelf.games);
        }
      }
    } else {
      const matched = sourceShelves.find((s) => s.id === activeCategory);
      if (matched?.games) pool = [...matched.games];
      else {
        // Fallback to all
        for (const shelf of sourceShelves) {
          if (shelf.games?.length) pool.push(...shelf.games);
        }
      }
    }

    // Deduplicate by appId or id
    const uniquePool: DiscoveryDeal[] = [];
    const seen = new Set<string | number>();
    for (const g of pool) {
      const key = g.appId ?? g.id;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePool.push(g);
      }
    }

    if (!uniquePool.length) return [];

    // Window slice based on rotationIndex:
    // ↻ = replace the candidate set.
    // Each rotation slides the candidate pool by 4 items so new games appear.
    const windowSize = Math.min(10, uniquePool.length);
    const offset = (rotationIndex * 4) % uniquePool.length;
    const candidates: DiscoveryDeal[] = [];
    const setSeen = new Set<string | number>();

    for (let i = 0; i < uniquePool.length && candidates.length < windowSize; i++) {
      const game = uniquePool[(offset + i) % uniquePool.length];
      const key = game.appId ?? game.id;
      if (!setSeen.has(key)) {
        setSeen.add(key);
        candidates.push(game);
      }
    }

    return candidates;
  })();

  return (
    <div className="discovery-home">
      <div className="discover-intro">
        <div>
          <span className="eyebrow">Sem ideia do que jogar?</span>
          <h2>Seu próximo favorito está por aqui.</h2>
          <p>Achados baratos, indies cheios de personalidade e ofertas de várias lojas. Tudo em reais.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, alignSelf: 'start' }}>
          <button
            type="button"
            onClick={handleDiscover}
            aria-pressed={isDiscoverActive}
            data-testid="discover-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 16px',
              minHeight: '44px',
              minWidth: '44px',
              fontSize: '13px',
              fontWeight: 700,
              fontFamily: 'inherit',
              borderRadius: '4px',
              cursor: 'pointer',
              border: isDiscoverActive
                ? '1px solid #39ff14'
                : '1px solid rgba(255, 255, 255, 0.15)',
              background: isDiscoverActive
                ? 'rgba(57, 255, 20, 0.15)'
                : 'rgba(255, 255, 255, 0.04)',
              color: isDiscoverActive ? '#39ff14' : '#f3f4f6',
              transition: 'border-color 0.18s, color 0.18s, background-color 0.18s',
            }}
          >
            <Compass size={16} />
            <span>Descobrir</span>
          </button>
          <button
            type="button"
            aria-label="Mostrar outros jogos"
            title="Mostrar outros jogos"
            data-testid="rotate-button"
            onClick={handleRotate}
            style={{
              minWidth: '44px',
              minHeight: '44px',
              display: 'grid',
              placeItems: 'center',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#f3f4f6',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'border-color 0.18s, color 0.18s',
            }}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="source-filters" role="group" aria-label="Explorar por loja">
        {primaryStores.map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={store === value}
            onClick={() => {
              setStore(value);
              if (value !== 'all') {
                setIsDiscoverActive(false);
              }
            }}
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
      ) : isDiscoverActive && curatedDiscoveryGames.length > 0 ? (
        <section
          className="discover-shelf discover-showcase"
          id="selection-descobrir"
          aria-labelledby="shelf-descobrir"
          data-testid="curated-discover-shelf"
          style={{
            background: 'linear-gradient(180deg, rgba(57, 255, 20, 0.06) 0%, rgba(12, 9, 20, 0.8) 100%)',
            padding: '24px 20px',
            borderRadius: '12px',
            border: '1px solid rgba(57, 255, 20, 0.3)',
            marginBottom: '32px',
          }}
        >
          <div className="discover-heading">
            <div>
              <span
                className="eyebrow"
                style={{
                  color: '#39ff14',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                ★ MODO DESCOBERTA · MIX CURADO
              </span>
              <h2 id="shelf-descobrir" style={{ fontSize: '26px', marginTop: '4px', marginBottom: '6px' }}>
                Descobertas para você explorar
              </h2>
              <p style={{ color: '#b0a6bf', fontSize: '14px', maxWidth: '680px' }}>
                Mix especial de 8 jogos de diferentes lojas, gêneros e faixas de preço selecionados para você explorar.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDiscoverStep((prev) => prev + 1)}
                data-testid="discover-reshuffle-button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(57, 255, 20, 0.15)',
                  border: '1px solid #39ff14',
                  color: '#39ff14',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '6px 14px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  minHeight: '36px',
                }}
              >
                <RefreshCw size={14} />
                <span>Sortear outro mix</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDiscoverActive(false)}
                data-testid="discover-exit-button"
                aria-label="Voltar às vitrines"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#f3f4f6',
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  minHeight: '36px',
                }}
              >
                ← Voltar às vitrines
              </button>
            </div>
          </div>

          {/* Discovery Carousel V2 for Curated Discovery */}
          <DiscoveryCarousel
            title="Mix de Descobertas Curadas"
            eyebrow="ROLETA DE DESCOBERTA · NAVEGUE PRO LADO"
            games={curatedDiscoveryGames}
            rotationIndex={discoverStep}
          />

          <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              type="button"
              onClick={() => setIsDiscoverActive(false)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#b0a6bf',
                fontSize: '13px',
                padding: '8px 18px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ← Voltar para todas as vitrines
            </button>
          </div>
        </section>
      ) : targetStore !== 'all' ? (
        sourceShelves && sourceShelves.length > 0 ? (
          sourceShelves.some((s) => s.games.length) ? (
            <>
              {categoryShelves.length > 0 && (
                <nav className="category-tiles" aria-label="Explorar coleções">
                  {categoryShelves.map((s) => (
                    <CategoryTile
                      key={`${s.id}-${categoryRepresentatives.get(s.id)?.id || rotationIndex}`}
                      shelf={s}
                      repGame={categoryRepresentatives.get(s.id)}
                      rotationIndex={rotationIndex}
                      onSelectCategory={setActiveCategory}
                      isActive={activeCategory === s.id}
                    />
                  ))}
                </nav>
              )}

              {/* Discovery Carousel V2 for Store Filter */}
              {carouselCandidates.length > 0 && (
                <DiscoveryCarousel
                  title={`Destaques em ${targetStore === 'steam' ? 'Steam' : targetStore === 'nuuvem' ? 'Nuuvem' : targetStore === 'gmg' ? 'Green Man Gaming' : 'Epic Games'}`}
                  eyebrow="ROLETA DE DESTAQUES · NAVEGUE PRO LADO"
                  games={carouselCandidates}
                  rotationIndex={rotationIndex}
                />
              )}

              {sourceShelves
                .filter((s) => s.games.length)
                .map((shelf) => (
                  <Shelf
                    key={shelf.id}
                    shelf={shelf}
                    budget={budget}
                    sort={sort}
                    rotationIndex={rotationIndex}
                  />
                ))}
              {sourceShelves.some((s) => !s.games.length) && (
                <details className="source-details">
                  <summary>Outras seleções sem ofertas ativas</summary>
                  {sourceShelves
                    .filter((s) => !s.games.length)
                    .map((shelf) => (
                      <Shelf
                        key={shelf.id}
                        shelf={shelf}
                        budget={budget}
                        sort={sort}
                        rotationIndex={rotationIndex}
                      />
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
          {/* Compact Category Navigation Tiles */}
          {categoryShelves.length > 0 && (
            <nav className="category-tiles" aria-label="Explorar coleções">
              {categoryShelves.map((s) => (
                <CategoryTile
                  key={`${s.id}-${categoryRepresentatives.get(s.id)?.id || rotationIndex}`}
                  shelf={s}
                  repGame={categoryRepresentatives.get(s.id)}
                  rotationIndex={rotationIndex}
                  onSelectCategory={setActiveCategory}
                  isActive={activeCategory === s.id}
                />
              ))}
            </nav>
          )}

          {/* Discovery Carousel V2 — Featured Horizontal Roulette */}
          {carouselCandidates.length > 0 && (
            <DiscoveryCarousel
              title="Destaques Recomendados"
              eyebrow="ROLETA DE JOGOS · DESLIZE PARA EXPLORAR"
              games={carouselCandidates}
              rotationIndex={rotationIndex}
            />
          )}

          {/* Detailed Categorical Shelves */}
          {sourceShelves
            ?.filter((s) => s.games.length)
            .map((shelf) => (
              <Shelf
                key={shelf.id}
                shelf={shelf}
                budget={budget}
                sort={sort}
                rotationIndex={rotationIndex}
              />
            ))}
          {sourceShelves?.some((s) => !s.games.length) && (
            <details className="source-details">
              <summary>Outras lojas e seleções sem ofertas ativas</summary>
              {sourceShelves
                .filter((s) => !s.games.length)
                .map((shelf) => (
                  <Shelf
                    key={shelf.id}
                    shelf={shelf}
                    budget={budget}
                    sort={sort}
                    rotationIndex={rotationIndex}
                  />
                ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}

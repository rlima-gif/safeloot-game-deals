'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Gamepad2, RefreshCw } from 'lucide-react';
import type { DiscoveryDeal, DiscoveryShelf } from '@/lib/discovery';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function DiscoveryCard({ game }: { game: DiscoveryDeal }) {
  const [broken, setBroken] = useState(false);
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
        {!broken && game.image ? (
          <img src={game.image} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <Gamepad2 size={40} />
        )}
        {game.discount > 0 && <span className="discount">−{game.discount}%</span>}
      </a>
      <div className="discover-card-body">
        <div className="discover-card-meta">
          <span>{game.store}{game.affiliate ? ' · Afiliado' : ''}</span>
          {game.tags[0] && <span>{game.tags[0]}</span>}
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
            {game.original > game.price && <s>{money(game.original)}</s>}
            <strong>{game.price === 0 ? 'Grátis' : money(game.price)}</strong>
          </div>
          <a
            href={destination}
            target="_blank"
            rel={game.affiliate ? 'sponsored noreferrer' : 'noreferrer'}
            aria-label={`Ver oferta de ${game.title} na ${game.store}`}
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
  const games = shelf.games
    .filter(
      (game) =>
        (!game.endsAt || Date.parse(game.endsAt) > Date.now()) &&
        (budget === 'all' || (budget === '0' ? game.price === 0 : game.price <= Number(budget))),
    )
    .toSorted((a, b) =>
      sort === 'price'
        ? a.price - b.price
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
        : `Achados até R$ ${budget}`
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
    setError('');
    void fetch('/api/discovery', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar as vitrines.');
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setShelves((data as { shelves: DiscoveryShelf[] }).shelves);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [retry]);

  const sourceShelves =
    store === 'all'
      ? shelves
      : shelves?.filter((shelf) =>
          (shelf.storeId || (['cheap', 'roguelike', 'indie'].includes(shelf.id) ? 'steam' : shelf.id)) === store,
        );

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
      ) : store !== 'all' ? (
        <>
          {sourceShelves?.map((shelf) => (
            <Shelf key={shelf.id} shelf={shelf} budget={budget} sort={sort} />
          ))}
        </>
      ) : (
        <>
          <nav className="category-tiles" aria-label="Explorar coleções">
            {sourceShelves
              ?.filter((s) => s.games.length && ['indie', 'roguelike', 'epic'].includes(s.id))
              .map((s) => (
                <a key={s.id} href={`#selection-${s.id}`}>
                  <img src={s.games[0].image} alt="" loading="lazy" />
                  {s.id === 'indie' ? 'Indies' : s.id === 'roguelike' ? 'Roguelikes' : 'Grátis na Epic'}
                </a>
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

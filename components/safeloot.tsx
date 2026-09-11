'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Gift,
  Heart,
  Home,
  Layers2,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  Store,
  X,
  RefreshCw,
  Globe2,
  Gamepad2,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FreeGames } from '@/components/free-games';
import { DiscoveryShelves } from '@/components/discovery-shelves';
import { StoreOptions } from '@/components/store-options';
import { stores, offerKind, offerCost, offerLink } from '@/lib/stores';
import { GamePlanning, ShoppingList, GameAvailability } from '@/components/game-planning';
import { CriticReview, MarketplaceLinks } from '@/components/game-editorial';
import { GameProfilePanel } from '@/components/game-profile';
import { PriceHistory } from '@/components/price-history';
import type { GameDetails, LiveGame, LiveOffer } from '@/lib/game-api';

type Highlights = {
  featured: LiveGame[];
  trending: LiveGame[];
  updatedAt: string;
};
type Offers = {
  game: GameDetails;
  offers: LiveOffer[];
  updatedAt: string;
  integrations?: { itad: 'ready' | 'not-configured' | 'unavailable' };
  coverage?: { store: string; available: boolean }[];
};
const money = (value: number | null, currency = 'BRL') =>
  value === null
    ? 'Indisponível'
    : value === 0
      ? 'Grátis'
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(
          value,
        );
const gameUrl = (id: number, title: string) =>
  `/jogo/${id}?titulo=${encodeURIComponent(title)}`;


function Cover({
  src,
  title,
  eager = false,
}: {
  src?: string;
  title: string;
  eager?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img
      src={src}
      alt={title}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="cover-empty">
      <Gamepad2 />
      <span>{title}</span>
    </span>
  );
}
function Discount({ value }: { value: number }) {
  return value > 0 ? <span className="discount">−{value}%</span> : null;
}
function GameRow({
  game,
  saved,
  toggle,
}: {
  game: LiveGame;
  saved: boolean;
  toggle: (g: LiveGame) => void;
}) {
  return (
    <article className="game-row">
      <a
        className="row-cover"
        href={gameUrl(game.id, game.title)}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Cover src={game.headerImage || game.image} title="" />
      </a>
      <div className="row-info">
        <a className="game-name" href={gameUrl(game.id, game.title)}>
          {game.title}
        </a>
        <span className="store-meta">
          <Store size={12} /> {game.store || 'Steam'} · Brasil
        </span>
      </div>
      <div className="row-price">
        <Discount value={game.discount} />
        <div>
          {game.originalPrice !== null &&
            game.finalPrice !== game.originalPrice && (
              <s>{money(game.originalPrice)}</s>
            )}
          <strong>{money(game.finalPrice)}</strong>
        </div>
      </div>
      <Button
        className={`save-icon ${saved ? 'saved' : ''}`}
        variant="ghost"
        size="icon"
        aria-label={`${saved ? 'Remover' : 'Salvar'} ${game.title}`}
        aria-pressed={saved}
        onClick={() => toggle(game)}
      >
        <Heart size={17} fill={saved ? 'currentColor' : 'none'} />
      </Button>
    </article>
  );
}
function Featured({ game, large }: { game: LiveGame; large: boolean }) {
  return (
    <a
      className={`featured-game ${large ? 'featured-large' : ''}`}
      href={gameUrl(game.id, game.title)}
    >
      <Cover src={game.image} title="" eager />
      <div className="featured-caption">
        <h2>{game.title}</h2>
        <div className="featured-price">
          <Discount value={game.discount} />
          <strong>{money(game.finalPrice)}</strong>
          {game.originalPrice !== game.finalPrice && (
            <s>{money(game.originalPrice)}</s>
          )}
        </div>
        <div className="featured-footer">
          <span>
            <Store size={14} /> Steam · Brasil
          </span>
          <span className="cta-small">
            Ver oferta <ChevronRight size={16} />
          </span>
        </div>
      </div>
    </a>
  );
}
function OfferRows({
  offers,
  international = false,
}: {
  offers: LiveOffer[];
  international?: boolean;
}) {
  return (
    <div className="offer-table-wrap">
      <table className="offer-table">
        <thead>
          <tr>
            <th>Loja</th>
            <th>Preço</th>
            <th className="discount-column">Desconto</th>
            <th className="activation-column">Ativação</th>
            <th className="region-column">Região</th>
            <th>
              <span className="sr-only">Abrir oferta</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {offers.map((o, index) => (
            <tr key={o.id}>
              <td>
                <span className="offer-store">
                  <Store size={17} />
                  {o.store}
                </span>
                <small className="offer-kind">{offerKind(o) === 'official' ? 'Oficial' : offerKind(o) === 'key' ? 'Key / marketplace' : 'Tipo não verificado'}{o.affiliate ? ' · Link afiliado' : ''}</small>
                <span className="mobile-meta">
                  {o.launcher || 'Ver ativação na loja'} · {o.region}
                </span>
              </td>
              <td>
                <strong
                  className={index === 0 && !international ? 'best-price' : ''}
                >
                  {money(offerCost(o), o.currency)}
                </strong>
                <small className="offer-kind">{o.feesIncluded ? 'Taxas incluídas' : 'Taxas: confirmar na loja'}</small>
                {(o.paymentMethods?.length || o.installments || o.coupon || o.cashback) && <small className="offer-kind">{[o.paymentMethods?.join(', '), o.installments, o.coupon && `Cupom: ${o.coupon}`, o.cashback].filter(Boolean).join(' · ')}</small>}
              </td>
              <td className="discount-column">
                <Discount value={o.discount} />
              </td>
              <td className="activation-column">
                {o.launcher || 'Confirmar na loja'}
              </td>
              <td className="region-column">
                {o.region}<small className="offer-kind">{o.activationInBrazil === true ? 'Ativa no Brasil' : o.activationInBrazil === false ? 'Não ativa no Brasil' : o.activationRestriction || 'Ativação: confirmar'}</small>
              </td>
              <td>
                <a
                  className="cta-small"
                  href={offerLink(o)}
                  target="_blank"
                  rel={o.affiliate ? "sponsored noreferrer" : "noreferrer"}
                  aria-label={`Ver oferta na ${o.store} por ${money(o.finalPrice, o.currency)}`}
                >
                  <span>Comprar</span>
                  <ArrowUpRight size={16} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SafeLoot({
  initialId,
  initialTitle = '',
}: {
  initialId?: number;
  initialTitle?: string;
}) {
  const [view, setView] = useState('offers'),
    [query, setQuery] = useState(''),
    [committed, setCommitted] = useState('');
  const [data, setData] = useState<Highlights | null>(null),
    [results, setResults] = useState<LiveGame[] | null>(null);
  const [loading, setLoading] = useState(true),
    [searching, setSearching] = useState(false),
    [error, setError] = useState(''),
    [searchError, setSearchError] = useState('');
  const [price, setPrice] = useState('all'),
    [sort, setSort] = useState('relevance'),
    [catalog, setCatalog] = useState('featured');
  const [storeFilter, setStoreFilter] = useState('all');
  const [favorites, setFavorites] = useState<number[]>([]),
    [savedGames, setSavedGames] = useState<LiveGame[]>([]),
    [notice, setNotice] = useState('');
  const [offers, setOffers] = useState<Offers | null>(null),
    [offersError, setOffersError] = useState(''),
    [offersLoading, setOffersLoading] = useState(!!initialId),
    [refresh, setRefresh] = useState(0);
  const [edition, setEdition] = useState('prices'),
    [related, setRelated] = useState<LiveGame[]>([]),
    [relatedError, setRelatedError] = useState(''),
    [relatedLoading, setRelatedLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    request = useRef<AbortController | null>(null);
  const composing = useRef(false);

  const runSearch = useCallback(async (term: string) => {
    request.current?.abort();
    if (term.trim().length < 2 || term.trim().length > 80) {
      setSearchError('Digite de 2 a 80 caracteres.');
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setSearchError('');
    setCommitted(term.trim());
    setResults(null);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(term.trim())}`,
        { signal: controller.signal },
      );
      const json = (await res.json()) as {
        results: LiveGame[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Busca indisponível.');
      if (!controller.signal.aborted) setResults(json.results);
    } catch (e) {
      if (!controller.signal.aborted)
        setSearchError(e instanceof Error ? e.message : 'Busca indisponível.');
    } finally {
      if (request.current === controller) setSearching(false);
    }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setView(
      ['free', 'wishlist', 'stores'].includes(params.get('view') || '')
        ? params.get('view')!
        : 'offers',
    );
    setPrice(
      ['10', '20', '50', '100'].includes(params.get('price') || '')
        ? params.get('price')!
        : 'all',
    );
    if (params.get('catalog') === 'trending') setCatalog('trending');
    setSort(
      ['price', 'discount', 'name'].includes(params.get('sort') || '')
        ? params.get('sort')!
        : 'relevance',
    );
    const term = params.get('q');
    if (term && !initialId) {
      setQuery(term);
      void runSearch(term);
    }
    try {
      const ids = JSON.parse(
        localStorage.getItem('ludopreco-favorites') || '[]',
      );
      setFavorites(
        Array.isArray(ids)
          ? ids.filter((n) => Number.isInteger(n) && n > 0)
          : [],
      );
      const saved = JSON.parse(
        localStorage.getItem('safeloot-saved-games') || '[]',
      );
      setSavedGames(
        Array.isArray(saved)
          ? saved.filter(
              (g) => Number.isInteger(g.id) && typeof g.title === 'string',
            )
          : [],
      );
    } catch {
      setNotice('Não foi possível ler a lista salva neste navegador.');
    }
    return () => request.current?.abort();
  }, [initialId, runSearch]);
  useEffect(() => {
    if (initialId) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetch('/api/highlights', { signal: controller.signal })
      .then(async (r) => {
        const json = (await r.json()) as Highlights & { error?: string };
        if (!r.ok) throw new Error(json.error);
        if (!controller.signal.aborted) setData(json);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialId, refresh]);
  useEffect(() => {
    if (initialId === undefined) return;
    if (!Number.isInteger(initialId) || initialId <= 0) {
      setOffersError('Jogo inválido. Volte à busca para escolher um jogo.');
      setOffersLoading(false);
      return;
    }
    const controller = new AbortController();
    setOffersLoading(true);
    setOffersError('');
    setOffers(null);
    void fetch(
      `/api/offers?appid=${initialId}&title=${encodeURIComponent(initialTitle)}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const json = (await r.json()) as Offers & { error?: string };
        if (!r.ok) throw new Error(json.error);
        if (!controller.signal.aborted) setOffers(json);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setOffersError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setOffersLoading(false);
      });
    return () => controller.abort();
  }, [initialId, initialTitle, refresh]);
  useEffect(() => {
    if (edition !== 'dlc' || !offers?.game.dlcIds?.length) return;
    const controller = new AbortController();
    setRelatedLoading(true);
    setRelatedError('');
    void fetch(
      `/api/search?q=${encodeURIComponent(offers.game.title.slice(0, 80))}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error('Não foi possível carregar os conteúdos adicionais.');
        const json = (await r.json()) as { results: LiveGame[] };
        if (!controller.signal.aborted)
          setRelated(
            json.results.filter((g: LiveGame) =>
              offers.game.dlcIds!.includes(g.id),
            ),
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setRelatedError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRelatedLoading(false);
      });
    return () => controller.abort();
  }, [edition, offers]);
  const allGames = useMemo(
    () => [
      ...new Map(
        [
          ...savedGames,
          ...(data?.featured || []),
          ...(data?.trending || []),
          ...(results || []),
        ].map((g) => [g.id, g]),
      ).values(),
    ],
    [savedGames, data, results],
  );
  const shown = useMemo(() => {
    const list =
      view === 'wishlist'
        ? allGames.filter((g) => favorites.includes(g.id))
        : committed
          ? results || []
          : data?.[catalog === 'trending' ? 'trending' : 'featured'] || [];
    return list
      .filter(
        (g) =>
          price === 'all' ||
          (g.currency === 'BRL' &&
            g.finalPrice !== null &&
            g.finalPrice <= Number(price)),
      )
      .toSorted((a, b) =>
        sort === 'price'
          ? (a.finalPrice ?? Infinity) - (b.finalPrice ?? Infinity)
          : sort === 'discount'
            ? b.discount - a.discount
            : sort === 'name'
              ? a.title.localeCompare(b.title, 'pt-BR')
              : 0,
      );
  }, [
    allGames,
    view,
    favorites,
    committed,
    results,
    data,
    catalog,
    price,
    sort,
  ]);
  function toggle(game: LiveGame) {
    const next = favorites.includes(game.id)
      ? favorites.filter((id) => id !== game.id)
      : [...favorites, game.id];
    const entries = [
      ...new Map([...savedGames, game].map((g) => [g.id, g])).values(),
    ].filter((g) => next.includes(g.id));
    setFavorites(next);
    setSavedGames(entries);
    try {
      localStorage.setItem('ludopreco-favorites', JSON.stringify(next));
      localStorage.setItem('safeloot-saved-games', JSON.stringify(entries));
      setNotice(
        next.includes(game.id)
          ? `${game.title} salvo na lista de desejos.`
          : `${game.title} removido da lista.`,
      );
    } catch {
      setNotice(
        'A lista foi atualizada nesta tela, mas o navegador não permitiu salvar.',
      );
    }
  }
  function updateFilter(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value === 'all' || value === 'relevance') url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    window.history.replaceState(null, '', url);
  }
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (composing.current) return;
    if (initialId || view !== 'offers') {
      if (query.trim().length < 2) {
        setSearchError('Digite pelo menos 2 caracteres.');
        return;
      }
      window.location.assign(`/?q=${encodeURIComponent(query.trim())}`);
    } else {
      updateFilter('q', query.trim());
      void runSearch(query);
    }
  }
  function clear() {
    request.current?.abort();
    request.current = null;
    setQuery('');
    setCommitted('');
    setResults(null);
    setSearching(false);
    setSearchError('');
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
    input.current?.focus();
  }
  const regional =
    offers?.offers
      .filter((o) => o.currency === 'BRL' && o.activationInBrazil !== false && (storeFilter === 'all' || offerKind(o) === storeFilter))
      .toSorted((a, b) => offerCost(a) - offerCost(b)) || [];
  const international =
    offers?.offers.filter((o) => o.currency !== 'BRL') || [];
  const best = regional[0];
  const detailGame: LiveGame | null = offers
    ? {
        id: offers.game.id,
        title: offers.game.title,
        image: offers.game.image,
        headerImage: offers.game.image,
        finalPrice: best?.finalPrice ?? null,
        originalPrice: best?.originalPrice ?? null,
        store: best?.store || 'Steam',
        currency: 'BRL',
        discount: best?.discount || 0,
        score: offers.game.score,
        windows: true,
        mac: false,
        linux: false,
        expiresAt: null,
        storeUrl: best?.url || '',
      }
    : null;

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a href="/" className="brand" aria-label="SafeLoot — início">
            <Layers2 className="brand-icon" />
            <span>
              SAFE<span>LOOT</span>
              <b>_</b>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="Navegação principal">
            <a
              href="/"
              aria-current={
                !initialId && view === 'offers' ? 'page' : undefined
              }
            >
              Ofertas
            </a>
            <a
              href="/?view=free"
              aria-current={view === 'free' ? 'page' : undefined}
            >
              Grátis
            </a>
            <a
              href="/?view=wishlist"
              aria-current={view === 'wishlist' ? 'page' : undefined}
            >
              Lista de desejos
            </a>
          </nav>
          <form
            noValidate
            className="header-search"
            role="search"
            onSubmit={submit}
          >
            <Search size={18} />
            <Input
              ref={input}
              aria-label="Buscar jogos"
              placeholder="Buscar jogos, expansões…"
              value={query}
              maxLength={80}
              onChange={(e) => setQuery(e.target.value)}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label="Limpar busca"
                onClick={clear}
              >
                <X size={16} />
              </Button>
            )}
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Buscar"
              disabled={searching}
            >
              {searching ? (
                <LoaderCircle className="spin" />
              ) : (
                <ChevronRight size={18} />
              )}
            </Button>
          </form>
          <span className="region-label">
            <Globe2 size={15} /> Brasil · R$
          </span>
          <a
            className="header-wishlist"
            href="/?view=wishlist"
            aria-label={`Lista de desejos, ${favorites.length} jogos`}
          >
            <Heart size={19} />
            {favorites.length > 0 && <span>{favorites.length}</span>}
          </a>
        </div>
      </header>
      <main id="conteudo" className="shell page-main">
        {searchError && (
          <p className="error-message" role="alert">
            {searchError}
          </p>
        )}
        {initialId !== undefined ? (
          <>
            <a className="back-link" href="/">
              <ArrowLeft size={15} /> Ofertas <ChevronRight size={14} />{' '}
              {offers?.game.title || initialTitle || 'Jogo'}
            </a>
            {offersLoading ? (
              <div className="loading-panel" role="status">
                <LoaderCircle className="spin" /> Consultando preços nas lojas…
              </div>
            ) : offersError ? (
              <div className="empty-state" role="alert">
                <h1>Não conseguimos consultar este jogo.</h1>
                <p>{offersError}</p>
                <Button onClick={() => setRefresh((n) => n + 1)}>
                  Tentar novamente
                </Button>
              </div>
            ) : offers && detailGame ? (
              <div className="game-detail">
                <div className="detail-main">
                  <div className="game-intro">
                    <div className="detail-cover">
                      <Cover
                        src={offers.game.image}
                        title={offers.game.title}
                        eager
                      />
                    </div>
                    <div>
                      <span className="eyebrow">
                        {offers.game.kind === 'dlc'
                          ? 'Conteúdo adicional · DLC'
                          : offers.game.kind === 'demo'
                            ? 'Demonstração'
                            : 'Jogo para PC'}
                      </span>
                      <h1>{offers.game.title}</h1>
                      <p className="developer">
                        {offers.game.developers.join(' · ')}
                      </p>
                      <div className="genre-tags">
                        {offers.game.genres.slice(0, 3).map((g) => (
                          <span key={g}>{g}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div
                    className="edition-nav"
                    role="group"
                    aria-label="Conteúdo do jogo"
                  >
                    <Button
                      className={edition === 'prices' ? 'active' : ''}
                      variant="outline"
                      onClick={() => setEdition('prices')}
                    >
                      {offers.game.kind === 'dlc'
                        ? 'Este DLC'
                        : 'Preços do jogo'}
                    </Button>
                    {!!offers.game.dlcIds?.length && (
                      <Button
                        className={edition === 'dlc' ? 'active' : ''}
                        variant="outline"
                        onClick={() => setEdition('dlc')}
                      >
                        DLCs ({offers.game.dlcIds.length})
                      </Button>
                    )}
                    {offers.game.baseGame && (
                      <a
                        className="secondary-link"
                        href={gameUrl(
                          Number(offers.game.baseGame.id),
                          offers.game.baseGame.name,
                        )}
                      >
                        Ver jogo base
                      </a>
                    )}
                  </div>
                  <CriticReview game={offers.game} />
                  <section className="comparison-section">
                    <div className="panel-heading">
                      <h2>
                        {edition === 'dlc'
                          ? 'Conteúdos adicionais'
                          : 'Comparar preços em reais'}
                      </h2>
                      {edition === 'prices' && (
                        <span>
                          {regional.length}{' '}
                          {regional.length === 1 ? 'oferta' : 'ofertas'}
                        </span>
                      )}
                    </div>
                    <div className="source-filters" role="group" aria-label="Tipo de loja">{[['all','Todas'],['official','Lojas oficiais'],['key','Keys']].map(([value,label]) => <button key={value} aria-pressed={storeFilter === value} onClick={() => setStoreFilter(value)}>{label}</button>)}</div>
                    {edition === 'prices' && <StoreOptions offers={offers.offers} filter={storeFilter} />}
                    {edition === 'dlc' ? (
                      relatedLoading ? (
                        <p className="loading-inline" role="status">
                          <LoaderCircle className="spin" /> Buscando DLCs…
                        </p>
                      ) : relatedError ? (
                        <p role="alert">{relatedError}</p>
                      ) : (
                        <>
                          {related.map((g) => (
                            <GameRow
                              key={g.id}
                              game={g}
                              saved={favorites.includes(g.id)}
                              toggle={toggle}
                            />
                          ))}
                          {!related.length && (
                            <p className="muted">
                              Os conteúdos adicionais não apareceram nesta
                              busca.
                            </p>
                          )}
                          <a
                            className="secondary-link"
                            href={`https://store.steampowered.com/dlc/${initialId}/?cc=br&l=brazilian`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver todos os DLCs na Steam{' '}
                            <ArrowUpRight size={14} />
                          </a>
                        </>
                      )
                    ) : regional.length ? (
                      <OfferRows offers={regional} />
                    ) : (
                      <div className="empty-state">
                        <p>Nenhuma oferta em reais confirmada neste momento.</p>
                        <a href="/?view=stores">Consultar outras lojas</a>
                      </div>
                    )}
                  </section>
                  <p className="price-disclosure">
                    Menor preço entre as ofertas consultadas. Confira a edição e
                    a ativação na loja antes de comprar.
                  </p>
                  {international.length > 0 && (
                    <details className="international">
                      <summary>
                        Outras ofertas internacionais ({international.length}){' '}
                        <span>Em US$</span>
                      </summary>
                      <p>
                        Valores originais em dólares. Impostos e restrições
                        regionais podem variar; não entram no ranking em reais.
                      </p>
                      <OfferRows offers={international} international />
                    </details>
                  )}
                  <PriceHistory appId={initialId} currentOffer={offers.offers.find(o => o.store === 'Steam' && o.currency === 'BRL')} />
                  <GameProfilePanel key={initialId} game={offers.game} />
                  <MarketplaceLinks />
                  <GameAvailability game={offers.game} />
                  <details className="source-details">
                    <summary>Lojas consultadas e atualização</summary>
                    <p>
                      Consulta:{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/Sao_Paulo',
                      }).format(new Date(offers.updatedAt))}{' '}
                      (Brasília).
                    </p>
                    {offers.integrations?.itad === 'not-configured' && <p>Outras lojas via IsThereAnyDeal: comparação automática ainda não ativada. Nuuvem é consultada diretamente.</p>}
                    {offers.integrations?.itad === 'unavailable' && <p>IsThereAnyDeal: consulta temporariamente indisponível.</p>}
                    {offers.coverage?.map((c) => (
                      <p key={c.store}>
                        <strong>{c.store}</strong> —{' '}
                        {c.available
                          ? regional.some((o) => o.store === c.store)
                            ? 'oferta em reais encontrada'
                            : 'sem oferta correspondente confirmada'
                          : 'consulta indisponível'}
                      </p>
                    ))}
                  </details>
                </div>
                <aside className="detail-sidebar">
                  <section className="purchase-panel">
                    <span className="eyebrow">
                      {best ? 'Menor preço encontrado' : 'Sem oferta em reais'}
                    </span>
                    <div className="purchase-price">
                      <strong>{money(best ? offerCost(best) : null)}</strong>
                      {best && <Discount value={best.discount} />}
                    </div>
                    {best && (
                      <>
                        <div className="purchase-store">
                          <Store size={17} />
                          <b>{best.store}</b>
                          <span>
                            {best.launcher || 'Ver ativação na loja'} · BR
                          </span>
                        </div>
                        {best.originalPrice > best.finalPrice && (
                          <p className="muted">
                            De <s>{money(best.originalPrice)}</s>
                          </p>
                        )}
                        <a
                          className="primary-link"
                          href={offerLink(best)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {best.affiliate ? 'Ver oferta · afiliado' : 'Ver oferta'} <ArrowUpRight size={18} />
                        </a>
                      </>
                    )}
                    <Button
                      className="wishlist-button"
                      variant="outline"
                      onClick={() => toggle(detailGame)}
                      aria-pressed={favorites.includes(detailGame.id)}
                    >
                      <Heart
                        size={17}
                        fill={
                          favorites.includes(detailGame.id)
                            ? 'currentColor'
                            : 'none'
                        }
                      />
                      {favorites.includes(detailGame.id)
                        ? 'Salvo na lista de desejos'
                        : 'Adicionar à lista de desejos'}
                    </Button>
                  </section>
                  <GamePlanning game={offers.game} offers={offers.offers} updatedAt={offers.updatedAt} />
                  <ShoppingList />
                  <a className="more-stores" href="/?view=stores">
                    <Store size={18} />
                    <span>
                      Procurando outra loja?
                      <small>Veja Nuuvem, Fanatical e mais</small>
                    </span>
                    <ChevronRight size={18} />
                  </a>
                </aside>
                {best && (
                  <div className="mobile-purchase">
                    <div>
                      <small>{best.store}{best.affiliate ? ' · Link afiliado' : ''}</small>
                      <strong>{money(offerCost(best))}</strong>
                    </div>
                    <a
                      className="primary-link"
                      href={offerLink(best)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver oferta <ArrowUpRight size={17} />
                    </a>
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : view === 'stores' ? (
          <>
            <div className="page-heading">
              <h1>Lojas, sem mistério.</h1>
              <p>
                Saiba de onde vêm os preços e onde consultar outras ofertas.
              </p>
            </div>
            <div className="source-filters" role="group" aria-label="Filtrar lojas">{[['all','Todas'],['official','Lojas oficiais'],['key','Keys']].map(([value,label]) => <button key={value} aria-pressed={storeFilter === value} onClick={() => setStoreFilter(value)}>{label}</button>)}</div>
            <div className="stores-grid">
              {stores.filter(s => storeFilter === 'all' || s.kind === storeFilter).map((s) => (
                <article key={s.name}>
                  <div className="panel-heading">
                    <h2>
                      <Store size={19} /> {s.name}
                    </h2>
                    <span className={s.active ? 'store-active' : 'muted'}>
                      {s.status}
                    </span>
                  </div>
                  <p><strong>{s.kind === 'official' ? 'Loja oficial' : 'Keys / marketplace'}</strong> · {s.desc}</p>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    Visitar loja <ArrowUpRight size={16} />
                  </a>
                </article>
              ))}
            </div>
            <p className="price-disclosure">
              Lojas sem preço confirmado não participam do ranking. As ofertas
              internacionais do CheapShark aparecem separadas, em sua moeda
              original.
            </p>
          </>
        ) : view === 'free' ? (
          <>
            <div className="page-heading">
              <span className="eyebrow">Para ficar na sua biblioteca</span>
              <h1>Jogos grátis para resgatar.</h1>
              <p>Jogos pagos oferecidos gratuitamente por tempo limitado.</p>
            </div>
            <FreeGames />
          </>
        ) : (
          <>
            <div className="page-heading">
              <h1>
                {view === 'wishlist' ? (
                  'Sua próxima jogatina.'
                ) : committed ? (
                  `Resultados para “${committed}”`
                ) : (
                  <>
                    Jogue mais. <em>Pague melhor.</em>
                  </>
                )}
              </h1>
              <p>
                {view === 'wishlist'
                  ? 'Sua lista de desejos, salva neste navegador. Abra o jogo para atualizar os preços.'
                  : committed
                    ? 'Preços da Steam Brasil. Abra um jogo para comparar as lojas.'
                    : 'Compare ofertas de jogos para PC. Preços em reais, direto das lojas.'}
              </p>
            </div>
            {!committed && view === 'offers' && (
              <div className="featured-grid">
                {data?.featured.slice(0, 3).map((g, i) => (
                  <Featured game={g} large={i === 0} key={g.id} />
                ))}
                {loading && !data && (
                  <div className="feature-loading" role="status">
                    <LoaderCircle className="spin" /> Carregando ofertas…
                  </div>
                )}
              </div>
            )}
            <nav className="discovery-links" aria-label="Descobrir ofertas"><a href="/?sort=discount">Maiores descontos</a><a href="/?price=20&sort=price">Até R$ 20</a><a href="/?catalog=trending">Ofertas populares</a><a href="/?view=free">Jogos grátis</a></nav>
            {view === 'wishlist' && <ShoppingList />}
            <div className="filter-bar">
              <div
                className="budget-filters"
                role="group"
                aria-label="Filtrar por preço"
              >
                {['all', '10', '20', '50', '100'].map((p) => (
                  <Button
                    variant="outline"
                    key={p}
                    className={price === p ? 'active' : ''}
                    aria-pressed={price === p}
                    onClick={() => {
                      setPrice(p);
                      updateFilter('price', p);
                    }}
                  >
                    {p === 'all' ? 'Todos' : `Até R$ ${p}`}
                  </Button>
                ))}
                <a className="free-filter" href="/?view=free">
                  <Gift size={15} /> Grátis para resgatar
                </a>
              </div>
              <label className="sort-label">
                <SlidersHorizontal size={15} />
                <span className="sr-only">Ordenar ofertas</span>
                <select
                  aria-label="Ordenar ofertas"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    updateFilter('sort', e.target.value);
                  }}
                >
                  <option value="relevance">Mais relevantes</option>
                  <option value="price">Menor preço</option>
                  <option value="discount">Maior desconto</option>
                  <option value="name">Nome do jogo</option>
                </select>
              </label>
            </div>
            {!committed && view === 'offers' && <DiscoveryShelves budget={price} sort={sort} />}
            <section className="deals-section">
              <div className="section-heading">
                <h2>
                  {view === 'wishlist'
                    ? `${favorites.length} jogos salvos`
                    : committed
                      ? `${shown.length} resultados`
                      : 'Ofertas em destaque'}
                </h2>
                {!committed && view === 'offers' && (
                  <div
                    className="catalog-switch"
                    role="group"
                    aria-label="Vitrine"
                  >
                    <button
                      aria-pressed={catalog === 'featured'}
                      onClick={() => setCatalog('featured')}
                    >
                      Em oferta
                    </button>
                    <button
                      aria-pressed={catalog === 'trending'}
                      onClick={() => setCatalog('trending')}
                    >
                      Mais vendidos
                    </button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Atualizar ofertas"
                  disabled={loading}
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  <RefreshCw size={16} />
                </Button>
              </div>
              {error && (
                <p className="error-message" role="alert">
                  {error}{' '}
                  <button onClick={() => setRefresh((n) => n + 1)}>
                    Tentar novamente
                  </button>
                </p>
              )}
              {searching ? (
                <div className="loading-panel" role="status">
                  <LoaderCircle className="spin" /> Buscando jogos…
                </div>
              ) : (
                <div className="game-grid">
                  {shown.map((g) => (
                    <GameRow
                      game={g}
                      key={g.id}
                      saved={favorites.includes(g.id)}
                      toggle={toggle}
                    />
                  ))}
                </div>
              )}
              {!searching && !loading && !shown.length && !error && (
                <div className="empty-state">
                  <Heart size={28} />
                  <h3>
                    {view === 'wishlist'
                      ? 'Sua lista está esperando o próximo jogo.'
                      : 'Nenhum jogo com esses filtros.'}
                  </h3>
                  <p>
                    {view === 'wishlist'
                      ? 'Toque no coração de uma oferta para salvar aqui.'
                      : 'Tente outro nome ou amplie a faixa de preço.'}
                  </p>
                  {price !== 'all' && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPrice('all');
                        updateFilter('price', 'all');
                      }}
                    >
                      Limpar filtro de preço
                    </Button>
                  )}
                </div>
              )}
              {view === 'wishlist' &&
                favorites.some((id) => !allGames.some((g) => g.id === id)) && (
                  <div className="legacy-favorites">
                    <p>Jogos salvos anteriormente:</p>
                    {favorites
                      .filter((id) => !allGames.some((g) => g.id === id))
                      .map((id) => (
                        <a key={id} href={`/jogo/${id}`}>
                          Atualizar jogo #{id} <ChevronRight size={14} />
                        </a>
                      ))}
                  </div>
                )}
            </section>
            <a className="giveaway-banner" href="/?view=free">
              <Gift size={26} />
              <span>
                <strong>Jogos grátis para resgatar</strong>
                <small>
                  Ofertas por tempo limitado, para ficar na biblioteca.
                </small>
              </span>
              <span>
                Ver grátis <ChevronRight size={18} />
              </span>
            </a>
            <div className="source-strip">
              <span>Compare no SafeLoot</span>
              <a href="/?view=stores">Steam</a>
              <a href="/?view=stores">GOG</a>
              <a href="/?view=stores">Hype Games</a>
              <a href="/?view=stores">GamersGate</a>
              <a href="/?view=stores">
                Todas as lojas <ChevronRight size={14} />
              </a>
            </div>
          </>
        )}
      </main>
      <footer className="site-footer shell">
        <a href="/" className="brand">
          <Layers2 size={21} />
          <span>
            SAFE<span>LOOT</span>
          </span>
        </a>
        <p>
          Mais jogo. Melhores escolhas.
          <br />
          <small>Preços podem mudar. Confirme o valor final na loja.</small>
        </p>
        <a href="/?view=stores">
          Lojas e fontes <ArrowUpRight size={14} />
        </a>
      </footer>
      <nav className="mobile-nav" aria-label="Navegação mobile">
        <a
          href="/"
          aria-current={!initialId && view === 'offers' ? 'page' : undefined}
        >
          <Home size={19} />
          Ofertas
        </a>
        <button
          onClick={() => {
            input.current?.focus();
            input.current?.scrollIntoView({ block: 'center' });
          }}
        >
          <Search size={19} />
          Buscar
        </button>
        <a
          href="/?view=wishlist"
          aria-current={view === 'wishlist' ? 'page' : undefined}
        >
          <Heart size={19} />
          Lista
        </a>
        <a
          href="/?view=free"
          aria-current={view === 'free' ? 'page' : undefined}
        >
          <Gift size={19} />
          Grátis
        </a>
        <a
          href="/?view=stores"
          aria-current={view === 'stores' ? 'page' : undefined}
        >
          <Store size={19} />
          Lojas
        </a>
      </nav>
      <div className="status-toast" role="status" aria-live="polite">
        {notice && (
          <>
            <Check size={17} />
            {notice}
            <button aria-label="Fechar mensagem" onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </>
  );
}

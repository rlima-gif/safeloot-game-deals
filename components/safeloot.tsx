'use client';

import {
  lazy,
  Suspense,
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
  Newspaper,
  Target,
  Download,
  Share2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FreeGames } from '@/components/free-games';
import { DealCarousel } from '@/components/deal-carousel';
import { NewsSection } from '@/components/news-section';
import { Sheet,SheetTrigger,SheetContent,SheetTitle,SheetClose } from '@/components/ui/sheet';
import { DiscoveryShelves } from '@/components/discovery-shelves';
import { stores, findStore, offerKind, offerCost, offerLink, canonicalStoreId } from '@/lib/stores';
import { GamePlanning, ShoppingList, GameAvailability } from '@/components/game-planning';
import { CriticReview, MarketplaceLinks } from '@/components/game-editorial';
import { GameProfilePanel } from '@/components/game-profile';
import { validateWishlistBackup, createWishlistExport } from '@/lib/wishlist-backup';
const PriceHistory=lazy(()=>import('@/components/price-history').then(module=>({default:module.PriceHistory})));
import type { GameDetails, LiveGame, LiveOffer } from '@/lib/game-api';
import {
  ALLOWED_PRICES,
  matchesPriceBand,
  priceBandLabel,
  priceBandOptionLabel,
  normalizeLegacyPriceBand,
} from '@/lib/price-bands';
import { resolveGameArtwork } from '@/lib/game-images';

function parsePriceInput(val: string): number | null {
  const clean = val.replace('R$', '').trim().replace(',', '.');
  const num = parseFloat(clean);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
}

const ALLOWED_LIMITS = [10, 20, 30, 100];

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
  coverage?: { store: string; status?: string; diagnostic?: string; available?: boolean }[];
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

const statusLabel = (status?: string, available?: boolean) => {
  if (!status) return available ? 'Fonte respondeu' : 'Fonte indisponível';
  if (status === 'confirmed') return 'Preço confirmado';
  if (status === 'unavailable') return 'Indisponível';
  if (status === 'no-offer') return 'Sem oferta confirmada';
  if (status === 'parser-error') return 'Preço não validado · formato da fonte mudou';
  if (status === 'not-integrated') return 'Integração não implementada';
  return status;
};

function storeSearchAction(storeName: string, gameTitle: string): { url: string; verb: string } {
  const store = findStore(storeName);
  const q = encodeURIComponent(gameTitle);
  const id = store?.id || storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  switch (id) {
    case 'nuuvem':
      return { url: `https://www.nuuvem.com/br-pt/catalog/search/${q}`, verb: 'Buscar na loja' };
    case 'gog':
      return { url: `https://www.gog.com/en/games?query=${q}&countryCode=BR&currencyCode=BRL`, verb: 'Buscar na loja' };
    case 'hype':
      return { url: `https://hype.games/br/search?q=${q}`, verb: 'Buscar na loja' };
    case 'epic':
      return { url: `https://store.epicgames.com/pt-BR/browse?q=${q}`, verb: 'Buscar na loja' };
    case 'gmg':
      return { url: `https://www.greenmangaming.com/search?query=${q}`, verb: 'Buscar na loja' };
    case 'gamersgate':
      return { url: `https://www.gamersgate.com/pt/games/?query=${q}`, verb: 'Buscar na loja' };
    case 'steam':
      return { url: `https://store.steampowered.com/search/?term=${q}`, verb: 'Buscar na loja' };
    default:
      return { url: store?.url || '#', verb: 'Buscar na loja' };
  }
}

export function dealScore(g: LiveGame): number {
  let score = 0;
  score += Math.max(0, Math.min(100, g.discount || 0)) * 1.5;
  if (typeof g.score === 'number' && g.score > 0) {
    score += g.score;
  } else {
    score += 50;
  }
  if (g.priceStatus === 'confirmed') {
    score += 20;
  }
  if (g.finalPrice === 0) {
    score += 50;
  }
  return score;
}

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
  const appId = game.appId || (game.id > 0 ? game.id : undefined);
  const targetUrl = appId ? gameUrl(appId, game.title) : (game.storeUrl || '#');
  const isExternal = !appId;

  return (
    <article className="game-row">
      <a
        className="row-cover"
        href={targetUrl}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noreferrer' : undefined}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Cover src={resolveGameArtwork(game, 'row')} title="" />
      </a>
      <div className="row-info">
        <a
          className="game-name"
          href={targetUrl}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noreferrer' : undefined}
        >
          {game.title}
        </a>
        <span className="store-meta">
          <Store size={12} /> {game.store || 'Steam'} · Brasil
        </span>
      </div>
      <div className="row-price">
        <Discount value={game.discount} />
        <div>
          {game.priceStatus === 'unconfirmed' || game.finalPrice === null ? (
            <strong>Consultar loja</strong>
          ) : (
            <>
              {game.originalPrice !== null &&
                game.finalPrice !== null &&
                game.finalPrice !== game.originalPrice && (
                  <s>{money(game.originalPrice)}</s>
                )}
              <strong>{money(game.finalPrice)}</strong>
            </>
          )}
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

function WishlistGameCard({
  game,
  target,
  onUpdateTarget,
  onRemove,
}: {
  game: LiveGame;
  target?: number;
  onUpdateTarget: (val: number | null) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(target ? String(target) : '');
  const appId = game.appId || (game.id > 0 ? game.id : undefined);
  const targetUrl = appId ? gameUrl(appId, game.title) : (game.storeUrl || '#');
  const isExternal = !appId;

  const currentPrice = game.finalPrice;
  const hasTarget = typeof target === 'number' && Number.isFinite(target);
  const isReached = hasTarget && currentPrice !== null && currentPrice <= target;
  const delta = hasTarget && currentPrice !== null ? currentPrice - target : null;

  return (
    <article className={`wishlist-card ${isReached ? 'target-reached' : ''}`}>
      <div className="wishlist-main-info">
        <a
          className="wishlist-cover"
          href={targetUrl}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noreferrer' : undefined}
          tabIndex={-1}
          aria-hidden="true"
        >
          <Cover src={resolveGameArtwork(game, 'cover')} title="" />
        </a>
        <div className="wishlist-meta">
          <a
            className="wishlist-game-title"
            href={targetUrl}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noreferrer' : undefined}
          >
            {game.title}
          </a>
          <span className="store-meta">
            <Store size={12} /> {game.store || 'Steam'} · Loja autorizada · Brasil
          </span>
          <div className="wishlist-price-display">
            {game.originalPrice !== null &&
              currentPrice !== null &&
              currentPrice !== game.originalPrice && (
                <s>{money(game.originalPrice)}</s>
              )}
            <strong>{currentPrice !== null ? money(currentPrice) : 'Consultar loja'}</strong>
            <Discount value={game.discount} />
          </div>
        </div>
      </div>

      <div className="wishlist-radar-box">
        {editing ? (
          <form
            className="radar-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              const num = parsePriceInput(inputVal);
              if (num !== null) {
                onUpdateTarget(num);
                setEditing(false);
              }
            }}
          >
            <label htmlFor={`target-input-${game.id}`}>Quero pagar até (R$):</label>
            <div className="radar-form-row">
              <input
                id={`target-input-${game.id}`}
                type="text"
                inputMode="decimal"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Ex: 29,90"
                required
                autoFocus
              />
              <Button type="submit" size="sm">Salvar alvo</Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : hasTarget ? (
          <div className="radar-status-content">
            <div className="radar-badge-line">
              {isReached ? (
                <span className="radar-pill-reached">🎯 Alvo atingido!</span>
              ) : (
                <span className="radar-pill-waiting">
                  ⏳ Faltam {delta !== null ? money(delta) : ''}
                </span>
              )}
              <span className="radar-target-amount">
                Meta: <strong>{money(target)}</strong>
              </span>
            </div>
            <p className="radar-explanation">
              {isReached
                ? `Preço atual (${money(currentPrice)}) está ${delta !== null && delta < 0 ? `${money(Math.abs(delta))} abaixo` : 'exatamente no'} do seu alvo!`
                : `O menor preço hoje está ${delta !== null ? money(delta) : ''} acima da sua meta.`}
            </p>
            <div className="radar-controls">
              <button
                type="button"
                className="radar-control-link"
                onClick={() => {
                  setInputVal(String(target));
                  setEditing(true);
                }}
              >
                Alterar alvo
              </button>
              <span>·</span>
              <button
                type="button"
                className="radar-control-link"
                onClick={() => onUpdateTarget(null)}
              >
                Remover alvo
              </button>
            </div>
          </div>
        ) : (
          <div className="radar-empty-prompt">
            <button
              type="button"
              className="radar-define-btn"
              onClick={() => {
                setInputVal(currentPrice ? (currentPrice * 0.8).toFixed(2) : '');
                setEditing(true);
              }}
            >
              <Target size={14} /> Definir preço-alvo
            </button>
            <span className="radar-empty-hint">
              Defina sua meta e veja quando a promoção alcançar seu valor.
            </span>
          </div>
        )}
      </div>

      <div className="wishlist-card-actions">
        <a
          className="wishlist-visit-btn"
          href={targetUrl}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noreferrer' : undefined}
        >
          Ver ofertas <ChevronRight size={14} />
        </a>
        <Button
          variant="ghost"
          size="sm"
          className="wishlist-delete-btn"
          onClick={onRemove}
          aria-label={`Remover ${game.title} da lista`}
        >
          <X size={14} /> Remover
        </Button>
      </div>
    </article>
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
                <small className="offer-kind">{offerKind(o) === 'official' ? 'Oficial' : offerKind(o) === 'key' ? 'Key / marketplace' : 'Tipo não verificado'}{o.verifiedAt ? ' · Preço confirmado' : ''}{o.affiliate ? ' · Link afiliado' : ''}</small>
                <span className="mobile-meta">
                  {o.launcher || 'Launcher não confirmado'} · {o.edition || 'Edição não confirmada'} · {o.region}
                </span>
              </td>
              <td>
                <strong
                  className={index === 0 && !international ? 'best-price' : ''}
                >
                  {money(offerCost(o), o.currency)}
                </strong>
                <small className="offer-kind">{o.edition || 'Edição: confirmar'}{o.verifiedAt && <> · <time dateTime={o.verifiedAt}>{new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(o.verifiedAt))} BRT</time></>}</small>
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
                  <span>{o.currency === 'BRL' ? `Comprar por ${money(offerCost(o), o.currency)}` : 'Ver oferta'}</span>
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
  initialData = null,
}: {
  initialId?: number;
  initialTitle?: string;
  initialData?: Highlights | null;
}) {
  const [view, setView] = useState('offers'),
    [query, setQuery] = useState(''),
    [committed, setCommitted] = useState('');
  const [data, setData] = useState<Highlights | null>(initialData),
    [results, setResults] = useState<LiveGame[] | null>(null);
  const [loading, setLoading] = useState(!initialData),
    [searching, setSearching] = useState(false),
    [error, setError] = useState(''),
    [searchError, setSearchError] = useState('');
  const [price, setPrice] = useState('all'),
    [sort, setSort] = useState('relevance'),
    [resultLimit, setResultLimit] = useState<number>(30),
    [catalog, setCatalog] = useState('featured');
  const [storeFilter, setStoreFilter] = useState('all');
  const [homeStore, setHomeStore] = useState('all');
  const [selectedStore,setSelectedStore]=useState('all'),[launcherFilter,setLauncherFilter]=useState('all'),[regionFilter,setRegionFilter]=useState('all'),[offerSort,setOfferSort]=useState('price');
  const [favorites, setFavorites] = useState<number[]>([]),
    [savedGames, setSavedGames] = useState<LiveGame[]>([]),
    [targets, setTargets] = useState<Record<number, number>>({}),
    [wishlistUpdating, setWishlistUpdating] = useState(false),
    [wishlistFilter, setWishlistFilter] = useState<'all' | 'reached'>('all'),
    [returningUserAlert, setReturningUserAlert] = useState<{ reachedCount: number } | null>(null),
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
    const rawPrice = params.get('price');
    const normalizedPrice = normalizeLegacyPriceBand(rawPrice);
    if (normalizedPrice !== 'all') {
      setPrice(normalizedPrice);
    } else {
      setPrice('all');
      if (rawPrice !== null) {
        const url = new URL(window.location.href);
        url.searchParams.delete('price');
        window.history.replaceState(null, '', url);
      }
    }
    const rawStore = params.get('store');
    if (rawStore && ['steam', 'nuuvem', 'gmg', 'epic', 'all'].includes(rawStore.toLowerCase())) {
      setHomeStore(rawStore.toLowerCase());
    } else {
      setHomeStore('all');
    }
    if (params.get('catalog') === 'trending') setCatalog('trending');
    setSort(
      ['price', 'discount', 'name'].includes(params.get('sort') || '')
        ? params.get('sort')!
        : 'relevance',
    );
    const rawLimit = params.get('limit');
    if (rawLimit !== null) {
      const numLimit = Number(rawLimit);
      if (ALLOWED_LIMITS.includes(numLimit)) {
        setResultLimit(numLimit);
      }
    }
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
      const savedTargets = JSON.parse(
        localStorage.getItem('safeloot-targets') || '{}',
      );
      if (savedTargets && typeof savedTargets === 'object' && !Array.isArray(savedTargets)) {
        const valid: Record<number, number> = {};
        for (const [k, v] of Object.entries(savedTargets)) {
          const id = Number(k);
          const val = Number(v);
          if (Number.isInteger(id) && id > 0 && Number.isFinite(val) && val > 0) {
            valid[id] = val;
          }
        }
        setTargets(valid);
      }
      const lastVisit = localStorage.getItem('safeloot-last-visit');
      const now = Date.now();
      // Show alert only on a genuinely new return visit (>2h) and only when a saved target is reached
      if (lastVisit && now - Number(lastVisit) > 2 * 60 * 60 * 1000 && Array.isArray(saved) && saved.length > 0) {
        let reached = 0;
        for (const g of saved) {
          const target = savedTargets?.[g.id];
          if (typeof target === 'number' && target > 0 && typeof g.finalPrice === 'number' && g.finalPrice <= target) {
            reached++;
          }
        }
        if (reached > 0) {
          setReturningUserAlert({ reachedCount: reached });
        }
      }
      localStorage.setItem('safeloot-last-visit', String(now));
    } catch {
      setNotice('Não foi possível ler a lista salva neste navegador.');
    }

    const syncTargets = () => {
      try {
        const t = JSON.parse(localStorage.getItem('safeloot-targets') || '{}');
        if (t && typeof t === 'object' && !Array.isArray(t)) {
          const valid: Record<number, number> = {};
          for (const [k, v] of Object.entries(t)) {
            const id = Number(k);
            const val = Number(v);
            if (Number.isInteger(id) && id > 0 && Number.isFinite(val) && val > 0) {
              valid[id] = val;
            }
          }
          setTargets(valid);
        }
      } catch {}
    };
    window.addEventListener('safeloot-targets-changed', syncTargets);
    window.addEventListener('storage', syncTargets);

    return () => {
      request.current?.abort();
      window.removeEventListener('safeloot-targets-changed', syncTargets);
      window.removeEventListener('storage', syncTargets);
    };
  }, [initialId, runSearch]);
  const highlightsMounted = useRef(false);
  const initialDataRef = useRef(initialData);
  useEffect(() => {
    if (initialId) return;
    const controller = new AbortController();
    // Na primeira montagem, se já veio HTML do servidor com os destaques
    // (SSR), evita o flash de "carregando" e só revalida em silêncio.
    const seeded = !highlightsMounted.current && refresh === 0 && !!initialDataRef.current;
    highlightsMounted.current = true;
    if (!seeded) {
      setLoading(true);
      setError('');
    }
    void fetch('/api/highlights', { signal: controller.signal })
      .then(async (r) => {
        const json = (await r.json()) as Highlights & { error?: string };
        if (!r.ok) throw new Error(json.error);
        if (!controller.signal.aborted) setData(json);
      })
      .catch((e) => {
        if (!controller.signal.aborted && !seeded) setError(e.message);
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
  function updateTarget(gameId: number, targetPrice: number | null) {
    setTargets((prev) => {
      const next = { ...prev };
      if (targetPrice === null || !Number.isFinite(targetPrice) || targetPrice <= 0) {
        delete next[gameId];
      } else {
        next[gameId] = Math.round(targetPrice * 100) / 100;
      }
      try {
        localStorage.setItem('safeloot-targets', JSON.stringify(next));
        window.dispatchEvent(new Event('safeloot-targets-changed'));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const refreshWishlistPrices = useCallback(async () => {
    if (wishlistUpdating || !favorites.length) return;
    setWishlistUpdating(true);
    setNotice('Atualizando ofertas salvas…');
    let updatedCount = 0;
    try {
      const results = await Promise.allSettled(
        savedGames.slice(0, 20).map(async (g) => {
          const res = await fetch(
            `/api/offers?appid=${g.id}&title=${encodeURIComponent(g.title)}`,
            { signal: AbortSignal.timeout(15000) },
          );
          if (!res.ok) return null;
          const data = (await res.json()) as { offers?: LiveOffer[] };
          if (!data?.offers || !Array.isArray(data.offers)) return null;
          const valid = data.offers.filter(
            (o) => o.currency === 'BRL' && o.available !== false && Number.isFinite(o.finalPrice),
          );
          if (!valid.length) return null;
          const best = valid.toSorted((a, b) => (a.finalPrice ?? Infinity) - (b.finalPrice ?? Infinity))[0];
          return {
            ...g,
            finalPrice: best.finalPrice,
            originalPrice: best.originalPrice,
            discount: best.discount,
            store: best.store,
            storeUrl: best.url || g.storeUrl,
          };
        }),
      );

      const nextSaved = savedGames.map((g) => {
        const found = results.find(
          (r) => r.status === 'fulfilled' && r.value && r.value.id === g.id,
        );
        if (found && found.status === 'fulfilled' && found.value) {
          updatedCount++;
          return found.value;
        }
        return g;
      });

      setSavedGames(nextSaved);
      try {
        localStorage.setItem('safeloot-saved-games', JSON.stringify(nextSaved));
      } catch {}
      setNotice(`Preços atualizados para ${updatedCount} jogos salvos.`);
    } catch {
      setNotice('Não foi possível atualizar todos os preços da lista.');
    } finally {
      setWishlistUpdating(false);
    }
  }, [favorites, savedGames, wishlistUpdating]);

  const exportWishlist = useCallback(() => {
    try {
      const backup = createWishlistExport(favorites, savedGames, targets);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safeloot-radar-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice('Backup do Radar exportado com sucesso!');
    } catch {
      setNotice('Não foi possível exportar o arquivo.');
    }
  }, [favorites, savedGames, targets]);

  const importWishlist = useCallback(
    (file: File) => {
      if (file.size > 256 * 1024) {
        setNotice('Arquivo de backup excede o tamanho máximo de 256 KB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = e.target?.result;
          if (typeof raw !== 'string') return;
          const json = JSON.parse(raw);
          const result = validateWishlistBackup(json);
          if (!result.success || !result.data) {
            setNotice(result.error || 'Formato de backup inválido.');
            return;
          }
          const { favorites: importedFavs, savedGames: importedGames, targets: importedTargets } = result.data;
          const mergedFavs = Array.from(new Set([...favorites, ...importedFavs]));
          const gameMap = new Map<number, LiveGame>();
          for (const g of savedGames) {
            gameMap.set(g.id, g);
          }
          for (const g of importedGames) {
            if (!gameMap.has(g.id)) {
              gameMap.set(g.id, {
                id: g.id,
                title: g.title,
                store: g.store,
                headerImage: g.headerImage || '',
                image: g.headerImage || '',
                finalPrice: null,
                originalPrice: null,
                discount: 0,
                currency: 'BRL',
                score: null,
                windows: true,
                mac: false,
                linux: false,
                expiresAt: null,
                storeUrl: '#',
                priceStatus: 'unconfirmed',
              });
            }
          }
          const mergedSaved = Array.from(gameMap.values());
          const mergedTargets = { ...targets, ...importedTargets };
          setFavorites(mergedFavs);
          setSavedGames(mergedSaved);
          setTargets(mergedTargets);
          localStorage.setItem('ludopreco-favorites', JSON.stringify(mergedFavs));
          localStorage.setItem('safeloot-saved-games', JSON.stringify(mergedSaved));
          localStorage.setItem('safeloot-targets', JSON.stringify(mergedTargets));
          setNotice(`${importedFavs.length} jogo(s) restaurados com sucesso!`);
        } catch {
          setNotice('Arquivo JSON inválido ou corrompido.');
        }
      };
      reader.readAsText(file);
    },
    [favorites, savedGames, targets],
  );

  const reachedTargetCount = useMemo(() => {
    return favorites.filter((id) => {
      const target = targets[id];
      if (target === undefined || !Number.isFinite(target)) return false;
      const game = allGames.find((g) => g.id === id);
      return game && game.finalPrice !== null && game.finalPrice <= target;
    }).length;
  }, [favorites, targets, allGames]);

  const shown = useMemo(() => {
    const list =
      view === 'wishlist'
        ? allGames.filter((g) => {
            if (!favorites.includes(g.id)) return false;
            if (wishlistFilter === 'reached') {
              const target = targets[g.id];
              return target !== undefined && g.finalPrice !== null && g.finalPrice <= target;
            }
            return true;
          })
        : committed
          ? results || []
          : data?.[catalog === 'trending' ? 'trending' : 'featured'] || [];
    return list
      .filter((g) => {
        if (homeStore !== 'all') {
          const s = canonicalStoreId(g.storeId || g.store || '');
          const target = canonicalStoreId(homeStore);
          if (s !== target) return false;
        }
        if (price === 'all') return true;
        if (g.currency !== 'BRL' || g.finalPrice === null || g.priceStatus === 'unconfirmed') return false;
        return matchesPriceBand(g.finalPrice, price);
      })
      .toSorted((a, b) =>
        sort === 'price'
          ? (a.finalPrice ?? Infinity) - (b.finalPrice ?? Infinity)
          : sort === 'discount'
            ? (b.discount || 0) - (a.discount || 0)
            : sort === 'name'
              ? a.title.localeCompare(b.title, 'pt-BR')
              : dealScore(b) - dealScore(a) || a.title.localeCompare(b.title, 'pt-BR'),
      );
  }, [
    allGames,
    view,
    favorites,
    targets,
    wishlistFilter,
    committed,
    results,
    data,
    catalog,
    price,
    sort,
    homeStore,
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
  const officialOffers =
    offers?.offers
      .filter((o) => o.currency === 'BRL' && !!o.verifiedAt && o.available === true && offerKind(o) === 'official' && o.activationInBrazil === true)
      .toSorted((a, b) => offerCost(a) - offerCost(b)) || [];
  const filterOffer=(o:LiveOffer)=>(selectedStore==='all'||canonicalStoreId(o.store)===canonicalStoreId(selectedStore))&&(launcherFilter==='all'||o.launcher===launcherFilter)&&(regionFilter==='all'||o.region===regionFilter);
  const orderOffers=(a:LiveOffer,b:LiveOffer)=>offerSort==='discount'?b.discount-a.discount:offerSort==='recent'?Date.parse(b.verifiedAt||'')-Date.parse(a.verifiedAt||''):offerCost(a)-offerCost(b);
  const regional=storeFilter==='key'?[]:officialOffers.filter(filterOffer).toSorted(orderOffers);
  const keyOffers =
    offers?.offers
      .filter(filterOffer).filter((o) => o.currency === 'BRL' && !!o.verifiedAt && o.available === true && offerKind(o) === 'key' && o.activationInBrazil === true && (storeFilter === 'all' || storeFilter === 'key'))
      .toSorted((a, b) => offerCost(a) - offerCost(b)) || [];
  const international =
    offers?.offers.filter((o) => o.currency !== 'BRL') || [];
  const best = officialOffers[0];
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
            <a href="/#noticias">
              Notícias
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
        {initialId === undefined && returningUserAlert && (
          <aside className="returning-banner" role="status">
            <div className="returning-banner-content">
              <span className="returning-icon">🎯</span>
              <div className="returning-text">
                <strong>Bem-vindo de volta!</strong>
                <span>
                  {returningUserAlert.reachedCount > 0
                    ? `${returningUserAlert.reachedCount} ${returningUserAlert.reachedCount === 1 ? 'jogo' : 'jogos'} da sua lista atingiram o preço-alvo!`
                    : 'Sua lista e metas continuam salvas neste navegador.'}
                </span>
              </div>
            </div>
            <div className="returning-banner-actions">
              {returningUserAlert.reachedCount > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    setView('wishlist');
                    setWishlistFilter('reached');
                    setReturningUserAlert(null);
                  }}
                >
                  Ver no Radar
                </Button>
              )}
              <button
                type="button"
                className="returning-dismiss"
                onClick={() => setReturningUserAlert(null)}
                aria-label="Fechar aviso"
              >
                ✕
              </button>
            </div>
          </aside>
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
                    <div className="source-filters" role="group" aria-label="Tipo de loja">{[['all','Todas'],['official','Lojas oficiais'],['key','Keys']].map(([value,label]) => <button key={value} aria-pressed={storeFilter === value} onClick={() => setStoreFilter(value)}>{label}</button>)}</div><div className="offer-filters"><label>Loja<select value={selectedStore} onChange={e=>setSelectedStore(e.target.value)}><option value="all">Todas as lojas</option>{[...new Map(offers.offers.filter(o=>o.currency==='BRL').map(o=>[canonicalStoreId(o.store), o.store])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Launcher<select value={launcherFilter} onChange={e=>setLauncherFilter(e.target.value)}><option value="all">Todos</option>{[...new Set(offers.offers.map(o=>o.launcher).filter(Boolean))].map(launcher=><option key={launcher}>{launcher}</option>)}</select></label><label>Região<select value={regionFilter} onChange={e=>setRegionFilter(e.target.value)}><option value="all">Todas</option><option>Brasil</option><option>LATAM</option><option>Global</option></select></label><label>Ordem<select value={offerSort} onChange={e=>setOfferSort(e.target.value)}><option value="price">Menor preço</option><option value="discount">Maior desconto</option><option value="recent">Mais recente</option></select></label></div>
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
                        <a href="/?view=stores">Ver fontes e integrações</a>
                      </div>
                    )}
                    {edition === 'prices' && keyOffers.length > 0 && (
                      <details className="international">
                        <summary>
                          Marketplaces de keys com preço confirmado ({keyOffers.length})
                        </summary>
                        <p>
                          Entram separados das lojas oficiais. Verifique taxas,
                          edição e região de ativação antes de comprar.
                        </p>
                        <OfferRows offers={keyOffers} />
                      </details>
                    )}
                  </section>
                  <p className="price-disclosure">
                    Ranking usa somente preços confirmados em BRL. Lojas sem
                    preço validado não competem com ofertas reais. Preços podem mudar. Confirme o valor final na loja.
                  </p>
                  {international.length > 0 && (
                    <details className="international">
                      <summary>
                        Outras ofertas internacionais ({international.length}){' '}
                        <span>Em US$</span>
                      </summary>
                      <p>
                        Valores originais em dólares. Câmbio, IOF, taxas e restrições
                        regionais podem variar; não entram no ranking em reais.
                      </p>
                      <OfferRows offers={international} international />
                    </details>
                  )}
                  <Suspense fallback={<p>Carregando histórico…</p>}><PriceHistory appId={initialId} currentOffer={offers.offers.find(o => o.store === 'Steam' && o.currency === 'BRL') || offers.offers.find(o => o.currency === 'BRL')} allOffers={offers.offers} /></Suspense>
                  <GameProfilePanel key={initialId} game={offers.game} />
                  <MarketplaceLinks />
                  <GameAvailability game={offers.game} />
                  <details className="source-details">
                    <summary>Outras lojas ({offers.coverage?.filter(c=>c.status!=='confirmed').length || 0})</summary>
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
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {offers.coverage?.filter(c=>c.status!=='confirmed').map((c) => {
                        const directUrl = (c as { productUrl?: string }).productUrl;
                        const action = directUrl
                          ? { url: directUrl, verb: 'Consultar preço' }
                          : storeSearchAction(c.store, offers.game.title);
                        return (
                          <div
                            key={`${c.store}-${c.status || c.available}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              background: 'var(--card)',
                              borderRadius: '4px',
                              border: '1px solid var(--border)',
                              gap: '12px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                              <strong>{c.store}</strong>
                              <span style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: '10px', marginTop: '2px' }}>
                                {c.diagnostic || statusLabel(c.status, c.available)}
                              </span>
                            </div>
                            {action.url !== '#' && (
                              <a
                                href={action.url}
                                target="_blank"
                                rel="noreferrer"
                                className="cta-small"
                                style={{
                                  fontSize: '11px',
                                  padding: '5px 10px',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                }}
                              >
                                <span>{action.verb}</span>
                                <ArrowUpRight size={13} />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
                <aside className="detail-sidebar">
                  <section className="purchase-panel">
                    <span className="eyebrow">
                      {best ? 'Melhor preço confirmado no Brasil' : 'Sem oferta em reais'}
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
                          Comprar por {money(offerCost(best))} <ArrowUpRight size={18} />
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
                    <Button
                      className="share-button"
                      variant="outline"
                      onClick={() => {
                        const title = `${offers.game.title} no SafeLoot`;
                        const text = `Confira o menor preço e histórico de ${offers.game.title} em reais no SafeLoot Brasil:`;
                        const url = window.location.href;
                        if (typeof navigator !== 'undefined' && navigator.share) {
                          navigator.share({ title, text, url }).catch(() => {});
                        } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(url);
                          setNotice('Link do jogo copiado!');
                        }
                      }}
                    >
                      <Share2 size={16} /> Compartilhar jogo
                    </Button>
                    {offers.updatedAt && (
                      <p className="freshness-indicator">
                        <Check size={13} /> Preços verificados recentemente (BRT)
                      </p>
                    )}
                    <div className="detail-target-radar">
                      <div className="target-radar-header">
                        <Target size={15} />
                        <span>Radar de Preço</span>
                      </div>
                      {targets[detailGame.id] !== undefined ? (
                        <div className="target-radar-active">
                          <div className="target-radar-row">
                            <span>Seu alvo: <strong>{money(targets[detailGame.id])}</strong></span>
                            <button
                              type="button"
                              className="target-radar-clear"
                              onClick={() => updateTarget(detailGame.id, null)}
                            >
                              Remover
                            </button>
                          </div>
                          {best && best.finalPrice <= targets[detailGame.id] ? (
                            <p className="radar-status-reached">
                              🎯 <strong>Alvo atingido!</strong> Preço atual de {money(best.finalPrice)} na {best.store} é menor ou igual ao seu alvo de {money(targets[detailGame.id])}.
                            </p>
                          ) : best ? (
                            <p className="radar-status-waiting">
                              ⏳ <strong>Faltam {money(best.finalPrice - targets[detailGame.id])}</strong> para atingir seu alvo (melhor oferta hoje: {money(best.finalPrice)}).
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <form
                          className="target-radar-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const inputEl = e.currentTarget.elements.namedItem('targetPrice') as HTMLInputElement;
                            const val = parsePriceInput(inputEl?.value || '');
                            if (val !== null) {
                              updateTarget(detailGame.id, val);
                              if (!favorites.includes(detailGame.id)) {
                                toggle(detailGame);
                              }
                            }
                          }}
                        >
                          <label htmlFor={`detail-target-${detailGame.id}`}>
                            Quero pagar até (R$):
                          </label>
                          <div className="target-radar-inputs">
                            <input
                              id={`detail-target-${detailGame.id}`}
                              name="targetPrice"
                              type="text"
                              inputMode="decimal"
                              placeholder={best ? (best.finalPrice * 0.8).toFixed(2).replace('.', ',') : '19,90'}
                              required
                            />
                            <Button type="submit" size="sm">Definir alvo</Button>
                          </div>
                          <small className="target-radar-disclaimer">
                            Salvo localmente neste navegador. O SafeLoot avalia sua meta quando os preços são carregados ao abrir o site.
                          </small>
                        </form>
                      )}
                    </div>
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
                      Comprar por {money(offerCost(best))} <ArrowUpRight size={17} />
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
            {view === 'wishlist' ? (
              <>
                <div className="page-heading">
                  <span className="eyebrow">Monitoramento inteligente</span>
                  <h1>Radar de Preços & Lista de Desejos</h1>
                  <p>
                    Seus jogos salvos com meta de preço personalizada neste navegador.
                  </p>
                </div>
                <div className="wishlist-privacy-banner">
                  <span>🛡️ Radar salvo localmente neste navegador</span>
                  <p>
                    Suas metas e jogos salvos ficam guardados neste navegador. O SafeLoot avalia o valor-alvo salvo quando a lista de preços é carregada ao abrir o site, sem necessidade de cadastro, conta ou envio de dados para servidores.
                  </p>
                </div>
                <div className="wishlist-action-bar">
                  <div className="wishlist-stat-pills">
                    <button
                      type="button"
                      className={`wishlist-pill ${wishlistFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setWishlistFilter('all')}
                    >
                      Todos ({favorites.length})
                    </button>
                    <button
                      type="button"
                      className={`wishlist-pill ${wishlistFilter === 'reached' ? 'active' : ''}`}
                      onClick={() => setWishlistFilter('reached')}
                    >
                      🎯 Alvo atingido ({reachedTargetCount})
                    </button>
                  </div>
                  <div className="wishlist-action-group">
                    <Button
                      variant="outline"
                      className="wishlist-refresh-btn"
                      disabled={wishlistUpdating || !favorites.length}
                      onClick={refreshWishlistPrices}
                    >
                      {wishlistUpdating ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <RefreshCw size={15} />
                      )}
                      {wishlistUpdating ? 'Atualizando preços…' : 'Atualizar preços da lista'}
                    </Button>
                    <div className="wishlist-backup-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        className="wishlist-backup-btn"
                        onClick={exportWishlist}
                        disabled={!favorites.length}
                        title="Baixar cópia de segurança da sua lista e metas"
                      >
                        <Download size={14} /> Exportar
                      </Button>
                      <label className="wishlist-import-label" title="Restaurar backup do Radar">
                        <Upload size={14} /> Importar
                        <input
                          type="file"
                          accept=".json,application/json"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              importWishlist(file);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="page-heading">
                  <h1>
                    {committed ? (
                      `Resultados para “${committed}”`
                    ) : (
                      <>
                        Jogue mais. <em>Pague melhor.</em>
                      </>
                    )}
                  </h1>
                  <p>
                    {committed
                      ? 'Preços da Steam Brasil. Abra um jogo para comparar as lojas.'
                      : 'Compare ofertas de jogos para PC. Preços em reais, direto das lojas.'}
                  </p>
                </div>
                {!committed && view === 'offers' && price === 'all' && homeStore === 'all' && (
                  <div>
                    {data && <DealCarousel games={data.featured} updatedAt={data.updatedAt}/>}
                    {loading && !data && (
                      <div className="feature-loading" role="status">
                        <LoaderCircle className="spin" /> Carregando ofertas…
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <Sheet>
              <SheetTrigger className="mobile-filter-trigger">
                <SlidersHorizontal size={17}/> Filtros e ordem {price!=='all' && `· ${priceBandLabel(price)}`} {homeStore!=='all' && `· ${homeStore.toUpperCase()}`}
              </SheetTrigger>
              <SheetContent className="loot-filter-drawer">
                <SheetTitle>Encontrar meu próximo jogo</SheetTitle>
                <label htmlFor="mobile-budget">Faixa de preço</label>
                <select id="mobile-budget" value={price} onChange={e=>{setPrice(e.target.value);updateFilter('price',e.target.value);}}>
                  {['all', ...ALLOWED_PRICES].map(p=><option key={p} value={p}>{priceBandOptionLabel(p)}</option>)}
                </select>
                <label htmlFor="mobile-store">Loja</label>
                <select id="mobile-store" value={homeStore} onChange={e=>{setHomeStore(e.target.value);updateFilter('store',e.target.value);}}>
                  <option value="all">Todas as lojas</option>
                  <option value="steam">Steam</option>
                  <option value="nuuvem">Nuuvem</option>
                  <option value="gmg">Green Man Gaming</option>
                  <option value="epic">Epic Games</option>
                </select>
                <label htmlFor="mobile-sort">Ordenar por</label>
                <select id="mobile-sort" value={sort} onChange={e=>{setSort(e.target.value);updateFilter('sort',e.target.value);}}>
                  <option value="relevance">Relevância</option>
                  <option value="price">Menor preço</option>
                  <option value="discount">Maior desconto</option>
                  <option value="name">Nome</option>
                </select>
                <label htmlFor="mobile-limit">Resultados por vez</label>
                <select id="mobile-limit" value={resultLimit} onChange={e=>{const val=Number(e.target.value);setResultLimit(val);updateFilter('limit',String(val));}}>
                  {ALLOWED_LIMITS.map(n=><option key={n} value={n}>{n} jogos</option>)}
                </select>
                <p>As vitrines exibem preços em reais. Escolha a loja na seção de ofertas.</p>
                <SheetClose className="spotlight-cta">Ver resultados</SheetClose>
              </SheetContent>
            </Sheet>
            <div className="filter-bar">
              <div
                className="budget-filters"
                role="group"
                aria-label="Filtrar por preço"
              >
                {['all', ...ALLOWED_PRICES].map((p) => (
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
                    {priceBandLabel(p)}
                  </Button>
                ))}
              </div>
              <div className="filter-controls">
                <label className="sort-label">
                  <Store size={15} />
                  <span className="sr-only">Filtrar por loja</span>
                  <select
                    aria-label="Filtrar por loja"
                    value={homeStore}
                    onChange={(e) => {
                      setHomeStore(e.target.value);
                      updateFilter('store', e.target.value);
                    }}
                  >
                    <option value="all">Todas as lojas</option>
                    <option value="steam">Steam</option>
                    <option value="nuuvem">Nuuvem</option>
                    <option value="gmg">Green Man Gaming</option>
                    <option value="epic">Epic Games</option>
                  </select>
                </label>
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
            </div>
            <section className="deals-section" id="ofertas">
              <div className="section-heading">
                <h2>
                  {loading && !data && !committed && view === 'offers'
                    ? 'Carregando ofertas em destaque…'
                    : view === 'wishlist'
                      ? wishlistFilter === 'reached'
                        ? `${shown.length} de ${favorites.length} jogos com preço-alvo atingido 🎯`
                        : `${shown.length} jogos no seu radar`
                      : committed
                        ? `${Math.min(shown.length, resultLimit)} de ${shown.length} resultados`
                        : price === '0'
                          ? `Jogos 100% grátis (${shown.length})`
                          : price !== 'all'
                            ? `Ofertas na faixa ${priceBandLabel(price)} (${shown.length})`
                            : homeStore !== 'all'
                              ? `Ofertas na ${homeStore === 'steam' ? 'Steam' : homeStore === 'nuuvem' ? 'Nuuvem' : homeStore === 'gmg' ? 'Green Man Gaming' : homeStore === 'epic' ? 'Epic Games' : homeStore} (${shown.length})`
                              : shown.length > resultLimit
                                ? `${resultLimit} de ${shown.length} ofertas em destaque`
                                : `${shown.length} ofertas em destaque`}
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
                <div
                  className="limit-switch"
                  role="group"
                  aria-label="Quantidade de resultados exibidos"
                >
                  <span className="limit-switch-label">Exibir:</span>
                  {ALLOWED_LIMITS.map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={`limit-switch-btn ${resultLimit === num ? 'active' : ''}`}
                      aria-pressed={resultLimit === num}
                      onClick={() => {
                        setResultLimit(num);
                        updateFilter('limit', String(num));
                      }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
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
              {searching || (loading && !data) ? (
                <div className="loading-panel" role="status">
                  <LoaderCircle className="spin" /> Carregando ofertas…
                </div>
              ) : view === 'wishlist' ? (
                <div className="wishlist-grid">
                  {shown.map((g) => (
                    <WishlistGameCard
                      key={g.id}
                      game={g}
                      target={targets[g.id]}
                      onUpdateTarget={(val) => updateTarget(g.id, val)}
                      onRemove={() => toggle(g)}
                    />
                  ))}
                </div>
              ) : (
                <div className="game-grid">
                  {shown.slice(0, resultLimit).map((g) => (
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
                      ? wishlistFilter === 'reached'
                        ? 'Nenhum jogo atingiu a meta definida ainda.'
                        : 'Sua lista está esperando o próximo jogo.'
                      : 'Nenhum jogo com esses filtros.'}
                  </h3>
                  <p>
                    {view === 'wishlist'
                      ? wishlistFilter === 'reached'
                        ? 'Assim que uma oferta alcançar o valor desejado, ela aparecerá com o selo 🎯 Alvo atingido.'
                        : 'Toque no coração de uma oferta para salvá-la no seu radar e definir sua meta de preço.'
                      : 'Tente outro nome ou amplie a faixa de preço.'}
                  </p>
                  {view === 'wishlist' && wishlistFilter === 'reached' ? (
                    <Button variant="outline" onClick={() => setWishlistFilter('all')}>
                      Ver todos os jogos salvos
                    </Button>
                  ) : (price !== 'all' || homeStore !== 'all') ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPrice('all');
                        updateFilter('price', 'all');
                        setHomeStore('all');
                        updateFilter('store', 'all');
                      }}
                    >
                      Limpar filtros
                    </Button>
                  ) : null}
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
              {view === 'wishlist' && (
                <div style={{ marginTop: '24px' }}>
                  <ShoppingList />
                </div>
              )}
            </section>
            {!committed && view === 'offers' && price === 'all' && homeStore === 'all' && (
              <DiscoveryShelves budget={price} sort={sort} />
            )}
            {!committed && view === 'offers' && (
              <section id="noticias">
                <NewsSection />
              </section>
            )}
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
              <a href="/?view=stores">Nuuvem</a>
              <a href="/?view=stores">Green Man Gaming</a>
              <a href="/?view=stores">Epic Games</a>
              <a href="/?view=stores">GOG</a>
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
        <div className="footer-links">
          <a href="/como-verificamos">Como verificamos os preços</a>
          <a href="/lojas">Lojas e integrações</a>
          <a href="/?view=stores">Fontes monitoradas</a>
        </div>
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
          href="/?view=free"
          aria-current={view === 'free' ? 'page' : undefined}
        >
          <Gift size={19} />
          Grátis
        </a>
        <a href="/#noticias">
          <Newspaper size={19} />
          Notícias
        </a>
        <a
          href="/?view=wishlist"
          aria-current={view === 'wishlist' ? 'page' : undefined}
        >
          <Heart size={19} />
          Lista
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

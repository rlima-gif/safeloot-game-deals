'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  Check,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Gamepad2,
  Globe2,
  Heart,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FreeGames } from '@/components/free-games';
import { OfferDeadline } from '@/components/offer-deadline';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { GameDetails, LiveGame, LiveOffer } from '@/lib/game-api';

type HighlightsPayload = {
  featured: LiveGame[];
  trending: LiveGame[];
  updatedAt: string;
  source: string;
};

type SearchPayload = {
  query: string;
  results: LiveGame[];
  updatedAt: string;
  source: string;
};

type OffersPayload = {
  game: GameDetails;
  offers: LiveOffer[];
  updatedAt: string;
  sources: string[];
};

type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });

function formatPrice(value: number | null, currency = 'BRL') {
  if (value === null) return 'Indisponível';
  if (value === 0) return 'Grátis';
  return currency === 'USD' ? usd.format(value) : brl.format(value);
}

function formatUpdate(value?: string) {
  if (!value) return 'aguardando atualização';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}


function DealSkeleton() {
  return (
    <div className="deal-card skeleton-card">
      <Skeleton className="h-44 w-full rounded-none bg-white/8" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-4 w-2/3 bg-white/8" />
        <Skeleton className="h-7 w-1/2 bg-white/8" />
        <Skeleton className="h-9 w-full bg-white/8" />
      </div>
    </div>
  );
}

function GameCard({ game, rank, favorite, onFavorite, onSelect }: {
  game: LiveGame;
  rank?: number;
  favorite: boolean;
  onFavorite: () => void;
  onSelect: () => void;
}) {

  return (
    <article className="deal-card">
      <button className="deal-art" onClick={onSelect} aria-label={`Consultar ofertas de ${game.title}`}>
        {game.image ? <img src={game.image} alt="" loading="lazy" /> : <span className="image-fallback"><Gamepad2 /></span>}
        <span className="art-shade" />
        {rank && <span className="rank-pill">#{String(rank).padStart(2, '0')}</span>}
        {game.discount > 0 && <span className="discount-pill">−{game.discount}%</span>}

      </button>
      <OfferDeadline expiresAt={game.expiresAt} />
      <div className="deal-body">
        <div className="deal-title-row">
          <div><span className="storeline"><span className="live-dot" /> Steam Brasil</span><h3>{game.title}</h3></div>
          <Button variant="ghost" size="icon" className={`favorite-button ${favorite ? 'selected' : ''}`} onClick={onFavorite} aria-pressed={favorite} aria-label={`${favorite ? 'Remover' : 'Adicionar'} ${game.title} dos favoritos`}>
            <Heart fill={favorite ? 'currentColor' : 'none'} />
          </Button>
        </div>
        <div className="deal-price-row">
          <div>
            {game.originalPrice !== null && game.originalPrice !== game.finalPrice && <s>{formatPrice(game.originalPrice, game.currency)}</s>}
            <strong>{formatPrice(game.finalPrice, game.currency)}</strong>
          </div>
          {game.score !== null && <span className="score"><Star size={13} fill="currentColor" /> {game.score}</span>}
        </div>
        <Button className="consult-button" onClick={onSelect}>Ver oferta <ArrowRight /></Button>
      </div>
    </article>
  );
}

export default function Home() {
  const [priceFilter, setPriceFilter] = useState('all');
  const [highlights, setHighlights] = useState<HighlightsPayload | null>(null);
  const [highlightsError, setHighlightsError] = useState('');
  const [loadingHighlights, setLoadingHighlights] = useState(true);
  const [query, setQuery] = useState('');
  const [searchData, setSearchData] = useState<SearchPayload | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedGame, setSelectedGame] = useState<LiveGame | null>(null);
  const [offerData, setOfferData] = useState<OffersPayload | null>(null);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [favorites, setFavorites] = useState<number[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  const offerRequest = useRef<AbortController | null>(null);

  const loadHighlights = useCallback(async () => {
    setLoadingHighlights(true);
    setHighlightsError('');
    try {
      const response = await fetch('/api/highlights');
      const payload = await response.json() as HighlightsPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar os destaques.');
      setHighlights(payload);
    } catch (error) {
      setHighlightsError(error instanceof Error ? error.message : 'Não foi possível atualizar os destaques.');
    } finally {
      setLoadingHighlights(false);
    }
  }, []);

  const runSearch = useCallback(async (term: string) => {
    const cleanTerm = term.trim();
    searchRequest.current?.abort();
    if (cleanTerm.length < 2) {
      setSearchError('Digite pelo menos 2 caracteres.');
      setSearching(false);
      return [] as LiveGame[];
    }
    const request = new AbortController();
    searchRequest.current = request;
    setSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(cleanTerm)}`, { signal: request.signal });
      const payload = await response.json() as SearchPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Busca indisponível agora.');
      if (searchRequest.current !== request) return [] as LiveGame[];
      setSearchData(payload);
      requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>('#resultado-busca h2');
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return payload.results;
    } catch (error) {
      if (request.signal.aborted) return [] as LiveGame[];
      setSearchData(null);
      setSearchError(error instanceof Error ? error.message : 'Busca indisponível agora.');
      return [] as LiveGame[];
    } finally {
      if (searchRequest.current === request) {
        searchRequest.current = null;
        setSearching(false);
      }
    }
  }, []);

  const openGame = useCallback(async (game: LiveGame) => {
    offerRequest.current?.abort();
    const request = new AbortController();
    offerRequest.current = request;
    setSelectedGame(game);
    setOfferData(null);
    setOfferError('');
    setLoadingOffers(true);
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('#comparar h2');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    try {
      const response = await fetch(`/api/offers?appid=${game.id}&title=${encodeURIComponent(game.title)}`, { signal: request.signal });
      const payload = await response.json() as OffersPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar as lojas.');
      if (offerRequest.current !== request) return null;
      setOfferData(payload);
      return payload;
    } catch (error) {
      if (request.signal.aborted) return null;
      setOfferError(error instanceof Error ? error.message : 'Não foi possível consultar as lojas.');
      return null;
    } finally {
      if (offerRequest.current === request) {
        offerRequest.current = null;
        setLoadingOffers(false);
      }
    }
  }, []);

  useEffect(() => { void loadHighlights(); }, [loadHighlights]);

  useEffect(() => {
    const stored = window.localStorage.getItem('ludopreco-favorites');
    if (stored) {
      try { setFavorites(JSON.parse(stored) as number[]); } catch { setFavorites([]); }
    }
    setFavoritesReady(true);
  }, []);

  useEffect(() => {
    if (!favoritesReady) return;
    window.localStorage.setItem('ludopreco-favorites', JSON.stringify(favorites));
  }, [favorites, favoritesReady]);

  useEffect(() => () => {
    searchRequest.current?.abort();
    offerRequest.current?.abort();
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebMcpTool) => {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    };

    register({
      name: 'get_live_highlights',
      title: 'Consultar destaques ao vivo',
      description: 'Consulta as ofertas e os jogos em alta exibidos agora no SafeLoot para a região Brasil.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute() {
        const response = await fetch('/api/highlights');
        if (!response.ok) throw new Error('Destaques indisponíveis.');
        const payload = await response.json() as HighlightsPayload;
        return { updatedAt: payload.updatedAt, featured: payload.featured.slice(0, 5).map((game) => ({ id: game.id, title: game.title, priceBrl: game.finalPrice, discount: game.discount })) };
      },
    });

    register({
      name: 'search_games',
      title: 'Buscar preços de jogos',
      description: 'Busca jogos na Steam brasileira e atualiza os resultados visíveis com preços em reais.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 80 } }, required: ['query'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const term = typeof input === 'object' && input !== null && 'query' in input ? String(input.query).trim() : '';
        if (term.length < 2) throw new Error('Informe ao menos 2 caracteres.');
        const results = await runSearch(term);
        return { query: term, matches: results.length, games: results.slice(0, 8).map((game) => ({ id: game.id, title: game.title, priceBrl: game.finalPrice })) };
      },
    });

    register({
      name: 'compare_game_offers',
      title: 'Comparar ofertas de um jogo',
      description: 'Localiza um jogo por nome, consulta as lojas disponíveis e abre a comparação no site.',
      inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 2, maxLength: 120 } }, required: ['title'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const title = typeof input === 'object' && input !== null && 'title' in input ? String(input.title).trim() : '';
        if (title.length < 2) throw new Error('Informe o nome do jogo.');
        const response = await fetch(`/api/search?q=${encodeURIComponent(title)}`);
        if (!response.ok) throw new Error('Jogo não encontrado.');
        const payload = await response.json() as SearchPayload;
        const game = payload.results.find((item) => item.title.toLowerCase() === title.toLowerCase()) ?? payload.results[0];
        if (!game) throw new Error('Jogo não encontrado.');
        const comparison = await openGame(game);
        return {
          id: game.id,
          title: game.title,
          steamPriceBrl: game.finalPrice,
          offers: comparison?.offers.map((offer) => ({ store: offer.store, region: offer.region, currency: offer.currency, price: offer.finalPrice })) ?? [],
        };
      },
    });

    return () => lifecycle.abort();
  }, [openGame, runSearch]);

  const heroGame = highlights?.featured[0] ?? highlights?.trending[0] ?? null;
  const filteredDeals = (highlights?.featured ?? []).filter((game) => priceFilter === 'all' || (game.currency === 'BRL' && game.finalPrice !== null && game.finalPrice >= 0 && game.finalPrice <= Number(priceFilter)));
  const maxDiscount = useMemo(() => Math.max(0, ...(highlights?.featured.map((game) => game.discount) ?? [])), [highlights]);
  const regionalOffers = (offerData?.offers ?? []).filter((offer) => offer.region === 'Brasil' && offer.currency === 'BRL').sort((a, b) => a.finalPrice - b.finalPrice);
  const regionalOffer = regionalOffers[0];
  const internationalOffers = (offerData?.offers ?? []).filter((offer) => offer.region === 'Global');

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void runSearch(query);
  }

  function quickSearch(term: string) {
    setQuery(term);
    void runSearch(term);
  }

  function toggleFavorite(id: number) {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="topbar">
        <div className="shell topbar-inner">
          <a className="brand" href="#inicio" aria-label="SafeLoot — início"><span className="brand-mark"><Gamepad2 /></span><span>SAFE<span>LOOT</span><span className="brand-cursor" aria-hidden="true">_</span></span></a>
          <div className="brand-telemetry" aria-hidden="true"><span>SYS.OP.01</span><span>SECURE_LINK</span></div>
          <nav className="main-nav" aria-label="Navegação principal">
            <a href="#agora">Agora</a><a href="#buscar">Buscar</a><a href="#comparar">Comparar</a>
          </nav>
          <div className="top-actions">
            <span className="live-status"><span /> Dados ao vivo</span>
            <Button variant="ghost" size="icon" aria-label={`${favorites.length} jogos salvos; ir aos destaques`} className="header-icon" onClick={() => document.querySelector('#agora')?.scrollIntoView({ behavior: 'smooth' })}><Heart fill={favorites.length ? 'currentColor' : 'none'} /></Button>
          </div>
        </div>
      </header>

      <section id="inicio" className="shell hero-grid">
        <div className="hero-copy" id="buscar">
          <span className="signal-label"><Activity /> Radar Brasil · PC</span>
          <h1>Preço bom,<br /><em>sem achismo.</em></h1>
          <p>Busque um jogo e compare os preços em reais encontrados na Steam e na GamersGate.</p>
          <form noValidate className="live-search" role="search" onSubmit={submitSearch}>
            <Search />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar um jogo" placeholder="Qual jogo está na sua lista?" />
            {query && <Button type="button" variant="ghost" size="icon" className="clear-button" onClick={() => { setQuery(''); setSearchData(null); setSearchError(''); }} aria-label="Limpar busca"><X /></Button>}
            <Button type="submit" disabled={searching} className="search-submit" aria-label={searching ? 'Consultando preços' : undefined}>{searching ? <LoaderCircle className="spin" /> : 'Consultar preço'}</Button>
          </form>
          {searchError && <p className="inline-error" role="alert">{searchError}</p>}
          <div className="quick-searches"><span>Buscas rápidas</span>{['Elden Ring', 'Hades', 'Cyberpunk 2077'].map((term) => <button key={term} onClick={() => quickSearch(term)}>{term}</button>)}</div>
          <div className="source-strip"><span><ShieldCheck /> Preços em R$</span><span><Zap /> Consulta sob demanda</span><span><Globe2 /> Internacional opcional</span></div>
        </div>

        <aside className="radar-card">
          <div className="radar-visual">
            <img src={heroGame?.headerImage || '/deal-radar.png'} alt="" />
            <span className="radar-gradient" />
            <div className="radar-top"><span><span className="live-dot" /> Destaque ao vivo</span><span>BRL</span></div>
            {loadingHighlights ? (
              <div className="hero-skeleton"><Skeleton className="h-5 w-28 bg-white/15" /><Skeleton className="h-10 w-52 bg-white/15" /><Skeleton className="h-8 w-32 bg-white/15" /></div>
            ) : heroGame ? (
              <div className="radar-game">
                {heroGame.discount > 0 && <span className="mega-discount">−{heroGame.discount}%</span>}
                <h2>{heroGame.title}</h2>
                <div><div>{heroGame.originalPrice !== heroGame.finalPrice && <s>{formatPrice(heroGame.originalPrice)}</s>}<strong>{formatPrice(heroGame.finalPrice)}</strong></div><Button onClick={() => void openGame(heroGame)}>Comparar <ChevronRight /></Button></div>
              </div>
            ) : (
              <div className="radar-game"><h2>Radar temporariamente indisponível</h2><Button onClick={() => void loadHighlights()}>Tentar novamente</Button></div>
            )}
          </div>
          <div className="radar-metrics">
            <div><BadgeDollarSign /><span>Maior desconto<strong>{maxDiscount ? `${maxDiscount}%` : '—'}</strong></span></div>
            <div><Store /><span>Fontes ativas<strong>{highlights ? '1' : '—'}</strong></span></div>
            <div><RefreshCw /><span>Atualizado<strong>{formatUpdate(highlights?.updatedAt)}</strong></span></div>
          </div>
        </aside>
      </section>

      {searchData && (
        <section id="resultado-busca" className="search-results-section" aria-live="polite">
          <div className="shell">
            <div className="section-head">
              <div><span className="section-index">BUSCA AO VIVO</span><h2 tabIndex={-1}>Resultados para “{searchData.query}”</h2><p>{searchData.results.length} resultados · preços regionais em reais</p></div>
              <Button variant="outline" onClick={() => { setSearchData(null); setQuery(''); }}><X /> Fechar resultados</Button>
            </div>
            {searchData.results.length ? (
              <div className="result-list">
                {searchData.results.map((game) => (
                  <article key={game.id} className="result-row">
                    <button className="result-image" onClick={() => void openGame(game)} aria-label={`Comparar ${game.title}`}>{game.image ? <img src={game.image} alt="" /> : <Gamepad2 />}</button>
                    <div className="result-name"><span>Steam · Brasil</span><h3>{game.title}</h3><small>{game.windows ? 'Windows' : ''}{game.mac ? ' · macOS' : ''}{game.linux ? ' · Linux' : ''}</small></div>
                    {game.discount > 0 && <span className="result-discount">−{game.discount}%</span>}
                    <div className="result-price">{game.originalPrice !== game.finalPrice && <s>{formatPrice(game.originalPrice, game.currency)}</s>}<strong>{formatPrice(game.finalPrice, game.currency)}</strong></div>
                    <Button onClick={() => void openGame(game)} className="result-action">Comparar <ArrowRight /></Button>
                  </article>
                ))}
              </div>
            ) : <div className="empty-panel"><Search /><h3>Nenhum resultado</h3><p>Tente o título sem subtítulo ou edição.</p></div>}
          </div>
        </section>
      )}

      <section id="agora" className="shell moments-section">
        <div className="section-head moments-head">
          <div><span className="section-index">PULSO DO MERCADO</span><h2>Destaques do momento</h2><p>Uma leitura ao vivo da vitrine brasileira da Steam.</p></div>
          <Button variant="outline" onClick={() => void loadHighlights()} disabled={loadingHighlights}><RefreshCw className={loadingHighlights ? 'spin' : ''} /> Atualizar</Button>
        </div>

        {highlightsError && <div className="source-error" role="alert"><span><Activity /> {highlightsError}</span><Button onClick={() => void loadHighlights()}>Tentar novamente</Button></div>}

        <Tabs defaultValue="deals" className="market-tabs">
          <TabsList variant="line" className="market-tabs-list">
            <TabsTrigger value="deals"><BadgeDollarSign /> Ofertas em destaque</TabsTrigger>
            <TabsTrigger value="trending"><TrendingUp /> Mais vendidos agora</TabsTrigger>
            <TabsTrigger value="free"><Sparkles /> Grátis para resgatar</TabsTrigger>
          </TabsList>
          <TabsContent value="deals">
            <ToggleGroup value={[priceFilter]} onValueChange={(values) => setPriceFilter(String(values[0] ?? 'all'))} className="price-filters" aria-label="Filtrar destaques por preço" variant="outline">
              {[['all', 'Todos'], ['10', 'Até R$ 10'], ['20', 'Até R$ 20'], ['50', 'Até R$ 50'], ['100', 'Até R$ 100']].map(([value, label]) => <ToggleGroupItem key={value} value={value}>{label}</ToggleGroupItem>)}
            </ToggleGroup>
            {!loadingHighlights && !highlightsError && <p className="filter-status" role="status">{filteredDeals.length ? `${filteredDeals.length} jogos na vitrine${priceFilter === 'all' ? '' : ` até R$ ${priceFilter}`}` : 'Nenhum destaque nesta faixa de preço agora. Experimente outro filtro.'}</p>}
            <div className="deals-grid">
              {loadingHighlights
                ? Array.from({ length: 6 }, (_, index) => <DealSkeleton key={index} />)
                : filteredDeals.map((game, index) => <GameCard key={game.id} game={game} rank={index + 1} favorite={favorites.includes(game.id)} onFavorite={() => toggleFavorite(game.id)} onSelect={() => void openGame(game)} />)}
            </div>
          </TabsContent>
          <TabsContent value="trending">
            <div className="deals-grid">
              {loadingHighlights
                ? Array.from({ length: 6 }, (_, index) => <DealSkeleton key={index} />)
                : highlights?.trending.slice(0, 6).map((game, index) => <GameCard key={game.id} game={game} rank={index + 1} favorite={favorites.includes(game.id)} onFavorite={() => toggleFavorite(game.id)} onSelect={() => void openGame(game)} />)}
            </div>
          </TabsContent>
          <TabsContent value="free"><FreeGames /></TabsContent>
        </Tabs>
        <div className="data-caption"><ShieldCheck /> Preços consultados para a região Brasil. A disponibilidade e o valor final são confirmados na loja.</div>
      </section>

      {selectedGame && (
        <section id="comparar" className="compare-section" aria-live="polite" aria-busy={loadingOffers}>
          <div className="shell compare-shell">
            <div className="compare-header">
              <div className="compare-cover">{(offerData?.game.image || selectedGame.headerImage) ? <img src={offerData?.game.image || selectedGame.headerImage} alt="" /> : <Gamepad2 />}</div>
              <div className="compare-copy"><span className="section-index">COMPARAÇÃO ATUALIZADA</span><h2 tabIndex={-1}>{offerData?.game.title || selectedGame.title}</h2><p>{offerData?.game.description || 'Consultando detalhes, região e lojas disponíveis.'}</p><div className="detail-tags">{offerData?.game.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}{offerData?.game.score && <span aria-label={`Metacritic ${offerData.game.score}`}><Star size={12} fill="currentColor" /> {offerData.game.score}</span>}</div></div>
              <Button variant="ghost" size="icon" onClick={() => { offerRequest.current?.abort(); offerRequest.current = null; setLoadingOffers(false); setSelectedGame(null); setOfferData(null); }} aria-label="Fechar comparação" className="close-compare"><X /></Button>
            </div>

            {loadingOffers ? (
              <div className="offers-loading"><LoaderCircle className="spin" /><span>Consultando preços e lojas…</span></div>
            ) : offerError ? (
              <div className="source-error" role="alert"><span><Activity /> {offerError}</span><Button onClick={() => void openGame(selectedGame)}>Consultar novamente</Button></div>
            ) : offerData ? (
              <div className="offers-layout">
                <div className="offer-column">
                  <div className="offer-group-title"><span><span className="flag-br">BR</span> Ofertas em reais</span><small>Menor preço primeiro</small></div>
                  {regionalOffers.length ? regionalOffers.map((offer, index) => <OfferRow key={offer.id} offer={offer} best={index === 0} />) : <p className="no-offer">Não foi possível confirmar um preço em reais para este jogo agora.</p>}
                  <p className="regional-note">Preços em BRL consultados nas lojas. Só mostramos ofertas com moeda e título correspondentes confirmados.</p>
                </div>
                <aside className="decision-card">
                  <span className="decision-icon"><Sparkles /></span>
                  <span className="section-index">LEITURA RÁPIDA</span>
                  <h3>{regionalOffer ? `${formatPrice(regionalOffer.finalPrice)} na ${regionalOffer.store}.` : 'Preço em reais indisponível.'}</h3>
                  <p>{regionalOffer ? 'Menor preço em reais entre as ofertas consultadas. Confirme a edição e a ativação na loja.' : 'Tente consultar novamente. As ofertas internacionais ficam na opção abaixo.'}</p>
                  <small><ShieldCheck /> Consulta feita às {formatUpdate(offerData.updatedAt)}</small>
                </aside>
                <Collapsible key={selectedGame.id} className="international-offers">
                  <CollapsibleTrigger className="international-trigger"><Globe2 size={18} /> Ver ofertas internacionais ({internationalOffers.length}) <ChevronRight size={18} /></CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="regional-note">Valores em dólar fornecidos pelo CheapShark. A loja pode apresentar outro preço regional em reais ao abrir; estes valores não são usados na comparação acima.</p>
                    {internationalOffers.length ? internationalOffers.map((offer) => <OfferRow key={offer.id} offer={offer} />) : <p className="no-offer">Nenhuma oferta internacional encontrada nesta consulta.</p>}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="shell methodology">
        <div><span className="method-icon"><ShieldCheck /></span><h3>Preço com contexto</h3><p>Região, moeda, fonte e horário aparecem em cada consulta.</p></div>
        <div><span className="method-icon"><CircleDollarSign /></span><h3>Reais em primeiro lugar</h3><p>Preços brasileiros vêm primeiro. Ofertas internacionais ficam como alternativa.</p></div>
        <div><span className="method-icon"><ShoppingBag /></span><h3>Compra na loja</h3><p>O SafeLoot direciona você à fonte para confirmar e finalizar.</p></div>
      </section>

      <footer>
        <div className="shell footer-main">
          <div><a className="brand" href="#inicio"><span className="brand-mark"><Gamepad2 /></span><span>SAFE<span>LOOT</span><span className="brand-cursor" aria-hidden="true">_</span></span></a><p>Um radar independente de preços para jogos de PC.</p></div>
          <div className="footer-sources"><span>Fontes de dados</span><a href="https://store.steampowered.com/" target="_blank" rel="noreferrer">Steam Store <ExternalLink /></a><a href="https://www.gamersgate.com/pt/" target="_blank" rel="noreferrer">GamersGate <ExternalLink /></a><a href="https://www.cheapshark.com/" target="_blank" rel="noreferrer">CheapShark <ExternalLink /></a></div>
        </div>
        <div className="shell footer-bottom"><span>Preços podem mudar sem aviso. Confirme moeda, região e edição antes da compra.</span><span>Valores regionais em BRL · globais em USD</span></div>
      </footer>
    </main>
  );
}

function OfferRow({ offer, best = false }: { offer: LiveOffer; best?: boolean }) {
  return (
    <article className={`live-offer ${best ? 'is-best' : ''}`}>
      <div className="store-avatar">{offer.store.slice(0, 1)}</div>
      <div className="live-offer-source"><div>{offer.store}{best && <span><Check /> Menor em R$</span>}</div><small>{offer.source}</small></div>
      {offer.discount > 0 && <span className="offer-discount">−{offer.discount}%</span>}
      <div className="live-offer-price">{offer.originalPrice !== offer.finalPrice && <s>{formatPrice(offer.originalPrice, offer.currency)}</s>}<strong>{formatPrice(offer.finalPrice, offer.currency)}</strong></div>
      <a className="offer-link" href={offer.url} target="_blank" rel="noreferrer">Abrir loja <ExternalLink /></a>
    </article>
  );
}

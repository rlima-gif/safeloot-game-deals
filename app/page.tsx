'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  Gamepad2,
  Heart,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  TrendingDown,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Offer = {
  store: string;
  price: number;
  oldPrice: number;
  region: string;
  verified: string;
  kind: string;
};

type Game = {
  id: number;
  title: string;
  genre: string;
  vibe: string;
  discount: number;
  low: number;
  usual: number;
  storeCount: number;
  color: string;
  symbol: string;
  offers: Offer[];
  history: number[];
};

type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

const games: Game[] = [
  {
    id: 1,
    title: 'Starlight Courier',
    genre: 'Aventura',
    vibe: 'Exploração espacial',
    discount: 68,
    low: 47.9,
    usual: 149.9,
    storeCount: 5,
    color: 'from-cyan-400/35 via-blue-600/20 to-transparent',
    symbol: 'SC',
    history: [149, 129, 129, 99, 119, 79, 79, 59, 47],
    offers: [
      { store: 'Nuuvem', price: 47.9, oldPrice: 149.9, region: 'Brasil', verified: 'há 6 min', kind: 'Chave Steam' },
      { store: 'Steam', price: 59.96, oldPrice: 149.9, region: 'Brasil', verified: 'há 11 min', kind: 'Compra direta' },
      { store: 'Green Man Gaming', price: 63.71, oldPrice: 149.9, region: 'Global', verified: 'há 18 min', kind: 'Chave Steam' },
    ],
  },
  {
    id: 2,
    title: 'Neon Vale',
    genre: 'RPG',
    vibe: 'Cyberpunk tático',
    discount: 55,
    low: 53.95,
    usual: 119.9,
    storeCount: 4,
    color: 'from-fuchsia-500/40 via-violet-600/20 to-transparent',
    symbol: 'NV',
    history: [119, 119, 99, 89, 89, 71, 71, 59, 53],
    offers: [
      { store: 'Epic Games', price: 53.95, oldPrice: 119.9, region: 'Brasil', verified: 'há 8 min', kind: 'Compra direta' },
      { store: 'Steam', price: 59.95, oldPrice: 119.9, region: 'Brasil', verified: 'há 12 min', kind: 'Compra direta' },
    ],
  },
  {
    id: 3,
    title: 'Ironwild',
    genre: 'Estratégia',
    vibe: 'Sobrevivência industrial',
    discount: 42,
    low: 69.54,
    usual: 119.9,
    storeCount: 6,
    color: 'from-lime-400/30 via-emerald-700/20 to-transparent',
    symbol: 'IW',
    history: [119, 109, 109, 99, 89, 89, 79, 69, 69],
    offers: [
      { store: 'GOG', price: 69.54, oldPrice: 119.9, region: 'Brasil', verified: 'há 5 min', kind: 'Sem DRM' },
      { store: 'Steam', price: 71.94, oldPrice: 119.9, region: 'Brasil', verified: 'há 9 min', kind: 'Compra direta' },
    ],
  },
  {
    id: 4,
    title: 'Paper Kingdoms',
    genre: 'Indie',
    vibe: 'Construção relaxante',
    discount: 35,
    low: 38.94,
    usual: 59.9,
    storeCount: 3,
    color: 'from-amber-400/35 via-orange-700/20 to-transparent',
    symbol: 'PK',
    history: [59, 59, 49, 49, 45, 45, 41, 38, 38],
    offers: [
      { store: 'Steam', price: 38.94, oldPrice: 59.9, region: 'Brasil', verified: 'há 4 min', kind: 'Compra direta' },
      { store: 'Nuuvem', price: 41.93, oldPrice: 59.9, region: 'Brasil', verified: 'há 15 min', kind: 'Chave Steam' },
    ],
  },
];

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function PriceChart({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 620;
      const y = 160 - ((value - min) / Math.max(max - min, 1)) * 115;
      return `${x},${y}`;
    })
    .join(' ');
  const finalY = Number(points.split(' ').at(-1)?.split(',')[1]);

  return (
    <div className="chart-wrap" aria-label="Histórico de menor preço nos últimos 12 meses">
      <svg viewBox="0 0 620 190" role="img" aria-label="Gráfico de preços em queda">
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#60f5c3" stopOpacity=".3" />
            <stop offset="100%" stopColor="#60f5c3" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[45, 82, 119, 156].map((y) => (
          <line key={y} x1="0" x2="620" y1={y} y2={y} stroke="rgba(255,255,255,.08)" />
        ))}
        <polygon points={`0,178 ${points} 620,178`} fill="url(#chartFill)" />
        <polyline points={points} fill="none" stroke="#60f5c3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="620" cy={finalY} r="6" fill="#0b1020" stroke="#60f5c3" strokeWidth="4" />
      </svg>
      <div className="chart-axis"><span>12 meses atrás</span><span>Hoje</span></div>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [activeGenre, setActiveGenre] = useState('Todos');
  const [selectedId, setSelectedId] = useState(1);
  const [favorites, setFavorites] = useState<number[]>([2]);
  const [alertOn, setAlertOn] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const genres = ['Todos', 'RPG', 'Aventura', 'Estratégia', 'Indie'];
  const filteredGames = useMemo(
    () => games.filter((game) => {
      const matchesText = `${game.title} ${game.genre} ${game.vibe}`.toLowerCase().includes(query.toLowerCase());
      return matchesText && (activeGenre === 'Todos' || game.genre === activeGenre);
    }),
    [activeGenre, query],
  );
  const selected = games.find((game) => game.id === selectedId) ?? games[0];

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebMcpTool) => {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    };

    register({
      name: 'search_games',
      title: 'Buscar jogos',
      description: 'Filtra a lista visível do Ludopreço por título, gênero ou estilo.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', minLength: 1 } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const queryValue = typeof input === 'object' && input !== null && 'query' in input ? String(input.query).trim() : '';
        if (!queryValue) throw new Error('Informe um termo de busca.');
        const matchCount = games.filter((game) => `${game.title} ${game.genre} ${game.vibe}`.toLowerCase().includes(queryValue.toLowerCase())).length;
        setQuery(queryValue);
        setActiveGenre('Todos');
        document.querySelector('#descobrir')?.scrollIntoView({ behavior: 'smooth' });
        return { query: queryValue, matches: matchCount };
      },
    });

    register({
      name: 'compare_game_offers',
      title: 'Comparar ofertas de um jogo',
      description: 'Seleciona um jogo pelo título e abre suas ofertas visíveis por loja.',
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string', minLength: 1 } },
        required: ['title'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const title = typeof input === 'object' && input !== null && 'title' in input ? String(input.title).trim() : '';
        const game = games.find((item) => item.title.toLowerCase() === title.toLowerCase());
        if (!game) throw new Error('Jogo não encontrado na amostra atual.');
        setSelectedId(game.id);
        requestAnimationFrame(() => document.querySelector('#ofertas')?.scrollIntoView({ behavior: 'smooth' }));
        return { title: game.title, offers: game.offers.length, bestPriceBrl: game.low };
      },
    });

    register({
      name: 'set_price_alert',
      title: 'Configurar alerta de preço',
      description: 'Ativa ou desativa o alerta visível para o jogo selecionado.',
      inputSchema: {
        type: 'object',
        properties: { enabled: { type: 'boolean' } },
        required: ['enabled'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (typeof input !== 'object' || input === null || typeof ('enabled' in input ? input.enabled : undefined) !== 'boolean') throw new Error('O campo enabled deve ser booleano.');
        const enabled = Boolean(input.enabled);
        setAlertOn(enabled);
        return { enabled };
      },
    });

    return () => lifecycle.abort();
  }, []);

  const toggleFavorite = (id: number) => {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#070a13]/88 backdrop-blur-xl">
        <div className="shell flex h-[72px] items-center gap-5">
          <a className="brand" href="#top" aria-label="Ludopreço — início">
            <span className="brand-mark"><Gamepad2 size={21} strokeWidth={2.4} /></span>
            <span>Ludo<span>preço</span></span>
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            <a className="nav-link active" href="#descobrir">Descobrir</a>
            <a className="nav-link" href="#ofertas">Ofertas</a>
            <a className="nav-link" href="#historico">Histórico</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="status-pill hidden sm:flex"><span className="status-dot" /> 7 lojas monitoradas</span>
            <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-white/8 hover:text-white" aria-label="Abrir favoritos"><Heart size={19} /></Button>
            <Button className="account-button">RL</Button>
          </div>
        </div>
      </header>

      <section id="top" className="shell pt-7 sm:pt-10">
        <div className="hero-panel">
          <img src="/deal-radar.png" alt="Controle de videogame ao lado de gráficos luminosos de preços" />
          <div className="hero-shade" />
          <div className="hero-content">
            <div className="eyebrow"><Sparkles size={14} /> Radar de ofertas para PC</div>
            <h1>O melhor preço.<br /><span>Com provas.</span></h1>
            <p>Compare lojas, confira a região e entenda o histórico antes de comprar.</p>
            <div className="search-box" role="search">
              <Search className="search-icon" size={21} />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busque um jogo, gênero ou estilo…" aria-label="Buscar jogos" className="search-input" />
              {query && <Button variant="ghost" size="icon" onClick={() => setQuery('')} aria-label="Limpar busca" className="clear-search"><X size={17} /></Button>}
              <Button className="search-button" onClick={() => document.querySelector('#descobrir')?.scrollIntoView({ behavior: 'smooth' })}>Comparar</Button>
            </div>
            <div className="trust-row">
              <span><ShieldCheck size={15} /> Região validada</span>
              <span><Zap size={15} /> Atualização frequente</span>
              <span><Store size={15} /> Fontes identificadas</span>
            </div>
          </div>
          <div className="hero-stat hidden lg:block"><span>Economia em destaque</span><strong>até 68%</strong><small>na amostra de hoje</small></div>
        </div>
      </section>

      <section id="descobrir" className="shell section-space">
        <div className="section-heading">
          <div><span className="section-kicker">Radar aberto</span><h2>Boas quedas de preço agora</h2></div>
          <Button variant="outline" onClick={() => setShowFilters((value) => !value)} className="filter-button"><SlidersHorizontal size={17} /> Filtros <ChevronDown size={15} className={showFilters ? 'rotate-180' : ''} /></Button>
        </div>

        <div className="genre-row" aria-label="Filtrar por gênero">
          {genres.map((genre) => (
            <Button key={genre} onClick={() => setActiveGenre(genre)} variant="ghost" className={`genre-chip ${activeGenre === genre ? 'selected' : ''}`} aria-pressed={activeGenre === genre}>{genre}</Button>
          ))}
        </div>

        {showFilters && (
          <div className="filter-panel">
            <div><span>Plataforma</span><strong>PC</strong></div>
            <div><span>Região</span><strong>Brasil + Global ativável</strong></div>
            <div><span>Tipo de chave</span><strong>Todas</strong></div>
            <div><span>Ordenação</span><strong>Maior desconto</strong></div>
          </div>
        )}

        {filteredGames.length ? (
          <div className="game-grid">
            {filteredGames.map((game, index) => (
              <article key={game.id} className={`game-card ${selectedId === game.id ? 'is-selected' : ''}`}>
                <button className="game-cover" onClick={() => setSelectedId(game.id)} aria-label={`Ver detalhes de ${game.title}`}>
                  <span className={`cover-glow bg-gradient-to-br ${game.color}`} />
                  <span className="cover-symbol">{game.symbol}</span><span className="rank">0{index + 1}</span><span className="discount">−{game.discount}%</span>
                </button>
                <div className="game-body">
                  <div className="game-title-row">
                    <div><span className="genre">{game.genre}</span><h3>{game.title}</h3></div>
                    <Button variant="ghost" size="icon" onClick={() => toggleFavorite(game.id)} className={`heart-button ${favorites.includes(game.id) ? 'favorited' : ''}`} aria-label={`${favorites.includes(game.id) ? 'Remover' : 'Adicionar'} ${game.title} dos favoritos`}><Heart size={18} fill={favorites.includes(game.id) ? 'currentColor' : 'none'} /></Button>
                  </div>
                  <p>{game.vibe}</p>
                  <div className="price-row">
                    <div><span>A partir de</span><strong>{money.format(game.low)}</strong></div>
                    <div className="old-price"><span>Preço usual</span><s>{money.format(game.usual)}</s></div>
                  </div>
                  <Button onClick={() => { setSelectedId(game.id); document.querySelector('#ofertas')?.scrollIntoView({ behavior: 'smooth' }); }} className="compare-button">Comparar {game.storeCount} lojas <ExternalLink size={15} /></Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><Search size={28} /><h3>Nenhum jogo encontrado</h3><p>Tente outro título ou remova o filtro de gênero.</p><Button onClick={() => { setQuery(''); setActiveGenre('Todos'); }}>Limpar filtros</Button></div>
        )}
      </section>

      <section id="ofertas" className="detail-section">
        <div className="shell py-16 sm:py-20">
          <div className="detail-grid">
            <div>
              <div className="selected-label"><span /> Jogo selecionado</div>
              <div className="detail-title-row">
                <div className={`mini-cover bg-gradient-to-br ${selected.color}`}>{selected.symbol}</div>
                <div><span>{selected.genre} · PC</span><h2>{selected.title}</h2><p>{selected.vibe}</p></div>
              </div>

              <div className="offer-list" aria-label={`Ofertas de ${selected.title}`}>
                {selected.offers.map((offer, index) => (
                  <article className={`offer-row ${index === 0 ? 'best' : ''}`} key={`${offer.store}-${offer.price}`}>
                    <div className="store-logo">{offer.store.slice(0, 1)}</div>
                    <div className="offer-source">
                      <div>{offer.store} {index === 0 && <span className="best-badge"><Check size={12} /> Melhor preço</span>}</div>
                      <span>{offer.kind} · {offer.region}</span>
                    </div>
                    <div className="offer-proof"><ShieldCheck size={15} /><span>Verificado<br /><strong>{offer.verified}</strong></span></div>
                    <div className="offer-price"><s>{money.format(offer.oldPrice)}</s><strong>{money.format(offer.price)}</strong></div>
                    <Button className={index === 0 ? 'buy-button best-buy' : 'buy-button'}>Ver oferta <ExternalLink size={14} /></Button>
                  </article>
                ))}
              </div>
              <p className="sample-note"><ShieldCheck size={15} /> Protótipo com preços ilustrativos para validação da experiência. Nenhuma compra é realizada pelo Ludopreço.</p>
            </div>

            <aside className="insight-card">
              <div className="insight-icon"><TrendingDown size={24} /></div>
              <span>Leitura do histórico</span>
              <h3>Este é o menor preço da amostra.</h3>
              <p>A oferta atual está {selected.discount}% abaixo do preço usual registrado.</p>
              <div className="insight-numbers">
                <div><span>Menor atual</span><strong>{money.format(selected.low)}</strong></div>
                <div><span>Economia</span><strong>{money.format(selected.usual - selected.low)}</strong></div>
              </div>
              <Button variant="outline" className={`alert-button ${alertOn ? 'active' : ''}`} onClick={() => setAlertOn((value) => !value)}><Bell size={17} fill={alertOn ? 'currentColor' : 'none'} /> {alertOn ? 'Alerta criado' : 'Criar alerta de preço'}</Button>
            </aside>
          </div>
        </div>
      </section>

      <section id="historico" className="shell section-space history-section">
        <div className="section-heading">
          <div><span className="section-kicker">12 meses</span><h2>Preço com contexto</h2></div>
          <span className="source-stamp"><ShieldCheck size={16} /> Evidência: menor valor observado por período</span>
        </div>
        <div className="history-card">
          <div className="history-summary"><span>Histórico de {selected.title}</span><strong>{money.format(selected.low)}</strong><small>menor preço atual</small></div>
          <PriceChart values={selected.history} />
          <div className="history-legend"><span><i className="current-dot" /> Menor preço</span><span><i /> Preço usual: {money.format(selected.usual)}</span></div>
        </div>
      </section>

      <footer>
        <div className="shell footer-row">
          <a className="brand" href="#top"><span className="brand-mark"><Gamepad2 size={19} /></span><span>Ludo<span>preço</span></span></a>
          <p>Decida com preço, região e origem à vista.</p>
          <span className="footer-source"><CircleDollarSign size={16} /> Valores em BRL</span>
        </div>
      </footer>
    </main>
  );
}

/**
 * SafeLoot Compact Gaming News Taxonomy
 * Deterministic, finite editorial taxonomy designed to eliminate useless "OTHER" classifications.
 */

export const NEWS_TAXONOMY = [
  'jogos',
  'atualizacoes',
  'industria',
  'eventos',
  'cultura',
  'pc',
  'playstation',
  'xbox',
  'nintendo',
  'promocoes',
  'gratis',
  'other',
] as const;

export type NewsTaxonomyCategory = (typeof NEWS_TAXONOMY)[number];

export interface CategoryMeta {
  id: NewsTaxonomyCategory;
  label: string;
  badge: string;
  description: string;
}

export const CATEGORY_METAS: Record<NewsTaxonomyCategory, CategoryMeta> = {
  jogos: {
    id: 'jogos',
    label: 'Jogos',
    badge: 'JOGOS',
    description: 'Lançamentos, anúncios de novos jogos, demos e expansões',
  },
  atualizacoes: {
    id: 'atualizacoes',
    label: 'Atualizações',
    badge: 'ATUALIZAÇÕES',
    description: 'Patches, novas temporadas, modos de jogo e balanceamento',
  },
  industria: {
    id: 'industria',
    label: 'Indústria',
    badge: 'INDÚSTRIA',
    description: 'Estúdios, desenvolvedoras, demissões, fusões e negócios',
  },
  eventos: {
    id: 'eventos',
    label: 'Eventos',
    badge: 'EVENTOS',
    description: 'Expos, convenções, Directs, TGA, Gamescom e festivais',
  },
  cultura: {
    id: 'cultura',
    label: 'Cultura',
    badge: 'CULTURA',
    description: 'Filmes, séries, lore, comunidade, retro e memórias',
  },
  pc: {
    id: 'pc',
    label: 'PC / Steam',
    badge: 'PC / STEAM',
    description: 'Steam, Steam Deck, mods, hardware e novidades do PC',
  },
  playstation: {
    id: 'playstation',
    label: 'PlayStation',
    badge: 'PLAYSTATION',
    description: 'PS5, PS4, PS Plus e ecossistema Sony',
  },
  xbox: {
    id: 'xbox',
    label: 'Xbox',
    badge: 'XBOX',
    description: 'Xbox Series, Game Pass e ecossistema Microsoft',
  },
  nintendo: {
    id: 'nintendo',
    label: 'Nintendo',
    badge: 'NINTENDO',
    description: 'Nintendo Switch e ecossistema Nintendo',
  },
  promocoes: {
    id: 'promocoes',
    label: 'Promoções',
    badge: 'PROMOÇÕES',
    description: 'Ofertas imperdíveis, sales e descontos especiais',
  },
  gratis: {
    id: 'gratis',
    label: 'Grátis',
    badge: 'GRÁTIS',
    description: 'Jogos gratuitos para resgatar por tempo limitado',
  },
  other: {
    id: 'other',
    label: 'Geral',
    badge: 'GERAL',
    description: 'Notícias gerais de games',
  },
};

/**
 * Deterministically classifies an article using contextual signals.
 * Fallback to 'other' is strictly exceptional.
 */
export function classifyArticleCategory(article: {
  title?: string;
  summary?: string;
  whyItMatters?: string;
  category?: string;
  appId?: number | null;
  game?: string | null;
  sources?: Array<{ name?: string; url?: string }>;
}): NewsTaxonomyCategory {
  const title = (article.title || '').toLowerCase();
  const summary = (article.summary || '').toLowerCase();
  const context = (article.whyItMatters || '').toLowerCase();
  const combined = `${title} ${summary} ${context}`;

  // 1. Events (Conventions, Showcases, Awards, Regional Expos like Retrocon)
  if (
    /retrocon|gamescom|tokyo game show|\btgs\b|the game awards|\btga\b|summer game fest|direct|showcase|state of play|convenção|feira|brasil game show|\bbgs\b|festival de jogos/i.test(
      combined,
    )
  ) {
    return 'eventos';
  }

  // 2. Industry & Business (Layoffs, Restructuring, Studio closures, Acquisitions)
  if (
    /despido|demiss|layoff|desligamento|reestrutura|fechamento de estúdio|aquisiç|compra da|estúdio fechou|lucro|receita|vendas de console|liderança|diretoria|parceria entre|bethesda e obsidian/i.test(
      combined,
    )
  ) {
    return 'industria';
  }

  // 3. Culture & Media (Adaptations, Series, Movies, Community Lore, Personal Nostalgia)
  if (
    /filme|cinema|série|animie|anime|edgerunners|adaptaç|personagem mmo|mitologia|goleira mongol|canto de|lore|história do jornalista|curiosidade|leetman/i.test(
      combined,
    )
  ) {
    return 'cultura';
  }

  // 4. Platform-Specific Ecosystems (Nintendo, PlayStation, Xbox)
  if (
    (/nintendo|switch/i.test(combined) && !/ps5|xbox/i.test(title)) ||
    article.category === 'nintendo'
  ) {
    return 'nintendo';
  }

  if (
    (/playstation|\bps5\b|\bps4\b|ps plus|sony interactive/i.test(combined) && !/xbox|switch/i.test(title)) ||
    article.category === 'playstation'
  ) {
    return 'playstation';
  }

  if (
    (/xbox|microsoft gaming|game pass/i.test(combined) && !/ps5|switch/i.test(title)) ||
    article.category === 'xbox'
  ) {
    return 'xbox';
  }

  // 5. Free Games & Giveaways
  if (/grátis|gratuito|resgate|100% off|de graça|giveaway/i.test(combined)) {
    return 'gratis';
  }

  // 6. Sales & Commercial Promotions
  if (/em oferta|promoção|promoções|desconto|descontos|\bsale\b|comprar já|preço baixo/i.test(combined)) {
    return 'promocoes';
  }

  // 7. PC / Steam Deck / Hardware specific
  if (
    /steam deck|linux gaming|driver amd|driver nvidia|geforce|radeon|pc gamer|placa de vídeo/i.test(combined) ||
    article.category === 'steam-deck' ||
    article.category === 'linux'
  ) {
    return 'pc';
  }

  // 8. Updates, Patches, Modes & Seasons
  if (
    /patch|atualizaç|update|hotfix|temporada|season|modo 3v3|modo de jogo|balanceamento|correções|correção de bug|notas de atualização/i.test(
      combined,
    ) ||
    article.category === 'update'
  ) {
    return 'atualizacoes';
  }

  // 9. Games, Releases, Announcements, Demos & Expansions
  if (
    /lançad|lançamento|estreia|novo jogo|demo|anúncio|anuncia|sequência|revelad|trailer de gameplay|hack 'n' slash|roguelike|metroidvania|soulslike|rpg|jogo de|disponível agora/i.test(
      combined,
    ) ||
    article.category === 'release' ||
    article.category === 'announcement' ||
    article.category === 'dlc' ||
    article.category === 'expansion' ||
    Boolean(article.appId) ||
    Boolean(article.game)
  ) {
    return 'jogos';
  }

  // 10. Check if existing raw category can be mapped
  const raw = (article.category || '').toLowerCase().trim();
  if (raw === 'system-requirements' || raw === 'drm') return 'pc';
  if (raw === 'subscription') return 'xbox';
  if (raw === 'edition') return 'jogos';

  return 'other';
}

/**
 * Returns formatted primary display badge text for an article.
 */
export function getCategoryBadgeLabel(category: string): string {
  const normalized = category.toLowerCase().trim() as NewsTaxonomyCategory;
  return CATEGORY_METAS[normalized]?.badge || CATEGORY_METAS.other.badge;
}

/**
 * User-facing category navigation filter options for News header.
 */
export const NEWS_NAV_CHIPS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'jogos', label: 'Jogos' },
  { id: 'atualizacoes', label: 'Atualizações' },
  { id: 'industria', label: 'Indústria' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'cultura', label: 'Cultura' },
  { id: 'pc', label: 'PC / Steam' },
  { id: 'consoles', label: 'Consoles' },
];

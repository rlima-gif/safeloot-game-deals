import type { RawNewsItem } from './sources/config';

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

const GAMING_POSITIVE_TOKENS = [
  // Platforms & Ecosystems
  'steam', 'valve', 'pc gamer', 'pc gaming', 'playstation', 'ps4', 'ps5', 'psvr', 'psvr2', 'ps plus', 'psn',
  'xbox', 'series x', 'series s', 'game pass', 'microsoft gaming',
  'nintendo', 'switch', 'switch 2', 'eshop', 'direct',
  'epic games', 'gog', 'ubisoft connect', 'ea play', 'battle.net',
  'steam deck', 'geforce now', 'proton',

  // Hardware gamer
  'rtx', 'geforce', 'radeon', 'gpu', 'placa de video', 'placa de vídeo', 'hardware gamer',
  'ryzen', 'intel core',

  // Game concepts
  'game', 'games', 'gaming', 'jogo', 'jogos', 'gamer', 'gameplay',
  'dlc', 'patch', 'update', 'atualizacao', 'atualização', 'correcao', 'correções',
  'launch', 'lancamento', 'lançamento', 'release', 'released', 'remake', 'remaster',
  'rpg', 'fps', 'mmo', 'indie', 'early access', 'acesso antecipado',
  'demo', 'beta', 'mod', 'mods', 'speedrun', 'trailer', 'teaser',
  'giveaway', 'free game', 'jogo gratis', 'jogo grátis', 'gratuito', 'resgate', 'de graca', 'de graça',
  'sale', 'promocao', 'promoção', 'desconto', 'oferta', 'price cut', 'queda de preco', 'queda de preço',
  'denuvo', 'anti-cheat', 'anticheat', 'drm',

  // Studios & Publishers & Major Franchises
  'rockstar', 'gta', 'bethesda', 'blizzard', 'activision', 'capcom', 'square enix',
  'fromsoftware', 'bandai namco', 'konami', 'sega', 'atlus', 'cd projekt', 'cyberpunk',
  'witcher', 'bungie', 'bioware', 'electronic arts', 'ubisoft', 'take-two', 'sony interactive',
  'zelda', 'mario', 'pokemon', 'pokémon', 'halo', 'forza', 'gears of war', 'god of war',
  'elden ring', 'dark souls', 'resident evil', 'silent hill', 'final fantasy', 'monster hunter',
  'assassin\'s creed', 'call of duty', 'battlefield', 'overwatch', 'diablo', 'warcraft',
  'starcraft', 'fortnite', 'league of legends', 'valorant', 'counter-strike', 'dota',
];

const NON_GAMING_NEGATIVE_TOKENS = [
  // Appliances & Smart Home
  'geladeira', 'refrigerador', 'air fryer', 'fritadeira', 'aspirador', 'lavadora', 'lava-loucas', 'lava-louças',
  'smartwatch', 'smartband', 'relogio inteligente', 'relógio inteligente',

  // Electric vehicles & automotive
  'carro eletrico', 'carro elétrico', 'veiculo eletrico', 'veículo elétrico', 'byd', 'tesla', 'montadora',
  'combustivel', 'combustível', 'gasolina', 'etanol', 'hibrido', 'híbrido', 'suv',

  // Telecoms & Generic Mobile apps
  'plano controle', 'operadora tim', 'operadora claro', 'operadora vivo', 'whatsapp beta', 'atualizacao do whatsapp',
  'atualização do whatsapp', 'stories do instagram',

  // Corporate finance & General Economy
  'taxa selic', 'imposto de renda', 'investimento cdb', 'tesouro direto', 'fundo imobiliario', 'fundo imobiliário',
  'bolsa de valores', 'ibovespa', 'banco central',

  // General TV/Gossip/Entertainment
  'reality show', 'big brother', 'bbb', 'paredao', 'paredão', 'novela', 'horoscopo', 'horóscopo',
];

export function isGamingNews(item: RawNewsItem): FilterResult {
  const titleLower = item.title.toLowerCase();
  const snippetLower = (item.snippet || '').toLowerCase();
  const combined = `${titleLower} ${snippetLower}`;

  if (item.title.trim().length < 5) {
    return { pass: false, reason: 'Título excessivamente curto' };
  }

  // Reject negative non-gaming topics unless there is an explicit core game indicator
  for (const neg of NON_GAMING_NEGATIVE_TOKENS) {
    if (combined.includes(neg)) {
      const hasStrongGameOverride = ['gta', 'cyberpunk', 'game', 'jogo', 'steam', 'playstation', 'xbox', 'nintendo'].some((k) =>
        titleLower.includes(k),
      );
      if (!hasStrongGameOverride) {
        return { pass: false, reason: `Conteúdo não-gamer identificado (${neg})` };
      }
    }
  }

  // Dedicated gaming sources are focused on games
  const dedicatedGamingSources = new Set([
    'steam',
    'pcgamer',
    'eurogamer',
    'rps',
    'gematsu',
    'vgc',
    'gamespot',
    'playstation',
    'xbox',
    'nintendolife',
  ]);

  if (dedicatedGamingSources.has(item.sourceId)) {
    return { pass: true };
  }

  // For multi-topic sources (GNews, general feeds): check for gaming tokens
  for (const token of GAMING_POSITIVE_TOKENS) {
    if (titleLower.includes(token) || snippetLower.includes(token)) {
      return { pass: true };
    }
  }

  return { pass: false, reason: 'Nenhum termo relevante sobre games detectado' };
}

export function filterGamingNews(items: RawNewsItem[]): {
  passed: RawNewsItem[];
  rejected: { item: RawNewsItem; reason: string }[];
} {
  const passed: RawNewsItem[] = [];
  const rejected: { item: RawNewsItem; reason: string }[] = [];

  for (const item of items) {
    const check = isGamingNews(item);
    if (check.pass) {
      passed.push(item);
    } else {
      rejected.push({ item, reason: check.reason || 'Filtrado' });
    }
  }

  return { passed, rejected };
}

export function hasCommercialValue(article: {
  appId?: number | null;
  category?: string;
  purchaseImpact?: string;
  purchaseAdvice?: string;
}): boolean {
  // 1. Must be a PC game with a valid appId tracked by SafeLoot
  if (!article.appId || !Number.isInteger(article.appId) || article.appId <= 0) {
    return false;
  }

  // 2. Omit for non-game or non-commercial editorial categories
  const nonCommercialCategories = ['industry', 'hardware', 'community', 'esports', 'other'];
  if (article.category && nonCommercialCategories.includes(article.category)) {
    return false;
  }

  // 3. Must have meaningful buying impact ('high' or 'medium').
  // Explicitly omit 'low' and 'none'.
  if (article.purchaseImpact !== 'high' && article.purchaseImpact !== 'medium') {
    return false;
  }

  // 4. Must have real commercial advice, not boilerplate filler
  const advice = (article.purchaseAdvice || '').trim().toLowerCase();
  if (
    !advice ||
    advice.length < 15 ||
    advice.includes('acompanhe as novidades') ||
    advice.includes('monitore o preço caso') ||
    advice.includes('não há impacto') ||
    advice.includes('sem impacto') ||
    advice.includes('baixo impacto')
  ) {
    return false;
  }

  return true;
}

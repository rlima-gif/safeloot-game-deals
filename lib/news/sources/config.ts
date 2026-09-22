export interface RawNewsItem {
  sourceId: string;
  sourceName: string;
  sourceType: 'steam' | 'rss' | 'official' | 'gnews';
  articleId: string;
  articleUrl: string;
  title: string;
  snippet?: string;
  publishedAt: string;
  collectedAt: string;
  appId?: number;
  imageUrl?: string;
}

export interface NewsSourceConfig {
  id: string;
  name: string;
  type: 'steam' | 'rss' | 'official' | 'gnews';
  enabled: boolean;
  priority: number;
  url?: string;
  lang?: 'en' | 'pt';
}

export const NEWS_SOURCES: NewsSourceConfig[] = [
  {
    id: 'steam',
    name: 'Steam News',
    type: 'steam',
    enabled: true,
    priority: 100,
    lang: 'en',
  },
  {
    id: 'gnews',
    name: 'GNews',
    type: 'gnews',
    enabled: true,
    priority: 90,
    lang: 'en',
  },
  {
    id: 'adrenaline',
    name: 'Adrenaline',
    type: 'rss',
    enabled: true,
    priority: 85,
    url: 'https://www.adrenaline.com.br/feed/',
    lang: 'pt',
  },
  {
    id: 'flowgames',
    name: 'Flow Games',
    type: 'rss',
    enabled: true,
    priority: 85,
    url: 'https://flowgames.gg/feed/',
    lang: 'pt',
  },
  {
    id: 'pcgamer',
    name: 'PC Gamer',
    type: 'rss',
    enabled: true,
    priority: 80,
    url: 'https://www.pcgamer.com/rss/',
    lang: 'en',
  },
  {
    id: 'gamespot',
    name: 'GameSpot',
    type: 'rss',
    enabled: true,
    priority: 80,
    url: 'https://www.gamespot.com/feeds/news/',
    lang: 'en',
  },
  {
    id: 'eurogamer',
    name: 'Eurogamer',
    type: 'rss',
    enabled: true,
    priority: 75,
    url: 'https://www.eurogamer.net/feed/news',
    lang: 'en',
  },
  {
    id: 'rps',
    name: 'Rock Paper Shotgun',
    type: 'rss',
    enabled: true,
    priority: 75,
    url: 'https://www.rockpapershotgun.com/feed/news',
    lang: 'en',
  },
  {
    id: 'vgc',
    name: 'VGC',
    type: 'rss',
    enabled: true,
    priority: 75,
    url: 'https://www.videogameschronicle.com/feed/',
    lang: 'en',
  },
  {
    id: 'gematsu',
    name: 'Gematsu',
    type: 'rss',
    enabled: true,
    priority: 70,
    url: 'https://www.gematsu.com/feed',
    lang: 'en',
  },
  {
    id: 'ign',
    name: 'IGN PC',
    type: 'rss',
    enabled: true,
    priority: 70,
    url: 'https://feeds.feedburner.com/ign/pc-articles',
    lang: 'en',
  },
  {
    id: 'playstation',
    name: 'PlayStation Blog',
    type: 'rss',
    enabled: true,
    priority: 70,
    url: 'https://blog.playstation.com/feed/',
    lang: 'en',
  },
  {
    id: 'xbox',
    name: 'Xbox Wire',
    type: 'rss',
    enabled: true,
    priority: 70,
    url: 'https://news.xbox.com/en-us/feed/',
    lang: 'en',
  },
  {
    id: 'nintendolife',
    name: 'Nintendo Life',
    type: 'rss',
    enabled: true,
    priority: 65,
    url: 'https://www.nintendolife.com/feeds/news',
    lang: 'en',
  },
];

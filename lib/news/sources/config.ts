export interface RawNewsItem {
  sourceId: string;
  sourceName: string;
  sourceType: 'steam' | 'rss' | 'official';
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
  type: 'steam' | 'rss' | 'official';
  enabled: boolean;
  priority: number;
  url?: string;
}

export const NEWS_SOURCES: NewsSourceConfig[] = [
  {
    id: 'steam',
    name: 'Steam News',
    type: 'steam',
    enabled: true,
    priority: 100,
  },
  {
    id: 'pcgamer',
    name: 'PC Gamer',
    type: 'rss',
    enabled: true,
    priority: 80,
    url: 'https://www.pcgamer.com/rss/',
  },
  {
    id: 'ign',
    name: 'IGN PC',
    type: 'rss',
    enabled: true,
    priority: 70,
    url: 'https://feeds.feedburner.com/ign/pc-articles',
  },
];

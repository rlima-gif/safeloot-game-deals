import {
  integer,
  sqliteTable,
  text,
  index,
  uniqueIndex,
  real,
} from 'drizzle-orm/sqlite-core';
export const games = sqliteTable('games', {
  appId: integer('app_id').primaryKey(),
  title: text('title').notNull(),
  monitored: integer('monitored').notNull().default(1),
  checkedAt: text('checked_at'),
  createdAt: text('created_at').notNull(),
});
export const products = sqliteTable(
  'store_products',
  {
    id: text('id').primaryKey(),
    appId: integer('app_id')
      .notNull()
      .references(() => games.appId),
    store: text('store').notNull(),
    productId: text('product_id').notNull(),
    url: text('url').notNull(),
    edition: text('edition'),
    launcher: text('launcher'),
    region: text('region').notNull(),
    status: text('status').notNull(),
    checkedAt: text('checked_at').notNull(),
  },
  (t) => [index('products_game').on(t.appId, t.store)],
);
export const prices = sqliteTable(
  'price_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    product: text('product')
      .notNull()
      .references(() => products.id),
    price: integer('price_cents').notNull(),
    original: integer('original_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),
    observedAt: text('observed_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (t) => [
    uniqueIndex('price_observation').on(t.product, t.observedAt),
    index('price_product_time').on(t.product, t.lastSeenAt),
  ],
);
export const health = sqliteTable('source_health', {
  store: text('store').primaryKey(),
  status: text('status').notNull(),
  checkedAt: text('checked_at').notNull(),
  details: text('details').notNull(),
});
export const collection = sqliteTable('collection_runs', {
  id: text('id').primaryKey(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  result: text('result'),
});

export const newsSources = sqliteTable('news_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  enabled: integer('enabled').notNull().default(1),
  priority: integer('priority').notNull().default(50),
  url: text('url'),
  lastCheckedAt: text('last_checked_at'),
  status: text('status').notNull().default('ok'),
});

export const newsRawItems = sqliteTable(
  'news_raw_items',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => newsSources.id),
    articleId: text('article_id').notNull(),
    articleUrl: text('article_url').notNull(),
    title: text('title').notNull(),
    snippet: text('snippet'),
    publishedAt: text('published_at').notNull(),
    collectedAt: text('collected_at').notNull(),
    appId: integer('app_id').references(() => games.appId),
    hash: text('hash').notNull(),
  },
  (t) => [
    uniqueIndex('raw_hash_idx').on(t.hash),
    index('raw_app_idx').on(t.appId),
  ],
);

export const newsEvents = sqliteTable(
  'news_events',
  {
    id: text('id').primaryKey(),
    appId: integer('app_id').references(() => games.appId),
    title: text('title').notNull(),
    category: text('category').notNull(),
    importance: integer('importance').notNull(),
    confidence: real('confidence').notNull(),
    purchaseImpact: text('purchase_impact').notNull(),
    safeToPublish: integer('safe_to_publish').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('event_app_idx').on(t.appId)],
);

export const newsArticles = sqliteTable(
  'news_articles',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => newsEvents.id),
    appId: integer('app_id').references(() => games.appId),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    whyItMatters: text('why_it_matters').notNull(),
    purchaseAdvice: text('purchase_advice').notNull(),
    category: text('category').notNull(),
    purchaseImpact: text('purchase_impact').notNull(),
    publishedAt: text('published_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('article_app_idx').on(t.appId),
    index('article_published_idx').on(t.publishedAt),
  ],
);

export const newsArticleSources = sqliteTable('news_article_sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: text('article_id')
    .notNull()
    .references(() => newsArticles.id),
  rawItemId: text('raw_item_id')
    .notNull()
    .references(() => newsRawItems.id),
  sourceName: text('source_name').notNull(),
  articleUrl: text('article_url').notNull(),
});

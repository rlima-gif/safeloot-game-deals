import {
  integer,
  sqliteTable,
  text,
  index,
  uniqueIndex,
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

export const priceHistorySchema = `
create table if not exists games (
  steam_app_id integer primary key,
  title text not null,
  updated_at text not null
);

create table if not exists store_products (
  id text primary key,
  steam_app_id integer not null,
  store text not null,
  product_id text not null,
  title text not null,
  edition text,
  region text not null,
  launcher text,
  product_url text not null,
  updated_at text not null
);

create table if not exists current_offers (
  store_product_id text primary key,
  price real not null,
  original_price real not null,
  currency text not null,
  available integer not null,
  verified_at text not null,
  source text not null
);

create table if not exists price_history (
  id integer primary key autoincrement,
  store_product_id text not null,
  steam_app_id integer not null,
  store text not null,
  price real not null,
  original_price real not null,
  currency text not null,
  region text not null,
  available integer not null,
  product_url text not null,
  source text not null,
  collected_at text not null
);

create table if not exists source_health (
  store text primary key,
  status text not null,
  responded integer not null,
  duration_ms integer not null,
  candidates integer,
  validated integer,
  price_extracted integer,
  checked_at text not null
);
`;

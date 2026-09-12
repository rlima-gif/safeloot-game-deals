import type { StoreResult } from './connectors/types';

export type PriceHistoryRow = {
  appId: number;
  store: string;
  productId: string;
  title: string;
  edition?: string;
  price: number;
  originalPrice: number;
  currency: 'BRL' | 'USD';
  region: 'Brasil' | 'LATAM' | 'Global';
  available: boolean;
  url: string;
  source: string;
  collectedAt: string;
};

const rows: PriceHistoryRow[] = [];

function sameSnapshot(a: PriceHistoryRow, b: PriceHistoryRow) {
  return (
    a.appId === b.appId &&
    a.store === b.store &&
    a.productId === b.productId &&
    a.price === b.price &&
    a.originalPrice === b.originalPrice &&
    a.currency === b.currency &&
    a.available === b.available
  );
}

export function recordConfirmedPrice(
  appId: number,
  title: string,
  result: StoreResult,
) {
  if (result.status !== 'confirmed' || !result.offer) return;
  if (result.offer.currency !== 'BRL') return;
  const row: PriceHistoryRow = {
    appId,
    store: result.store,
    productId: result.productId || result.offer.productUrl,
    title,
    edition: result.offer.edition,
    price: result.offer.price,
    originalPrice: result.offer.originalPrice,
    currency: result.offer.currency,
    region: result.offer.region,
    available: result.offer.available,
    url: result.offer.productUrl,
    source: `${result.store} connector`,
    collectedAt: result.offer.verifiedAt,
  };
  const last = [...rows].reverse().find(
    (item) =>
      item.appId === row.appId &&
      item.store === row.store &&
      item.productId === row.productId,
  );
  if (last && sameSnapshot(last, row)) return;
  rows.push(row);
  if (rows.length > 5000) rows.splice(0, rows.length - 5000);
}

export function getStoredHistory(appId: number, days: number) {
  const since = Date.now() - days * 86400000;
  return rows
    .filter((row) => row.appId === appId && row.currency === 'BRL')
    .filter((row) => Date.parse(row.collectedAt) >= since)
    .map((row) => ({
      date: Date.parse(row.collectedAt),
      price: row.price,
      store: row.store,
    }))
    .sort((a, b) => a.date - b.date);
}

export function getCurrentPriceStats(appId: number) {
  const latest = new Map<string, PriceHistoryRow>();
  for (const row of rows.filter((item) => item.appId === appId && item.currency === 'BRL')) {
    latest.set(`${row.store}:${row.productId}`, row);
  }
  const current = [...latest.values()].filter((row) => row.available);
  return {
    currentLow: current.length ? Math.min(...current.map((row) => row.price)) : null,
    historicalLow: rows.some((row) => row.appId === appId && row.currency === 'BRL')
      ? Math.min(...rows.filter((row) => row.appId === appId && row.currency === 'BRL').map((row) => row.price))
      : null,
  };
}

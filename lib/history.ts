import { itadEnabled } from './itad';
import { getStoredHistory } from './price-history-store';
export type HistoryPoint = { date: number; price: number; store?: string };
export type HistoryMaturity = {
  firstObservedAt?: string;
  lastObservedAt?: string;
  observationCount: number;
  changeCount: number;
  retailerCount: number;
};
export type HistoryPayload = {
  status: 'ready' | 'building' | 'not-configured' | 'empty';
  points: HistoryPoint[];
  analysisPoints?: HistoryPoint[];
  source: string;
  days: number;
  maturity?: HistoryMaturity;
};
export function calculateMaturity(points: HistoryPoint[]): HistoryMaturity {
  if (!points.length) {
    return {
      observationCount: 0,
      changeCount: 0,
      retailerCount: 0,
    };
  }
  const sorted = [...points].sort((a, b) => a.date - b.date);
  const stores = new Set<string>();
  let changeCount = 0;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i].store;
    if (s) stores.add(s);
    if (i > 0 && Math.abs(sorted[i].price - sorted[i - 1].price) > 0.001) {
      changeCount++;
    }
  }
  return {
    firstObservedAt: new Date(sorted[0].date).toISOString(),
    lastObservedAt: new Date(sorted[sorted.length - 1].date).toISOString(),
    observationCount: sorted.length,
    changeCount,
    retailerCount: stores.size || 1,
  };
}
export function parseHistory(value: unknown): HistoryPoint[] {
  if (!Array.isArray(value)) return [];
  const points = new Map<number, number>();
  for (const row of value) {
    const date = Date.parse(row?.timestamp),
      money = row?.deal?.price;
    if (
      row?.shop?.id === 61 &&
      money?.currency === 'BRL' &&
      typeof money.amount === 'number' &&
      Number.isFinite(money.amount) &&
      money.amount >= 0 &&
      Number.isFinite(date) &&
      date <= Date.now()
    )
      points.set(date, money.amount);
  }
  return [...points]
    .sort(([a], [b]) => a - b)
    .map(([date, price]) => ({ date, price }));
}
async function loadHistory(
  appId: number,
  days: number,
): Promise<HistoryPayload> {
  const key = process.env.ITAD_API_KEY;
  const base = {
    points: [] as HistoryPoint[],
    source: 'IsThereAnyDeal · Steam Brasil',
    days,
  };
  if (!itadEnabled()) return { ...base, status: 'not-configured', maturity: calculateMaturity([]) };
  async function request(path: string) {
    const res = await fetch(`https://api.isthereanydeal.com${path}`, {
      headers: { 'ITAD-API-Key': key!, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error('Histórico temporariamente indisponível.');
    return res.json();
  }
  const lookup = (await request(`/games/lookup/v1?appid=${appId}`)) as {
    found: boolean;
    game?: { id?: string };
  };
  if (!lookup.found || typeof lookup.game?.id !== 'string')
    return { ...base, status: 'empty', maturity: calculateMaturity([]) };
  const params = new URLSearchParams({
    id: lookup.game!.id!,
    country: 'BR',
    shops: '61',
    since: new Date(Date.now() - Math.max(days, 365) * 86400000).toISOString(),
  });
  const analysisPoints = parseHistory(
    await request(`/games/history/v2?${params}`),
  );
  const points = analysisPoints.filter(
    (point) => point.date >= Date.now() - days * 86400000,
  );
  return {
    ...base,
    points,
    analysisPoints,
    status: points.length ? 'ready' : 'empty',
    maturity: calculateMaturity(analysisPoints.length ? analysisPoints : points),
  };
}

const historyCache = new Map<
  string,
  { expires: number; payload: HistoryPayload }
>();
export async function getHistory(
  appId: number,
  days: number,
): Promise<HistoryPayload> {
  const ownPoints = await getStoredHistory(appId, days);
  const storeCounts = new Map<string, number>();
  for (const point of ownPoints)
    storeCounts.set(point.store, (storeCounts.get(point.store) || 0) + 1);
  if ([...storeCounts.values()].some((count) => count >= 2)) {
    const analysisPoints = (
      await getStoredHistory(appId, Math.max(days, 365))
    ).filter((point) => point.store === 'Steam');
    return {
      status: 'ready',
      points: ownPoints,
      analysisPoints,
      source: 'SafeLoot · histórico próprio por loja',
      days,
      maturity: calculateMaturity(ownPoints),
    };
  }
  if (ownPoints.length > 0) {
    return {
      status: 'building',
      points: ownPoints,
      analysisPoints: ownPoints,
      source: 'SafeLoot · histórico próprio por loja',
      days,
      maturity: calculateMaturity(ownPoints),
    };
  }
  if (!itadEnabled())
    return {
      status: 'building',
      points: [],
      source: 'SafeLoot · histórico próprio por loja',
      days,
      maturity: calculateMaturity([]),
    };
  const cacheKey = `${appId}:${days}`;
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.payload;
  const payload = await loadHistory(appId, days);
  if (historyCache.size >= 100)
    historyCache.delete(historyCache.keys().next().value!);
  historyCache.set(cacheKey, { expires: Date.now() + 300000, payload });
  return payload;
}

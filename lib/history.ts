import { itadEnabled } from './itad';
export type HistoryPoint = { date: number; price: number };
export type HistoryPayload = {
  status: 'ready' | 'not-configured' | 'empty';
  points: HistoryPoint[];
  analysisPoints?: HistoryPoint[];
  source: string;
  days: number;
};
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
  if (!itadEnabled()) return { ...base, status: 'not-configured' };
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
    return { ...base, status: 'empty' };
  const params = new URLSearchParams({
    id: lookup.game!.id!,
    country: 'BR',
    shops: '61',
    since: new Date(Date.now() - Math.max(days, 365) * 86400000).toISOString(),
  });
  const analysisPoints = parseHistory(await request(`/games/history/v2?${params}`));
  const points = analysisPoints.filter(point => point.date >= Date.now() - days * 86400000);
  return { ...base, points, analysisPoints, status: points.length ? 'ready' : 'empty' };
}


const historyCache = new Map<string, { expires: number; payload: HistoryPayload }>();
export async function getHistory(appId: number, days: number): Promise<HistoryPayload> {
  if (!itadEnabled()) return loadHistory(appId, days);
  const cacheKey = `${appId}:${days}`;
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.payload;
  const payload = await loadHistory(appId, days);
  if (historyCache.size >= 100) historyCache.delete(historyCache.keys().next().value!);
  historyCache.set(cacheKey, { expires: Date.now() + 300000, payload });
  return payload;
}

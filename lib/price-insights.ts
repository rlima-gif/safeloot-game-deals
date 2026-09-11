import type { HistoryPoint } from './history';
const day = 86400000;
export function priceInsights(
  points: HistoryPoint[],
  current: number,
  discount: number,
  now = Date.now(),
) {
  const sorted = points
    .filter(
      (point) =>
        Number.isFinite(point.date) &&
        point.date <= now &&
        Number.isFinite(point.price) &&
        point.price >= 0,
    )
    .sort((a, b) => a.date - b.date);
  const start = now - 90 * day;
  // Price changes are events, not daily samples. Require coverage from the window's start.
  if (
    !Number.isFinite(current) ||
    current < 0 ||
    sorted.length < 3 ||
    sorted[0].date > start
  )
    return null;
  function average(days: number) {
    const from = now - days * day;
    const baseline = sorted.filter((point) => point.date <= from).at(-1);
    if (!baseline) return null;
    let price = baseline.price,
      time = from,
      area = 0;
    for (const point of sorted.filter((point) => point.date > from)) {
      area += price * (point.date - time);
      time = point.date;
      price = point.price;
    }
    return (area + price * (now - time)) / (days * day);
  }
  const recent = sorted.filter((point) => point.date >= start);
  const baseline = sorted.filter((point) => point.date <= start).at(-1)!;
  const series = [baseline, ...recent];
  if (series.length < 3) return null;
  const low = Math.min(...series.map((point) => point.price), current),
    avg90 = average(90)!,
    avg30 = average(30)!;
  const aboveLow =
    low > 0 ? (current / low - 1) * 100 : current === 0 ? 0 : null;
  let drops = 0;
  for (let i = 1; i < series.length; i++)
    if (series[i].price < series[i - 1].price) drops++;
  // Transparent heuristic: low proximity (60%), time-weighted average (25%), discount (15%).
  const proximity = aboveLow === null ? 0 : Math.max(0, 10 - aboveLow / 10);
  const relative =
    avg90 > 0
      ? Math.max(0, Math.min(10, 5 + (1 - current / avg90) * 10))
      : current === 0
        ? 10
        : 0;
  const score =
    Math.round(
      Math.max(
        0,
        Math.min(
          10,
          proximity * 0.6 +
            relative * 0.25 +
            Math.max(0, Math.min(100, discount)) * 0.015 -
            (drops >= 3 && current > low * 1.1 ? 0.5 : 0),
        ),
      ) * 10,
    ) / 10;
  return {
    low,
    avg30,
    avg90,
    aboveLow,
    difference: current - low,
    drops,
    score,
    label:
      score >= 8.5
        ? 'Excelente preço'
        : score >= 7
          ? 'Bom preço'
          : score >= 5
            ? 'Preço normal'
            : 'Melhor esperar',
  };
}

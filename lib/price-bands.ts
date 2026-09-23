export const ALLOWED_PRICES = ['0', '10', '10-20', '20-30', '30-50', '50-100', '100+'] as const;
export type PriceBand = (typeof ALLOWED_PRICES)[number] | 'all';

export function matchesPriceBand(finalPrice: number | null | undefined, band: string): boolean {
  if (band === 'all') return true;
  if (finalPrice === null || finalPrice === undefined || !Number.isFinite(finalPrice)) return false;
  if (band === '0') return finalPrice === 0;
  if (band === '10' || band === '0-10') return finalPrice > 0 && finalPrice <= 10;
  if (band === '10-20') return finalPrice > 10 && finalPrice <= 20;
  if (band === '20-30') return finalPrice > 20 && finalPrice <= 30;
  if (band === '30-50') return finalPrice > 30 && finalPrice <= 50;
  if (band === '50-100') return finalPrice > 50 && finalPrice <= 100;
  if (band === '100+' || band === '100') return finalPrice > 100;
  return false;
}

export function priceBandLabel(p: string): string {
  if (p === 'all') return 'Todos';
  if (p === '0') return 'Grátis';
  if (p === '10') return 'Até R$ 10';
  if (p === '10-20') return 'R$ 10–20';
  if (p === '20-30') return 'R$ 20–30';
  if (p === '30-50') return 'R$ 30–50';
  if (p === '50-100') return 'R$ 50–100';
  if (p === '100+' || p === '100') return 'R$ 100+';
  return p;
}

export function priceBandOptionLabel(p: string): string {
  if (p === 'all') return 'Qualquer valor (Todos)';
  if (p === '0') return 'Grátis';
  if (p === '10') return 'Até R$ 10';
  if (p === '10-20') return 'R$ 10 a R$ 20';
  if (p === '20-30') return 'R$ 20 a R$ 30';
  if (p === '30-50') return 'R$ 30 a R$ 50';
  if (p === '50-100') return 'R$ 50 a R$ 100';
  if (p === '100+' || p === '100') return 'Acima de R$ 100';
  return p;
}

export function normalizeLegacyPriceBand(rawPrice: string | null): string {
  if (!rawPrice) return 'all';
  if (rawPrice === '20') return '10-20';
  if (rawPrice === '30') return '20-30';
  if (rawPrice === '50') return '30-50';
  if (rawPrice === '100') return '50-100';
  if ((ALLOWED_PRICES as readonly string[]).includes(rawPrice)) return rawPrice;
  return 'all';
}

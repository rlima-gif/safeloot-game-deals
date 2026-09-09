import type { LiveOffer } from './game-api';

function decodeEntities(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

function titleKey(value: string) {
  // Preserve edition names, years and numbers: a remake or DLC is not the same product.
  return decodeEntities(value).replace(/[™®]/g, '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

export function regionalAmount(value: unknown, currency: unknown): number | null {
  if (currency !== 'BRL' || value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const cents = Number(value);
  return Number.isFinite(cents) && cents >= 0 ? cents / 100 : null;
}

export async function fetchGamersGateCatalog(title: string) {
  const url = new URL('https://www.gamersgate.com/pt/games/');
  url.searchParams.set('query', title);
  const response = await fetch(url, { headers: { 'Accept': 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error('GamersGate indisponível.');
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('Catálogo excedeu o limite da consulta.');
  return html;
}

export function parseGamersGateOffers(html: string, title: string): LiveOffer[] {
  const cards = [...html.matchAll(/<div\b[^>]*class="[^"]*\bproduct--item\b[^"]*"[^>]*>/g)];
  const offers: LiveOffer[] = [];
  for (let index = 0; index < cards.length; index++) {
    const card = cards[index];
    const attrs = Object.fromEntries([...card[0].matchAll(/\b(data-[\w-]+)="([^"]*)"/g)].map((match) => [match[1], decodeEntities(match[2])]));
    if (titleKey(attrs['data-name'] ?? '') !== titleKey(title) || attrs['data-currency'] !== 'BRL') continue;
    const amount = attrs['data-price'];
    if (!amount || !/^\d+(?:\.\d{1,2})?$/.test(amount)) continue;
    const finalPrice = Number(amount);
    const path = attrs['data-url'] ?? '';
    if (!/^\/pt\/product\/[a-z0-9-]+\/$/.test(path)) continue;
    const body = html.slice(card.index, cards[index + 1]?.index ?? card.index! + 10000);
    const full = body.match(/class="catalog-item--full-price"[^>]*>\s*R\$\s*(\d+(?:\.\d{1,2})?)\s*</)?.[1];
    const originalPrice = full && Number(full) >= finalPrice ? Number(full) : finalPrice;
    offers.push({ id: `gamersgate-br-${attrs['data-id']}`, store: 'GamersGate', region: 'Brasil', currency: 'BRL', finalPrice, originalPrice, discount: originalPrice > 0 ? Math.round((1 - finalPrice / originalPrice) * 100) : 0, url: `https://www.gamersgate.com${path}`, source: 'Preço em BRL consultado na GamersGate' });
  }
  // An ambiguous edition match must not become a comparison price.
  return offers.length === 1 ? offers : [];
}

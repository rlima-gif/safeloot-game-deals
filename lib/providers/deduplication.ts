import type { NormalizedOffer } from './types';
import { validateOffer } from './validation';

/**
 * Returns the authority precedence tier for a given provider.
 * Higher number = higher precedence.
 * 
 * Rules:
 * direct retailer source (300)
 * > authorized regional aggregator (200)
 * > auxiliary aggregator (100)
 */
export function getProviderPrecedence(providerId: string): number {
  const pid = (providerId || '').toLowerCase();
  if (pid.startsWith('direct_') || pid.startsWith('direct-') || pid === 'direct' || pid === 'direct_connector') {
    return 300;
  }
  if (pid === 'itad' || pid === 'isthereanydeal') {
    return 200;
  }
  // Auxiliary aggregators (GG.deals, CheapShark, GamerPower, etc.)
  return 100;
}

export function deduplicationKey(offer: NormalizedOffer): string {
  const edition = (offer.edition || 'standard').trim().toLowerCase();
  return `${offer.canonicalGameId}:${offer.retailerId.toLowerCase()}:${edition}:${offer.region}:${offer.currency}`;
}

/**
 * Deterministically deduplicates offers across multiple providers for the same retailer & game.
 * 
 * Invariants:
 * 1. Deduplication identity: canonicalGameId + retailerId + edition + region + currency.
 * 2. Deterministic precedence: direct > authorized regional aggregator > auxiliary aggregator.
 * 3. Tie-breaking: freshness (newer observedAt) -> lowest currentPrice.
 * 4. NEVER prioritized by affiliate commission or commerceUrlSource.
 * 5. Rejects invalid offers failing validation.
 */
export function deduplicateOffers(offers: NormalizedOffer[]): NormalizedOffer[] {
  const map = new Map<string, NormalizedOffer>();

  for (const offer of offers) {
    const check = validateOffer(offer);
    if (!check.valid) {
      continue;
    }

    const key = deduplicationKey(offer);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, offer);
      continue;
    }

    const existingPrec = getProviderPrecedence(existing.providerId);
    const currentPrec = getProviderPrecedence(offer.providerId);

    if (currentPrec > existingPrec) {
      // Higher authority source wins
      map.set(key, offer);
    } else if (currentPrec === existingPrec) {
      // Tie breaker 1: Freshness (newer observedAt wins)
      const existingTime = Date.parse(existing.observedAt) || 0;
      const currentTime = Date.parse(offer.observedAt) || 0;

      if (currentTime > existingTime + 60_000) {
        map.set(key, offer);
      } else if (Math.abs(currentTime - existingTime) <= 60_000) {
        // Tie breaker 2: Lower confirmed price wins
        if (offer.currentPrice < existing.currentPrice) {
          map.set(key, offer);
        }
      }
    }
  }

  return Array.from(map.values());
}

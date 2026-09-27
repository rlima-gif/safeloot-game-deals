import type { NormalizedOffer } from './types';

const EDITION_KEYWORDS = [
  'deluxe',
  'ultimate',
  'gold',
  'goty',
  'game of the year',
  'definitive',
  'complete',
  'remastered',
  'directors cut',
  "director's cut",
  'anniversary',
  'bundle',
  'premium',
  'enhanced',
  'legendary',
  'collector',
];

export function extractCanonicalEdition(title: string): string {
  const lower = (title || '').toLowerCase();
  if (lower.includes('game of the year') || lower.includes('goty')) return 'goty';
  if (lower.includes("director's cut") || lower.includes('directors cut')) return "director's cut";
  for (const kw of EDITION_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return 'standard';
}

export function validateOffer(offer: Partial<NormalizedOffer>): { valid: boolean; reason?: string } {
  if (!offer) return { valid: false, reason: 'Offer object is null or undefined' };
  
  if (typeof offer.canonicalGameId !== 'number' || !Number.isSafeInteger(offer.canonicalGameId) || offer.canonicalGameId <= 0) {
    return { valid: false, reason: `Invalid canonicalGameId: ${offer.canonicalGameId}` };
  }

  if (!offer.retailerId || typeof offer.retailerId !== 'string' || !offer.retailerId.trim()) {
    return { valid: false, reason: 'retailerId is required' };
  }

  if (!offer.providerId || typeof offer.providerId !== 'string' || !offer.providerId.trim()) {
    return { valid: false, reason: 'providerId is required' };
  }

  if (offer.currency !== 'BRL' && offer.currency !== 'USD') {
    return { valid: false, reason: `Invalid currency: ${offer.currency}. Must be BRL or USD.` };
  }

  if (offer.region !== 'Brasil' && offer.region !== 'Global' && offer.region !== 'LATAM') {
    return { valid: false, reason: `Invalid region: ${offer.region}` };
  }

  if (typeof offer.currentPrice !== 'number' || !Number.isFinite(offer.currentPrice) || offer.currentPrice < 0) {
    return { valid: false, reason: `Invalid currentPrice: ${offer.currentPrice}` };
  }

  if (typeof offer.regularPrice !== 'number' || !Number.isFinite(offer.regularPrice) || offer.regularPrice < 0) {
    return { valid: false, reason: `Invalid regularPrice: ${offer.regularPrice}` };
  }

  if (offer.regularPrice < offer.currentPrice) {
    return { valid: false, reason: `regularPrice (${offer.regularPrice}) cannot be less than currentPrice (${offer.currentPrice})` };
  }

  if (typeof offer.discount !== 'number' || !Number.isFinite(offer.discount) || offer.discount < 0 || offer.discount > 100) {
    return { valid: false, reason: `Invalid discount: ${offer.discount}` };
  }

  try {
    const pUrl = new URL(offer.providerUrl || '');
    if (pUrl.protocol !== 'https:') return { valid: false, reason: 'providerUrl must be https:' };
  } catch {
    return { valid: false, reason: 'Malformed providerUrl' };
  }

  try {
    const cUrl = new URL(offer.commerceUrl || '');
    if (cUrl.protocol !== 'https:') return { valid: false, reason: 'commerceUrl must be https:' };
  } catch {
    return { valid: false, reason: 'Malformed commerceUrl' };
  }

  if (!offer.commerceUrlSource || !['provider', 'direct-retailer', 'safeloot-affiliate'].includes(offer.commerceUrlSource)) {
    return { valid: false, reason: `Invalid commerceUrlSource: ${offer.commerceUrlSource}` };
  }

  if (offer.available === false) {
    return { valid: false, reason: 'Offer marked as unavailable' };
  }

  return { valid: true };
}

/**
 * Determines whether an offer is eligible for Brazilian Real (BRL) objective price ranking.
 * Strict Price-Truth Invariant:
 * - Currency must be strictly 'BRL' (never converts USD to fake BRL)
 * - Region must be 'Brasil' or 'Global'
 * - Price must be confirmed and non-negative
 */
export function isBrlRankingEligible(offer: NormalizedOffer): boolean {
  if (offer.currency !== 'BRL') return false;
  if (offer.region !== 'Brasil' && offer.region !== 'Global') return false;
  if (offer.available === false) return false;
  if (typeof offer.currentPrice !== 'number' || !Number.isFinite(offer.currentPrice) || offer.currentPrice < 0) return false;
  return true;
}

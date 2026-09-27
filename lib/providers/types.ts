export type OfferCurrency = 'BRL' | 'USD';
export type OfferRegion = 'Brasil' | 'Global' | 'LATAM';
export type CommerceUrlSource = 'provider' | 'direct-retailer' | 'safeloot-affiliate';
export type ProviderPrecedenceTier = 'direct' | 'regional_aggregator' | 'auxiliary_aggregator' | 'giveaway';

export type NormalizedOffer = {
  canonicalGameId: number;
  retailerId: string;       // e.g. 'steam', 'nuuvem', 'gog', 'gamersgate', 'hype', 'epic', 'fanatical'
  retailerName: string;     // e.g. 'Steam', 'Nuuvem', 'GOG', 'GamersGate', 'Hype Games', 'Epic Games', 'Fanatical'
  providerId: string;       // e.g. 'direct_steam', 'direct_nuuvem', 'direct_gog', 'itad', 'ggdeals', 'cheapshark', 'gamerpower'
  region: OfferRegion;
  currency: OfferCurrency;
  currentPrice: number;
  regularPrice: number;
  discount: number;
  observedAt: string;
  providerUrl: string;
  commerceUrl: string;
  commerceUrlSource: CommerceUrlSource;
  available: boolean;
  launcher?: string;
  edition?: string;
  kind?: 'official' | 'key' | 'unknown';
};

export type ProviderStatus = 
  | 'PRODUCTION_ELIGIBLE'
  | 'WAITING_FOR_API_KEY_OR_APPROVAL'
  | 'WAITING_FOR_COMMERCIAL_APPROVAL'
  | 'AUXILIARY_USD';

export type ProviderMeta = {
  providerId: string;
  name: string;
  tier: ProviderPrecedenceTier;
  precedence: number;
  status: ProviderStatus;
  notes: string;
};

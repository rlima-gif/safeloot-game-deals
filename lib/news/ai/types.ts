import type { RawNewsItem } from '../sources/config';

export type PurchaseImpact = 'none' | 'low' | 'medium' | 'high';

export const CANONICAL_CATEGORIES = [
  'release',
  'delay',
  'update',
  'dlc',
  'expansion',
  'edition',
  'sale',
  'price',
  'free-game',
  'subscription',
  'system-requirements',
  'drm',
  'steam-deck',
  'linux',
  'announcement',
  'other',
] as const;

export type NewsCategory = (typeof CANONICAL_CATEGORIES)[number];

export type ProviderType = 'cloudflare' | 'openai' | 'heuristic';

export interface ClassificationResult {
  safeToPublish: boolean;
  category: NewsCategory;
  importance: number; // 0 - 100
  confidence: number; // 0.0 - 1.0
  purchaseImpact: PurchaseImpact;
  rumor: boolean;
  providerType: ProviderType;
  facts: string[];
}

export interface GeneratedArticleText {
  title: string;
  summary: string;
  whyItMatters: string;
  purchaseAdvice: string;
}

export interface VerificationResult {
  approved: boolean;
  unsupportedClaims: string[];
}

export interface EditorialGroundingContext {
  gameTitle?: string;
  category: NewsCategory;
  purchaseImpact: PurchaseImpact;
  facts: string[];
}

export interface NewsAIProvider {
  readonly providerType: ProviderType;
  classify(eventTitle: string, items: RawNewsItem[]): Promise<ClassificationResult>;
  write(
    facts: string[],
    context: { gameTitle?: string; category: NewsCategory; purchaseImpact: PurchaseImpact },
  ): Promise<GeneratedArticleText>;
  verify(context: EditorialGroundingContext, generatedText: GeneratedArticleText): Promise<VerificationResult>;
}

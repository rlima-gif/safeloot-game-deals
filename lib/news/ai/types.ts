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

export const DECISION_JSON_SCHEMA = {
  name: 'decision_schema',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      decision: { type: 'string', enum: ['publish', 'reject'] },
      category: { type: 'string', enum: CANONICAL_CATEGORIES },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      game: { type: 'string', nullable: true },
      appId: { type: 'integer', nullable: true },
      title: { type: 'string', nullable: true },
      summary: { type: 'string', nullable: true },
      body: { type: 'string', nullable: true },
      whyItMatters: { type: 'string', nullable: true },
      purchaseImpact: { type: 'string', enum: ['none', 'low', 'medium', 'high'], nullable: true },
      purchaseAdvice: { type: 'string', nullable: true },
      facts: { type: 'array', items: { type: 'string' } },
      claims: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, basis: { type: 'array', items: { type: 'string' } } }, required: ['text', 'basis'], additionalProperties: false } },
    },
    required: ['decision', 'category', 'confidence', 'facts', 'claims'],
    additionalProperties: false,
  },
};

export interface GenerateArticleResult {
  decision: 'publish' | 'reject';
  category: NewsCategory;
  confidence: number;
  game: string | null;
  appId: number | null;
  title: string | null;
  summary: string | null;
  body: string | null;
  whyItMatters: string | null;
  purchaseImpact: PurchaseImpact | null;
  purchaseAdvice: string | null;
  facts: string[];
  claims: Array<{ text: string; basis: string[] }>;
}

export interface GeneratedArticleText {
  title: string;
  summary: string;
  whyItMatters: string;
  purchaseAdvice: string;
  claims?: Array<{ text: string; basis: string[] }>;
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
  generateArticle(
    eventTitle: string,
    items: RawNewsItem[],
    appId?: number,
  ): Promise<GenerateArticleResult>;
}

export interface EditorialGroundingContext {
  gameTitle?: string;
  category: NewsCategory;
  purchaseImpact: PurchaseImpact;
  facts: string[];
}

export interface NewsAIProvider {
  readonly providerType: ProviderType;
  generateArticle(
    eventTitle: string,
    items: RawNewsItem[],
    appId?: number,
  ): Promise<GenerateArticleResult>;
}
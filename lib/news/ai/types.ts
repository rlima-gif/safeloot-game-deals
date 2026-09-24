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
  'industria',
  'eventos',
  'cultura',
  'pc',
  'playstation',
  'xbox',
  'nintendo',
  'promocoes',
  'other',
] as const;

export type NewsCategory = (typeof CANONICAL_CATEGORIES)[number];

export function normalizeCategory(rawCat: string): NewsCategory {
  const cat = (rawCat || '').toLowerCase().trim();
  if (CANONICAL_CATEGORIES.includes(cat as NewsCategory)) return cat as NewsCategory;
  if (cat.includes('event') || cat.includes('showcase') || cat.includes('direct') || cat.includes('tga') || cat.includes('retrocon')) return 'eventos';
  if (cat.includes('industr') || cat.includes('layoff') || cat.includes('demiss') || cat.includes('estudio') || cat.includes('studio') || cat.includes('business')) return 'industria';
  if (cat.includes('cultur') || cat.includes('filme') || cat.includes('movie') || cat.includes('serie') || cat.includes('anime') || cat.includes('lore')) return 'cultura';
  if (cat.includes('patch') || cat.includes('update') || cat.includes('atualiz') || cat.includes('hotfix')) return 'update';
  if (cat.includes('dlc') || cat.includes('expans')) return 'dlc';
  if (cat.includes('launch') || cat.includes('release') || cat.includes('lançam') || cat.includes('dispon')) return 'release';
  if (cat.includes('sale') || cat.includes('promo') || cat.includes('desconto')) return 'sale';
  if (cat.includes('free') || cat.includes('grátis') || cat.includes('gratuito')) return 'free-game';
  if (cat.includes('nintendo') || cat.includes('switch')) return 'nintendo';
  if (cat.includes('playstation') || cat.includes('ps5') || cat.includes('ps4')) return 'playstation';
  if (cat.includes('xbox') || cat.includes('gamepass') || cat.includes('game pass')) return 'xbox';
  if (cat.includes('steam deck') || cat.includes('steam-deck')) return 'steam-deck';
  if (cat.includes('steam') || cat.includes('pc')) return 'pc';
  if (cat.includes('require') || cat.includes('requisit')) return 'system-requirements';
  if (cat.includes('delay') || cat.includes('adiad')) return 'delay';
  if (cat.includes('announc') || cat.includes('anúncio') || cat.includes('revel')) return 'announcement';
  return 'other';
}

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
  body?: string;
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

export function parseAiJsonResponse(textContent: string): Record<string, unknown> {
  if (!textContent || !textContent.trim()) {
    throw new Error('Saída textual vazia da IA.');
  }

  let cleanText = textContent.trim();
  if (cleanText.includes('```')) {
    cleanText = cleanText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  }

  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    if (/desculpe|não posso|não consigo|i cannot|i am sorry|i'm sorry|as an ai/i.test(cleanText)) {
      return {
        decision: 'reject',
        category: 'other',
        confidence: 0,
        facts: [],
        claims: [],
      };
    }
    throw new Error(`JSON malformado da IA: ${cleanText.slice(0, 100)}`);
  }
  cleanText = cleanText.slice(firstBrace, lastBrace + 1);

  try {
    const direct = JSON.parse(cleanText) as Record<string, unknown>;
    if (direct && typeof direct === 'object') return direct;
  } catch {}

  let inStr = false;
  let esc = false;
  let sanitized = '';
  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (inStr) {
      if (esc) {
        esc = false;
        sanitized += ch;
      } else if (ch === '\\') {
        esc = true;
        sanitized += ch;
      } else if (ch === '"') {
        inStr = false;
        sanitized += ch;
      } else if (ch === '\n') {
        sanitized += '\\n';
      } else if (ch === '\r') {
        sanitized += '\\r';
      } else if (ch === '\t') {
        sanitized += '\\t';
      } else {
        sanitized += ch;
      }
    } else {
      if (ch === '"') {
        inStr = true;
      }
      sanitized += ch;
    }
  }

  sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');

  try {
    const parsed = JSON.parse(sanitized) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (err) {
    const repaired = tryRepairJson(sanitized);
    if (repaired) return repaired;
    throw new Error(`JSON malformado da IA: ${err instanceof Error ? err.message : String(err)}`);
  }

  throw new Error('JSON malformado da IA.');
}

function tryRepairJson(str: string): Record<string, unknown> | null {
  let s = str.trim();
  const lastCloseBrace = s.lastIndexOf('}');
  if (lastCloseBrace > 0) {
    try {
      const obj = JSON.parse(s.slice(0, lastCloseBrace + 1));
      if (obj && typeof obj === 'object') return obj;
    } catch {}
  }

  let inStr = false;
  let esc = false;
  let braces = 0;
  let brackets = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{') braces++;
      else if (c === '}') braces--;
      else if (c === '[') brackets++;
      else if (c === ']') brackets--;
    }
  }
  if (inStr) s += '"';
  s = s.replace(/,\s*$/, '');
  while (brackets > 0) {
    s += ']';
    brackets--;
  }
  while (braces > 0) {
    s += '}';
    braces--;
  }
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === 'object') return obj;
  } catch {}
  return null;
}
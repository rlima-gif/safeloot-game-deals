import type { RawNewsItem } from '../sources/config';
import { getNewsAIProvider, type NewsAIProvider, type PurchaseImpact, type NewsCategory, type ProviderType, generateArticleWithFallback, type GenerateArticleAttemptResult, type ErrorCode, CANONICAL_CATEGORIES } from './provider';
import { checkDeterministicGrounding } from './grounding';

export interface ProcessedNewsArticle {
  eventId: string;
  appId?: number;
  title: string;
  summary: string;
  whyItMatters: string;
  purchaseAdvice: string;
  category: NewsCategory;
  purchaseImpact: PurchaseImpact;
  importance: number;
  confidence: number;
  rumor: boolean;
  providerType: ProviderType;
  safeToPublish: boolean;
  publishedAt: string;
  sources: { rawItemId: string; sourceName: string; articleUrl: string }[];
}

export type RejectionCode =
  | 'empty'
  | 'rumor'
  | 'safeToPublishFalse'
  | 'other'
  | 'validation'
  | 'grounding';
export type RetryableCode = 'timeout' | 'rate_limit' | 'provider_unavailable' | 'http_5xx' | 'model_unavailable' | 'fetch_error' | 'malformed_json' | 'invalid_output' | 'unknown';
export type FailedStage = 'prefilter' | 'ai' | 'validation' | 'grounding';

export type ProcessEventResult =
  | { status: 'published'; article: ProcessedNewsArticle }
  | { status: 'rejected'; reason: string; code: RejectionCode; attempts: GenerateArticleAttemptResult[] }
  | { status: 'retryable_error'; error: string; code: RetryableCode; failedStage: FailedStage; attempts: GenerateArticleAttemptResult[] };

function deterministicPrefilter(items: RawNewsItem[]): { pass: boolean; reason?: string; code?: RejectionCode } {
  if (!items.length) return { pass: false, reason: 'Sem itens para processar', code: 'empty' };
  
  for (const item of items) {
    if (!item.title || item.title.trim().length < 3) {
      return { pass: false, reason: 'Título muito curto', code: 'empty' };
    }
    if (!item.articleUrl || !item.articleUrl.startsWith('http')) {
      return { pass: false, reason: 'URL inválida', code: 'empty' };
    }
    if (!item.sourceName || !item.sourceId) {
      return { pass: false, reason: 'Fonte desconhecida', code: 'empty' };
    }
  }
  
  return { pass: true };
}

export async function processNewsEventResult(
  eventId: string,
  eventTitle: string,
  items: RawNewsItem[],
  appId?: number,
  aiProvider?: NewsAIProvider,
): Promise<ProcessEventResult> {
  const prefilter = deterministicPrefilter(items);
  if (!prefilter.pass) {
    return { status: 'rejected', reason: prefilter.reason || 'Pré-filtro falhou', code: prefilter.code || 'empty', attempts: [] };
  }

  try {
    const { result, error, attempts } = await generateArticleWithFallback(eventTitle, items, appId, aiProvider);

    if (error !== null) {
      const lastAttempt = attempts[attempts.length - 1];
      const errorMessage = lastAttempt?.errorMessage || (error || 'Falha técnica');
      return { status: 'retryable_error', error: errorMessage, code: error as RetryableCode, failedStage: 'ai', attempts };
    }

    if (!result) {
      return { status: 'retryable_error', error: 'Sem resultado da IA', code: 'unknown', failedStage: 'ai', attempts };
    }

    if (result.decision === 'reject') {
      return { status: 'rejected', reason: 'IA rejeitou o evento', code: 'safeToPublishFalse', attempts };
    }

    if (!result.title || result.title.length < 3) {
      return { status: 'rejected', reason: 'Título curto ou inválido', code: 'validation', attempts };
    }
    if (!result.summary || result.summary.length < 10) {
      return { status: 'rejected', reason: 'Resumo curto ou inválido', code: 'validation', attempts };
    }
    if (!result.body || result.body.length < 10) {
      return { status: 'rejected', reason: 'Corpo curto ou inválido', code: 'validation', attempts };
    }
    if (!result.whyItMatters || result.whyItMatters.length < 5) {
      return { status: 'rejected', reason: 'whyItMatters curto ou inválido', code: 'validation', attempts };
    }
    if (!result.purchaseAdvice || result.purchaseAdvice.length < 5) {
      return { status: 'rejected', reason: 'purchaseAdvice curto ou inválido', code: 'validation', attempts };
    }
    if (!result.purchaseImpact) {
      return { status: 'rejected', reason: 'purchaseImpact ausente', code: 'validation', attempts };
    }
    if (!CANONICAL_CATEGORIES.includes(result.category)) {
      return { status: 'rejected', reason: 'Categoria inválida', code: 'validation', attempts };
    }
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      return { status: 'rejected', reason: 'Confidence inválido', code: 'validation', attempts };
    }

    const earliestDate = items.reduce((acc, curr) => {
      return new Date(curr.publishedAt).getTime() < new Date(acc).getTime() ? curr.publishedAt : acc;
    }, items[0].publishedAt);

    const article: ProcessedNewsArticle = {
      eventId,
      appId: appId || items[0].appId,
      title: result.title,
      summary: result.summary,
      whyItMatters: result.whyItMatters,
      purchaseAdvice: result.purchaseAdvice,
      category: result.category,
      purchaseImpact: result.purchaseImpact,
      importance: Math.round(result.confidence * 100),
      confidence: result.confidence,
      rumor: false,
      providerType: attempts[0]?.model as ProviderType || 'heuristic',
      safeToPublish: true,
      publishedAt: earliestDate,
      sources: items.map((i) => ({
        rawItemId: i.articleId,
        sourceName: i.sourceName,
        articleUrl: i.articleUrl,
      })),
    };

    const groundingContext = {
      gameTitle: article.appId ? `Jogo #${article.appId}` : undefined,
      category: article.category,
      purchaseImpact: article.purchaseImpact,
      facts: result.facts,
    };

    const generatedText = {
      title: article.title,
      summary: article.summary,
      whyItMatters: article.whyItMatters,
      purchaseAdvice: article.purchaseAdvice,
      claims: result.claims,
    };

    const deterministic = checkDeterministicGrounding(groundingContext, generatedText);
    if (!deterministic.approved) {
      return {
        status: 'rejected',
        reason: `Grounding determinístico falhou: ${deterministic.unsupportedClaims.join(', ')}`,
        code: 'grounding',
        attempts,
      };
    }

    return { status: 'published', article };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'retryable_error', error: message, code: 'unknown', failedStage: 'ai', attempts: [] };
  }
}

export async function processNewsEvent(
  eventId: string,
  eventTitle: string,
  items: RawNewsItem[],
  appId?: number,
  aiProvider?: NewsAIProvider,
): Promise<ProcessedNewsArticle | null> {
  const result = await processNewsEventResult(eventId, eventTitle, items, appId, aiProvider);
  return result.status === 'published' ? result.article : null;
}
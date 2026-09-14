import type { RawNewsItem } from '../sources/config';
import { getNewsAIProvider, type NewsAIProvider, type PurchaseImpact, type NewsCategory, type ProviderType } from './provider';
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

export type ProcessEventResult =
  | { status: 'published'; article: ProcessedNewsArticle }
  | { status: 'rejected'; reason: string }
  | { status: 'retryable_error'; error: string };

export async function processNewsEventResult(
  eventId: string,
  eventTitle: string,
  items: RawNewsItem[],
  appId?: number,
  aiProvider?: NewsAIProvider,
): Promise<ProcessEventResult> {
  if (!items.length) return { status: 'rejected', reason: 'Sem itens para processar' };

  let provider: NewsAIProvider;
  try {
    provider = aiProvider || getNewsAIProvider();
  } catch (err) {
    return {
      status: 'retryable_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    // Stage 1 — Editor (Classification & Fact Extraction)
    const classification = await provider.classify(eventTitle, items);

    if (classification.rumor) {
      return { status: 'rejected', reason: 'Notícia classificada como rumor' };
    }
    if (!classification.safeToPublish) {
      return { status: 'rejected', reason: 'Classificação indicou safeToPublish=false' };
    }
    if (classification.category === 'other') {
      return { status: 'rejected', reason: 'Categoria "other" não é publicada' };
    }

    // Stage 2 — Writer (Summary & Purchase Advice Generation)
    const groundingContext = {
      gameTitle: appId ? `Jogo #${appId}` : undefined,
      category: classification.category,
      purchaseImpact: classification.purchaseImpact,
      facts: classification.facts,
    };

    const generatedText = await provider.write(classification.facts, {
      gameTitle: groundingContext.gameTitle,
      category: groundingContext.category,
      purchaseImpact: groundingContext.purchaseImpact,
    });

    // Stage 3 — Verifier receives the SAME approved editorial context + generated Writer output
    const verification = await provider.verify(groundingContext, generatedText);

    if (!verification.approved || verification.unsupportedClaims.length > 0) {
      return {
        status: 'rejected',
        reason: `Verificação falhou: ${verification.unsupportedClaims.join(', ')}`,
      };
    }

    // Deterministic post-check AFTER the LLM verifier (narrow, fail-closed).
    const deterministic = checkDeterministicGrounding(groundingContext, generatedText);
    if (!deterministic.approved) {
      return {
        status: 'rejected',
        reason: `Grounding determinístico falhou: ${deterministic.unsupportedClaims.join(', ')}`,
      };
    }

    const earliestDate = items.reduce((acc, curr) => {
      return new Date(curr.publishedAt).getTime() < new Date(acc).getTime() ? curr.publishedAt : acc;
    }, items[0].publishedAt);

    const article: ProcessedNewsArticle = {
      eventId,
      appId: appId || items[0].appId,
      title: generatedText.title,
      summary: generatedText.summary,
      whyItMatters: generatedText.whyItMatters,
      purchaseAdvice: generatedText.purchaseAdvice,
      category: classification.category,
      purchaseImpact: classification.purchaseImpact,
      importance: classification.importance,
      confidence: classification.confidence,
      rumor: classification.rumor,
      providerType: provider.providerType,
      safeToPublish: classification.safeToPublish,
      publishedAt: earliestDate,
      sources: items.map((i) => ({
        rawItemId: i.articleId,
        sourceName: i.sourceName,
        articleUrl: i.articleUrl,
      })),
    };

    return { status: 'published', article };
  } catch (err) {
    // Infrastructure / provider error (timeout, quota 429, malformed output, binding missing)
    // ZERO-COST POLICY: Keep event retryable for next run. Do NOT call paid AI or fallback to heuristic.
    return {
      status: 'retryable_error',
      error: err instanceof Error ? err.message : String(err),
    };
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

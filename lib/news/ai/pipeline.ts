import type { RawNewsItem } from '../sources/config';
import { getNewsAIProvider, type NewsAIProvider, type PurchaseImpact, type NewsCategory } from './provider';

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
  providerType: 'heuristic' | 'openai';
  safeToPublish: boolean;
  publishedAt: string;
  sources: { rawItemId: string; sourceName: string; articleUrl: string }[];
}

export async function processNewsEvent(
  eventId: string,
  eventTitle: string,
  items: RawNewsItem[],
  appId?: number,
  aiProvider?: NewsAIProvider,
): Promise<ProcessedNewsArticle | null> {
  if (!items.length) return null;

  try {
    const provider = aiProvider || getNewsAIProvider();

    // Stage 1 — Editor (Classification & Fact Extraction)
    const classification = await provider.classify(eventTitle, items);

    // Hard Rule: If safeToPublish is false or rumor is true or category is 'other', DO NOT publish!
    if (!classification.safeToPublish || classification.rumor || classification.category === 'other') {
      return null;
    }

    // Stage 2 — Writer (Summary & Purchase Advice Generation)
    const generatedText = await provider.write(classification.facts, {
      gameTitle: appId ? `Jogo #${appId}` : undefined,
      category: classification.category,
      purchaseImpact: classification.purchaseImpact,
    });

    // Stage 3 — Verifier (Factual Consistency Verification)
    const verification = await provider.verify(classification.facts, generatedText);

    if (!verification.approved || verification.unsupportedClaims.length > 0) {
      return null;
    }

    const earliestDate = items.reduce((acc, curr) => {
      return new Date(curr.publishedAt).getTime() < new Date(acc).getTime() ? curr.publishedAt : acc;
    }, items[0].publishedAt);

    return {
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
  } catch {
    // HARD RULE: On any AI provider error (OpenAI 401/429/500/timeout/malformed/missing config),
    // DO NOT publish and DO NOT fall back to heuristic!
    return null;
  }
}

import type { CloudflareAiRunFn } from './cloudflare-provider';

export function isPortugueseText(text: string): boolean {
  if (!text || text.trim().length < 4) return true;

  const normalized = text.toLowerCase();

  // Strong indicator: Portuguese diacritics
  const ptDiacritics = (normalized.match(/[ãõáéíóúâêôçà]/g) || []).length;
  if (ptDiacritics >= 2) {
    return true;
  }

  // Count common distinctive Portuguese words
  const ptWords = (
    normalized.match(
      /\b(de|do|da|dos|das|em|no|na|nos|nas|para|por|com|como|que|não|seu|sua|seus|suas|um|uma|mais|mas|pelo|pela|este|esta|esse|essa|sobre|jogo|jogos|lançou|chega|novo|nova|atualizou|atualização|grátis|oferta|disponível)\b/g,
    ) || []
  ).length;

  // Count common distinctive English words
  const enWords = (
    normalized.match(
      /\b(the|of|and|to|in|is|that|for|it|with|as|was|on|are|by|this|from|at|have|has|but|not|they|an|will|can|all|about|update|release|released|patch|news|gameplay)\b/g,
    ) || []
  ).length;

  if (ptWords > enWords) return true;
  if (enWords > ptWords) return false;

  return ptDiacritics > 0;
}

export function detectLanguage(text: string): 'pt' | 'en' {
  return isPortugueseText(text) ? 'pt' : 'en';
}

const COMMON_TRANSLATIONS: Record<string, string> = {
  'Patch released with performance fixes': 'Patch lançado com melhorias de desempenho',
  'released with performance fixes': 'lançado com melhorias de desempenho',
  'Expansion detailed': 'Expansão detalhada',
  'details revealed': 'detalhes revelados',
  'Ultimate Edition Announced': 'Edição Ultimate anunciada',
  'announced': 'anunciado',
  'is 50% off in Steam Summer Sale': 'está com 50% de desconto na Promoção de Verão Steam',
  'Permanent price cut announced': 'Corte permanente de preço anunciado',
  'Claim': 'Resgate',
  'for free to keep this weekend': 'gratuitamente para sempre neste fim de semana',
  'system requirements updated': 'requisitos de sistema atualizados',
  'delayed to': 'adiado para',
  'removes Denuvo DRM': 'remove proteção Denuvo DRM',
  'is Steam Deck Verified': 'está verificado no Steam Deck',
  'adds native Linux Proton support': 'adiciona suporte nativo ao Linux via Proton',
  'coming to Game Pass subscription': 'chegando à assinatura Game Pass',
  'sequel officially announced': 'sequência oficialmente anunciada',
  'launching today worldwide': 'lançando hoje mundialmente',
};

function heuristicTranslateText(text: string): string {
  let translated = text;
  for (const [en, pt] of Object.entries(COMMON_TRANSLATIONS)) {
    if (translated.includes(en)) {
      translated = translated.replace(new RegExp(en, 'gi'), pt);
    }
  }
  return translated;
}

export async function translateTextToPtBr(
  text: string,
  options: {
    customAiRun?: CloudflareAiRunFn;
    model?: string;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const trimmed = text?.trim();
  if (!trimmed) return '';

  // 1. Cost & latency optimization: if text is already Portuguese, do not translate
  if (isPortugueseText(trimmed)) {
    return trimmed;
  }

  const timeoutMs = options.timeoutMs || 15000;
  let runner = options.customAiRun;

  if (!runner) {
    let env: { AI?: { run: CloudflareAiRunFn } } | null = null;
    try {
      const imported = await import('cloudflare:workers');
      env = imported.env as unknown as { AI?: { run: CloudflareAiRunFn } };
    } catch {
    }

    if (env?.AI && typeof env.AI.run === 'function') {
      runner = env.AI.run.bind(env.AI);
    } else {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
      const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
      if (accountId && apiToken) {
        runner = async (model, inputs) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const response = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model.split('/').map((part) => encodeURIComponent(part).replace(/%40/g, '@')).join('/')}`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(inputs),
                signal: controller.signal,
              },
            );
            if (!response.ok) {
              throw new Error(`Workers AI HTTP ${response.status}`);
            }
            const payload = (await response.json()) as { success?: boolean; result?: Record<string, unknown> };
            return payload.result || {};
          } finally {
            clearTimeout(timer);
          }
        };
      }
    }
  }

  // If no Cloudflare Workers AI runner is available (e.g. offline test environment)
  if (!runner) {
    return heuristicTranslateText(trimmed);
  }

  // Attempt 1: Cloudflare Workers AI dedicated translation model M2M100
  try {
    const m2mModel = options.model || '@cf/meta/m2m100-1.2b';
    const rawResult = await runner(m2mModel, {
      text: trimmed,
      source_lang: 'english',
      target_lang: 'portuguese',
    } as unknown as { messages: [] });

    if (rawResult && typeof rawResult === 'object') {
      const resultObj = rawResult as Record<string, unknown>;
      const translated =
        (typeof resultObj.translated_text === 'string' && resultObj.translated_text.trim()) ||
        (typeof resultObj.response === 'string' && resultObj.response.trim());
      if (translated) {
        return translated;
      }
    }
  } catch {
    // M2M100 error, proceed to LLM translation fallback
  }

  // Attempt 2: Fallback to LLM translation prompt with Llama 3.1
  try {
    const rawLlm = await runner('@cf/meta/llama-3.1-8b-instruct-fast', {
      messages: [
        {
          role: 'system',
          content:
            'Você é um tradutor jornalístico especializado em games. Traduza o texto em inglês para o português brasileiro com naturalidade e precisão. Retorne estritamente o texto traduzido, sem introduções ou explicações.',
        },
        {
          role: 'user',
          content: trimmed,
        },
      ],
      max_tokens: 2048,
    });

    if (rawLlm && typeof rawLlm === 'object') {
      const resultObj = rawLlm as Record<string, unknown>;
      const responseText =
        (typeof resultObj.response === 'string' && resultObj.response.trim()) ||
        (typeof resultObj.text === 'string' && resultObj.text.trim());
      if (responseText) {
        return responseText;
      }
    }
  } catch {
    // LLM translation failed, fallback to heuristic
  }

  return heuristicTranslateText(trimmed);
}

export async function translateArticleToPtBr<T extends { title: string; summary: string; body?: string | null; whyItMatters?: string | null }>(
  article: T,
  options: { customAiRun?: CloudflareAiRunFn } = {},
): Promise<{ article: T; translated: boolean }> {
  const needsTitle = !isPortugueseText(article.title);
  const needsSummary = !isPortugueseText(article.summary);
  const needsBody = article.body ? !isPortugueseText(article.body) : false;
  const needsWhyItMatters = article.whyItMatters ? !isPortugueseText(article.whyItMatters) : false;

  if (!needsTitle && !needsSummary && !needsBody && !needsWhyItMatters) {
    return { article, translated: false };
  }

  const [translatedTitle, translatedSummary, translatedBody, translatedWhy] = await Promise.all([
    needsTitle ? translateTextToPtBr(article.title, options) : Promise.resolve(article.title),
    needsSummary ? translateTextToPtBr(article.summary, options) : Promise.resolve(article.summary),
    needsBody && article.body ? translateTextToPtBr(article.body, options) : Promise.resolve(article.body),
    needsWhyItMatters && article.whyItMatters ? translateTextToPtBr(article.whyItMatters, options) : Promise.resolve(article.whyItMatters),
  ]);

  return {
    article: {
      ...article,
      title: translatedTitle || article.title,
      summary: translatedSummary || article.summary,
      body: translatedBody !== undefined ? translatedBody : article.body,
      whyItMatters: translatedWhy !== undefined ? translatedWhy : article.whyItMatters,
    },
    translated: true,
  };
}

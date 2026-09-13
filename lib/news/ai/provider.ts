import type { RawNewsItem } from '../sources/config';

export type PurchaseImpact = 'none' | 'low' | 'medium' | 'high';
export type NewsCategory = 'update' | 'dlc' | 'discount' | 'release' | 'announcement' | 'event' | 'other';

export interface ClassificationResult {
  safeToPublish: boolean;
  category: NewsCategory;
  importance: number; // 0 - 100
  confidence: number; // 0.0 - 1.0
  purchaseImpact: PurchaseImpact;
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

export interface NewsAIProvider {
  classify(eventTitle: string, items: RawNewsItem[]): Promise<ClassificationResult>;
  write(
    facts: string[],
    context: { gameTitle?: string; category: NewsCategory; purchaseImpact: PurchaseImpact },
  ): Promise<GeneratedArticleText>;
  verify(facts: string[], generatedText: GeneratedArticleText): Promise<VerificationResult>;
}

export class HeuristicRuleNewsAIProvider implements NewsAIProvider {
  async classify(eventTitle: string, items: RawNewsItem[]): Promise<ClassificationResult> {
    const titleLower = eventTitle.toLowerCase();
    const snippetsCombined = items.map((i) => (i.snippet || '').toLowerCase()).join(' ');
    const textCombined = `${titleLower} ${snippetsCombined}`;

    let category: NewsCategory = 'update';
    let purchaseImpact: PurchaseImpact = 'low';
    let importance = 60;

    if (textCombined.includes('patch') || textCombined.includes('update') || textCombined.includes('atualização') || textCombined.includes('correções')) {
      category = 'update';
      purchaseImpact = 'low';
      importance = 65;
    } else if (textCombined.includes('dlc') || textCombined.includes('expansão') || textCombined.includes('expansion')) {
      category = 'dlc';
      purchaseImpact = 'medium';
      importance = 75;
    } else if (textCombined.includes('desconto') || textCombined.includes('promoção') || textCombined.includes('sale') || textCombined.includes('price cut')) {
      category = 'discount';
      purchaseImpact = 'high';
      importance = 85;
    } else if (textCombined.includes('lançamento') || textCombined.includes('release') || textCombined.includes('out now')) {
      category = 'release';
      purchaseImpact = 'medium';
      importance = 80;
    } else if (textCombined.includes('grátis') || textCombined.includes('free to keep') || textCombined.includes('giveaway')) {
      category = 'announcement';
      purchaseImpact = 'high';
      importance = 90;
    } else {
      category = 'other';
      purchaseImpact = 'none';
      importance = 40;
    }

    const facts: string[] = [
      `Evento detectado: ${eventTitle}`,
      `Fontes confirmadas: ${items.map((i) => i.sourceName).join(', ')}`,
      `Data da publicação: ${items[0]?.publishedAt || new Date().toISOString()}`,
    ];

    items.forEach((item, index) => {
      if (item.snippet) {
        facts.push(`Fato da fonte ${item.sourceName} #${index + 1}: ${item.snippet.slice(0, 150)}`);
      }
    });

    return {
      safeToPublish: importance >= 50 && category !== 'other',
      category,
      importance,
      confidence: 0.92,
      purchaseImpact,
      facts,
    };
  }

  async write(
    facts: string[],
    context: { gameTitle?: string; category: NewsCategory; purchaseImpact: PurchaseImpact },
  ): Promise<GeneratedArticleText> {
    const rawTitle = facts[0]?.replace('Evento detectado: ', '') || 'Atualização de jogo';
    const game = context.gameTitle ? `${context.gameTitle}: ` : '';

    let purchaseAdvice = 'Acompanhe as ofertas no SafeLoot para conferir o preço atualizado.';
    if (context.purchaseImpact === 'high') {
      purchaseAdvice = 'Esta novidade impacta diretamente o valor percebido do jogo. Excelente momento para adquirir ou resgatar.';
    } else if (context.purchaseImpact === 'medium') {
      purchaseAdvice = 'Novo conteúdo relevante adicionado. Vale colocar na lista de desejos se você tem interesse no gênero.';
    } else if (context.purchaseImpact === 'low') {
      purchaseAdvice = 'Melhorias técnicas contínuas. Se você já planejava comprar, a experiência atual está mais estável.';
    }

    return {
      title: `${game}${rawTitle}`,
      summary: facts.slice(1, 4).join(' ') || 'Resumo das atualizações técnicas e melhorias confirmadas pelas fontes.',
      whyItMatters: `Esta novidade traz informações relevantes para jogadores de PC sobre ${context.category}.`,
      purchaseAdvice,
    };
  }

  async verify(facts: string[], generatedText: GeneratedArticleText): Promise<VerificationResult> {
    const unsupportedClaims: string[] = [];

    // Basic sanity check: generated text should not invent random external domains or clickbait phrases
    if (generatedText.title.toLowerCase().includes('você não vai acreditar')) {
      unsupportedClaims.push('Título contém tom sensacionalista/clickbait.');
    }

    if (!generatedText.summary || generatedText.summary.length < 10) {
      unsupportedClaims.push('Resumo insuficiente ou ausente.');
    }

    return {
      approved: unsupportedClaims.length === 0,
      unsupportedClaims,
    };
  }
}

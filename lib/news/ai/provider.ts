import type { RawNewsItem } from '../sources/config';
import { OpenAINewsAIProvider } from './openai-provider';
import { CloudflareWorkersAINewsAIProvider } from './cloudflare-provider';
import {
  type NewsCategory,
  type PurchaseImpact,
  type ClassificationResult,
  type GeneratedArticleText,
  type VerificationResult,
  type NewsAIProvider,
} from './types';

export * from './types';

export class HeuristicRuleNewsAIProvider implements NewsAIProvider {
  readonly providerType = 'heuristic' as const;

  async classify(eventTitle: string, items: RawNewsItem[]): Promise<ClassificationResult> {
    const titleLower = eventTitle.toLowerCase();
    const snippetsCombined = items.map((i) => (i.snippet || '').toLowerCase()).join(' ');
    const textCombined = `${titleLower} ${snippetsCombined}`;

    const rumorKeywords = [
      'rumor',
      'reportedly',
      'allegedly',
      'leak',
      'leaked',
      'according to sources',
      'insider',
      'vazamento',
      'vazado',
      'especulação',
    ];
    const isRumor = rumorKeywords.some((keyword) => textCombined.includes(keyword));

    let category: NewsCategory = 'update';
    let purchaseImpact: PurchaseImpact = 'low';
    let importance = 60;

    if (textCombined.includes('delay') || textCombined.includes('delayed') || textCombined.includes('adiado') || textCombined.includes('adiamento')) {
      category = 'delay';
      purchaseImpact = 'medium';
      importance = 80;
    } else if (textCombined.includes('expansão') || textCombined.includes('expansion')) {
      category = 'expansion';
      purchaseImpact = 'medium';
      importance = 80;
    } else if (textCombined.includes('edition') || textCombined.includes('edição') || textCombined.includes('gold edition') || textCombined.includes('goty')) {
      category = 'edition';
      purchaseImpact = 'medium';
      importance = 75;
    } else if (textCombined.includes('grátis') || textCombined.includes('free to keep') || textCombined.includes('giveaway')) {
      category = 'free-game';
      purchaseImpact = 'high';
      importance = 90;
    } else if (textCombined.includes('sale') || textCombined.includes('promoção') || textCombined.includes('desconto')) {
      category = 'sale';
      purchaseImpact = 'high';
      importance = 85;
    } else if (textCombined.includes('price cut') || textCombined.includes('preço permanente') || textCombined.includes('price drop')) {
      category = 'price';
      purchaseImpact = 'high';
      importance = 85;
    } else if (textCombined.includes('system requirements') || textCombined.includes('requisitos') || textCombined.includes('pc specs') || textCombined.includes('specs')) {
      category = 'system-requirements';
      purchaseImpact = 'medium';
      importance = 70;
    } else if (textCombined.includes('denuvo') || textCombined.includes('drm')) {
      category = 'drm';
      purchaseImpact = 'medium';
      importance = 75;
    } else if (textCombined.includes('steam deck') || textCombined.includes('deck verified')) {
      category = 'steam-deck';
      purchaseImpact = 'medium';
      importance = 70;
    } else if (textCombined.includes('linux') || textCombined.includes('proton')) {
      category = 'linux';
      purchaseImpact = 'low';
      importance = 65;
    } else if (textCombined.includes('game pass') || textCombined.includes('ps plus') || textCombined.includes('assinatura')) {
      category = 'subscription';
      purchaseImpact = 'medium';
      importance = 75;
    } else if (textCombined.includes('patch') || textCombined.includes('update') || textCombined.includes('atualização') || textCombined.includes('correções')) {
      category = 'update';
      purchaseImpact = 'low';
      importance = 65;
    } else if (textCombined.includes('dlc')) {
      category = 'dlc';
      purchaseImpact = 'medium';
      importance = 75;
    } else if (textCombined.includes('lançamento') || textCombined.includes('launching') || textCombined.includes('launch') || textCombined.includes('release') || textCombined.includes('out now')) {
      category = 'release';
      purchaseImpact = 'medium';
      importance = 80;
    } else if (textCombined.includes('announcement') || textCombined.includes('announced') || textCombined.includes('anúncio') || textCombined.includes('revelado') || textCombined.includes('anunciado') || textCombined.includes('reveal')) {
      category = 'announcement';
      purchaseImpact = 'low';
      importance = 60;
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

    // RUMOR HARD RULE: If rumor === true, safeToPublish MUST be false!
    const safeToPublish = !isRumor && importance >= 50 && category !== 'other';

    return {
      safeToPublish,
      category,
      importance,
      confidence: 0.92,
      purchaseImpact,
      rumor: isRumor,
      providerType: this.providerType,
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

export function getNewsAIProvider(customProvider?: NewsAIProvider): NewsAIProvider {
  if (customProvider) return customProvider;

  const providerSetting = (process.env.NEWS_AI_PROVIDER || '').trim().toLowerCase();

  if (providerSetting === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error('Configuração da OpenAI ausente: OPENAI_API_KEY não definida.');
    }
    return new OpenAINewsAIProvider({ apiKey });
  }

  if (providerSetting === 'heuristic') {
    return new HeuristicRuleNewsAIProvider();
  }

  // DEFAULT PRODUCTION PROVIDER: cloudflare
  return new CloudflareWorkersAINewsAIProvider();
}

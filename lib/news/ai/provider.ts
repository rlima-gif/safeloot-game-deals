import type { RawNewsItem } from '../sources/config';
import { OpenAINewsAIProvider } from './openai-provider';
import { CloudflareWorkersAINewsAIProvider } from './cloudflare-provider';
import {
  type NewsCategory,
  type PurchaseImpact,
  type GenerateArticleResult,
  type NewsAIProvider,
} from './types';

export * from './types';

export type ErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'http_5xx'
  | 'model_unavailable'
  | 'fetch_error'
  | 'malformed_json'
  | 'invalid_output'
  | 'validation'
  | 'grounding'
  | 'duplicate'
  | 'unknown';

export interface GenerateArticleAttemptResult {
  result: GenerateArticleResult | null;
  error: ErrorCode | null;
  errorMessage: string | null;
  model: string;
}

function getFallbackModels(): string[] {
  const fallbacks = (process.env.NEWS_AI_MODEL_FALLBACKS || '').trim();
  if (!fallbacks) return [];
  return fallbacks.split(',').map((m) => m.trim()).filter(Boolean);
}

function isTechnicalError(code: ErrorCode | null): boolean {
  return code !== null && code !== 'validation' && code !== 'grounding';
}

export function classifyError(message: string): ErrorCode {
  const msg = message.toLowerCase();
  if (msg.includes('timeout') || msg.includes('abort')) return 'timeout';
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) return 'rate_limit';
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return 'http_5xx';
  if (msg.includes('malform') || msg.includes('json') || msg.includes('empty') || msg.includes('inválida')) return 'malformed_json';
  if (msg.includes('fetch') || msg.includes('transport') || msg.includes('binding') || msg.includes('indisponível')) return 'fetch_error';
  if (msg.includes('model') && (msg.includes('unavailable') || msg.includes('not found'))) return 'model_unavailable';
  return 'unknown';
}

async function attemptGenerateArticle(
  provider: NewsAIProvider,
  eventTitle: string,
  items: RawNewsItem[],
  appId: number | undefined,
): Promise<GenerateArticleAttemptResult> {
  try {
    const result = await provider.generateArticle(eventTitle, items, appId);
    return { result, error: null, errorMessage: null, model: provider.providerType };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: null, error: classifyError(message), errorMessage: message, model: provider.providerType };
  }
}

export async function generateArticleWithFallback(
  eventTitle: string,
  items: RawNewsItem[],
  appId: number | undefined,
  customProvider?: NewsAIProvider,
): Promise<{ result: GenerateArticleResult | null; error: ErrorCode | null; attempts: GenerateArticleAttemptResult[] }> {
  const primaryProvider = customProvider || getNewsAIProvider();
  const fallbackModelIds = getFallbackModels();
  
  const attempts: GenerateArticleAttemptResult[] = [];
  let currentProvider = primaryProvider;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    const attemptResult = await attemptGenerateArticle(currentProvider, eventTitle, items, appId);
    attempts.push(attemptResult);
    
    if (attemptResult.result !== null) {
      // Return the result regardless of decision - let the pipeline handle editorial rejections
      return { result: attemptResult.result, error: null, attempts };
    }
    
    if (!isTechnicalError(attemptResult.error)) {
      return { result: null, error: attemptResult.error, attempts };
    }
    
    const nextModelId = fallbackModelIds[attempt];
    if (!nextModelId) break;
    
    if (currentProvider.providerType === 'cloudflare') {
      currentProvider = new CloudflareWorkersAINewsAIProvider({ model: nextModelId });
    } else if (currentProvider.providerType === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        currentProvider = new OpenAINewsAIProvider({ apiKey, model: nextModelId });
      } else {
        break;
      }
    } else {
      break;
    }
  }
  
  const finalError = attempts[attempts.length - 1]?.error || 'unknown';
  return { result: null, error: finalError, attempts };
}

export class HeuristicRuleNewsAIProvider implements NewsAIProvider {
  readonly providerType = 'heuristic' as const;

  async generateArticle(eventTitle: string, items: RawNewsItem[]): Promise<GenerateArticleResult> {
    const classification = await this.classify(eventTitle, items);
    if (!classification.safeToPublish) {
      return {
        decision: 'reject',
        category: classification.category,
        confidence: classification.confidence,
        game: null,
        appId: null,
        title: null,
        summary: null,
        body: null,
        whyItMatters: null,
        purchaseImpact: classification.purchaseImpact,
        purchaseAdvice: null,
        facts: classification.facts,
        claims: [],
      };
    }
    const article = await this.write(classification.facts, {
      gameTitle: undefined,
      category: classification.category,
      purchaseImpact: classification.purchaseImpact,
    });
    return {
      decision: 'publish',
      category: classification.category,
      confidence: classification.confidence,
      game: null,
      appId: null,
      title: article.title,
      summary: article.summary,
      body: article.body,
      whyItMatters: article.whyItMatters,
      purchaseImpact: classification.purchaseImpact,
      purchaseAdvice: article.purchaseAdvice,
      facts: classification.facts,
      claims: article.claims,
    };
  }

  async classify(eventTitle: string, items: RawNewsItem[]): Promise<any> {
    const titleLower = eventTitle.toLowerCase();
    const snippetsCombined = items.map((i) => (i.snippet || '').toLowerCase()).join(' ');
    const textCombined = `${titleLower} ${snippetsCombined}`;

    const rumorKeywords = [
      'rumor', 'reportedly', 'allegedly', 'leak', 'leaked', 'according to sources', 'insider',
      'vazamento', 'vazado', 'especulação',
    ];
    const isRumor = rumorKeywords.some((k) => textCombined.includes(k));

    let category: NewsCategory = 'update';
    let purchaseImpact: PurchaseImpact = 'low';
    let importance = 60;

    if (textCombined.includes('delay') || textCombined.includes('delayed') || textCombined.includes('adiado') || textCombined.includes('adiamento')) {
      category = 'delay'; purchaseImpact = 'none'; importance = 80;
    } else if (textCombined.includes('expansão') || textCombined.includes('expansion')) {
      category = 'expansion'; purchaseImpact = 'medium'; importance = 80;
    } else if (textCombined.includes('edition') || textCombined.includes('edição') || textCombined.includes('gold edition') || textCombined.includes('goty')) {
      category = 'edition'; purchaseImpact = 'medium'; importance = 75;
    } else if (textCombined.includes('grátis') || textCombined.includes('free to keep') || textCombined.includes('giveaway')) {
      category = 'free-game'; purchaseImpact = 'high'; importance = 90;
    } else if (textCombined.includes('sale') || textCombined.includes('promoção') || textCombined.includes('desconto')) {
      category = 'sale'; purchaseImpact = 'high'; importance = 85;
    } else if (textCombined.includes('price cut') || textCombined.includes('preço permanente') || textCombined.includes('price drop')) {
      category = 'price'; purchaseImpact = 'high'; importance = 85;
    } else if (textCombined.includes('system requirements') || textCombined.includes('requisitos') || textCombined.includes('pc specs') || textCombined.includes('specs')) {
      category = 'system-requirements'; purchaseImpact = 'none'; importance = 70;
    } else if (textCombined.includes('denuvo') || textCombined.includes('drm')) {
      category = 'drm'; purchaseImpact = 'none'; importance = 75;
    } else if (textCombined.includes('steam deck') || textCombined.includes('deck verified')) {
      category = 'steam-deck'; purchaseImpact = 'none'; importance = 70;
    } else if (textCombined.includes('linux') || textCombined.includes('proton')) {
      category = 'linux'; purchaseImpact = 'none'; importance = 65;
    } else if (textCombined.includes('game pass') || textCombined.includes('ps plus') || textCombined.includes('assinatura')) {
      category = 'subscription'; purchaseImpact = 'medium'; importance = 75;
    } else if (textCombined.includes('patch') || textCombined.includes('update') || textCombined.includes('atualização') || textCombined.includes('correções')) {
      category = 'update'; purchaseImpact = 'none'; importance = 65;
    } else if (textCombined.includes('dlc')) {
      category = 'dlc'; purchaseImpact = 'medium'; importance = 75;
    } else if (textCombined.includes('lançamento') || textCombined.includes('launching') || textCombined.includes('launch') || textCombined.includes('release') || textCombined.includes('out now') || textCombined.includes('disponível') || textCombined.includes('available now')) {
      category = 'release'; purchaseImpact = 'medium'; importance = 80;
    } else if (textCombined.includes('announcement') || textCombined.includes('announced') || textCombined.includes('anúncio') || textCombined.includes('revelado') || textCombined.includes('anunciado') || textCombined.includes('reveal')) {
      category = 'announcement'; purchaseImpact = 'none'; importance = 60;
    } else {
      category = 'other'; purchaseImpact = 'none'; importance = 40;
    }

    const facts: string[] = [
      `Evento detectado: ${eventTitle}`,
      `Fontes confirmadas: ${items.map((i) => i.sourceName).join(', ')}`,
      `Data da publicação: ${items[0]?.publishedAt || new Date().toISOString()}`,
    ];

    items.forEach((item, index) => {
      if (item.snippet) {
        facts.push(`Fato da fonte ${item.sourceName} #${index + 1}: ${item.snippet.slice(0, 500)}`);
      }
    });

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
  ): Promise<{
    title: string;
    summary: string;
    body: string;
    whyItMatters: string;
    purchaseAdvice: string;
    claims: Array<{ text: string; basis: string[] }>;
  }> {
    const rawTitle = facts[0]?.replace('Evento detectado: ', '').trim() || 'Atualização de jogo';
    const game = context.gameTitle ? `${context.gameTitle}: ` : '';
    const sourcesInfo = facts[1]?.replace('Fontes confirmadas: ', '').trim() || '';

    let purchaseAdvice: string | null = null;
    if (context.purchaseImpact === 'high') {
      purchaseAdvice = 'Esta novidade impacta diretamente o valor percebido do jogo. Excelente momento para adquirir ou resgatar.';
    } else if (context.purchaseImpact === 'medium') {
      purchaseAdvice = 'Novo conteúdo relevante adicionado. Vale colocar na lista de desejos se você tem interesse no gênero.';
    } else if (context.purchaseImpact === 'low') {
      purchaseAdvice = 'Melhorias técnicas contínuas. Se você já planejava comprar, a experiência atual está mais estável.';
    } else {
      purchaseAdvice = null;
    }

    let whyItMatters = 'Informação relevante para o acompanhamento do ecossistema do jogo no PC.';
    if (context.category === 'release') {
      whyItMatters = 'O lançamento marca a chegada do título às plataformas digitais de PC.';
    } else if (context.category === 'update') {
      whyItMatters = 'A atualização técnica aprimora a estabilidade e corrige problemas relatados pela comunidade.';
    } else if (context.category === 'sale') {
      whyItMatters = 'A promoção reduz o custo de aquisição do jogo nas lojas digitais.';
    } else if (context.category === 'free-game') {
      whyItMatters = 'O resgate gratuito permite adicionar permanentemente o jogo à biblioteca.';
    } else if (context.category === 'system-requirements') {
      whyItMatters = 'Os requisitos técnicos definem o hardware necessário para rodar o jogo com fluidez.';
    } else if (context.category === 'dlc' || context.category === 'expansion') {
      whyItMatters = 'O novo conteúdo expande a jogabilidade e a história disponível para os jogadores.';
    }

    const summary = `${rawTitle} foi oficialmente comunicado, reunindo novidades sobre o título para a comunidade de jogadores de PC.`;

    const snippetTexts = facts
      .filter((f) => f.startsWith('Fato da fonte'))
      .map((f) => f.replace(/^Fato da fonte [^:]+:\s*/, '').trim())
      .filter(Boolean);

    const paragraphs: string[] = [];

    if (sourcesInfo) {
      paragraphs.push(
        `Conforme reportado por ${sourcesInfo}, a divulgação de "${rawTitle}" traz novidades oficiais e detalhamentos sobre o projeto no PC.`
      );
    } else {
      paragraphs.push(
        `Comunicados recentes confirmam novidades a respeito de "${rawTitle}" com informações voltadas para a comunidade no PC.`
      );
    }

    const isRichSource =
      snippetTexts.length >= 2 ||
      snippetTexts.some((s) => s.split(/(?<=[.?!])\s+/).filter(Boolean).length >= 3);

    if (snippetTexts.length > 0) {
      for (const snippet of snippetTexts) {
        const cleanSnippet = snippet.replace(/<[^>]+>/g, '').trim();
        if (!cleanSnippet) continue;

        const sentences = cleanSnippet.split(/(?<=[.?!])\s+/).filter(Boolean);
        if (isRichSource && sentences.length >= 3) {
          const half = Math.ceil(sentences.length / 2);
          paragraphs.push(sentences.slice(0, half).join(' '));
          paragraphs.push(sentences.slice(half).join(' '));
        } else {
          paragraphs.push(cleanSnippet);
        }
      }
    }

    if (isRichSource && paragraphs.length >= 2 && snippetTexts.length > 1) {
      paragraphs.push(
        `A cobertura simultânea por diferentes veículos reforça a relevância das informações anunciadas e o impacto para a base de jogadores.`
      );
    }

    const uniqueParagraphs: string[] = [];
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (trimmed.length > 20 && !uniqueParagraphs.includes(trimmed)) {
        uniqueParagraphs.push(trimmed);
      }
    }

    const body = uniqueParagraphs.join('\n\n');

    const claims: Array<{ text: string; basis: string[] }> = [
      { text: rawTitle, basis: ['fact:0', 'gameIdentity'] },
    ];
    if (purchaseAdvice) {
      claims.push({ text: purchaseAdvice, basis: ['purchaseImpact'] });
    }

    return {
      title: `${game}${rawTitle}`,
      summary,
      body,
      whyItMatters,
      purchaseAdvice: purchaseAdvice || '',
      claims,
    };
  }

  async verify(context: any, generatedText: any): Promise<any> {
    const unsupportedClaims: string[] = [];
    const facts = context.facts || [];

    if (generatedText.title.toLowerCase().includes('você não vai acreditar')) {
      unsupportedClaims.push('Título contém tom sensacionalista/clickbait.');
    }

    if (!generatedText.summary || generatedText.summary.length < 10) {
      unsupportedClaims.push('Resumo insuficiente ou ausente.');
    }

    if (generatedText.body && generatedText.summary && generatedText.body.trim().toLowerCase() === generatedText.summary.trim().toLowerCase()) {
      unsupportedClaims.push('Corpo idêntico ao resumo.');
    }

    const fullText = `${generatedText.title || ''} ${generatedText.summary || ''} ${generatedText.body || ''}`.toLowerCase();
    const forbiddenUIElements = ['<svg', '<button', '<nav', 'href=', '/jogo/', 'vale comprar?', 'quer monitorar o preço?'];
    for (const elem of forbiddenUIElements) {
      if (fullText.includes(elem)) {
        unsupportedClaims.push(`Texto contém contaminação de UI ou elementos proibidos: "${elem}"`);
      }
    }

    const fillerPhrases = [
      'é um evento importante para os fãs',
      'orientam os jogadores de pc',
      'essas atualizações orientam',
      'trazem novos esclarecimentos sobre o status atual do jogo',
      'a comunidade pode acompanhar novos comunicados para confirmar',
      'isso mostra que o jogo tem um lado mais complexo e imprevisível',
    ];
    for (const phrase of fillerPhrases) {
      if (fullText.includes(phrase)) {
        unsupportedClaims.push(`Texto contém frase genérica de preenchimento (filler): "${phrase}"`);
      }
    }

    const factsText = facts.join(' ').toLowerCase();
    const forbiddenCausalPhrases = [
      'pode melhorar a experiência',
      'melhora a experiência de jogo',
      'melhora o desempenho do jogo',
      'boa notícia porque melhora',
    ];
    const textBlob = `${generatedText.summary} ${generatedText.whyItMatters}`.toLowerCase();
    for (const phrase of forbiddenCausalPhrases) {
      if (textBlob.includes(phrase) && !factsText.includes(phrase.split(' ')[0])) {
        unsupportedClaims.push(`Alegação causal não suportada pelos fatos: "${phrase}"`);
      }
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

  return new CloudflareWorkersAINewsAIProvider();
}
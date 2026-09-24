import type { RawNewsItem } from '../sources/config';
import {
  type NewsAIProvider,
  type GenerateArticleResult,
  CANONICAL_CATEGORIES,
  parseAiJsonResponse,
  normalizeCategory,
} from './types';

export interface CloudflareAiRunOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  response_format?: {
    type: 'json_object' | 'json_schema';
    [key: string]: unknown;
  };
  max_tokens?: number;
}

export type CloudflareAiRunFn = (
  model: string,
  inputs: CloudflareAiRunOptions,
) => Promise<
  Record<string, unknown> | { response?: string | Record<string, unknown> }
>;

export class CloudflareWorkersAINewsAIProvider implements NewsAIProvider {
  readonly providerType = 'cloudflare' as const;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly customAiRun?: CloudflareAiRunFn;

  constructor(
    options: {
      model?: string;
      timeoutMs?: number;
      customAiRun?: CloudflareAiRunFn;
    } = {},
  ) {
    this.model =
      options.model ||
      process.env.NEWS_AI_MODEL ||
      '@cf/meta/llama-3.1-8b-instruct-fast';
    this.timeoutMs =
      options.timeoutMs ||
      (process.env.NEWS_AI_TIMEOUT_MS
        ? Number(process.env.NEWS_AI_TIMEOUT_MS)
        : 30000);
    this.customAiRun = options.customAiRun;
  }

  private async runAi(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let runner = this.customAiRun;

      if (!runner) {
        let env: { AI?: { run: CloudflareAiRunFn } } | null = null;
        try {
          const imported = await import('cloudflare:workers');
          env = imported.env as unknown as { AI?: { run: CloudflareAiRunFn } };
        } catch {}

        if (env?.AI && typeof env.AI.run === 'function') {
          runner = env.AI.run.bind(env.AI);
        } else {
          const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
          const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
          if (!accountId || !apiToken) {
            throw new Error(
              'Cloudflare Workers AI indisponível: configure env.AI ou CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN.',
            );
          }
          runner = async (model, inputs) => {
            try {
              const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model
                  .split('/')
                  .map((part) => encodeURIComponent(part).replace(/%40/g, '@'))
                  .join('/')}`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(inputs),
                  signal: controller.signal,
                  redirect: 'error',
                },
              );
              if (!response.ok) {
                throw new Error(
                  `Cloudflare Workers AI REST HTTP ${response.status}.`,
                );
              }
              const payload = (await response.json()) as {
                success?: boolean;
                result?: Record<string, unknown>;
              };
              if (
                payload.success !== true ||
                !payload.result ||
                typeof payload.result !== 'object'
              ) {
                throw new Error(
                  'Cloudflare Workers AI REST retornou resposta inválida.',
                );
              }
              return payload.result;
            } catch (err) {
              if (controller.signal.aborted) {
                throw new Error(
                  `Timeout na chamada Cloudflare Workers AI (${this.timeoutMs}ms).`,
                );
              }
              const message = err instanceof Error ? err.message : '';
              if (/^Cloudflare Workers AI REST HTTP \d{3}\.$/.test(message)) {
                throw new Error(message);
              }
              throw new Error(
                'Falha no transporte Cloudflare Workers AI REST.',
              );
            }
          };
        }
      }

      const rawResult = await Promise.race([
        runner(this.model, {
          messages,
          max_tokens: 2500,
          response_format: { type: 'json_object' },
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(
              new Error(
                `Timeout na chamada Cloudflare Workers AI (${this.timeoutMs}ms).`,
              ),
            ),
          );
        }),
      ]);

      if (!rawResult || typeof rawResult !== 'object') {
        throw new Error('Resposta inválida do Cloudflare Workers AI.');
      }

      let textContent = '';

      if ('response' in rawResult) {
        if (typeof rawResult.response === 'string') {
          textContent = rawResult.response.trim();
        } else if (
          rawResult.response &&
          typeof rawResult.response === 'object'
        ) {
          return rawResult.response as Record<string, unknown>;
        }
      } else if ('text' in rawResult && typeof rawResult.text === 'string') {
        textContent = rawResult.text.trim();
      } else if (
        'result' in rawResult &&
        typeof rawResult.result === 'object'
      ) {
        return rawResult.result as Record<string, unknown>;
      }

      if (!textContent) {
        throw new Error('Cloudflare Workers AI retornou saída textual vazia.');
      }

      return parseAiJsonResponse(textContent);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `Timeout na chamada Cloudflare Workers AI (${this.timeoutMs}ms).`,
        );
      }
      const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        token ? message.split(token).join('[REDACTED]') : message,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async generateArticle(
    eventTitle: string,
    items: RawNewsItem[],
    appId?: number,
  ): Promise<GenerateArticleResult> {
    const systemPrompt = `Você é o editor jornalístico do SafeLoot, portal de notícias e curadoria de games para PC no Brasil.

DIRETRIZES EDITORIAIS:
1. ESCOPO JORNALÍSTICO: O SafeLoot News é um portal autêntico de jornalismo de games. APROVE matérias com relevância informativa para gamers: anúncios de jogos, datas de lançamento, adiamentos, cancelamentos, revelações de gameplay, trailers substanciais, grandes atualizações, expansões, patches, movimentações de estúdios, aquisições, demissões relevantes, estratégias de plataformas (PC, Steam, PlayStation, Xbox, Nintendo, Game Pass, PS Plus), localização/dublagem em PT-BR, produções brasileiras e grandes eventos da indústria (State of Play, Xbox Showcase, Nintendo Direct, Summer Game Fest, The Game Awards).
   IMPORTANTE: Uma notícia NÃO precisa de impacto comercial ou preço para ser publicada. Notícias institucionais, de anúncios e da indústria com purchaseImpact: "none" DEVEM ser publicadas se forem fatos relevantes de games.
2. REJEITE APENAS: Listicles de SEO ("10 coisas que você não sabia"), guias e dicas genéricas ("como passar da fase 1"), fofocas vazias, cosplays, galerias de memes, agregação de reações de redes sociais e boatos sem fontes identificáveis.
3. ESTRUTURA DOS CAMPOS DE TEXTO:
   - title: Máximo 120 caracteres. Jornalístico, direto, objetivo, sem sensacionalismo ou clickbait.
   - summary: Resumo/lead factual (1 a 2 frases, máximo 350 caracteres). DEVE PRESERVAR OBRIGATORIAMENTE FATOS CONCRETOS DAS FONTES: inclua nomes exatos (jogo, desenvolvedora, estúdio, personagens), datas ou janelas de lançamento, números (número da versão do patch, porcentagem de desconto, resolução/FPS, contagem de jogadores) e plataformas confirmadas. NUNCA faça uma generalização vaga (ex: "um jogo recebeu novidades importantes") — declare o que exatamente aconteceu com nomes e dados específicos.
   - body: O corpo completo da notícia (máximo 3500 caracteres), estruturado em parágrafos separados por duas quebras de linha ("\n\n").
     * PRESERVAÇÃO DE FATOS CONCRETOS: O texto deve priorizar especificidade e dados exatos em vez de síntese abstrata. Conserve nomes de desenvolvedores/estúdios, datas de lançamento/período de testes, números de versão, porcentagens de desconto, preços citados, plataformas mencionadas, requisitos de hardware e nomes específicos de mecânicas ou modos. NUNCA resuma fatos específicos com termos vagos como "várias novidades", "diversas melhorias", "um estúdio renomado" ou "em breve".
     * EXTENSÃO ORGÂNICA (SOURCE RICHNESS -> ARTICLE DEPTH): A profundidade e o número de parágrafos devem emergir exclusivamente da quantidade de fatos suportados nas fontes fornecidas. Não force um número fixo de parágrafos nem busque atingir uma contagem de caracteres pré-definida. O artigo pode ter 2, 3, 4, 5 ou 6 parágrafos, conforme os grupos temáticos de fatos presentes nas fontes (ex: fato principal, detalhes específicos/mecânicas, histórico/contexto factual, plataformas/datas/preços).
     * ZERO INVENÇÃO OU EXTRAPOLAÇÃO: Cada afirmação concreta no corpo deve ser diretamente sustentada pelas fontes. NUNCA deduza ou infira decisões executivas internas, recomendações corporativas formais, negociações prolongadas, alterações de roteiro, números de orçamento ou causas e efeitos que não estejam explicitamente documentados no material de origem.
     * SEM ÂNGULO BRASILEIRO FORÇADO: Mencione o Brasil apenas quando estritamente suportado pelas fontes (preço em R$, estúdio brasileiro, evento no Brasil, dublagem em PT-BR). Não invente relevância local em matérias puramente internacionais.
     * NUNCA apenas 1 parágrafo para fontes ricas: quando houver múltiplos fatos, divida-os em 2 ou mais parágrafos temáticos.
     * REGRA EDITORIAL FUNDAMENTAL: CADA PARÁGRAFO DO CORPO DEVE AVANÇAR A HISTÓRIA COM NOVOS FATOS CONCRETOS.
     * ABERTURA DIRETA: O primeiro parágrafo DEVE começar diretamente com o fato concreto mais forte extraído das fontes (ex: quem realizou qual ação, versões, números, mecânicas, plataformas). NUNCA inicie com frases cerimoniais de atribuição ou preenchimento (ex: "Conforme reportado por...", "Segundo apuração...", "A apuração traz detalhes..."). A atribuição de fontes já é exibida nativamente na interface do SafeLoot e NUNCA deve ser duplicada como preenchimento na prosa.
     * PROIBIÇÃO ABSOLUTA DE FILLER E CHAVÕES: NUNCA use frases de abertura cerimonial, chavões ou preenchimento vazio como: "Conforme reportado por...", "Segundo informações divulgadas por...", "A apuração traz detalhes...", "Traz detalhes e confirmações a respeito de...", "A novidade promete...", "Os jogadores podem esperar...", "Mais informações devem surgir...", "O lançamento do jogo é um evento importante para os fãs de...", "No segmento de...", "Essas atualizações orientam os jogadores de PC...", "A comunidade pode acompanhar novos comunicados...", "Isso mostra que o jogo tem um lado mais complexo...", "A cobertura simultânea por diferentes veículos reforça...". Cada parágrafo deve conter fatos reais e objetivos extraídos das fontes.
     * NUNCA repita ou parafraseie o título ou o resumo como um parágrafo introdutório vazio. O resumo introduz o fato de forma concisa; o corpo desenvolve diretamente os fatos e dados técnicos.
     * NUNCA invente fatos, plataformas, preços, notas ou datas não presentes nas fontes.
     * NUNCA inclua elementos de interface (UI), tags HTML/SVG, botões, links internos ou frases comerciais forçadas ("vale comprar?", "quer monitorar o preço?").
     * SINTAXE JSON: Utilize aspas simples (') ao citar nomes de jogos, estúdios ou termos entre aspas no título, resumo e corpo, evitando quebrar a sintaxe JSON.
   - whyItMatters: 1 frase explicando o impacto ou relevância factual para a comunidade gamer.
   - purchaseImpact: "none" | "low" | "medium" | "high". Notícias sem gancho explícito de preço/desconto (ex: atualizações técnicas, correções de bugs, requisitos de sistema, DRM, Steam Deck, Linux, eventos, cultura ou indústria) DEVEM ter purchaseImpact: "none".
   - purchaseAdvice: Se purchaseImpact for "none", retorne estritamente null. Forneça conselho de compra apenas quando houver impacto comercial real (promoção, gratuidade, novo bundle ou expansão paga).
4. RETORNE EXCLUSIVAMENTE JSON ESTRUTURADO:
{"decision":"publish"|"reject","category":string,"confidence":number,"game":string|null,"appId":number|null,"title":string|null,"summary":string|null,"body":string|null,"whyItMatters":string|null,"purchaseImpact":"none"|"low"|"medium"|"high"|null,"purchaseAdvice":string|null,"facts":string[],"claims":[{"text":string,"basis":string[]}]}
5. Anti-clickbait: NUNCA use "você não vai acreditar", "insano", "impressionante", "incrível", "deveria ser obrigatório".
6. Se "reject": decision="reject", title/summary/body podem ser null.
7. FORMATO OBRIGATÓRIO: Retorne estritamente um único objeto JSON válido. Quebras de linha dentro do campo "body" devem ser representadas como \n (duas quebras = \n\n).
Sem markdown externo, sem comentários, sem campos adicionais.`;

    const itemsSummary = items
      .map(
        (item) =>
          `[Fonte: ${item.sourceName}] Título: ${item.title}\nResumo: ${(item.snippet || '').trim()}`,
      )
      .join('\n\n');

    const gameFromSteam = items.find((i) => i.appId)?.appId;
    const userPrompt = `Evento: ${eventTitle}\n\nFontes:\n${itemsSummary}\n\nSteam App ID: ${gameFromSteam || 'N/A'}`;

    const raw = await this.runAi([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const parsed = raw as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(
        'Cloudflare Workers AI retornou JSON inválido para generateArticle.',
      );
    }

    const rawDecision =
      typeof parsed.decision === 'string'
        ? parsed.decision.toLowerCase().trim()
        : '';
    const decision: 'publish' | 'reject' =
      rawDecision === 'publish' ? 'publish' : 'reject';

    const rawCategory =
      typeof parsed.category === 'string'
        ? parsed.category.toLowerCase().trim()
        : '';
    const category = (CANONICAL_CATEGORIES as readonly string[]).includes(
      rawCategory,
    )
      ? (rawCategory as (typeof CANONICAL_CATEGORIES)[number])
      : normalizeCategory(rawCategory);

    const confidence =
      typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.85;

    const game = typeof parsed.game === 'string' ? parsed.game : null;
    const appIdResult =
      typeof parsed.appId === 'number' &&
      Number.isInteger(parsed.appId) &&
      parsed.appId > 0
        ? parsed.appId
        : appId || null;

    const title = typeof parsed.title === 'string' ? parsed.title.trim() : null;
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim() : null;
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : null;
    const whyItMatters =
      typeof parsed.whyItMatters === 'string'
        ? parsed.whyItMatters.trim()
        : null;
    const purchaseAdvice =
      typeof parsed.purchaseAdvice === 'string'
        ? parsed.purchaseAdvice.trim()
        : null;

    const rawImpact =
      typeof parsed.purchaseImpact === 'string'
        ? parsed.purchaseImpact.toLowerCase().trim()
        : '';
    const purchaseImpact: 'none' | 'low' | 'medium' | 'high' = [
      'none',
      'low',
      'medium',
      'high',
    ].includes(rawImpact)
      ? (rawImpact as 'none' | 'low' | 'medium' | 'high')
      : decision === 'publish'
        ? 'none'
        : 'none';

    const factsRaw = Array.isArray(parsed.facts) ? parsed.facts : [];
    const facts = factsRaw
      .map((f) => (typeof f === 'string' ? f.trim() : ''))
      .filter(Boolean);

    if (decision === 'reject') {
      return {
        decision: 'reject',
        category,
        confidence,
        game,
        appId: appIdResult,
        title: null,
        summary: null,
        body: null,
        whyItMatters: null,
        purchaseImpact: null,
        purchaseAdvice: null,
        facts,
        claims: [],
      };
    }

    const claimsRaw = Array.isArray(parsed.claims) ? parsed.claims : [];
    let claims = claimsRaw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const text = typeof record.text === 'string' ? record.text.trim() : '';
        const basis = Array.isArray(record.basis)
          ? record.basis
              .map((b) => (typeof b === 'string' ? b.trim() : ''))
              .filter(Boolean)
          : [];
        if (!text || basis.length === 0) return null;
        return { text, basis };
      })
      .filter((c): c is { text: string; basis: string[] } => c !== null);

    if (claims.length === 0) {
      claims =
        facts.length > 0
          ? facts.map((fact, idx) => ({ text: fact, basis: [`fact:${idx}`] }))
          : [
              {
                text: title || 'Fato confirmado pelas fontes',
                basis: ['fact:0', 'gameIdentity'],
              },
            ];
    }

    const finalWhyItMatters =
      whyItMatters && whyItMatters.length >= 5
        ? whyItMatters
        : 'Informação relevante para jogadores de PC acompanharem o status do título.';

    const finalPurchaseAdvice =
      purchaseImpact === 'none'
        ? null
        : purchaseAdvice && purchaseAdvice.length >= 5
          ? purchaseAdvice
          : 'Acompanhe as novidades e ofertas disponíveis na plataforma.';

    if (
      !title ||
      title.length < 3 ||
      !summary ||
      summary.length < 10 ||
      !body ||
      body.length < 10
    ) {
      return {
        decision: 'reject',
        category,
        confidence,
        game,
        appId: appIdResult,
        title: null,
        summary: null,
        body: null,
        whyItMatters: null,
        purchaseImpact: null,
        purchaseAdvice: null,
        facts,
        claims: [],
      };
    }

    return {
      decision,
      category,
      confidence,
      game,
      appId: appIdResult,
      title,
      summary,
      body,
      whyItMatters: finalWhyItMatters,
      purchaseImpact: purchaseImpact || 'none',
      purchaseAdvice: finalPurchaseAdvice,
      facts,
      claims,
    };
  }
}

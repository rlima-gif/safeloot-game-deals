import type { RawNewsItem } from '../sources/config';
import {
  type NewsAIProvider,
  type NewsCategory,
  type PurchaseImpact,
  type GenerateArticleResult,
  CANONICAL_CATEGORIES,
  DECISION_JSON_SCHEMA,
  parseAiJsonResponse,
} from './types';

export interface CloudflareAiRunOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  response_format?: { type: 'json_object' | 'json_schema'; [key: string]: unknown };
  max_tokens?: number;
}

export type CloudflareAiRunFn = (
  model: string,
  inputs: CloudflareAiRunOptions,
) => Promise<Record<string, unknown> | { response?: string | Record<string, unknown> }>;

export class CloudflareWorkersAINewsAIProvider implements NewsAIProvider {
  readonly providerType = 'cloudflare' as const;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly customAiRun?: CloudflareAiRunFn;

  constructor(options: {
    model?: string;
    timeoutMs?: number;
    customAiRun?: CloudflareAiRunFn;
  } = {}) {
    this.model = options.model || process.env.NEWS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast';
    this.timeoutMs = options.timeoutMs || (process.env.NEWS_AI_TIMEOUT_MS ? Number(process.env.NEWS_AI_TIMEOUT_MS) : 30000);
    this.customAiRun = options.customAiRun;
  }

  private async runAi(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let runner = this.customAiRun;

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
          if (!accountId || !apiToken) {
            throw new Error('Cloudflare Workers AI indisponível: configure env.AI ou CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN.');
          }
          runner = async (model, inputs) => {
            try {
              const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model.split('/').map(part => encodeURIComponent(part).replace(/%40/g, '@')).join('/')}`,
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
                throw new Error(`Cloudflare Workers AI REST HTTP ${response.status}.`);
              }
              const payload = await response.json() as {
                success?: boolean;
                result?: Record<string, unknown>;
              };
              if (payload.success !== true || !payload.result || typeof payload.result !== 'object') {
                throw new Error('Cloudflare Workers AI REST retornou resposta inválida.');
              }
              return payload.result;
            } catch (err) {
              if (controller.signal.aborted) {
                throw new Error(`Timeout na chamada Cloudflare Workers AI (${this.timeoutMs}ms).`);
              }
              const message = err instanceof Error ? err.message : '';
              if (/^Cloudflare Workers AI REST HTTP \d{3}\.$/.test(message)) {
                throw new Error(message);
              }
              throw new Error('Falha no transporte Cloudflare Workers AI REST.');
            }
          };
        }
      }

      const rawResult = await Promise.race([
        runner(this.model, {
          messages,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error(`Timeout na chamada Cloudflare Workers AI (${this.timeoutMs}ms).`)),
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
        } else if (rawResult.response && typeof rawResult.response === 'object') {
          return rawResult.response as Record<string, unknown>;
        }
      } else if ('text' in rawResult && typeof rawResult.text === 'string') {
        textContent = rawResult.text.trim();
      } else if ('result' in rawResult && typeof rawResult.result === 'object') {
        return rawResult.result as Record<string, unknown>;
      }

      if (!textContent) {
        throw new Error('Cloudflare Workers AI retornou saída textual vazia.');
      }

      return parseAiJsonResponse(textContent);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout na chamada Cloudflare Workers AI (${this.timeoutMs}ms).`);
      }
      const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(token ? message.split(token).join('[REDACTED]') : message);
    } finally {
      clearTimeout(timer);
    }
  }

  async generateArticle(eventTitle: string, items: RawNewsItem[], appId?: number): Promise<GenerateArticleResult> {
    const systemPrompt = `Você é o editor jornalístico do SafeLoot, portal de notícias e curadoria de games para PC no Brasil.

DIRETRIZES EDITORIAIS:
1. PRIORIDADE: Notícias com impacto direto em jogadores de PC: lançamentos, datas, preços, promoções, expansões, DLCs, grandes atualizações técnicas, requisitos de sistema, DRM/Denuvo, suporte a Steam Deck e Linux.
2. REJEITE: Curiosidades irrelevantes ("10 curiosidades"), dicas genéricas, fofocas, hardware genérico sem relação com anúncios de jogos, trilha sonora/dublagem isoladas.
3. ESTRUTURA DOS CAMPOS DE TEXTO:
   - title: Máximo 120 caracteres. Jornalístico, direto, sem sensacionalismo ou clickbait.
   - summary: Resumo/lead jornalístico de 1 a 2 frases curtas (máximo 350 caracteres) destacando o fato principal e seu impacto imediato.
   - body: O corpo completo da notícia (máximo 2500 caracteres), estruturado em parágrafos separados por duas quebras de linha ("\\n\\n").
     * Se a fonte contiver informações ricas, redija entre 3 e 6 parágrafos curtos detalhando a narrativa completa (quem confirmou, o que mudou, mecânicas/recursos, plataformas e datas).
     * Se a fonte contiver pouca informação, redija 1 a 2 parágrafos curtos fiéis estritamente aos fatos disponíveis.
     * NUNCA repita o mesmo texto ou as mesmas frases no resumo e no corpo. O resumo introduz o fato; o corpo aprofunda os detalhes.
     * NUNCA invente fatos, plataformas, preços ou datas não presentes nas fontes.
     * NUNCA inclua elementos de interface (UI), tags HTML/SVG, botões, links internos do site ou frases de loja/afiliado ("vale comprar?", "quer monitorar o preço?").
   - whyItMatters: 1 frase explicando a relevância prática para quem joga no PC.
   - purchaseImpact: "none" | "low" | "medium" | "high".
   - purchaseAdvice: Recomendação prática de compra ou monitoramento.
4. RETORNE EXCLUSIVAMENTE JSON ESTRUTURADO:
{"decision":"publish"|"reject","category":string,"confidence":number,"game":string|null,"appId":number|null,"title":string|null,"summary":string|null,"body":string|null,"whyItMatters":string|null,"purchaseImpact":"none"|"low"|"medium"|"high"|null,"purchaseAdvice":string|null,"facts":string[],"claims":[{"text":string,"basis":string[]}]}
5. Anti-clickbait: NUNCA use "você não vai acreditar", "insano", "impressionante", "incrível", "deveria ser obrigatório".
6. Se "reject": decision="reject", title/summary/body podem ser null.
7. FORMATO OBRIGATÓRIO: Retorne estritamente um único objeto JSON válido. Quebras de linha dentro do campo "body" devem ser representadas como \\n (duas quebras = \\n\\n).
Sem markdown, sem comentários, sem campos adicionais.`;

    const itemsSummary = items
      .map(
        (item) =>
          `[Fonte: ${item.sourceName}] Título: ${item.title}\nResumo: ${(item.snippet || '').trim()}`,
      )
      .join('\n\n');

    const gameFromSteam = items.find((i) => i.appId)?.appId;
    const userPrompt = `Evento: ${eventTitle}\n\nFontes:\n${itemsSummary}\n\nSteam App ID: ${gameFromSteam || 'N/A'}`;

    const raw = await this.runAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    );

    const parsed = raw as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Cloudflare Workers AI retornou JSON inválido para generateArticle.');
    }

    const decision = String(parsed.decision || '') as 'publish' | 'reject';
    if (decision !== 'publish' && decision !== 'reject') {
      throw new Error(`Cloudflare Workers AI retornou decisão inválida: "${parsed.decision}".`);
    }

    const category = String(parsed.category || '') as (typeof CANONICAL_CATEGORIES)[number];
    if (!CANONICAL_CATEGORIES.includes(category)) {
      throw new Error(`Cloudflare Workers AI retornou categoria inválida: "${parsed.category}".`);
    }

    const confidence = Number(parsed.confidence);
    if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`Cloudflare Workers AI retornou confidence inválida: ${parsed.confidence}.`);
    }

    const game = parsed.game === null || parsed.game === undefined ? null : String(parsed.game);
    const appIdResult = parsed.appId === null || parsed.appId === undefined ? null : Number(parsed.appId);
    if (parsed.appId !== null && parsed.appId !== undefined && appIdResult !== null) {
      if (!Number.isInteger(appIdResult) || appIdResult < 0) {
        throw new Error(`Cloudflare Workers AI retornou appId inválida: ${parsed.appId}.`);
      }
    }

    const title = parsed.title === null || parsed.title === undefined ? null : String(parsed.title).trim();
    const summary = parsed.summary === null || parsed.summary === undefined ? null : String(parsed.summary).trim();
    const body = parsed.body === null || parsed.body === undefined ? null : String(parsed.body).trim();
    const whyItMatters = parsed.whyItMatters === null || parsed.whyItMatters === undefined ? null : String(parsed.whyItMatters).trim();
    const purchaseAdvice = parsed.purchaseAdvice === null || parsed.purchaseAdvice === undefined ? null : String(parsed.purchaseAdvice).trim();

    const purchaseImpact = parsed.purchaseImpact === null || parsed.purchaseImpact === undefined ? null : String(parsed.purchaseImpact) as 'none' | 'low' | 'medium' | 'high' | null;
    if (purchaseImpact !== null && !['none', 'low', 'medium', 'high'].includes(purchaseImpact)) {
      throw new Error(`Cloudflare Workers AI retornou purchaseImpact inválido: "${parsed.purchaseImpact}".`);
    }

    const factsRaw = Array.isArray(parsed.facts) ? parsed.facts : [];
    const facts = factsRaw.map((f) => String(f).trim()).filter(Boolean);

    const claimsRaw = Array.isArray(parsed.claims) ? parsed.claims : [];
    if (claimsRaw.length === 0) {
      throw new Error('Cloudflare Workers AI retornou claims vazias.');
    }

    const claims = claimsRaw.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('Cloudflare Workers AI retornou claim inválida.');
      }
      const record = entry as Record<string, unknown>;
      const text = String(record.text || '').trim();
      const basis = Array.isArray(record.basis)
        ? record.basis.map((b) => String(b).trim()).filter(Boolean)
        : [];
      if (!text || basis.length === 0) {
        throw new Error('Cloudflare Workers AI retornou claim sem texto ou base.');
      }
      return { text, basis };
    });

    if (decision === 'publish') {
      if (!title || title.length < 3) throw new Error('Título curto ou inválido para publicação.');
      if (!summary || summary.length < 10) throw new Error('Resumo curto ou inválido para publicação.');
      if (!body || body.length < 10) throw new Error('Corpo curto ou inválido para publicação.');
      if (!whyItMatters || whyItMatters.length < 5) throw new Error('whyItMatters curto ou inválido para publicação.');
      if (!purchaseAdvice || purchaseAdvice.length < 5) throw new Error('purchaseAdvice curto ou inválido para publicação.');
      if (!purchaseImpact) throw new Error('purchaseImpact obrigatório para publicação.');
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
      whyItMatters,
      purchaseImpact,
      purchaseAdvice,
      facts,
      claims,
    };
  }
}
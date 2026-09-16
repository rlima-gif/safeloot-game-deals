import type { RawNewsItem } from '../sources/config';
import {
  type NewsAIProvider,
  type NewsCategory,
  type PurchaseImpact,
  type GenerateArticleResult,
  CANONICAL_CATEGORIES,
  DECISION_JSON_SCHEMA,
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
    this.timeoutMs = options.timeoutMs || (process.env.NEWS_AI_TIMEOUT_MS ? Number(process.env.NEWS_AI_TIMEOUT_MS) : 12000);
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
          max_tokens: 1024,
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

      const match = textContent.match(/\{[\s\S]*\}/);
      const jsonStr = match ? match[0] : textContent;

      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('JSON malformado do Cloudflare Workers AI.');
      }

      return parsed;
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
    const systemPrompt = `Você é o editor do SafeLoot, curador de notícias para jogadores de PC no Brasil.

REGRAS:
1. DÊ PRIORIDADE a conteúdo que afete uma decisão de compra:
   - preços, descontos, disponibilidade
   - alterações de lançamento ou plataforma
   - mudanças de edição/goty
   - avanços técnicos importantes para PC
   - exclusividade, mudanças de plataforma
   - grandes anúncios relacionados a compras

2. REJEITE notícias que são:
   - generalidades sem valor de compra ("10 coisas sobre X", dicas, curiosidades)
   - comentários sem contexto de compra
   - notícias sobre hardware genérico (excluindo revelações de plataforma)
   - cobertura de soundtrack, dublagem, Easter eggs
   - conteúdo de entretenimento genérico
   - histórias sem implicação na compra

3. RETORNE JSON ESTRUTURADO com campos obrigatórios:
   {"decision": "publish" | "reject", "category": string, "confidence": number, "game": string | null, "appId": number | null, "title": string | null, "summary": string | null, "body": string | null, "whyItMatters": string | null, "purchaseImpact": "none" | "low" | "medium" | "high" | null, "purchaseAdvice": string | null, "facts": string[], "claims": [{"text": string, "basis": string[]}]}

4. Para DECISION="publish", campos obrigatórios:
   - title: máximo 120 chars, sem clickbait, referenciado em claims
   - summary: máximo 300 chars, referenciado em claims
   - body: máximo 1000 chars, contém pontos-chave do artigo
   - whyItMatters: vincula o artigo ao purchaseImpact
   - purchaseImpact: deve corresponder ao category
   - purchaseAdvice: orientação de compra coerente com purchaseImpact
   - claims: cada claim deve referenciar fact:N ou category/purchaseImpact/gameIdentity

5. NUNCA invente:
   - preços, datas, disponibilidade
   - especulações sobre plataforma/DRM
   - causalidade de desempenho sem suporte direto nos fatos

6. Evite:
   - redundância com outras notícias SafeLoot
   - clickbait sem substância
   - cobertura superficial de lançamentos

7. Anti-sensacionalismo:
   - sem "você não vai acreditar", sem "insano"
   - sem "impressionante", sem "incrível"
   - sem "deveria ser obrigatório"

8. Claims devem ser:
   - apenas baseados em dados da fonte
   - sem extrapolação causal sem suporte direto
   - vinculados por fact:N, category, purchaseImpact ou gameIdentity

9. Se rejeitar:
   - retorne decision="reject"
   - campos title/summary/body podem ser null

Retorne apenas o JSON.
Sem comentários, sem fences de markdown.
Sem campos adicionais.
Sem claims vazias.
Sem inventar dados da fonte.`;

    const itemsSummary = items
      .map(
        (item) =>
          `[Fonte: ${item.sourceName}] Título: ${item.title}\nResumo: ${(item.snippet || '').slice(0, 300)}`,
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
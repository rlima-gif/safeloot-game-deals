import type { RawNewsItem } from '../sources/config';
import {
  type NewsAIProvider,
  type NewsCategory,
  type PurchaseImpact,
  type GenerateArticleResult,
  CANONICAL_CATEGORIES,
  DECISION_JSON_SCHEMA,
} from './types';

export class OpenAINewsAIProvider implements NewsAIProvider {
  readonly providerType = 'openai' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly customFetch: typeof fetch;

  constructor(options: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    customFetch?: typeof fetch;
  } = {}) {
    const key = options.apiKey || process.env.OPENAI_API_KEY;
    if (!key || !key.trim()) {
      throw new Error('Configuração da OpenAI ausente: OPENAI_API_KEY não definida.');
    }
    this.apiKey = key.trim();
    this.model = options.model || process.env.NEWS_AI_MODEL || 'gpt-4o-2024-08-06';
    this.timeoutMs = options.timeoutMs || (process.env.NEWS_AI_TIMEOUT_MS ? Number(process.env.NEWS_AI_TIMEOUT_MS) : 12000);
    this.customFetch = options.customFetch || fetch;
  }

  private async callOpenAI(
    messages: { role: 'system' | 'user'; content: string }[],
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        model: this.model,
        store: false,
        input: messages,
        text: {
          format: {
            type: 'json_schema',
            name: DECISION_JSON_SCHEMA.name,
            strict: DECISION_JSON_SCHEMA.strict,
            schema: DECISION_JSON_SCHEMA.schema,
          },
        },
      };

      const res = await this.customFetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMessage = `HTTP ${res.status}`;
        try {
          const errJson = (await res.json()) as { error?: { message?: string } };
          if (errJson?.error?.message) errMessage = errJson.error.message;
        } catch {}
        const safeErrorMsg = errMessage.replace(this.apiKey, '[REDACTED_API_KEY]');
        throw new Error(`OpenAI API error: ${safeErrorMsg}`);
      }

      const json = (await res.json()) as {
        status?: string;
        output?: Array<{
          type?: string;
          role?: string;
          content?: Array<{
            type?: string;
            text?: string;
            refusal?: string;
          }>;
        }>;
      };

      if (json.status && json.status !== 'completed') {
        throw new Error(`OpenAI Responses API status: ${json.status}.`);
      }

      if (!Array.isArray(json.output)) {
        throw new Error('OpenAI Responses API resposta inválida sem array de output.');
      }

      let rawContent = '';
      let refusalText = '';

      for (const item of json.output) {
        if (Array.isArray(item.content)) {
          for (const contentBlock of item.content) {
            if (contentBlock.type === 'refusal' || contentBlock.refusal) {
              refusalText = contentBlock.refusal || 'Recusado pelo modelo';
              break;
            }
            if (
              contentBlock.type === 'output_text' ||
              contentBlock.type === 'text' ||
              typeof contentBlock.text === 'string'
            ) {
              if (contentBlock.text && contentBlock.text.trim()) {
                rawContent = contentBlock.text.trim();
              }
            }
          }
        }
      }

      if (refusalText) {
        throw new Error(`OpenAI Responses API recusa: ${refusalText}.`);
      }

      if (!rawContent) {
        throw new Error('OpenAI Responses API retornou resposta sem output_text.');
      }

      const parsed = JSON.parse(rawContent) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('OpenAI JSON malformado.');
      }

      return parsed;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout na chamada OpenAI (${this.timeoutMs}ms).`);
      }
      if (err instanceof Error) {
        err.message = err.message.replace(this.apiKey, '[REDACTED_API_KEY]');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async generateArticle(eventTitle: string, items: RawNewsItem[], appId?: number): Promise<GenerateArticleResult> {
    const systemPrompt = `Você é o editor jornalístico do SafeLoot, portal de notícias e curadoria de games para PC no Brasil.

DIRETRIZES EDITORIAIS:
1. PRIORIDADE: Notícias com impacto direto em jogadores de PC: lançamentos, datas, preços, promoções, expansões, DLCs, grandes atualizações técnicas, requisitos de sistema, DRM/Denuvo, suporte a Steam Deck e Linux.
2. REJEITE: Curiosidades irrelevantes ("10 coisas sobre X"), dicas genéricas, fofocas, hardware genérico sem relação com anúncios de jogos, trilha sonora/dublagem isoladas.
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
Sem markdown, sem comentários, sem campos adicionais.`;

    const itemsSummary = items
      .map(
        (item) =>
          `[Fonte: ${item.sourceName}] Título: ${item.title}\nResumo: ${(item.snippet || '').trim()}`,
      )
      .join('\n\n');

    const gameFromSteam = items.find((i) => i.appId)?.appId;
    const userPrompt = `Evento: ${eventTitle}\n\nFontes:\n${itemsSummary}\n\nSteam App ID: ${gameFromSteam || 'N/A'}`;

    const raw = await this.callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    );

    const parsed = raw as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('OpenAI retornou JSON inválido para generateArticle.');
    }

    const decision = String(parsed.decision || '') as 'publish' | 'reject';
    if (decision !== 'publish' && decision !== 'reject') {
      throw new Error(`OpenAI retornou decisão inválida: "${parsed.decision}".`);
    }

    const category = String(parsed.category || '') as (typeof CANONICAL_CATEGORIES)[number];
    if (!CANONICAL_CATEGORIES.includes(category)) {
      throw new Error(`OpenAI retornou categoria inválida: "${parsed.category}".`);
    }

    const confidence = Number(parsed.confidence);
    if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`OpenAI retornou confidence inválida: ${parsed.confidence}.`);
    }

    const game = parsed.game === null || parsed.game === undefined ? null : String(parsed.game);
    const appIdResult = parsed.appId === null || parsed.appId === undefined ? null : Number(parsed.appId);
    if (parsed.appId !== null && parsed.appId !== undefined && appIdResult !== null) {
      if (!Number.isInteger(appIdResult) || appIdResult < 0) {
        throw new Error(`OpenAI retornou appId inválida: ${parsed.appId}.`);
      }
    }

    const title = parsed.title === null || parsed.title === undefined ? null : String(parsed.title).trim();
    const summary = parsed.summary === null || parsed.summary === undefined ? null : String(parsed.summary).trim();
    const body = parsed.body === null || parsed.body === undefined ? null : String(parsed.body).trim();
    const whyItMatters = parsed.whyItMatters === null || parsed.whyItMatters === undefined ? null : String(parsed.whyItMatters).trim();
    const purchaseAdvice = parsed.purchaseAdvice === null || parsed.purchaseAdvice === undefined ? null : String(parsed.purchaseAdvice).trim();

    const purchaseImpact = parsed.purchaseImpact === null || parsed.purchaseImpact === undefined ? null : String(parsed.purchaseImpact) as 'none' | 'low' | 'medium' | 'high' | null;
    if (purchaseImpact !== null && !['none', 'low', 'medium', 'high'].includes(purchaseImpact)) {
      throw new Error(`OpenAI retornou purchaseImpact inválido: "${parsed.purchaseImpact}".`);
    }

    const factsRaw = Array.isArray(parsed.facts) ? parsed.facts : [];
    const facts = factsRaw.map((f) => String(f).trim()).filter(Boolean);

    const claimsRaw = Array.isArray(parsed.claims) ? parsed.claims : [];
    if (claimsRaw.length === 0) {
      throw new Error('OpenAI retornou claims vazias.');
    }

    const claims = claimsRaw.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('OpenAI retornou claim inválida.');
      }
      const record = entry as Record<string, unknown>;
      const text = String(record.text || '').trim();
      const basis = Array.isArray(record.basis)
        ? record.basis.map((b) => String(b).trim()).filter(Boolean)
        : [];
      if (!text || basis.length === 0) {
        throw new Error('OpenAI retornou claim sem texto ou base.');
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
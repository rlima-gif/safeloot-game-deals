import type { RawNewsItem } from '../sources/config';
import {
  type NewsAIProvider,
  type NewsCategory,
  type PurchaseImpact,
  type GenerateArticleResult,
  CANONICAL_CATEGORIES,
  DECISION_JSON_SCHEMA,
  parseAiJsonResponse,
  normalizeCategory,
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

      return parseAiJsonResponse(rawContent);
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
1. ESCOPO JORNALÍSTICO: O SafeLoot News é um portal autêntico de jornalismo de games. APROVE matérias com relevância informativa para gamers: anúncios de jogos, datas de lançamento, adiamentos, cancelamentos, revelações de gameplay, trailers substanciais, grandes atualizações, expansões, patches, movimentações de estúdios, aquisições, demissões relevantes, estratégias de plataformas (PC, Steam, PlayStation, Xbox, Nintendo, Game Pass, PS Plus), localização/dublagem em PT-BR, produções brasileiras e grandes eventos da indústria (State of Play, Xbox Showcase, Nintendo Direct, Summer Game Fest, The Game Awards).
   IMPORTANTE: Uma notícia NÃO precisa de impacto comercial ou preço para ser publicada. Notícias institucionais, de anúncios e da indústria com purchaseImpact: "none" DEVEM ser publicadas se forem fatos relevantes de games.
2. REJEITE APENAS: Listicles de SEO ("10 coisas que você não sabia"), guias e dicas genéricas ("como passar da fase 1"), fofocas vazias, cosplays, galerias de memes, agregação de reações de redes sociais e boatos sem fontes identificáveis.
3. ESTRUTURA DOS CAMPOS DE TEXTO:
   - title: Máximo 120 caracteres. Jornalístico, direto, sem sensacionalismo ou clickbait.
   - summary: Resumo/lead jornalístico de 1 a 2 frases curtas (máximo 350 caracteres) destacando o fato principal e seu impacto imediato.
   - body: O corpo completo da notícia (máximo 3500 caracteres), estruturado em parágrafos separados por duas quebras de linha ("\n\n").
     * EXTENSÃO: Quando as fontes contiverem conteúdo informativo rico, redija entre 4 e 7 parágrafos substanciais detalhando a narrativa completa (quem desenvolve/publica, o que mudou, mecânicas e recursos citados, plataformas confirmadas, datas e preços quando informados).
     * FONTES CURTAS: Se a fonte for naturalmente curta ou consistir apenas em um aviso breve, redija de 1 a 3 parágrafos concisos estritamente fiéis aos fatos disponíveis.
     * PROIBIDO FILLER E CHAVÕES: NUNCA use frases genéricas de preenchimento ou tautologias como "O lançamento do jogo é um evento importante para os fãs de...", "No segmento de...", "Essas atualizações orientam os jogadores de PC...", "A comunidade pode acompanhar novos comunicados...", "Isso mostra que o jogo tem um lado mais complexo...". Cada parágrafo deve conter fatos reais e objetivos extraídos das fontes.
     * MULTI-FONTES: Quando houver múltiplas fontes para o mesmo evento, cruze e sintetize as informações de todas elas: mencione os diferentes veículos ou desenvolvedores quando relevante, combinando detalhes complementares sem repetir o mesmo fato.
     * SUBTÍTULOS OPCIONAIS: Em matérias mais longas (4 a 7 parágrafos), você pode incluir subtítulos markdown curtos (ex: "### O que muda no jogo" ou "### Disponibilidade e plataformas") para estruturar a leitura. NUNCA crie seções artificiais repetitivas como "Matéria Completa", "Por que isso importa" ou "Vale comprar?".
     * NUNCA repita no corpo as mesmas frases do resumo. O resumo introduz o fato; o corpo aprofunda os detalhes.
     * NUNCA invente fatos, plataformas, preços, notas ou datas não presentes nas fontes.
     * NUNCA inclua elementos de interface (UI), tags HTML/SVG, botões, links internos ou frases comerciais forçadas ("vale comprar?", "quer monitorar o preço?").
     * SINTAXE JSON: Utilize aspas simples (') ao citar nomes de jogos, estúdios ou termos entre aspas no título, resumo e corpo, evitando quebrar a sintaxe JSON.
   - whyItMatters: 1 frase explicando o impacto ou relevância factual para a comunidade gamer.
   - purchaseImpact: "none" | "low" | "medium" | "high". Notícias legítimas com "none" devem ter decision="publish".
   - purchaseAdvice: Recomendação prática quando houver aspecto comercial; se não houver contexto útil de compra, retorne null.
4. RETORNE EXCLUSIVAMENTE JSON ESTRUTURADO:
{"decision":"publish"|"reject","category":string,"confidence":number,"game":string|null,"appId":number|null,"title":string|null,"summary":string|null,"body":string|null,"whyItMatters":string|null,"purchaseImpact":"none"|"low"|"medium"|"high"|null,"purchaseAdvice":string|null,"facts":string[],"claims":[{"text":string,"basis":string[]}]}
5. Anti-clickbait: NUNCA use "você não vai acreditar", "insano", "impressionante", "incrível", "deveria ser obrigatório".
6. Se "reject": decision="reject", title/summary/body podem ser null.
Sem markdown externo, sem comentários adicionais.`;

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

    const rawDecision = typeof parsed.decision === 'string' ? parsed.decision.toLowerCase().trim() : '';
    const decision: 'publish' | 'reject' = rawDecision === 'publish' ? 'publish' : 'reject';

    const rawCategory = typeof parsed.category === 'string' ? parsed.category.toLowerCase().trim() : '';
    const category = (CANONICAL_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as (typeof CANONICAL_CATEGORIES)[number])
      : normalizeCategory(rawCategory);

    const confidence = typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.85;

    const game = typeof parsed.game === 'string' ? parsed.game : null;
    const appIdResult = typeof parsed.appId === 'number' && Number.isInteger(parsed.appId) && parsed.appId > 0
      ? parsed.appId
      : (appId || null);

    const title = typeof parsed.title === 'string' ? parsed.title.trim() : null;
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : null;
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : null;
    const whyItMatters = typeof parsed.whyItMatters === 'string' ? parsed.whyItMatters.trim() : null;
    const purchaseAdvice = typeof parsed.purchaseAdvice === 'string' ? parsed.purchaseAdvice.trim() : null;

    const rawImpact = typeof parsed.purchaseImpact === 'string' ? parsed.purchaseImpact.toLowerCase().trim() : '';
    const purchaseImpact = ['none', 'low', 'medium', 'high'].includes(rawImpact)
      ? (rawImpact as 'none' | 'low' | 'medium' | 'high')
      : (decision === 'publish' ? 'low' : null);

    const factsRaw = Array.isArray(parsed.facts) ? parsed.facts : [];
    const facts = factsRaw.map((f) => (typeof f === 'string' ? f.trim() : '')).filter(Boolean);

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
          ? record.basis.map((b) => (typeof b === 'string' ? b.trim() : '')).filter(Boolean)
          : [];
        if (!text || basis.length === 0) return null;
        return { text, basis };
      })
      .filter((c): c is { text: string; basis: string[] } => c !== null);

    if (claims.length === 0) {
      claims = facts.length > 0
        ? facts.map((fact, idx) => ({ text: fact, basis: [`fact:${idx}`] }))
        : [{ text: title || 'Fato confirmado pelas fontes', basis: ['fact:0', 'gameIdentity'] }];
    }

    const finalWhyItMatters =
      whyItMatters && whyItMatters.length >= 5
        ? whyItMatters
        : 'Informação relevante para jogadores de PC acompanharem o status do título.';

    const finalPurchaseAdvice =
      purchaseAdvice && purchaseAdvice.length >= 5
        ? purchaseAdvice
        : 'Acompanhe as novidades e ofertas disponíveis na plataforma.';

    if (!title || title.length < 3 || !summary || summary.length < 10 || !body || body.length < 10) {
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
import type { RawNewsItem } from '../sources/config';
import {
  type NewsAIProvider,
  type ClassificationResult,
  type GeneratedArticleText,
  type VerificationResult,
  type NewsCategory,
  type PurchaseImpact,
  CANONICAL_CATEGORIES,
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
    this.model = options.model || process.env.NEWS_AI_MODEL || 'gpt-4o-mini';
    this.timeoutMs = options.timeoutMs || (process.env.NEWS_AI_TIMEOUT_MS ? Number(process.env.NEWS_AI_TIMEOUT_MS) : 12000);
    this.customFetch = options.customFetch || fetch;
  }

  private async callOpenAI(messages: { role: 'system' | 'user'; content: string }[], jsonSchemaName: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.customFetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMessage = `HTTP ${res.status}`;
        try {
          const errJson = (await res.json()) as { error?: { message?: string } };
          if (errJson?.error?.message) errMessage = errJson.error.message;
        } catch {}
        // Never log or leak API key in error text
        const safeErrorMsg = errMessage.replace(this.apiKey, '[REDACTED_API_KEY]');
        throw new Error(`OpenAI API error: ${safeErrorMsg}`);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const rawContent = json.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error(`OpenAI API retornou resposta vazia (${jsonSchemaName}).`);
      }

      const parsed = JSON.parse(rawContent) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`OpenAI JSON malformado (${jsonSchemaName}).`);
      }

      return parsed;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout na chamada OpenAI (${this.timeoutMs}ms).`);
      }
      if (err instanceof Error) {
        // Sanitize error string to never expose API key
        err.message = err.message.replace(this.apiKey, '[REDACTED_API_KEY]');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async classify(eventTitle: string, items: RawNewsItem[]): Promise<ClassificationResult> {
    const systemPrompt = `Você é o Editor do SafeLoot, curador de notícias para jogadores de PC no Brasil.
Sua tarefa é analisar o evento e retornar estritamente um JSON com a classificação e fatos.
Categorias válidas: ${CANONICAL_CATEGORIES.join(', ')}.
Impactos de compra válidos: none, low, medium, high.

Regras:
1. Extraia apenas fatos fundamentados nas fontes. NUNCA invente fatos.
2. Se a notícia for baseada em rumores, vazamentos ou fontes não oficiais, defina rumor=true.
3. Se rumor=true, safeToPublish DEVE ser false.
4. Se o evento não se encaixa nas categorias principais, use "other".
5. importance deve ser número de 0 a 100.
6. confidence deve ser número de 0.0 a 1.0.

Formato JSON esperado:
{
  "safeToPublish": boolean,
  "category": string,
  "importance": number,
  "confidence": number,
  "purchaseImpact": "none" | "low" | "medium" | "high",
  "rumor": boolean,
  "facts": string[]
}`;

    const itemsSummary = items
      .map(
        (item) =>
          `[Fonte: ${item.sourceName}] Título: ${item.title}\nResumo: ${(item.snippet || '').slice(0, 300)}`,
      )
      .join('\n\n');

    const userPrompt = `Evento: ${eventTitle}\n\nItens das fontes:\n${itemsSummary}`;

    const raw = await this.callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      'EditorClassification',
    );

    return validateEditorResponse(raw);
  }

  async write(
    facts: string[],
    context: { gameTitle?: string; category: NewsCategory; purchaseImpact: PurchaseImpact },
  ): Promise<GeneratedArticleText> {
    const systemPrompt = `Você é o Redator do SafeLoot. Escreva em Português do Brasil de forma natural, útil, direta e sem sensacionalismo ou clickbait.
Use APENAS os fatos aprovados. NUNCA invente preços, descontos, suporte de plataforma, DRM ou disponibilidade.
Se o impacto na compra for "none", mantenha a dica de compra neutra.

Formato JSON esperado:
{
  "title": string,
  "summary": string,
  "whyItMatters": string,
  "purchaseAdvice": string
}`;

    const userPrompt = `Jogo: ${context.gameTitle || 'PC'}\nCategoria: ${context.category}\nImpacto na Compra: ${context.purchaseImpact}\nFatos Aprovados:\n${facts.map((f) => `- ${f}`).join('\n')}`;

    const raw = await this.callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      'WriterText',
    );

    return validateWriterResponse(raw);
  }

  async verify(facts: string[], generatedText: GeneratedArticleText): Promise<VerificationResult> {
    const systemPrompt = `Você é o Verificador de Fatos do SafeLoot.
Sua única função é checar se TODAS as declarações no texto gerado (título, resumo, por que importa e conselho de compra) são 100% suportadas pelos fatos aprovados.
Se houver QUALQUER alegação não suportada ou inventada, retorne approved=false e liste cada alegação.

Formato JSON esperado:
{
  "approved": boolean,
  "unsupportedClaims": string[]
}`;

    const userPrompt = `Fatos Aprovados:\n${facts.map((f) => `- ${f}`).join('\n')}\n\nTexto Gerado:\nTítulo: ${generatedText.title}\nResumo: ${generatedText.summary}\nPor que importa: ${generatedText.whyItMatters}\nConselho de compra: ${generatedText.purchaseAdvice}`;

    const raw = await this.callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      'VerifierCheck',
    );

    return validateVerifierResponse(raw);
  }
}

export function validateEditorResponse(raw: Record<string, unknown>): ClassificationResult {
  const category = String(raw.category || '').trim() as NewsCategory;
  if (!CANONICAL_CATEGORIES.includes(category)) {
    throw new Error(`Editor retornou categoria inválida: "${raw.category}".`);
  }

  const importance = Number(raw.importance);
  if (!Number.isInteger(importance) || importance < 0 || importance > 100) {
    throw new Error(`Editor retornou importance inválida: ${raw.importance}.`);
  }

  const confidence = Number(raw.confidence);
  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Editor retornou confidence inválida: ${raw.confidence}.`);
  }

  const validImpacts: PurchaseImpact[] = ['none', 'low', 'medium', 'high'];
  const purchaseImpact = String(raw.purchaseImpact || '').trim() as PurchaseImpact;
  if (!validImpacts.includes(purchaseImpact)) {
    throw new Error(`Editor retornou purchaseImpact inválido: "${raw.purchaseImpact}".`);
  }

  const rumor = Boolean(raw.rumor);
  let safeToPublish = Boolean(raw.safeToPublish);

  // HARD RULE: Rumors are NEVER safe to publish!
  if (rumor) {
    safeToPublish = false;
  }

  const facts = Array.isArray(raw.facts)
    ? raw.facts.map((f) => String(f).trim()).filter(Boolean)
    : [];

  if (facts.length === 0) {
    throw new Error('Editor retornou lista de fatos vazia.');
  }

  return {
    safeToPublish,
    category,
    importance,
    confidence,
    purchaseImpact,
    rumor,
    providerType: 'openai',
    facts,
  };
}

export function validateWriterResponse(raw: Record<string, unknown>): GeneratedArticleText {
  const title = String(raw.title || '').trim();
  const summary = String(raw.summary || '').trim();
  const whyItMatters = String(raw.whyItMatters || '').trim();
  const purchaseAdvice = String(raw.purchaseAdvice || '').trim();

  if (!title || title.length < 3) {
    throw new Error('Redator retornou título curto ou inválido.');
  }
  if (!summary || summary.length < 10) {
    throw new Error('Redator retornou resumo curto ou inválido.');
  }
  if (!whyItMatters || whyItMatters.length < 5) {
    throw new Error('Redator retornou whyItMatters curto ou inválido.');
  }
  if (!purchaseAdvice || purchaseAdvice.length < 5) {
    throw new Error('Redator retornou purchaseAdvice curto ou inválido.');
  }

  if (title.toLowerCase().includes('você não vai acreditar')) {
    throw new Error('Redator retornou título sensacionalista.');
  }

  return {
    title,
    summary,
    whyItMatters,
    purchaseAdvice,
  };
}

export function validateVerifierResponse(raw: Record<string, unknown>): VerificationResult {
  const approved = Boolean(raw.approved);
  const unsupportedClaims = Array.isArray(raw.unsupportedClaims)
    ? raw.unsupportedClaims.map((c) => String(c).trim()).filter(Boolean)
    : [];

  return {
    approved: approved && unsupportedClaims.length === 0,
    unsupportedClaims,
  };
}
